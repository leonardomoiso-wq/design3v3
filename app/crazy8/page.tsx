'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type TipoImmagine = 'sketch_originale' | 'generata';
type ImmagineForm = { tipo: TipoImmagine; ordine: number; urlFile: string };

const messaggioErrore = (codice: string) => {
  switch (codice) {
    case 'codice_errato':
      return 'Codice di gruppo errato. Inserisci il codice scelto quando hai creato questa consegna.';
    case 'codice_troppo_corto':
      return 'Il codice di gruppo deve avere almeno 4 caratteri.';
    case 'submission_non_trovata':
      return 'Questa consegna non esiste più (forse è stata cancellata).';
    default:
      return 'Errore durante il salvataggio. Riprova.';
  }
};

function leggiFileComeDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Crazy8Page() {
  const [attivitaInfo, setAttivitaInfo] = useState<{ id: string; stato: string; richiediLogPrompt: boolean; richiediRiflessione: boolean } | null | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'crea' | 'gestisci'>('crea');
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [filtroGruppo, setFiltroGruppo] = useState('');

  const [editId, setEditId] = useState<string | null>(null);
  const [gruppoNome, setGruppoNome] = useState('');
  const [gruppoNum, setGruppoNum] = useState('');
  const [hmwOTema, setHmwOTema] = useState('');
  const [motoreUsato, setMotoreUsato] = useState('');
  const [sketch, setSketch] = useState<ImmagineForm[]>([]);
  const [generata, setGenerata] = useState<ImmagineForm[]>([]);
  const [notePrompt, setNotePrompt] = useState('');
  const [riflessione, setRiflessione] = useState('');
  const [codiceGruppo, setCodiceGruppo] = useState('');
  const [codiceGiaVerificato, setCodiceGiaVerificato] = useState(false);
  const [erroreSalvataggio, setErroreSalvataggio] = useState('');
  const [salvataggioInCorso, setSalvataggioInCorso] = useState(false);

  const [submissionDaSbloccare, setSubmissionDaSbloccare] = useState<any | null>(null);
  const [codiceSblocco, setCodiceSblocco] = useState('');
  const [erroreSblocco, setErroreSblocco] = useState('');
  const [verificaInCorso, setVerificaInCorso] = useState(false);

  const [submissionDaEliminare, setSubmissionDaEliminare] = useState<any | null>(null);
  const [codiceEliminazione, setCodiceEliminazione] = useState('');
  const [erroreEliminazione, setErroreEliminazione] = useState('');
  const [eliminazioneInCorso, setEliminazioneInCorso] = useState(false);

  const caricaSubmissions = async () => {
    const { data, error } = await supabase
      .from('submission_crazy8')
      .select('*, immagini(*)')
      .order('created_at', { ascending: false });
    if (!error && data) {
      const formattate = (data as any[]).map(s => ({
        ...s,
        immagini: (s.immagini || []).slice().sort((a: any, b: any) => a.ordine - b.ordine),
      }));
      setSubmissions(formattate);
    }
  };

  useEffect(() => {
    const caricaAttivita = async () => {
      const { data } = await supabase.from('attivita').select('*').eq('tipo', 'crazy8_ai').maybeSingle();
      if (data) {
        setAttivitaInfo({
          id: data.id,
          stato: data.stato,
          richiediLogPrompt: data.richiedi_log_prompt,
          richiediRiflessione: data.richiedi_riflessione,
        });
      } else {
        setAttivitaInfo(null);
      }
    };

    caricaAttivita();
    caricaSubmissions();

    const channel = supabase
      .channel('realtime-crazy8-studenti')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submission_crazy8' }, caricaSubmissions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'immagini' }, caricaSubmissions)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setGruppoNome(''); setGruppoNum(''); setHmwOTema(''); setMotoreUsato('');
    setSketch([]); setGenerata([]); setNotePrompt(''); setRiflessione('');
    setCodiceGruppo(''); setCodiceGiaVerificato(false); setEditId(null);
    setErroreSalvataggio('');
  };

  const caricaImmagini = async (e: React.ChangeEvent<HTMLInputElement>, tipo: TipoImmagine, setLista: React.Dispatch<React.SetStateAction<ImmagineForm[]>>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of files) {
      const urlFile = await leggiFileComeDataUrl(file);
      setLista(prev => [...prev, { tipo, ordine: prev.length, urlFile }]);
    }
  };

  const rimuoviImmagine = (setLista: React.Dispatch<React.SetStateAction<ImmagineForm[]>>, indice: number) => {
    setLista(prev => prev.filter((_, i) => i !== indice).map((img, i) => ({ ...img, ordine: i })));
  };

  const formValido =
    gruppoNome.trim() !== '' &&
    String(gruppoNum).trim() !== '' &&
    (codiceGiaVerificato || codiceGruppo.trim().length >= 4) &&
    sketch.length > 0 &&
    generata.length > 0 &&
    (!attivitaInfo?.richiediLogPrompt || notePrompt.trim() !== '') &&
    (!attivitaInfo?.richiediRiflessione || riflessione.trim() !== '');

  const inviaConsegna = async () => {
    setErroreSalvataggio('');
    setSalvataggioInCorso(true);

    const immaginiPayload = [...sketch, ...generata].map(img => ({ tipo: img.tipo, ordine: img.ordine, url_file: img.urlFile }));

    const { error } = editId !== null
      ? await supabase.rpc('aggiorna_submission_crazy8', {
          p_id: editId,
          p_codice: codiceGruppo,
          p_gruppo_nome: gruppoNome,
          p_gruppo_num: Number(gruppoNum),
          p_hmw_o_tema: hmwOTema,
          p_motore_usato: motoreUsato,
          p_note_prompt: notePrompt,
          p_riflessione: riflessione,
          p_stato: 'consegnato',
          p_immagini: immaginiPayload,
        })
      : await supabase.rpc('crea_submission_crazy8', {
          p_attivita_id: attivitaInfo?.id ?? null,
          p_gruppo_nome: gruppoNome,
          p_gruppo_num: Number(gruppoNum),
          p_hmw_o_tema: hmwOTema,
          p_motore_usato: motoreUsato,
          p_note_prompt: notePrompt,
          p_riflessione: riflessione,
          p_stato: 'consegnato',
          p_immagini: immaginiPayload,
          p_codice: codiceGruppo,
        });

    setSalvataggioInCorso(false);

    if (error) {
      setErroreSalvataggio(messaggioErrore(error.message));
      return;
    }

    resetForm();
    await caricaSubmissions();
    setActiveTab('gestisci');
  };

  const avviaModifica = (s: any, codiceVerificato: string) => {
    setEditId(s.id);
    setGruppoNome(s.gruppo_nome);
    setGruppoNum(String(s.gruppo_num));
    setHmwOTema(s.hmw_o_tema || '');
    setMotoreUsato(s.motore_usato || '');
    setSketch((s.immagini || []).filter((i: any) => i.tipo === 'sketch_originale').map((i: any, idx: number) => ({ tipo: 'sketch_originale', ordine: idx, urlFile: i.url_file })));
    setGenerata((s.immagini || []).filter((i: any) => i.tipo === 'generata').map((i: any, idx: number) => ({ tipo: 'generata', ordine: idx, urlFile: i.url_file })));
    setNotePrompt(s.note_prompt || '');
    setRiflessione(s.riflessione || '');
    setCodiceGruppo(codiceVerificato);
    setCodiceGiaVerificato(true);
    setErroreSalvataggio('');
    setActiveTab('crea');
  };

  const chiediSblocco = (s: any) => {
    setSubmissionDaSbloccare(s);
    setCodiceSblocco('');
    setErroreSblocco('');
  };

  const confermaSblocco = async () => {
    if (!submissionDaSbloccare) return;
    setVerificaInCorso(true);
    setErroreSblocco('');

    const { data, error } = await supabase.rpc('verifica_codice_submission_crazy8', {
      p_id: submissionDaSbloccare.id,
      p_codice: codiceSblocco,
    });

    setVerificaInCorso(false);

    if (error || !data) {
      setErroreSblocco('Codice errato. Riprova.');
      return;
    }

    const s = submissionDaSbloccare;
    setSubmissionDaSbloccare(null);
    avviaModifica(s, codiceSblocco);
  };

  const chiediEliminazione = (s: any) => {
    setSubmissionDaEliminare(s);
    setCodiceEliminazione('');
    setErroreEliminazione('');
  };

  const confermaEliminazione = async () => {
    if (!submissionDaEliminare) return;
    setEliminazioneInCorso(true);
    setErroreEliminazione('');

    const { error } = await supabase.rpc('elimina_submission_crazy8', {
      p_id: submissionDaEliminare.id,
      p_codice: codiceEliminazione,
    });

    setEliminazioneInCorso(false);

    if (error) {
      setErroreEliminazione('Codice errato. Riprova.');
      return;
    }

    setSubmissionDaEliminare(null);
    await caricaSubmissions();
  };

  const submissionFiltrate = filtroGruppo.trim()
    ? submissions.filter(s => String(s.gruppo_num) === String(filtroGruppo.trim()))
    : submissions;

  if (attivitaInfo === undefined) {
    return <main className="min-h-screen flex items-center justify-center text-sm text-stone-400">Caricamento...</main>;
  }

  if (attivitaInfo === null || attivitaInfo.stato !== 'attiva') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center px-6 space-y-3">
        <span className="text-3xl" aria-hidden="true">🎨</span>
        <h1 className="text-xl font-serif">Questa attività non è ancora disponibile</h1>
        <p className="text-sm text-stone-500 max-w-sm">Il/la docente non l&apos;ha ancora attivata. Torna più tardi o chiedi in aula.</p>
        <a href="/" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium mt-4">&larr; Torna alla Home</a>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-8 border-b border-stone-200 pb-4">
        <div className="flex items-center space-x-4">
          <a href="/" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium">&larr; Home</a>
        </div>
        <div className="space-x-2">
          <button onClick={() => { resetForm(); setActiveTab('crea'); }} className={`px-4 py-2 rounded-full text-xs font-medium transition ${activeTab === 'crea' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200'}`}>
            {editId !== null ? 'Modifica Consegna' : '+ Nuova Consegna'}
          </button>
          <button onClick={() => setActiveTab('gestisci')} className={`px-4 py-2 rounded-full text-xs font-medium transition ${activeTab === 'gestisci' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200'}`}>
            Elenco & Modifiche ({submissions.length})
          </button>
        </div>
      </div>

      <h1 className="text-2xl font-serif mb-1">🎨 Crazy 8 + Co-creazione Generativa</h1>
      <p className="text-sm text-stone-500 mb-6">Caricate gli sketch scelti dal vostro Crazy 8 insieme alle immagini generate con l&apos;AI a vostra scelta.</p>

      {activeTab === 'crea' ? (
        <div className="space-y-5">
          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">Il Gruppo</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Nome Gruppo</label>
                <input type="text" value={gruppoNome} onChange={e => setGruppoNome(e.target.value)} placeholder="Es. Design Studio" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Numero Gruppo</label>
                <input type="number" value={gruppoNum} onChange={e => setGruppoNum(e.target.value)} placeholder="Es. 4" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
              </div>
            </div>
            {codiceGiaVerificato ? (
              <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-3 text-xs font-medium">
                <span aria-hidden="true">✓</span>
                <span>Codice di gruppo verificato — potete modificare questa consegna.</span>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Codice di Gruppo</label>
                <input type="password" minLength={4} value={codiceGruppo} onChange={e => setCodiceGruppo(e.target.value)} placeholder="Scegli un codice (min. 4 caratteri)..." className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
                <p className="text-[11px] text-stone-400 mt-1">Vi servirà per modificare questa consegna in futuro: conservatelo, non è recuperabile.</p>
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">Il Progetto</h2>
            <div>
              <label className="block text-xs font-medium uppercase text-stone-500 mb-1">HMW o Tema di Riferimento</label>
              <input type="text" value={hmwOTema} onChange={e => setHmwOTema(e.target.value)} placeholder="Il vostro How Might We o il tema del Crazy 8..." className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Motore AI Usato</label>
              <input type="text" value={motoreUsato} onChange={e => setMotoreUsato(e.target.value)} placeholder="Es. Midjourney, DALL·E, Stable Diffusion..." className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">Immagini</h2>

            <div>
              <span className="block text-xs font-medium uppercase text-stone-500 mb-1">Sketch Originali (1-3, i selezionati dal Crazy 8)</span>
              <input type="file" accept="image/*" multiple onChange={e => caricaImmagini(e, 'sketch_originale', setSketch)} className="w-full text-xs text-stone-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-stone-900 file:text-white cursor-pointer" />
              {sketch.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {sketch.map((img, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-xl bg-stone-100 border border-stone-200 overflow-hidden">
                      <img src={img.urlFile} alt={`Sketch ${i + 1}`} className="w-full h-full object-contain" />
                      <button type="button" onClick={() => rimuoviImmagine(setSketch, i)} aria-label={`Rimuovi sketch ${i + 1}`} className="absolute top-0.5 right-0.5 w-5 h-5 bg-stone-900/80 text-white rounded-full text-[10px] leading-none">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <span className="block text-xs font-medium uppercase text-stone-500 mb-1">Immagini Generate (con AI, a partire dagli sketch)</span>
              <input type="file" accept="image/*" multiple onChange={e => caricaImmagini(e, 'generata', setGenerata)} className="w-full text-xs text-stone-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-stone-900 file:text-white cursor-pointer" />
              {generata.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {generata.map((img, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-xl bg-stone-100 border border-stone-200 overflow-hidden">
                      <img src={img.urlFile} alt={`Generata ${i + 1}`} className="w-full h-full object-contain" />
                      <button type="button" onClick={() => rimuoviImmagine(setGenerata, i)} aria-label={`Rimuovi immagine generata ${i + 1}`} className="absolute top-0.5 right-0.5 w-5 h-5 bg-stone-900/80 text-white rounded-full text-[10px] leading-none">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">Log Prompt &amp; Riflessione</h2>
            <div>
              <label className="block text-xs font-medium uppercase text-stone-500 mb-1">
                Log Prompt {attivitaInfo.richiediLogPrompt ? '(obbligatorio)' : '(facoltativo)'}
              </label>
              <textarea rows={3} value={notePrompt} onChange={e => setNotePrompt(e.target.value)} placeholder="Che prompt avete usato? Quanti tentativi vi sono serviti?" className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase text-stone-500 mb-1">
                Riflessione {attivitaInfo.richiediRiflessione ? '(obbligatoria)' : '(facoltativa)'}
              </label>
              <textarea rows={3} value={riflessione} onChange={e => setRiflessione(e.target.value)} placeholder="Cosa ha funzionato? Cosa cambiereste nel processo sketch → AI?" className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
            </div>
          </div>

          {erroreSalvataggio && (
            <p className="text-xs text-red-600 font-medium text-center bg-red-50 border border-red-200 rounded-xl p-3">{erroreSalvataggio}</p>
          )}

          <button
            onClick={inviaConsegna}
            disabled={!formValido || salvataggioInCorso}
            className="w-full bg-stone-900 text-white py-3 rounded-xl text-sm font-medium hover:bg-stone-800 transition disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
          >
            {salvataggioInCorso ? 'Salvataggio...' : editId !== null ? 'Salva Modifiche' : 'Invia Consegna'}
          </button>
          {!formValido && (
            <p className="text-[11px] text-stone-400 text-center">
              Servono gruppo, codice, almeno uno sketch e una generata{(attivitaInfo.richiediLogPrompt || attivitaInfo.richiediRiflessione) ? ', e i campi obbligatori sopra' : ''}.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
            <p className="text-stone-500 text-xs">Filtra per numero di gruppo per verificare o modificare la tua consegna.</p>
            <div className="w-40">
              <input type="number" value={filtroGruppo} onChange={e => setFiltroGruppo(e.target.value)} placeholder="N. Gruppo..." className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
            </div>
          </div>

          <div className="space-y-3">
            {submissionFiltrate.length === 0 ? (
              <div className="bg-white p-12 rounded-2xl border border-stone-200 text-center text-stone-400 text-sm">Nessuna consegna trovata.</div>
            ) : (
              submissionFiltrate.map(s => (
                <div key={s.id} className="bg-white p-4 rounded-2xl border border-stone-200 flex items-center justify-between shadow-sm hover:border-stone-300 transition">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-xl bg-stone-100 border border-stone-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                      {s.immagini?.[0] ? (
                        <img src={s.immagini[0].url_file} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-stone-400 font-bold">IMG</span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-stone-900">{s.hmw_o_tema || 'Senza tema'}</h3>
                      <p className="text-xs text-stone-500">Gruppo {s.gruppo_num} — {s.gruppo_nome} · <span className="capitalize">{s.stato.replace('_', ' ')}</span></p>
                    </div>
                  </div>
                  <div className="flex space-x-2 flex-shrink-0">
                    <button onClick={() => chiediSblocco(s)} className="text-xs bg-stone-100 hover:bg-stone-900 hover:text-white px-4 py-2 rounded-xl font-medium transition">Modifica</button>
                    <button onClick={() => chiediEliminazione(s)} className="text-xs bg-stone-100 hover:bg-red-600 hover:text-white px-4 py-2 rounded-xl font-medium transition">Elimina</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {submissionDaSbloccare && (
        <div className="fixed inset-0 z-40 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-6" role="dialog" aria-modal="true" onClick={() => setSubmissionDaSbloccare(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="font-serif font-bold text-lg">Sblocca per modificare</h2>
            <p className="text-xs text-stone-500">Inserisci il codice di gruppo di &ldquo;{submissionDaSbloccare.hmw_o_tema || 'questa consegna'}&rdquo;.</p>
            <form onSubmit={e => { e.preventDefault(); confermaSblocco(); }}>
              <input type="password" autoFocus value={codiceSblocco} onChange={e => setCodiceSblocco(e.target.value)} placeholder="Codice di gruppo..." className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
              {erroreSblocco && <p role="alert" className="text-xs text-red-600 font-medium mt-2 bg-red-50 border border-red-200 rounded-xl p-2.5">{erroreSblocco}</p>}
              <div className="flex space-x-2 mt-4">
                <button type="button" onClick={() => setSubmissionDaSbloccare(null)} className="flex-1 bg-stone-100 hover:bg-stone-200 transition text-xs font-medium py-2.5 rounded-xl">Annulla</button>
                <button type="submit" disabled={verificaInCorso} className="flex-1 bg-stone-900 text-white hover:bg-stone-800 transition text-xs font-medium py-2.5 rounded-xl disabled:opacity-50">{verificaInCorso ? 'Verifica...' : 'Sblocca'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {submissionDaEliminare && (
        <div className="fixed inset-0 z-40 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-6" role="dialog" aria-modal="true" onClick={() => setSubmissionDaEliminare(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="font-serif font-bold text-lg text-red-700">Eliminare questa consegna?</h2>
            <p className="text-xs text-stone-500">Questa azione è irreversibile. Inserisci il codice di gruppo per confermare.</p>
            <form onSubmit={e => { e.preventDefault(); confermaEliminazione(); }}>
              <input type="password" autoFocus value={codiceEliminazione} onChange={e => setCodiceEliminazione(e.target.value)} placeholder="Codice di gruppo..." className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
              {erroreEliminazione && <p role="alert" className="text-xs text-red-600 font-medium mt-2 bg-red-50 border border-red-200 rounded-xl p-2.5">{erroreEliminazione}</p>}
              <div className="flex space-x-2 mt-4">
                <button type="button" onClick={() => setSubmissionDaEliminare(null)} className="flex-1 bg-stone-100 hover:bg-stone-200 transition text-xs font-medium py-2.5 rounded-xl">Annulla</button>
                <button type="submit" disabled={eliminazioneInCorso} className="flex-1 bg-red-600 text-white hover:bg-red-700 transition text-xs font-medium py-2.5 rounded-xl disabled:opacity-50">{eliminazioneInCorso ? 'Eliminazione...' : 'Elimina'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
