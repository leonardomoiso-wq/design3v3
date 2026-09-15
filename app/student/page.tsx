'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { normalizzaDriver } from '../../lib/driver';

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

type Colore = 'verde' | 'giallo' | 'rosso';

export default function StudentPage() {
  const [activeTab, setActiveTab] = useState<'crea' | 'gestisci' | 'vota'>('crea');
  const [casi, setCasi] = useState<any[]>([]);
  
  const [editId, setEditId] = useState<number | null>(null);
  const [gruppoNome, setGruppoNome] = useState('');
  const [gruppoNum, setGruppoNum] = useState('');
  const [titolo, setTitolo] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [immagine, setImmagine] = useState<string>('');
  const [tagsSelezionati, setTagsSelezionati] = useState<string[]>([]);
  const [tagPersonalizzato, setTagPersonalizzato] = useState('');
  const [desiderabilita, setDesiderabilita] = useState(50);
  const [fattibilita, setFattibilita] = useState(50);
  const [responsabilita, setResponsabilita] = useState(50);
  const [vitalita, setVitalita] = useState(50);
  const [codiceGruppo, setCodiceGruppo] = useState('');
  const [erroreSalvataggio, setErroreSalvataggio] = useState('');
  const [salvataggioInCorso, setSalvataggioInCorso] = useState(false);

  const [filtroGruppo, setFiltroGruppo] = useState('');

  const [numeroGruppoVoto, setNumeroGruppoVoto] = useState('');
  const [casoAttivoId, setCasoAttivoId] = useState<number | null>(null);
  const [mioVoto, setMioVoto] = useState<Colore | null>(null);
  const [erroreVoto, setErroreVoto] = useState('');
  const [votoInCorso, setVotoInCorso] = useState(false);

  useEffect(() => {
    caricaDati();
    caricaStatoRevisione();

    const channel = supabase
      .channel('realtime-casi-studio-studenti')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casi_studio' }, caricaDati)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revisione_stato' }, caricaStatoRevisione)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const caricaStatoRevisione = async () => {
    const { data, error } = await supabase.from('revisione_stato').select('caso_attivo_id').eq('id', true).single();
    if (!error && data) {
      setCasoAttivoId(data.caso_attivo_id !== null ? Number(data.caso_attivo_id) : null);
    }
  };

  const caricaDati = async () => {
    const { data, error } = await supabase.from('casi_studio').select('*');
    if (!error && data) {
      const formattati = data.map(c => ({
        id: Number(c.id),
        gruppoNome: c.gruppo_nome,
        gruppoNum: c.gruppo_num,
        titolo: c.titolo,
        descrizione: c.descrizione,
        immagine: c.immagine,
        tags: c.tags || [],
        driver: normalizzaDriver(c.driver),
        x: Number(c.x),
        y: Number(c.y)
      }));
      setCasi(formattati);
    }
  };

  const toggleTag = (tag: string) => {
    setTagsSelezionati(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImmagine(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const messaggioErrore = (codice: string) => {
    switch (codice) {
      case 'codice_errato':
        return 'Codice di gruppo errato. Inserisci il codice scelto quando hai creato questa scheda.';
      case 'codice_troppo_corto':
        return 'Il codice di gruppo deve avere almeno 4 caratteri.';
      case 'caso_non_trovato':
        return 'Questo caso studio non esiste più (forse è stato cancellato).';
      default:
        return 'Errore durante il salvataggio. Riprova.';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroreSalvataggio('');
    setSalvataggioInCorso(true);

    const x = fattibilita - desiderabilita;
    const y = vitalita - responsabilita;

    const tagPersonalizzatoTrim = tagPersonalizzato.trim();
    const tagsFinali = tagPersonalizzatoTrim
      ? [...tagsSelezionati, tagPersonalizzatoTrim]
      : tagsSelezionati;

    const driver = { desiderabilita, fattibilita, responsabilita, vitalita };

    const { error } = editId !== null
      ? await supabase.rpc('aggiorna_caso_studio', {
          p_id: editId,
          p_codice: codiceGruppo,
          p_gruppo_nome: gruppoNome,
          p_gruppo_num: Number(gruppoNum),
          p_titolo: titolo,
          p_descrizione: descrizione,
          p_immagine: immagine,
          p_tags: tagsFinali,
          p_driver: driver,
          p_x: x,
          p_y: y,
        })
      : await supabase.rpc('crea_caso_studio', {
          p_gruppo_nome: gruppoNome,
          p_gruppo_num: Number(gruppoNum),
          p_titolo: titolo,
          p_descrizione: descrizione,
          p_immagine: immagine,
          p_tags: tagsFinali,
          p_driver: driver,
          p_x: x,
          p_y: y,
          p_codice: codiceGruppo,
        });

    setSalvataggioInCorso(false);

    if (error) {
      console.error('Errore nel salvataggio:', error);
      setErroreSalvataggio(messaggioErrore(error.message));
      return;
    }

    setGruppoNome(''); setGruppoNum(''); setTitolo(''); setDescrizione(''); setImmagine('');
    setTagsSelezionati([]); setTagPersonalizzato(''); setCodiceGruppo('');
    setDesiderabilita(50); setFattibilita(50); setResponsabilita(50); setVitalita(50);
    setEditId(null);
    await caricaDati();
    setActiveTab('gestisci');
  };

  const avviaModifica = (c: any) => {
    setEditId(c.id);
    setGruppoNome(c.gruppoNome);
    setGruppoNum(c.gruppoNum);
    setTitolo(c.titolo);
    setDescrizione(c.descrizione);
    setImmagine(c.immagine || '');
    setCodiceGruppo('');
    setErroreSalvataggio('');
    const tagsEsistenti: string[] = c.tags || [];
    setTagsSelezionati(tagsEsistenti.filter(t => TAG_OPTIONS.includes(t)));
    setTagPersonalizzato(tagsEsistenti.find(t => !TAG_OPTIONS.includes(t)) || '');
    if (c.driver) {
      setDesiderabilita(c.driver.desiderabilita);
      setFattibilita(c.driver.fattibilita);
      setResponsabilita(c.driver.responsabilita);
      setVitalita(c.driver.vitalita);
    }
    setActiveTab('crea');
  };

  const casiFiltrati = filtroGruppo.trim()
    ? casi.filter(c => String(c.gruppoNum) === String(filtroGruppo.trim()))
    : casi;

  const casoInVotazione = casoAttivoId !== null ? casi.find(c => c.id === casoAttivoId) || null : null;

  useEffect(() => {
    setMioVoto(null);
    setErroreVoto('');
    if (casoAttivoId === null || !numeroGruppoVoto.trim()) return;

    const caricaMioVoto = async () => {
      const { data } = await supabase
        .from('voti_revisione')
        .select('colore')
        .eq('caso_id', casoAttivoId)
        .eq('gruppo_num', Number(numeroGruppoVoto.trim()))
        .maybeSingle();
      if (data) setMioVoto(data.colore as Colore);
    };
    caricaMioVoto();
  }, [casoAttivoId, numeroGruppoVoto]);

  const votaCartellino = async (colore: Colore) => {
    if (casoAttivoId === null) return;
    const numero = numeroGruppoVoto.trim();
    if (!numero) {
      setErroreVoto('Inserisci il numero del tuo gruppo prima di votare.');
      return;
    }

    setVotoInCorso(true);
    setErroreVoto('');
    const { error } = await supabase.rpc('vota_caso_studio', {
      p_caso_id: casoAttivoId,
      p_gruppo_num: Number(numero),
      p_colore: colore,
    });
    setVotoInCorso(false);

    if (error) {
      setErroreVoto(
        error.message === 'votazione_non_attiva'
          ? 'La votazione per questo caso studio si è chiusa proprio ora. Attendi che il/la docente ne apra una nuova.'
          : 'Errore durante il voto. Riprova.'
      );
      return;
    }
    setMioVoto(colore);
  };

  return (
    <main className="min-h-screen px-6 py-10 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-8 border-b border-stone-200 pb-4">
        <a href="/" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium">&larr; Home</a>
        <div className="space-x-2">
          <button onClick={() => setActiveTab('crea')} className={`px-4 py-2 rounded-full text-xs font-medium transition ${activeTab === 'crea' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200'}`}>
            {editId !== null ? 'Modifica Scheda' : '+ Nuova Consegna'}
          </button>
          <button onClick={() => setActiveTab('gestisci')} className={`px-4 py-2 rounded-full text-xs font-medium transition ${activeTab === 'gestisci' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200'}`}>
            Elenco & Modifiche ({casi.length})
          </button>
          <button onClick={() => setActiveTab('vota')} className={`px-4 py-2 rounded-full text-xs font-medium transition relative ${activeTab === 'vota' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200'}`}>
            🗳️ Vota in Aula
            {casoInVotazione && activeTab !== 'vota' && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white"></span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'crea' ? (
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-serif">{editId !== null ? 'Modifica Caso Studio' : 'Consegna Analitica'}</h1>
            <p className="text-stone-600 text-sm mt-1">Inserisci i dati del gruppo, carica l&apos;immagine e valuta i driver di innovazione.</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl border border-stone-200 shadow-sm space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Nome Gruppo</label>
                <input type="text" required value={gruppoNome} onChange={e => setGruppoNome(e.target.value)} placeholder="Es. Design Studio" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:border-stone-900" />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Numero Gruppo</label>
                <input type="number" required value={gruppoNum} onChange={e => setGruppoNum(e.target.value)} placeholder="Es. 4" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:border-stone-900" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Codice di Gruppo</label>
              <input
                type="password"
                required
                minLength={4}
                value={codiceGruppo}
                onChange={e => setCodiceGruppo(e.target.value)}
                placeholder={editId !== null ? 'Inserisci il codice scelto alla creazione...' : 'Scegli un codice (min. 4 caratteri)...'}
                className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:border-stone-900"
              />
              <p className="text-[11px] text-stone-400 mt-1">
                {editId !== null
                  ? 'Serve a confermare che questa scheda è vostra: usate lo stesso codice inserito alla creazione.'
                  : 'Vi servirà per modificare questa scheda in futuro: conservatelo, non è recuperabile.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Titolo del Progetto</label>
              <input type="text" required value={titolo} onChange={e => setTitolo(e.target.value)} placeholder="Es. Superleggera" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:border-stone-900" />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Immagine di Copertina / Progetto</label>
              <div className="flex items-center space-x-4 border border-dashed border-stone-300 p-4 rounded-xl bg-stone-50/50">
                <div className="w-20 h-20 rounded-xl bg-stone-100 border border-stone-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                  {immagine ? (
                    <img src={immagine} alt="Preview" className="max-w-full max-h-full object-contain p-1" />
                  ) : (
                    <span className="text-[10px] text-stone-400 font-medium tracking-wide">NO IMG</span>
                  )}
                </div>
                <div className="flex-1">
                  <input type="file" accept="image/*" onChange={handleImageChange} className="w-full text-xs text-stone-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-stone-900 file:text-white cursor-pointer" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Descrizione Critica</label>
              <textarea rows={4} required value={descrizione} onChange={e => setDescrizione(e.target.value)} placeholder="Analizza il contesto, le leve di cambiamento e il valore generato..." className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:border-stone-900"></textarea>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase text-stone-500 mb-2">Tag Tematici</label>
              <div className="grid grid-cols-2 gap-2">
                {TAG_OPTIONS.map(tag => (
                  <label key={tag} className={`flex items-center space-x-2 text-xs p-2.5 rounded-xl border cursor-pointer transition ${tagsSelezionati.includes(tag) ? 'bg-stone-900 text-white border-stone-900' : 'bg-stone-50/50 border-stone-200 text-stone-700 hover:border-stone-400'}`}>
                    <input
                      type="checkbox"
                      checked={tagsSelezionati.includes(tag)}
                      onChange={() => toggleTag(tag)}
                      className="accent-stone-900"
                    />
                    <span>{tag}</span>
                  </label>
                ))}
              </div>
              <input
                type="text"
                value={tagPersonalizzato}
                onChange={e => setTagPersonalizzato(e.target.value)}
                placeholder="Altro (tag personalizzato)..."
                className="w-full mt-2 border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:border-stone-900"
              />
            </div>

            <div className="border-t border-stone-100 pt-6 space-y-5">
              <h3 className="font-serif text-sm font-medium">Ponderazione Driver IDEO (0 - 100)</h3>
              
              <div>
                <div className="flex justify-between text-xs text-stone-500 mb-1.5 font-medium"><span>Desiderabilità</span><span>{desiderabilita}</span></div>
                <input type="range" min="0" max="100" value={desiderabilita} onChange={e => setDesiderabilita(Number(e.target.value))} className="w-full accent-stone-900 cursor-pointer" />
              </div>

              <div>
                <div className="flex justify-between text-xs text-stone-500 mb-1.5 font-medium"><span>Fattibilità</span><span>{fattibilita}</span></div>
                <input type="range" min="0" max="100" value={fattibilita} onChange={e => setFattibilita(Number(e.target.value))} className="w-full accent-stone-900 cursor-pointer" />
              </div>

              <div>
                <div className="flex justify-between text-xs text-stone-500 mb-1.5 font-medium"><span>Responsabilità</span><span>{responsabilita}</span></div>
                <input type="range" min="0" max="100" value={responsabilita} onChange={e => setResponsabilita(Number(e.target.value))} className="w-full accent-stone-900 cursor-pointer" />
              </div>

              <div>
                <div className="flex justify-between text-xs text-stone-500 mb-1.5 font-medium"><span>Vitalità</span><span>{vitalita}</span></div>
                <input type="range" min="0" max="100" value={vitalita} onChange={e => setVitalita(Number(e.target.value))} className="w-full accent-stone-900 cursor-pointer" />
              </div>
            </div>

            {erroreSalvataggio && (
              <p className="text-xs text-red-600 font-medium text-center bg-red-50 border border-red-200 rounded-xl p-3">{erroreSalvataggio}</p>
            )}

            <button type="submit" disabled={salvataggioInCorso} className="w-full bg-stone-900 text-white py-3.5 rounded-xl font-medium hover:bg-stone-800 transition shadow-sm disabled:opacity-50">
              {salvataggioInCorso ? 'Salvataggio...' : editId !== null ? 'Salva Modifiche' : 'Invia Consegna'}
            </button>
          </form>
        </div>
      ) : activeTab === 'gestisci' ? (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
            <div>
              <h1 className="text-2xl font-serif">Elenco Casi Studio</h1>
              <p className="text-stone-500 text-xs mt-0.5">Filtra per numero di gruppo per verificare o modificare la tua scheda.</p>
            </div>
            <div className="w-40">
              <input type="number" value={filtroGruppo} onChange={e => setFiltroGruppo(e.target.value)} placeholder="N. Gruppo..." className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-stone-50 focus:outline-none focus:border-stone-900" />
            </div>
          </div>

          <div className="space-y-3">
            {casiFiltrati.length === 0 ? (
              <div className="bg-white p-12 rounded-2xl border border-stone-200 text-center text-stone-400 text-sm">
                Nessun caso studio trovato.
              </div>
            ) : (
              casiFiltrati.map(c => (
                <div key={c.id} className="bg-white p-4 rounded-2xl border border-stone-200 flex items-center justify-between shadow-sm hover:border-stone-300 transition">
                  <div className="flex items-center space-x-4">
                    {c.immagine ? (
                      <div className="w-12 h-12 rounded-xl bg-stone-100 border border-stone-200 overflow-hidden flex items-center justify-center flex-shrink-0 p-1">
                        <img src={c.immagine} alt="" className="max-w-full max-h-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center text-[10px] text-stone-400 font-bold flex-shrink-0">IMG</div>
                    )}
                    <div>
                      <h3 className="font-bold text-sm text-stone-900">{c.titolo}</h3>
                      <p className="text-xs text-stone-500">Gruppo {c.gruppoNum} — {c.gruppoNome}</p>
                    </div>
                  </div>
                  <button onClick={() => avviaModifica(c)} className="text-xs bg-stone-100 hover:bg-stone-900 hover:text-white px-4 py-2 rounded-xl font-medium transition">
                    Modifica
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-serif">Vota in Aula</h1>
            <p className="text-stone-500 text-xs mt-1">Quando il/la docente apre la votazione su un caso studio, esprimete il vostro cartellino come gruppo.</p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Il vostro Numero Gruppo</label>
              <input
                type="number"
                value={numeroGruppoVoto}
                onChange={e => setNumeroGruppoVoto(e.target.value)}
                placeholder="Es. 4"
                className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:border-stone-900"
              />
            </div>

            {!casoInVotazione ? (
              <div className="text-center text-stone-400 text-sm py-8">
                Nessuna votazione attiva al momento. Attendi che il/la docente apra il voto su un caso studio.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center space-x-4 p-4 bg-stone-50 rounded-xl border border-stone-200">
                  {casoInVotazione.immagine ? (
                    <div className="w-16 h-16 rounded-xl bg-white border border-stone-200 overflow-hidden flex items-center justify-center flex-shrink-0 p-1">
                      <img src={casoInVotazione.immagine} alt="" className="max-w-full max-h-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-[10px] text-stone-400 font-bold flex-shrink-0">IMG</div>
                  )}
                  <div>
                    <span className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold">🟢 In votazione ora</span>
                    <h3 className="font-serif font-bold text-base text-stone-900">{casoInVotazione.titolo}</h3>
                    <p className="text-xs text-stone-500">Gruppo {casoInVotazione.gruppoNum} — {casoInVotazione.gruppoNome}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {(['verde', 'giallo', 'rosso'] as Colore[]).map(colore => {
                    const stile = {
                      verde: 'bg-emerald-500',
                      giallo: 'bg-amber-400',
                      rosso: 'bg-red-500',
                    }[colore];
                    const selezionato = mioVoto === colore;
                    return (
                      <button
                        key={colore}
                        onClick={() => votaCartellino(colore)}
                        disabled={votoInCorso}
                        className={`flex flex-col items-center space-y-2 p-4 rounded-2xl border-2 transition disabled:opacity-50 ${selezionato ? 'border-stone-900' : 'border-transparent hover:border-stone-300'}`}
                      >
                        <span className={`w-14 h-14 rounded-2xl ${stile} shadow-md flex items-center justify-center text-white text-xl`}>
                          {selezionato ? '✓' : ''}
                        </span>
                        <span className="text-xs font-medium capitalize text-stone-700">{colore}</span>
                      </button>
                    );
                  })}
                </div>

                {mioVoto && (
                  <p className="text-xs text-emerald-700 text-center font-medium">Voto registrato: {mioVoto}. Puoi cambiarlo finché la votazione resta aperta.</p>
                )}
                {erroreVoto && (
                  <p className="text-xs text-red-600 font-medium text-center bg-red-50 border border-red-200 rounded-xl p-3">{erroreVoto}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}