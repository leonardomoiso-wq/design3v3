'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type TipoImmagine = 'sketch_originale' | 'generata';
type ImmagineForm = { tipo: TipoImmagine; ordine: number; urlFile: string };
type Step = 'immagini' | 'racconta' | 'riepilogo';

const TUTORIAL_VISTO_KEY = 'crazy8_tutorial_visto';

const TUTORIAL_SLIDES = [
  { icona: '✏️', titolo: 'Scegliete lo sketch giusto', testo: "Dagli 8 schizzi del Crazy 8, portate qui solo 1-3: quelli con l'idea più chiara, non i più rifiniti." },
  { icona: '💬', titolo: 'Scrivete un prompt efficace', testo: 'Descrivete forma, materiale, ambientazione e stile. Più siete specifici, più il risultato sarà vicino alla vostra idea.' },
  { icona: '🔄', titolo: 'Generazione consapevole', testo: "L'AI non sostituisce lo sketch: lo estende. Confrontate sempre generata e originale, e iterate se il risultato non convince." },
  { icona: '📝', titolo: 'Documentate il processo', testo: 'Segnate i prompt usati e cosa cambiereste: sarà utile a voi in revisione e a chi guarda il vostro lavoro dopo di voi.' },
];

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

function TutorialOverlay({ onChiudi }: { onChiudi: () => void }) {
  const [indice, setIndice] = useState(0);
  const ultimo = indice === TUTORIAL_SLIDES.length - 1;
  const slide = TUTORIAL_SLIDES[indice];

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/95 backdrop-blur-sm flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label="Tutorial Crazy 8">
      <div key={indice} className="max-w-lg w-full text-center space-y-6 animate-fade-in-up">
        <span className="text-6xl block" aria-hidden="true">{slide.icona}</span>
        <h2 className="text-2xl font-serif font-bold text-white">{slide.titolo}</h2>
        <p className="text-stone-300 text-sm leading-relaxed">{slide.testo}</p>

        <div className="flex items-center justify-center gap-1.5 pt-2">
          {TUTORIAL_SLIDES.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === indice ? 'w-6 bg-white' : 'w-1.5 bg-stone-600'}`} />
          ))}
        </div>

        <div className="flex items-center justify-center gap-3 pt-4">
          <button onClick={onChiudi} className="text-xs text-stone-400 hover:text-white transition px-4 py-2">Salta</button>
          <button
            onClick={() => (ultimo ? onChiudi() : setIndice(i => i + 1))}
            className="bg-white text-stone-900 px-6 py-2.5 rounded-full text-xs font-bold hover:bg-stone-200 transition"
          >
            {ultimo ? 'Inizia' : 'Avanti →'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Crazy8Page() {
  const [attivitaInfo, setAttivitaInfo] = useState<{ id: string; stato: string; richiediLogPrompt: boolean; richiediRiflessione: boolean } | null | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'crea' | 'gestisci'>('crea');
  const [step, setStep] = useState<Step>('immagini');
  const [mostraTutorial, setMostraTutorial] = useState(false);
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

    try {
      if (!localStorage.getItem(TUTORIAL_VISTO_KEY)) setMostraTutorial(true);
    } catch {
      // storage non disponibile (modalità privata, ecc.): niente tutorial automatico, resta raggiungibile a mano
    }

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

  const chiudiTutorial = () => {
    setMostraTutorial(false);
    try {
      localStorage.setItem(TUTORIAL_VISTO_KEY, '1');
    } catch {
      // niente di grave: il tutorial ricomparirà alla prossima visita, non è bloccante
    }
  };

  const resetForm = () => {
    setGruppoNome(''); setGruppoNum(''); setHmwOTema(''); setMotoreUsato('');
    setSketch([]); setGenerata([]); setNotePrompt(''); setRiflessione('');
    setCodiceGruppo(''); setCodiceGiaVerificato(false); setEditId(null);
    setErroreSalvataggio(''); setStep('immagini');
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

  const immaginiPronte = sketch.length > 0 && generata.length > 0;

  const formValido =
    gruppoNome.trim() !== '' &&
    String(gruppoNum).trim() !== '' &&
    (codiceGiaVerificato || codiceGruppo.trim().length >= 4) &&
    immaginiPronte &&
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
    setStep('immagini');
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
    <main className="min-h-screen bg-[#FBF9F5]">
      {mostraTutorial && <TutorialOverlay onChiudi={chiudiTutorial} />}

      <div className="flex justify-between items-center px-6 py-4 border-b border-stone-200">
        <a href="/" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium">&larr; Home</a>
        <div className="flex items-center gap-2">
          <button onClick={() => setMostraTutorial(true)} className="text-xs text-stone-400 hover:text-stone-900 transition px-2">? Tutorial</button>
          <button onClick={() => { resetForm(); setActiveTab('crea'); }} className={`px-4 py-2 rounded-full text-xs font-medium transition ${activeTab === 'crea' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200'}`}>
            {editId !== null ? 'Modifica' : '+ Nuova Consegna'}
          </button>
          <button onClick={() => setActiveTab('gestisci')} className={`px-4 py-2 rounded-full text-xs font-medium transition ${activeTab === 'gestisci' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200'}`}>
            Elenco ({submissions.length})
          </button>
        </div>
      </div>

      {activeTab === 'crea' ? (
        <div className="min-h-[calc(100vh-65px)] flex flex-col">
          <div className="flex items-center justify-center gap-2 pt-6 pb-2">
            {(['immagini', 'racconta', 'riepilogo'] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition ${step === s ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-500'}`}>{i + 1}</span>
                {i < 2 && <span className="w-8 h-px bg-stone-300" />}
              </div>
            ))}
          </div>

          {step === 'immagini' && (
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-5xl mx-auto w-full">
              <div className="text-center mb-8 animate-fade-in-up">
                <h1 className="text-3xl font-serif">🎨 Sketch → Generata</h1>
                <p className="text-sm text-stone-500 mt-1">Caricate i vostri schizzi e le immagini generate: vedrete subito il confronto.</p>
              </div>

              <div className="grid sm:grid-cols-2 gap-6 w-full">
                {([
                  ['sketch_originale', sketch, setSketch, 'Sketch Originali', '✏️'],
                  ['generata', generata, setGenerata, 'Immagini Generate', '✨'],
                ] as const).map(([tipo, lista, setLista, etichetta, icona]) => (
                  <div key={tipo} className="space-y-3">
                    <label
                      htmlFor={`upload-${tipo}`}
                      className="flex flex-col items-center justify-center gap-2 h-40 rounded-3xl border-2 border-dashed border-stone-300 bg-white hover:border-stone-500 hover:bg-stone-50 transition cursor-pointer"
                    >
                      <span className="text-3xl" aria-hidden="true">{icona}</span>
                      <span className="text-sm font-medium text-stone-700">{etichetta}</span>
                      <span className="text-[11px] text-stone-400">Clicca per caricare</span>
                    </label>
                    <input id={`upload-${tipo}`} type="file" accept="image/*" multiple className="sr-only" onChange={e => caricaImmagini(e, tipo, setLista)} />

                    {lista.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {lista.map((img, i) => (
                          <div key={i} className="relative w-20 h-20 rounded-xl bg-stone-100 border border-stone-200 overflow-hidden animate-scale-in" style={{ animationDelay: `${i * 60}ms` }}>
                            <img src={img.urlFile} alt={`${etichetta} ${i + 1}`} className="w-full h-full object-contain" />
                            <button type="button" onClick={() => rimuoviImmagine(setLista, i)} aria-label={`Rimuovi ${etichetta} ${i + 1}`} className="absolute top-0.5 right-0.5 w-5 h-5 bg-stone-900/80 text-white rounded-full text-[10px] leading-none">✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {immaginiPronte && (
                <div className="w-full mt-8 animate-fade-in-up">
                  <p className="text-[11px] uppercase tracking-widest text-stone-400 text-center mb-3">Anteprima del confronto</p>
                  <div className="grid grid-cols-2 gap-4 bg-white rounded-3xl border border-stone-200 p-4 shadow-sm">
                    <div className="rounded-2xl overflow-hidden bg-stone-50 h-56 flex items-center justify-center">
                      <img src={sketch[0].urlFile} alt="Sketch principale" className="max-w-full max-h-full object-contain" />
                    </div>
                    <div className="rounded-2xl overflow-hidden bg-stone-50 h-56 flex items-center justify-center">
                      <img src={generata[0].urlFile} alt="Generata principale" className="max-w-full max-h-full object-contain" />
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={() => setStep('racconta')}
                disabled={!immaginiPronte}
                className="mt-8 bg-stone-900 text-white px-8 py-3 rounded-full text-sm font-medium hover:bg-stone-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Avanti →
              </button>
            </div>
          )}

          {step === 'racconta' && (
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
              <div className="max-w-lg w-full space-y-4">
                <div className="text-center mb-4 animate-fade-in-up">
                  <h1 className="text-2xl font-serif">Raccontateci il processo</h1>
                  <p className="text-sm text-stone-500 mt-1">Chi siete e come ci siete arrivati.</p>
                </div>

                <div className="grid grid-cols-2 gap-3 animate-fade-in-up" style={{ animationDelay: '60ms' }}>
                  <input type="text" value={gruppoNome} onChange={e => setGruppoNome(e.target.value)} placeholder="Nome Gruppo" className="border border-stone-200 rounded-xl p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900" />
                  <input type="number" value={gruppoNum} onChange={e => setGruppoNum(e.target.value)} placeholder="Numero Gruppo" className="border border-stone-200 rounded-xl p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900" />
                </div>

                <input type="text" value={hmwOTema} onChange={e => setHmwOTema(e.target.value)} placeholder="HMW o tema di riferimento" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 animate-fade-in-up" style={{ animationDelay: '110ms' }} />
                <input type="text" value={motoreUsato} onChange={e => setMotoreUsato(e.target.value)} placeholder="Motore AI usato (Midjourney, DALL·E...)" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 animate-fade-in-up" style={{ animationDelay: '160ms' }} />

                <textarea rows={2} value={notePrompt} onChange={e => setNotePrompt(e.target.value)} placeholder={`Log prompt ${attivitaInfo.richiediLogPrompt ? '(obbligatorio)' : '(facoltativo)'}: che prompt avete usato?`} className="w-full border border-stone-200 rounded-xl p-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 animate-fade-in-up" style={{ animationDelay: '210ms' }} />
                <textarea rows={2} value={riflessione} onChange={e => setRiflessione(e.target.value)} placeholder={`Riflessione ${attivitaInfo.richiediRiflessione ? '(obbligatoria)' : '(facoltativa)'}: cosa ha funzionato?`} className="w-full border border-stone-200 rounded-xl p-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 animate-fade-in-up" style={{ animationDelay: '260ms' }} />

                {!codiceGiaVerificato && (
                  <input type="password" minLength={4} value={codiceGruppo} onChange={e => setCodiceGruppo(e.target.value)} placeholder="Codice di gruppo (min. 4 caratteri)" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 animate-fade-in-up" style={{ animationDelay: '310ms' }} />
                )}

                <div className="flex justify-between pt-2">
                  <button onClick={() => setStep('immagini')} className="text-xs text-stone-500 hover:text-stone-900 px-4 py-2">← Indietro</button>
                  <button
                    onClick={() => setStep('riepilogo')}
                    disabled={!formValido}
                    className="bg-stone-900 text-white px-8 py-3 rounded-full text-sm font-medium hover:bg-stone-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Avanti →
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'riepilogo' && (
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
              <div className="max-w-lg w-full space-y-4 animate-fade-in-up">
                <div className="text-center mb-2">
                  <h1 className="text-2xl font-serif">Pronti per l&apos;invio</h1>
                  <p className="text-sm text-stone-500 mt-1">Gruppo {gruppoNum} — {gruppoNome}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 bg-white rounded-2xl border border-stone-200 p-3">
                  <div className="rounded-xl overflow-hidden bg-stone-50 h-32 flex items-center justify-center">
                    <img src={sketch[0]?.urlFile} alt="" className="max-w-full max-h-full object-contain" />
                  </div>
                  <div className="rounded-xl overflow-hidden bg-stone-50 h-32 flex items-center justify-center">
                    <img src={generata[0]?.urlFile} alt="" className="max-w-full max-h-full object-contain" />
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-stone-200 p-3 text-xs space-y-1">
                  <p><b>{hmwOTema || 'Senza tema'}</b></p>
                  {motoreUsato && <p className="text-stone-500">Motore: {motoreUsato}</p>}
                </div>

                {erroreSalvataggio && <p className="text-xs text-red-600 font-medium text-center bg-red-50 border border-red-200 rounded-xl p-3">{erroreSalvataggio}</p>}

                <div className="flex justify-between pt-2">
                  <button onClick={() => setStep('racconta')} className="text-xs text-stone-500 hover:text-stone-900 px-4 py-2">← Indietro</button>
                  <button
                    onClick={inviaConsegna}
                    disabled={!formValido || salvataggioInCorso}
                    className="bg-stone-900 text-white px-8 py-3 rounded-full text-sm font-medium hover:bg-stone-800 transition disabled:opacity-50"
                  >
                    {salvataggioInCorso ? 'Invio...' : editId !== null ? 'Salva Modifiche' : 'Invia Consegna ✨'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
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
