'use client';
import { useState, useEffect, useRef } from 'react';

export default function TeacherPage() {
  const [isAuth, setIsAuth] = useState(false);
  const [passLogin, setPassLogin] = useState('');
  const [erroreLogin, setErroreLogin] = useState(false);

  const [casi, setCasi] = useState<any[]>([]);
  const [selezionato, setSelezionato] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'matrice' | 'analitica' | 'controllo' | 'slides'>('matrice');
  
  const [personaSelezionata, setPersonaSelezionata] = useState('artigiano');
  const [aiCritica, setAiCritica] = useState('');
  const [loadingAi, setLoadingAi] = useState(false);

  const [passwordReset, setPasswordReset] = useState('');
  const [erroreReset, setErroreReset] = useState(false);
  const [successoReset, setSuccessoReset] = useState(false);

  const matrixRef = useRef<HTMLDivElement>(null);

  import { supabase } from '@/lib/supabase';

  // Dentro il componente TeacherPage:
  useEffect(() => {
    if (!isAuth) return;
  
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
          driver: c.driver,
          x: Number(c.x),
          y: Number(c.y)
        }));
        setCasi(formattati);
        if (formattati.length > 0 && !selezionato) setSelezionato(formattati[0]);
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
  }, [isAuth]);

  const resettaTuttoConPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordReset === 'admin2026') {
      localStorage.removeItem('casiStudio');
      setCasi([]);
      setSelezionato(null);
      setAiCritica('');
      setPasswordReset('');
      setErroreReset(false);
      setSuccessoReset(true);
      setTimeout(() => setSuccessoReset(false), 4000);
    } else {
      setErroreReset(true);
      setSuccessoReset(false);
    }
  };

  const generaCriticaAi = async (caso: any, persona: string) => {
    setLoadingAi(true);
    setAiCritica("");
    const d = caso.driver || { desiderabilita: 50, fattibilita: 50, responsabilita: 50, vitalita: 50 };
    
    let promptPersona = "";
    if (persona === 'artigiano') {
      promptPersona = `Agisci come un Artigiano Tradizionale critico. Analizza l'immagine e i parametri di questo caso studio (${caso.titolo}): Desiderabilità ${d.desiderabilita}, Fattibilità ${d.fattibilita}, Responsabilità ${d.responsabilita}, Vitalità ${d.vitalita}. Descrizione: ${caso.descrizione}. Fai considerazioni sulla materia e la costruzione.`;
    } else if (persona === 'ingegnere') {
      promptPersona = `Agisci come un Ingegnere di Sistema rigoroso. Analizza il caso studio (${caso.titolo}) con driver Desiderabilità ${d.desiderabilita}, Fattibilità ${d.fattibilita}, Responsabilità ${d.responsabilita}, Vitalità ${d.vitalita}. Focalizzati su scalabilità e flussi.`;
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

  const aggiornaPosizioneDaDrop = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    if (!matrixRef.current) return;
    const rect = matrixRef.current.getBoundingClientRect();
    
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;
    
    const x = Math.round(((xPx / rect.width) * 200) - 100);
    const y = Math.round((((rect.height - yPx) / rect.height) * 200) - 100);

    const xClamped = Math.max(-100, Math.min(100, x));
    const yClamped = Math.max(-100, Math.min(100, y));

    const salvati = JSON.parse(localStorage.getItem('casiStudio') || '[]');
    const aggiornati = salvati.map((c: any) => {
      if (c.id === id) {
        const nuovoFattibilita = xClamped >= 0 ? 50 + (xClamped / 2) : 50 + (xClamped / 2);
        const nuovoDesiderabilita = xClamped <= 0 ? 50 - (xClamped / 2) : 50 - (xClamped / 2);
        const nuovoVitalita = yClamped <= 0 ? 50 - (yClamped / 2) : 50 - (yClamped / 2);
        const nuovoResponsabilita = yClamped >= 0 ? 50 + (yClamped / 2) : 50 + (yClamped / 2);

        const casoAggiornato = {
          ...c, x: xClamped, y: yClamped,
          driver: {
            desiderabilita: Math.max(0, Math.min(100, Math.round(nuovoDesiderabilita))),
            fattibilita: Math.max(0, Math.min(100, Math.round(nuovoFattibilita))),
            responsabilita: Math.max(0, Math.min(100, Math.round(nuovoResponsabilita))),
            vitalita: Math.max(0, Math.min(100, Math.round(nuovoVitalita)))
          }
        };
        if (selezionato?.id === id) setSelezionato(casoAggiornato);
        return casoAggiornato;
      }
      return c;
    });

    setCasi(aggiornati);
    localStorage.setItem('casiStudio', JSON.stringify(aggiornati));
  };

  const getClusterAnalitici = () => {
    const innovatori = casi.filter(c => c.x >= 0 && c.y >= 0);
    const sociali = casi.filter(c => c.x < 0 && c.y < 0);
    const strategici = casi.filter(c => c.x >= 0 && c.y < 0);
    const esplorativi = casi.filter(c => c.x < 0 && c.y >= 0);
    return { innovatori, sociali, strategici, esplorativi };
  };

  const clusters = getClusterAnalitici();

  if (!isAuth) {
    return (
      <main className="h-screen w-screen flex items-center justify-center bg-[#FBF9F5] px-4">
        <div className="bg-white p-8 rounded-2xl border border-stone-200 shadow-sm max-w-md w-full space-y-6">
          <div className="text-center space-y-2">
            <a href="/" className="text-xs uppercase tracking-widest text-stone-400 font-medium hover:text-stone-900">&larr; Home</a>
            <h1 className="text-2xl font-serif">Area Riservata Docente</h1>
            <p className="text-stone-500 text-xs">Inserisci la password amministrativa per accedere alla matrice e ai controlli.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Password (admin2026)</label>
              <input 
                type="password" 
                value={passLogin} 
                onChange={e => setPassLogin(e.target.value)} 
                placeholder="Password..." 
                className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50 focus:outline-none focus:border-stone-900" 
                required
              />
            </div>

            {erroreLogin && (
              <p className="text-xs text-red-600 font-medium text-center">Password errata. Riprova.</p>
            )}

            <button type="submit" className="w-full bg-stone-900 text-white py-3 rounded-xl font-medium hover:bg-stone-800 transition text-xs">
              Sblocca Area Docente
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen w-screen overflow-hidden flex flex-col bg-[#FBF9F5] text-stone-950 select-none">
      
      <header className="px-6 py-3.5 border-b border-stone-200 flex justify-between items-center bg-[#FBF9F5]/90 backdrop-blur z-20 flex-shrink-0">
        <div className="flex items-center space-x-4">
          <a href="/" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium">&larr; Home</a>
          <span className="text-stone-300">/</span>
          <h1 className="font-serif text-base font-medium">Dashboard Docente &amp; Matrice</h1>
        </div>

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
      </header>

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

            {casi.length === 0 && (
              <div className="absolute z-10 text-center text-stone-400 text-xs bg-white/80 backdrop-blur px-6 py-3 rounded-2xl border border-stone-200 shadow-sm">
                Nessun caso studio registrato. Vai su &quot;Area Studenti&quot; per inserire le consegne.
              </div>
            )}

            {casi.map(c => {
              const left = `${((c.x + 100) / 200) * 100}%`;
              const top = `${((-c.y + 100) / 200) * 100}%`;
              const isSelected = selezionato?.id === c.id;

              return (
                <div
                  key={c.id}
                  draggable
                  onDragEnd={(e) => aggiornaPosizioneDaDrop(e, c.id)}
                  onClick={() => { setSelezionato(c); setAiCritica(''); }}
                  style={{ left, top }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing transition-all duration-150 p-2.5 rounded-2xl bg-white border ${isSelected ? 'border-stone-900 shadow-2xl scale-105 z-30' : 'border-stone-200 shadow-md hover:border-stone-400 z-10'} flex items-center space-x-2.5 max-w-[200px]`}
                >
                  {c.immagine ? (
                    <div className="w-9 h-9 rounded-xl bg-stone-100 border border-stone-200 overflow-hidden flex items-center justify-center flex-shrink-0 p-0.5">
                      <img src={c.immagine} alt="" className="max-w-full max-h-full object-contain" />
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
                    <img src={selezionato.immagine} alt="" className="max-w-full max-h-full object-contain rounded-lg shadow-sm" />
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

                <div className="space-y-2 border-t border-stone-200 pt-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Ponderazione Driver IDEO</h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white p-2.5 rounded-xl border border-stone-200">Desiderabilità: <b className="text-xs">{selezionato.driver?.desiderabilita ?? 50}</b></div>
                    <div className="bg-white p-2.5 rounded-xl border border-stone-200">Fattibilità: <b className="text-xs">{selezionato.driver?.fattibilita ?? 50}</b></div>
                    <div className="bg-white p-2.5 rounded-xl border border-stone-200">Responsabilità: <b className="text-xs">{selezionato.driver?.responsabilita ?? 50}</b></div>
                    <div className="bg-white p-2.5 rounded-xl border border-stone-200">Vitalità: <b className="text-xs">{selezionato.driver?.vitalita ?? 50}</b></div>
                  </div>
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
        <div className="flex-1 p-12 overflow-y-auto bg-stone-200 space-y-12">
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
                <div key={c.id} className="bg-white aspect-[16/9] p-12 rounded-2xl shadow-lg border border-stone-300 flex flex-col justify-between page-break">
                  <div className="flex justify-between items-center border-b border-stone-200 pb-4">
                    <span className="text-xs uppercase tracking-widest text-stone-400 font-bold">Laboratorio di Design 3 &middot; Scheda {index + 1} di {casi.length}</span>
                    <span className="text-xs bg-stone-900 text-white px-3 py-1 rounded-full font-medium">Gruppo {c.gruppoNum} &mdash; {c.gruppoNome}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-8 items-center my-auto">
                    <div className="space-y-4">
                      <h2 className="text-3xl font-serif font-bold text-stone-900">{c.titolo}</h2>
                      <p className="text-sm text-stone-600 leading-relaxed bg-stone-50 p-4 rounded-xl border border-stone-200">
                        {c.descrizione || "Nessuna descrizione fornita."}
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-stone-50 p-2 rounded-lg border">Desiderabilità: <b>{c.driver?.desiderabilita}</b></div>
                        <div className="bg-stone-50 p-2 rounded-lg border">Fattibilità: <b>{c.driver?.fattibilita}</b></div>
                        <div className="bg-stone-50 p-2 rounded-lg border">Responsabilità: <b>{c.driver?.responsabilita}</b></div>
                        <div className="bg-stone-50 p-2 rounded-lg border">Vitalità: <b>{c.driver?.vitalita}</b></div>
                      </div>
                    </div>

                    <div className="h-72 bg-stone-100 rounded-2xl border border-stone-200 flex items-center justify-center p-4 overflow-hidden">
                      {c.immagine ? (
                        <img src={c.immagine} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
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
        <div className="flex-1 p-8 overflow-y-auto max-w-xl mx-auto w-full space-y-6 flex flex-col justify-center">
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
                <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Password per Reset Totale (admin2026)</label>
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
        </div>
      )}

    </main>
  );
}