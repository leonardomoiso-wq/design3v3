'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizzaDriver, estraiNote, driverDaCoordinate, MAX_DRIVER } from '@/lib/driver';
import { useDocente } from '@/lib/docente-context';

const TAG_OPTIONS = [
  'Eco-feedback interfaces',
  'Bio-digital architecture',
  'Non-human interaction design (NHID)',
  'Algorithmic conservation',
  'Multispecies product design',
  'Regenerative urban prototyping',
  'Foraged and bio-based materials',
  'More-than-human service design',
  'Speculative multispecies products',
  'Microbial design',
];

export default function TeacherPage() {
  const { passcode: passcodeAttivo } = useDocente();

  const [casi, setCasi] = useState<any[]>([]);
  const [selezionato, setSelezionato] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'matrice' | 'analitica' | 'controllo' | 'slides'>('matrice');

  const [personaSelezionata, setPersonaSelezionata] = useState('artigiano');
  const [aiCritica, setAiCritica] = useState('');
  const [loadingAi, setLoadingAi] = useState(false);

  const [passwordReset, setPasswordReset] = useState('');
  const [erroreReset, setErroreReset] = useState(false);
  const [successoReset, setSuccessoReset] = useState(false);

  const [casoDaReimpostare, setCasoDaReimpostare] = useState<any | null>(null);
  const [nuovoCodice, setNuovoCodice] = useState('');
  const [erroreReimposta, setErroreReimposta] = useState('');
  const [reimpostaInCorso, setReimpostaInCorso] = useState(false);
  const [successoReimposta, setSuccessoReimposta] = useState<{ titolo: string; codice: string } | null>(null);

  const matrixRef = useRef<HTMLDivElement>(null);
  const [filtroTag, setFiltroTag] = useState('');
  const [ricercaMatrice, setRicercaMatrice] = useState('');
  const [casoHoverId, setCasoHoverId] = useState<number | null>(null);

  useEffect(() => {

    // 1. Carica i dati iniziali
    const fetchCasiIniziali = async () => {
      const { data, error } = await supabase.from('casi_studio').select('*');
      if (!error && data) {
        // Mappa i campi dal formato snake_case del db al formato camelCase dell'app
        const formattati = data.map(c => ({
          id: Number(c.id),
          gruppoNome: c.gruppo_nome,
          gruppoNum: c.gruppo_num,
          titolo: c.titolo,
          descrizione: c.descrizione,
          immagine: c.immagine,
          tags: c.tags || [],
          driver: normalizzaDriver(c.driver),
          driverNote: estraiNote(c.driver),
          x: Number(c.x),
          y: Number(c.y)
        }));
        setCasi(formattati);
        setSelezionato((prev: any) => {
          if (prev) {
            const aggiornato = formattati.find(f => f.id === prev.id);
            if (aggiornato) return aggiornato;
          }
          return formattati.length > 0 ? formattati[0] : null;
        });
      }
    };
  
    fetchCasiIniziali();
  
    // 2. Ascolta i cambiamenti in tempo reale (Realtime subscription)
    const channel = supabase
      .channel('realtime-casi-studio')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casi_studio' }, (payload) => {
        // Ricarica i dati o aggiorna lo stato istantaneamente quando un utente modifica/inserisce qualcosa
        fetchCasiIniziali();
      })
      .subscribe();
  
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const resettaTuttoConPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.rpc('docente_resetta_tutto', { p_passcode: passwordReset });
    if (error) {
      console.error('Errore nel reset:', error);
      setErroreReset(true);
      setSuccessoReset(false);
      return;
    }
    setCasi([]);
    setSelezionato(null);
    setAiCritica('');
    setPasswordReset('');
    setErroreReset(false);
    setSuccessoReset(true);
    setTimeout(() => setSuccessoReset(false), 4000);
  };

  const confermaReimpostaCodice = async () => {
    if (!casoDaReimpostare) return;
    if (nuovoCodice.trim().length < 4) {
      setErroreReimposta('Il codice deve avere almeno 4 caratteri.');
      return;
    }

    setReimpostaInCorso(true);
    setErroreReimposta('');

    const { error } = await supabase.rpc('docente_reimposta_codice', {
      p_caso_id: casoDaReimpostare.id,
      p_nuovo_codice: nuovoCodice.trim(),
      p_passcode: passcodeAttivo,
    });

    setReimpostaInCorso(false);

    if (error) {
      console.error('Errore nel reimpostare il codice:', error);
      setErroreReimposta('Errore durante il salvataggio. Riprova.');
      return;
    }

    setSuccessoReimposta({ titolo: casoDaReimpostare.titolo, codice: nuovoCodice.trim() });
    setCasoDaReimpostare(null);
    setNuovoCodice('');
  };

  const generaCriticaAi = async (caso: any, persona: string) => {
    setLoadingAi(true);
    setAiCritica("");
    const meta = Math.round(MAX_DRIVER / 2);
    const d = caso.driver || { desiderabilita: meta, fattibilita: meta, responsabilita: meta, vitalita: meta };
    
    let promptPersona = "";
    if (persona === 'artigiano') {
      promptPersona = `Agisci come un Artigiano Tradizionale critico. Analizza l'immagine e i parametri (scala 0-${MAX_DRIVER}) di questo caso studio (${caso.titolo}): Desiderabilità ${d.desiderabilita}, Fattibilità ${d.fattibilita}, Responsabilità ${d.responsabilita}, Vitalità ${d.vitalita}. Descrizione: ${caso.descrizione}. Fai considerazioni sulla materia e la costruzione.`;
    } else if (persona === 'ingegnere') {
      promptPersona = `Agisci come un Ingegnere di Sistema rigoroso. Analizza il caso studio (${caso.titolo}) con driver (scala 0-${MAX_DRIVER}) Desiderabilità ${d.desiderabilita}, Fattibilità ${d.fattibilita}, Responsabilità ${d.responsabilita}, Vitalità ${d.vitalita}. Focalizzati su scalabilità e flussi.`;
    } else if (persona === 'designer80') {
      promptPersona = `Agisci come un Designer radicale anni '80 (Memphis). Analizza il caso studio (${caso.titolo}) focalizzandoti sul valore provocatorio e formale.`;
    } else if (persona === 'prodotto2000') {
      promptPersona = `Agisci come un Product Manager anni 2000 orientato ai KPI. Analizza il caso studio (${caso.titolo}) focalizzandoti su UX e sostenibilità commerciale.`;
    }

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: caso.immagine || null, promptText: promptPersona })
      });
      const data = await res.json();
      setAiCritica(data.text || "Impossibile generare l'analisi.");
    } catch (err) {
      setAiCritica("Errore di connessione al server AI.");
    } finally {
      setLoadingAi(false);
    }
  };

  const applicaPosizione = async (id: number, xClamped: number, yClamped: number) => {
    const caso = casi.find(c => c.id === id);
    const noteEsistenti = caso?.driverNote || { desiderabilita: '', fattibilita: '', responsabilita: '', vitalita: '' };

    const valoriDriver = driverDaCoordinate(xClamped, yClamped);

    // Il driver salvato può contenere anche la motivazione testuale dello
    // studente: la preserviamo, aggiornando solo il valore numerico.
    const nuovoDriverConNote = {
      desiderabilita: { valore: valoriDriver.desiderabilita, nota: noteEsistenti.desiderabilita },
      fattibilita: { valore: valoriDriver.fattibilita, nota: noteEsistenti.fattibilita },
      responsabilita: { valore: valoriDriver.responsabilita, nota: noteEsistenti.responsabilita },
      vitalita: { valore: valoriDriver.vitalita, nota: noteEsistenti.vitalita },
    };

    const aggiornati = casi.map(c => {
      if (c.id === id) {
        const casoAggiornato = { ...c, x: xClamped, y: yClamped, driver: valoriDriver };
        if (selezionato?.id === id) setSelezionato(casoAggiornato);
        return casoAggiornato;
      }
      return c;
    });
    setCasi(aggiornati);

    const { error } = await supabase.rpc('docente_aggiorna_posizione', {
      p_id: id,
      p_x: xClamped,
      p_y: yClamped,
      p_driver: nuovoDriverConNote,
      p_passcode: passcodeAttivo,
    });

    if (error) {
      console.error('Errore nel salvataggio della posizione:', error);
    }
  };

  const aggiornaPosizioneDaDrop = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    if (!matrixRef.current) return;
    const rect = matrixRef.current.getBoundingClientRect();

    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;

    const x = Math.round(((xPx / rect.width) * 200) - 100);
    const y = Math.round((((rect.height - yPx) / rect.height) * 200) - 100);

    applicaPosizione(id, Math.max(-100, Math.min(100, x)), Math.max(-100, Math.min(100, y)));
  };

  const spostaConTastiera = (id: number, dx: number, dy: number) => {
    const caso = casi.find(c => c.id === id);
    if (!caso) return;
    const xClamped = Math.max(-100, Math.min(100, caso.x + dx));
    const yClamped = Math.max(-100, Math.min(100, caso.y + dy));
    applicaPosizione(id, xClamped, yClamped);
  };

  const tuttiITag = Array.from(new Set(casi.flatMap(c => c.tags || []))).sort();

  const ricercaNormalizzata = ricercaMatrice.trim().toLowerCase();

  const casiFiltrati = casi
    .filter(c => (filtroTag ? (c.tags || []).includes(filtroTag) : true))
    .filter(c => {
      if (!ricercaNormalizzata) return true;
      return (
        c.titolo?.toLowerCase().includes(ricercaNormalizzata) ||
        c.gruppoNome?.toLowerCase().includes(ricercaNormalizzata) ||
        String(c.gruppoNum).includes(ricercaNormalizzata)
      );
    });

  const getClusterAnalitici = () => {
    const innovatori = casi.filter(c => c.x >= 0 && c.y >= 0);
    const sociali = casi.filter(c => c.x < 0 && c.y < 0);
    const strategici = casi.filter(c => c.x >= 0 && c.y < 0);
    const esplorativi = casi.filter(c => c.x < 0 && c.y >= 0);
    return { innovatori, sociali, strategici, esplorativi };
  };

  const clusters = getClusterAnalitici();

  return (
    <div className="app-shell-body flex-1 overflow-hidden flex flex-col select-none">

      <div className="px-6 py-2.5 border-b border-stone-200 flex justify-end items-center bg-[#FBF9F5]/90 backdrop-blur z-20 flex-shrink-0">
        <div className="flex items-center space-x-2">
          <button onClick={() => setActiveTab('matrice')} className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${activeTab === 'matrice' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-700'}`}>
            Matrice Globale
          </button>
          <button onClick={() => setActiveTab('analitica')} className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${activeTab === 'analitica' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-700'}`}>
            📊 Cluster Analitici
          </button>
          <button onClick={() => setActiveTab('slides')} className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${activeTab === 'slides' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-700'}`}>
            🖥️ Modalità Slide PDF
          </button>
          <button onClick={() => setActiveTab('controllo')} className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${activeTab === 'controllo' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-700'}`}>
            ⚙️ Controllo &amp; Reset
          </button>
        </div>
      </div>

      {activeTab === 'matrice' && (
        <div className="flex-1 flex relative overflow-hidden">
          <div
            ref={matrixRef}
            onDragOver={e => e.preventDefault()}
            className="flex-1 relative bg-[#FCFBF9] border-r border-stone-200 flex items-center justify-center overflow-hidden"
          >
            <div className="absolute inset-x-0 top-1/2 border-b border-stone-300/60 z-0"></div>
            <div className="absolute inset-y-0 left-1/2 border-r border-stone-300/60 z-0"></div>

            <span className="absolute top-6 left-8 text-[11px] font-bold uppercase tracking-widest text-stone-400 z-0">1. Desiderabilità</span>
            <span className="absolute top-6 right-8 text-[11px] font-bold uppercase tracking-widest text-stone-400 z-0">2. Fattibilità</span>
            <span className="absolute bottom-6 left-8 text-[11px] font-bold uppercase tracking-widest text-stone-400 z-0">3. Responsabilità</span>
            <span className="absolute bottom-6 right-8 text-[11px] font-bold uppercase tracking-widest text-stone-400 z-0">4. Vitalità</span>

            <div className="absolute top-16 left-8 z-20 flex items-center gap-2">
              <select
                value={filtroTag}
                onChange={e => setFiltroTag(e.target.value)}
                className="text-[11px] border border-stone-300 rounded-full px-3 py-1.5 bg-white/90 backdrop-blur shadow-sm focus:outline-none focus:border-stone-900"
              >
                <option value="">Tutti i tag ({casi.length})</option>
                {tuttiITag.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
              <label htmlFor="ricerca-matrice" className="sr-only">Cerca per titolo o gruppo</label>
              <input
                id="ricerca-matrice"
                type="search"
                value={ricercaMatrice}
                onChange={e => setRicercaMatrice(e.target.value)}
                placeholder="🔍 Cerca titolo o gruppo..."
                className="text-[11px] border border-stone-300 rounded-full px-3 py-1.5 bg-white/90 backdrop-blur shadow-sm focus:outline-none focus:border-stone-900 w-44"
              />
            </div>

            {casiFiltrati.length === 0 && (
              <div className="absolute z-10 text-center text-stone-400 text-xs bg-white/80 backdrop-blur px-6 py-3 rounded-2xl border border-stone-200 shadow-sm">
                {casi.length === 0
                  ? <>Nessun caso studio registrato. Vai su &quot;Area Studenti&quot; per inserire le consegne.</>
                  : <>Nessun caso studio corrisponde ai filtri applicati.</>}
              </div>
            )}

            {casiFiltrati.map(c => {
              const left = `${((c.x + 100) / 200) * 100}%`;
              const top = `${((-c.y + 100) / 200) * 100}%`;
              const isSelected = selezionato?.id === c.id;
              const inEvidenza = casoHoverId === c.id;

              return (
                <div
                  key={c.id}
                  draggable
                  onDragEnd={(e) => aggiornaPosizioneDaDrop(e, c.id)}
                  onClick={() => { setSelezionato(c); setAiCritica(''); }}
                  onMouseEnter={() => setCasoHoverId(c.id)}
                  onMouseLeave={() => setCasoHoverId(null)}
                  style={{ left, top }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing transition-all duration-150 p-2.5 rounded-2xl bg-white border flex items-center space-x-2.5 max-w-[200px] ${
                    isSelected
                      ? 'border-stone-900 shadow-2xl scale-105 z-30'
                      : inEvidenza
                        ? 'border-amber-300 ring-2 ring-amber-200 shadow-lg scale-105 z-20'
                        : 'border-stone-200 shadow-md hover:border-stone-400 z-10'
                  }`}
                >
                  {c.immagine ? (
                    <div className="w-9 h-9 rounded-xl bg-stone-100 border border-stone-200 overflow-hidden flex items-center justify-center flex-shrink-0 p-0.5">
                      <img src={c.immagine} alt={c.titolo} className="max-w-full max-h-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center text-[10px] font-bold text-stone-400 flex-shrink-0">IMG</div>
                  )}
                  <div className="overflow-hidden">
                    <div className="text-xs font-bold truncate text-stone-900">{c.titolo}</div>
                    <div className="text-[9px] text-stone-500 truncate">G.{c.gruppoNum} &middot; {c.gruppoNome}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="w-[440px] bg-[#FBF9F5] border-l border-stone-200 p-6 flex flex-col justify-between overflow-y-auto z-20 flex-shrink-0">
            {selezionato ? (
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Scheda di Visualizzazione &amp; Commento</span>
                    <span className="text-[10px] bg-stone-200 px-2.5 py-0.5 rounded-full font-medium">Gruppo {selezionato.gruppoNum}</span>
                  </div>
                  <h2 className="text-2xl font-serif font-medium mt-1">{selezionato.titolo}</h2>
                  <p className="text-xs text-stone-500">{selezionato.gruppoNome}</p>
                </div>

                <div className="w-full h-52 rounded-2xl bg-stone-100 border border-stone-200 overflow-hidden shadow-inner flex items-center justify-center p-3">
                  {selezionato.immagine ? (
                    <img src={selezionato.immagine} alt={selezionato.titolo} className="max-w-full max-h-full object-contain rounded-lg shadow-sm" />
                  ) : (
                    <span className="text-xs text-stone-400">Nessuna immagine disponibile</span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Descrizione del Caso Studio</h3>
                  <p className="text-xs text-stone-700 leading-relaxed bg-white p-4 rounded-xl border border-stone-200 max-h-36 overflow-y-auto">
                    {selezionato.descrizione || "Nessuna descrizione inserita."}
                  </p>
                </div>

                {selezionato.tags && selezionato.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selezionato.tags.map((tag: string) => (
                      <span key={tag} className="text-[10px] bg-white border border-stone-200 px-2.5 py-1 rounded-full text-stone-600 font-medium">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="space-y-2 border-t border-stone-200 pt-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Ponderazione Driver IDEO (scala 0-{MAX_DRIVER})</h3>
                  <div className="space-y-1.5">
                    {([
                      ['desiderabilita', 'Desiderabilità'],
                      ['fattibilita', 'Fattibilità'],
                      ['responsabilita', 'Responsabilità'],
                      ['vitalita', 'Vitalità'],
                    ] as const).map(([chiave, etichetta]) => {
                      const nota = selezionato.driverNote?.[chiave];
                      return (
                        <div key={chiave} className="bg-white p-2.5 rounded-xl border border-stone-200 text-xs">
                          <div className="flex justify-between">
                            <span>{etichetta}</span>
                            <b>{selezionato.driver?.[chiave] ?? Math.round(MAX_DRIVER / 2)}</b>
                          </div>
                          {nota && (
                            <p className="text-[11px] text-stone-500 italic mt-1 border-t border-stone-100 pt-1">&ldquo;{nota}&rdquo;</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2 border-t border-stone-200 pt-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Sposta sulla Matrice (da tastiera)</h3>
                  <div className="grid grid-cols-3 gap-1.5 w-32 mx-auto">
                    <span></span>
                    <button onClick={() => spostaConTastiera(selezionato.id, 0, 10)} aria-label="Sposta verso l'alto (più vitale)" className="bg-white border border-stone-200 rounded-lg py-1.5 hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900">↑</button>
                    <span></span>
                    <button onClick={() => spostaConTastiera(selezionato.id, -10, 0)} aria-label="Sposta a sinistra (più desiderabile)" className="bg-white border border-stone-200 rounded-lg py-1.5 hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900">←</button>
                    <button onClick={() => spostaConTastiera(selezionato.id, 0, -10)} aria-label="Sposta verso il basso (più responsabile)" className="bg-white border border-stone-200 rounded-lg py-1.5 hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900">↓</button>
                    <button onClick={() => spostaConTastiera(selezionato.id, 10, 0)} aria-label="Sposta a destra (più fattibile)" className="bg-white border border-stone-200 rounded-lg py-1.5 hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900">→</button>
                  </div>
                  <p className="text-[10px] text-stone-400 text-center">Alternativa al trascinamento per chi usa la tastiera.</p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm space-y-3">
                  <h3 className="text-xs font-serif font-bold text-stone-900">🤖 Analisi Critica / Punti di Vista AI</h3>
                  <select 
                    value={personaSelezionata} 
                    onChange={e => setPersonaSelezionata(e.target.value)}
                    className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-stone-50 focus:outline-none focus:border-stone-900"
                  >
                    <option value="artigiano">L&apos;Artigiano Tradizionale</option>
                    <option value="ingegnere">L&apos;Ingegnere di Sistema</option>
                    <option value="designer80">Il Designer Anni &apos;80 (Memphis)</option>
                    <option value="prodotto2000">Il Product Manager Anni 2000</option>
                  </select>

                  <button 
                    onClick={() => generaCriticaAi(selezionato, personaSelezionata)}
                    disabled={loadingAi}
                    className="w-full bg-stone-900 text-white py-2.5 rounded-xl text-xs font-medium hover:bg-stone-800 transition"
                  >
                    {loadingAi ? 'Elaborazione punto di vista...' : 'Genera Analisi Critica ✨'}
                  </button>

                  {aiCritica && (
                    <div className="text-[11px] text-stone-700 bg-stone-50 p-3.5 rounded-xl border border-stone-200 leading-relaxed italic">
                      &quot;{aiCritica}&quot;
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-stone-400 text-center px-4">
                Seleziona o trascina un caso studio sulla matrice per aprire la scheda di commento.
              </div>
            )}

            <div className="border-t border-stone-200 pt-3 mt-4 text-[10px] text-stone-400 text-center">
              Trascina le schede sulla matrice per riposizionarle liberamente.
            </div>
          </div>
        </div>
      )}

      {activeTab === 'slides' && (
        <div className="printable-area flex-1 p-12 overflow-y-auto bg-stone-200 space-y-12">
          <div className="max-w-4xl mx-auto flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm">
            <div>
              <h2 className="text-xl font-serif font-bold">Anteprima Pacchetto Slide (PDF)</h2>
              <p className="text-xs text-stone-500 mt-0.5">Ogni caso studio è impaginato come slide orizzontale indipendente. Clicca sotto per stampare o salvare in PDF.</p>
            </div>
            <button 
              onClick={() => window.print()}
              className="bg-stone-900 text-white px-6 py-2.5 rounded-xl text-xs font-medium hover:bg-stone-800 transition shadow-sm"
            >
              🖨️ Stampa / Salva PDF delle Slide
            </button>
          </div>

          <div className="space-y-12 max-w-4xl mx-auto">
            {casi.length === 0 ? (
              <div className="bg-white p-12 rounded-2xl text-center text-stone-400 text-sm">Nessun caso studio disponibile per le slide.</div>
            ) : (
              casi.map((c, index) => (
                <div key={c.id} className="bg-white min-h-[34rem] p-12 rounded-2xl shadow-lg border border-stone-300 flex flex-col justify-between page-break">
                  <div className="flex justify-between items-center border-b border-stone-200 pb-4">
                    <span className="text-xs uppercase tracking-widest text-stone-400 font-bold">Laboratorio di Design 3 &middot; Scheda {index + 1} di {casi.length}</span>
                    <span className="text-xs bg-stone-900 text-white px-3 py-1 rounded-full font-medium">Gruppo {c.gruppoNum} &mdash; {c.gruppoNome}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-8 items-start my-auto">
                    <div className="space-y-4">
                      <h2 className="text-3xl font-serif font-bold text-stone-900">{c.titolo}</h2>
                      <p className="text-sm text-stone-600 leading-relaxed bg-stone-50 p-4 rounded-xl border border-stone-200">
                        {c.descrizione || "Nessuna descrizione fornita."}
                      </p>
                      <div className="space-y-2">
                        {([
                          ['desiderabilita', 'Desiderabilità'],
                          ['fattibilita', 'Fattibilità'],
                          ['responsabilita', 'Responsabilità'],
                          ['vitalita', 'Vitalità'],
                        ] as const).map(([chiave, etichetta]) => {
                          const nota = c.driverNote?.[chiave];
                          return (
                            <div key={chiave} className="bg-stone-50 p-2.5 rounded-lg border border-stone-200 text-xs">
                              <div className="flex justify-between">
                                <span className="font-medium text-stone-600">{etichetta}</span>
                                <b>{c.driver?.[chiave]}/{MAX_DRIVER}</b>
                              </div>
                              {nota && (
                                <p className="text-[11px] text-stone-500 italic mt-1 border-t border-stone-200 pt-1">&ldquo;{nota}&rdquo;</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="h-72 bg-stone-100 rounded-2xl border border-stone-200 flex items-center justify-center p-4 overflow-hidden">
                      {c.immagine ? (
                        <img src={c.immagine} alt={c.titolo} className="max-w-full max-h-full object-contain rounded-lg" />
                      ) : (
                        <span className="text-xs text-stone-400">Nessuna immagine</span>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-stone-200 pt-4 flex justify-between items-center text-[10px] text-stone-400">
                    <span>Framework IDEO 4-Driver &mdash; RothFinder Style</span>
                    <span>Coordinate Matrice &mdash; X: {c.x}, Y: {c.y}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'analitica' && (
        <div className="flex-1 p-8 overflow-y-auto max-w-6xl mx-auto w-full space-y-6">
          <div>
            <h2 className="text-2xl font-serif">Analitica e Cluster dei Casi Studio</h2>
            <p className="text-stone-500 text-xs mt-1">Raggruppamento automatico dei progetti in base alle affinità di posizionamento strategico.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-3">
              <h3 className="font-serif font-bold text-sm text-emerald-800">🚀 Cluster Innovazione &amp; Fattibilità ({clusters.innovatori.length})</h3>
              <div className="space-y-2 pt-2">
                {clusters.innovatori.map(c => (
                  <div key={c.id} className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs flex justify-between items-center">
                    <span><b>{c.titolo}</b> (Gruppo {c.gruppoNum})</span>
                    <span className="text-[10px] bg-stone-200 px-2 py-0.5 rounded">X: {c.x}, Y: {c.y}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-3">
              <h3 className="font-serif font-bold text-sm text-blue-800">🌍 Cluster Impatto Sociale &amp; Desiderabilità ({clusters.sociali.length})</h3>
              <div className="space-y-2 pt-2">
                {clusters.sociali.map(c => (
                  <div key={c.id} className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs flex justify-between items-center">
                    <span><b>{c.titolo}</b> (Gruppo {c.gruppoNum})</span>
                    <span className="text-[10px] bg-stone-200 px-2 py-0.5 rounded">X: {c.x}, Y: {c.y}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-3">
              <h3 className="font-serif font-bold text-sm text-amber-800">⚙️ Cluster Strategici &amp; di Sistema ({clusters.strategici.length})</h3>
              <div className="space-y-2 pt-2">
                {clusters.strategici.map(c => (
                  <div key={c.id} className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs flex justify-between items-center">
                    <span><b>{c.titolo}</b> (Gruppo {c.gruppoNum})</span>
                    <span className="text-[10px] bg-stone-200 px-2 py-0.5 rounded">X: {c.x}, Y: {c.y}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-3">
              <h3 className="font-serif font-bold text-sm text-purple-800">💡 Cluster Esplorativi &amp; Vitali ({clusters.esplorativi.length})</h3>
              <div className="space-y-2 pt-2">
                {clusters.esplorativi.map(c => (
                  <div key={c.id} className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs flex justify-between items-center">
                    <span><b>{c.titolo}</b> (Gruppo {c.gruppoNum})</span>
                    <span className="text-[10px] bg-stone-200 px-2 py-0.5 rounded">X: {c.x}, Y: {c.y}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'controllo' && (
        <div className="flex-1 p-8 overflow-y-auto max-w-xl mx-auto w-full space-y-6">
          {successoReimposta && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm flex items-start justify-between space-x-3">
              <div>
                <p className="font-medium text-emerald-800">Nuovo codice per &ldquo;{successoReimposta.titolo}&rdquo;</p>
                <p className="text-emerald-700 mt-1">Comunica questo codice al gruppo: <b className="font-mono bg-white px-2 py-0.5 rounded border border-emerald-200">{successoReimposta.codice}</b></p>
              </div>
              <button onClick={() => setSuccessoReimposta(null)} aria-label="Chiudi" className="text-emerald-600 hover:text-emerald-900 text-xs flex-shrink-0">✕</button>
            </div>
          )}

          <div className="bg-white p-8 rounded-2xl border border-stone-200 shadow-sm space-y-6">
            <div>
              <h2 className="text-2xl font-serif text-center">Pannello di Controllo &amp; Sicurezza</h2>
              <p className="text-stone-500 text-xs mt-1 text-center">Gestisci il reset protetto del database locale.</p>
            </div>

            <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-600 text-center">
              Casi studio attivi memorizzati: <b>{casi.length}</b>
            </div>

            <form onSubmit={resettaTuttoConPassword} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Password per Reset Totale</label>
                <input
                  type="password"
                  value={passwordReset}
                  onChange={e => setPasswordReset(e.target.value)}
                  placeholder="Inserisci password..."
                  className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50 focus:outline-none focus:border-stone-900"
                  required
                />
              </div>

              {erroreReset && (
                <p className="text-xs text-red-600 font-medium text-center">Password errata. Impossibile procedere al reset.</p>
              )}

              {successoReset && (
                <p className="text-xs text-emerald-600 font-medium text-center">Piattaforma resettata con successo!</p>
              )}

              <button
                type="submit"
                className="w-full bg-red-600 text-white py-3 rounded-xl font-medium hover:bg-red-700 transition shadow-sm text-xs"
              >
                Conferma e Svuota Database Piattaforma
              </button>
            </form>
          </div>

          <div className="bg-white p-8 rounded-2xl border border-stone-200 shadow-sm space-y-4">
            <div>
              <h2 className="text-lg font-serif font-bold">Gestione Codici di Gruppo</h2>
              <p className="text-stone-500 text-xs mt-1">I codici non sono mai leggibili (nemmeno da qui): se un gruppo lo dimentica, imposta qui uno nuovo e comunicaglielo.</p>
            </div>

            {casi.length === 0 ? (
              <p className="text-xs text-stone-400 text-center py-4">Nessun caso studio registrato.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {casi.map(c => (
                  <div key={c.id} className="flex items-center justify-between bg-stone-50 border border-stone-200 rounded-xl p-3">
                    <div className="overflow-hidden">
                      <p className="text-sm font-medium truncate">{c.titolo}</p>
                      <p className="text-xs text-stone-500">Gruppo {c.gruppoNum} — {c.gruppoNome}</p>
                    </div>
                    <button
                      onClick={() => { setCasoDaReimpostare(c); setNuovoCodice(''); setErroreReimposta(''); }}
                      className="text-xs bg-white border border-stone-300 hover:border-stone-500 px-3 py-2 rounded-xl font-medium transition flex-shrink-0 ml-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
                    >
                      Reimposta codice
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {casoDaReimpostare && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Reimposta codice: ${casoDaReimpostare.titolo}`}
          onClick={() => setCasoDaReimpostare(null)}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <h2 className="font-serif font-bold text-lg">Nuovo codice di gruppo</h2>
              <p className="text-xs text-stone-500 mt-1">
                Stai per sostituire il codice di &ldquo;{casoDaReimpostare.titolo}&rdquo; (Gruppo {casoDaReimpostare.gruppoNum}). Il vecchio codice smetterà di funzionare.
              </p>
            </div>

            <form onSubmit={e => { e.preventDefault(); confermaReimpostaCodice(); }}>
              <label htmlFor="nuovo-codice" className="sr-only">Nuovo codice</label>
              <input
                id="nuovo-codice"
                type="text"
                autoFocus
                minLength={4}
                value={nuovoCodice}
                onChange={e => setNuovoCodice(e.target.value)}
                placeholder="Nuovo codice (min. 4 caratteri)..."
                className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900"
              />

              {erroreReimposta && (
                <p role="alert" className="text-xs text-red-600 font-medium mt-2 bg-red-50 border border-red-200 rounded-xl p-2.5">{erroreReimposta}</p>
              )}

              <div className="flex space-x-2 mt-4">
                <button
                  type="button"
                  onClick={() => setCasoDaReimpostare(null)}
                  className="flex-1 bg-stone-100 hover:bg-stone-200 transition text-xs font-medium py-2.5 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={reimpostaInCorso}
                  className="flex-1 bg-stone-900 text-white hover:bg-stone-800 transition text-xs font-medium py-2.5 rounded-xl disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
                >
                  {reimpostaInCorso ? 'Salvataggio...' : 'Reimposta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}