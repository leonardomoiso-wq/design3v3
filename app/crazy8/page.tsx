'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { comprimiImmagine } from '../../lib/immagine';
import { SfondoCaricamento, ImpulsoCaricamento } from '../../lib/caricamento';
import { useTeam, etichettaTeam } from '../../lib/team-context';
import RichiedeCorso from '../../components/RichiedeCorso';
import type { Corso } from '../../lib/corsi';
import {
  FASI, NUMERO_FASI, ORIZZONTI, MIN_MOODBOARD, Miniatura, TestoAutosalvato, faseEffettiva, risolviVoceMoodboard, sottoAmbitiDi, visioneDi,
  type Generazione, type Scenario, type Sketch, type Submission, type VoceMoodboard,
} from '../../components/crazy8/shared';
import PromptConfiguratore, { MOTORI } from '../../components/crazy8/PromptConfiguratore';
import { MoodboardEditor } from '../../components/crazy8/Moodboard';
import Share from '../../components/crazy8/Share';
import Valutazione, { valutazioneCompleta } from '../../components/crazy8/Valutazione';
import { caricaTagCorso, TAG_VUOTI, type TagCorso } from '../../lib/tag';

// Crazy 8 a fasi (lato studente). Il percorso è lineare: ogni fase si
// sblocca quando la precedente ha prodotto ciò che serve (almeno uno
// sketch, almeno uno selezionato, ...), ma si può sempre tornare a
// rivedere le fasi già raggiunte. Il punto raggiunto è salvato sulla
// consegna, così il telefono che scatta gli sketch e il portatile che li
// rivede restano allineati (con l'aggiornamento realtime).

const TUTORIAL_VISTO_KEY = 'crazy8_fasi_tutorial_visto';

const TUTORIAL_SLIDES = [
  { icona: '🧭', titolo: 'Si parte dai sotto-ambiti', testo: 'Per ognuno scrivete cosa sta cambiando oggi e come potrebbe essere tra qualche anno.' },
  { icona: '📱', titolo: 'Sketch su carta, foto col telefono', testo: 'Fate gli 8 sketch, poi fotografateli da qui: li ritrovate subito anche sul portatile.' },
  { icona: '🪄', titolo: 'Dallo sketch all\'immagine', testo: 'Scegliete i migliori, componete il prompt e apritelo in ChatGPT o Gemini. Più ci mettete di vostro, meglio viene.' },
  { icona: '🎯', titolo: 'Valutate e presentate', testo: 'Le immagini migliori vanno in una moodboard: date tag e punteggi, poi raccontatele alla classe.' },
];

const messaggioErrore = (codice: string) => {
  switch (codice) {
    case 'codice_errato': return 'Codice di gruppo errato.';
    case 'codice_troppo_corto': return 'Il codice di gruppo deve avere almeno 4 caratteri.';
    case 'submission_non_trovata': return 'Questa consegna non esiste più.';
    case 'sketch_non_trovato': return 'Questo sketch non esiste più.';
    case 'prompt_mancante': return 'Scrivi il prompt usato.';
    default: return 'Errore durante il salvataggio. Riprova.';
  }
};

const chiaveUltimoPrompt = (sketchId: string) => `crazy8_ultimo_prompt_${sketchId}`;

function leggiUltimoPrompt(sketchId: string): { prompt: string; motore: string } {
  try {
    const v = localStorage.getItem(chiaveUltimoPrompt(sketchId));
    if (v) return JSON.parse(v);
  } catch { /* storage non disponibile */ }
  return { prompt: '', motore: '' };
}

function normalizza(s: any): Submission {
  return {
    ...s,
    fase_raggiunta: s.fase_raggiunta || 1,
    moodboard: Array.isArray(s.moodboard) ? s.moodboard : [],
    scenario: s.scenario && typeof s.scenario === 'object' ? s.scenario : {},
    immagini: (s.immagini || [])
      .slice()
      .sort((a: any, b: any) => a.ordine - b.ordine)
      .map((img: any) => ({
        ...img,
        selezionato: !!img.selezionato,
        generazioni_crazy8: (img.generazioni_crazy8 || []).slice().sort((a: any, b: any) => a.ordine - b.ordine),
      })),
  };
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
          <button onClick={() => (ultimo ? onChiudi() : setIndice(i => i + 1))} className="bg-white text-stone-900 px-6 py-2.5 rounded-full text-xs font-bold hover:bg-stone-200 transition">
            {ultimo ? 'Inizia' : 'Avanti →'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stepper({ fase, raggiunta, onVai }: { fase: number; raggiunta: number; onVai: (n: number) => void }) {
  return (
    <nav aria-label="Fasi dell'attività" className="overflow-x-auto">
      <ol className="flex items-stretch gap-1.5 min-w-max">
        {FASI.map(f => {
          const bloccata = f.n > raggiunta;
          const corrente = f.n === fase;
          const fatta = f.n < raggiunta && !corrente;
          return (
            <li key={f.n}>
              <button
                type="button"
                disabled={bloccata}
                onClick={() => onVai(f.n)}
                aria-current={corrente ? 'step' : undefined}
                className={`flex items-center gap-2 rounded-full pl-1.5 pr-3.5 py-1.5 text-xs font-medium border transition ${
                  corrente ? 'bg-stone-900 text-white border-stone-900'
                    : fatta ? 'bg-white text-stone-700 border-stone-300 hover:border-stone-600'
                      : bloccata ? 'bg-stone-50 text-stone-300 border-stone-100 cursor-not-allowed'
                        : 'bg-white text-stone-700 border-amber-300 hover:border-amber-500'
                }`}
              >
                <span className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  corrente ? 'bg-white text-stone-900' : fatta ? 'bg-emerald-600 text-white' : bloccata ? 'bg-stone-100 text-stone-300' : 'bg-amber-100 text-amber-800'
                }`}>
                  {fatta ? '✓' : bloccata ? '🔒' : f.n}
                </span>
                {f.breve}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function NavigazioneFase({ fase, onIndietro, onAvanti, avantiPossibile, motivoBlocco, etichettaAvanti }: {
  fase: number; onIndietro: () => void; onAvanti?: () => void; avantiPossibile: boolean; motivoBlocco?: string; etichettaAvanti?: string;
}) {
  const prossima = FASI.find(f => f.n === fase + 1);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-stone-200">
      {fase > 1 ? (
        <button onClick={onIndietro} className="text-xs text-stone-500 hover:text-stone-900 transition">← {FASI[fase - 2].breve}</button>
      ) : <span />}
      {prossima && onAvanti && (
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {!avantiPossibile && motivoBlocco && <span className="text-[11px] text-stone-400">{motivoBlocco}</span>}
          <button onClick={onAvanti} disabled={!avantiPossibile} className="bg-stone-900 text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-stone-800 transition disabled:opacity-30 disabled:cursor-not-allowed">
            {etichettaAvanti || `Avanti: ${prossima.breve}`} →
          </button>
        </div>
      )}
    </div>
  );
}

function SelettoreSottoAmbito({ valore, opzioni, onCambia, compatto = false }: { valore: string | null; opzioni: string[]; onCambia: (v: string) => void; compatto?: boolean }) {
  if (opzioni.length === 0) return null;
  return (
    <select
      value={valore || ''}
      onChange={e => onCambia(e.target.value)}
      className={`border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 ${compatto ? 'text-[11px] px-1.5 py-1 w-full' : 'text-xs px-2.5 py-2'}`}
      aria-label="Sotto-ambito"
    >
      <option value="">— sotto-ambito —</option>
      {opzioni.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function BloccoCaricaGenerate({ sketch, onAggiungi, onCaricamentoChange }: {
  sketch: Sketch;
  onAggiungi: (sketchId: string, prompt: string, urlFile: string, motore: string) => Promise<boolean>;
  onCaricamentoChange: (attivo: boolean) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [motore, setMotore] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [comprimendo, setComprimendo] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState('');
  const [fatto, setFatto] = useState(false);

  // il prompt inviato dal configuratore (fase 4) è già qui
  useEffect(() => {
    const ultimo = leggiUltimoPrompt(sketch.id);
    setPrompt(p => p || ultimo.prompt);
    setMotore(m => m || ultimo.motore);
  }, [sketch.id]);

  const carica = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const lista = Array.from(e.target.files || []);
    e.target.value = '';
    if (lista.length === 0) return;
    setComprimendo(true);
    onCaricamentoChange(true);
    try {
      const urls: string[] = [];
      for (const f of lista) urls.push(await comprimiImmagine(f));
      setFiles(prev => [...prev, ...urls]);
    } finally {
      setComprimendo(false);
      onCaricamentoChange(false);
    }
  };

  const invia = async () => {
    setErrore('');
    setFatto(false);
    if (!prompt.trim() || files.length === 0) {
      setErrore('Servono almeno un\'immagine e il prompt usato.');
      return;
    }
    setInCorso(true);
    let tutteOk = true;
    for (const url of files) {
      const ok = await onAggiungi(sketch.id, prompt, url, motore);
      if (!ok) tutteOk = false;
    }
    setInCorso(false);
    if (tutteOk) {
      setFiles([]);
      setFatto(true);
    } else {
      setErrore('Alcune immagini non sono state salvate. Riprova.');
    }
  };

  return (
    <div className="bg-stone-50 rounded-2xl border border-dashed border-stone-300 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs bg-white border border-stone-200 rounded-xl px-4 py-2.5 cursor-pointer hover:border-stone-500 transition font-medium">
          {comprimendo ? <ImpulsoCaricamento etichetta="Comprimo..." /> : '＋ Scegli immagini generate'}
          <input type="file" accept="image/*" multiple className="sr-only" onChange={carica} disabled={comprimendo} />
        </label>
        {files.map((url, i) => (
          <div key={i} className="relative animate-scale-in">
            <img src={url} alt="" className="w-14 h-14 object-contain rounded-lg border border-stone-200 bg-white" />
            <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-stone-900 text-white text-[10px]" aria-label="Togli">✕</button>
          </div>
        ))}
      </div>
      <div className="grid sm:grid-cols-[1fr_180px] gap-2">
        <textarea rows={3} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Prompt usato (arriva già compilato se l'avete inviato dal configuratore)" className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-stone-900" />
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Modello usato</span>
          <select value={motore} onChange={e => setMotore(e.target.value)} className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-stone-900">
            <option value="">—</option>
            {MOTORI.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            <option value="Altro">Altro</option>
          </select>
        </div>
      </div>
      {errore && <p className="text-[11px] text-red-600 font-medium">{errore}</p>}
      {fatto && <p className="text-[11px] text-emerald-700 font-medium">✓ Immagini aggiunte al percorso di questo sketch.</p>}
      <button onClick={invia} disabled={inCorso || files.length === 0} className="text-xs bg-stone-900 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-stone-800 transition disabled:opacity-40">
        {inCorso ? 'Salvataggio...' : `Carica ${files.length > 1 ? `${files.length} immagini` : 'immagine'}`}
      </button>
    </div>
  );
}

export default function Crazy8Page() {
  return <RichiedeCorso>{corso => <Crazy8PageCorso corso={corso} />}</RichiedeCorso>;
}

function Crazy8PageCorso({ corso }: { corso: Corso }) {
  const { team } = useTeam();
  const [attivitaInfo, setAttivitaInfo] = useState<{ id: string; stato: string; richiediLogPrompt: boolean; richiediRiflessione: boolean } | null | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'percorso' | 'elenco' | 'share'>('percorso');
  const [mostraTutorial, setMostraTutorial] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [caricate, setCaricate] = useState(false);
  const [filtroGruppo, setFiltroGruppo] = useState('');
  const [suggerimentiPrompt, setSuggerimentiPrompt] = useState<any[]>([]);
  const [caricamentiAttivi, setCaricamentiAttivi] = useState(0);
  const [caricamentoSketch, setCaricamentoSketch] = useState(false);
  const segnalaCaricamento = (attivo: boolean) => setCaricamentiAttivi(n => Math.max(0, n + (attivo ? 1 : -1)));
  const [urlPagina, setUrlPagina] = useState('');
  const [tagCorso, setTagCorso] = useState<TagCorso>(TAG_VUOTI);
  const [scenarioBozza, setScenarioBozza] = useState<Scenario>({});

  // La consegna aperta al momento (creata ora o sbloccata dall'elenco)
  const [attivaId, setAttivaId] = useState<string | null>(null);
  const [attivaCodice, setAttivaCodice] = useState('');
  const [fase, setFase] = useState(1);
  const [erroreAzione, setErroreAzione] = useState('');

  // creazione
  const [gruppoNome, setGruppoNome] = useState('');
  const [gruppoNum, setGruppoNum] = useState('');
  const [sottoAmbiti, setSottoAmbiti] = useState<string[]>(['']);
  const [codiceNuovo, setCodiceNuovo] = useState('');
  const [erroreCreazione, setErroreCreazione] = useState('');
  const [creazioneInCorso, setCreazioneInCorso] = useState(false);

  // fase 2: sotto-ambito assegnato ai prossimi sketch caricati
  const [sottoAmbitoUpload, setSottoAmbitoUpload] = useState('');
  // fase 3: sketch in primo piano nel pannello a doppia vista
  const [sketchInRevisione, setSketchInRevisione] = useState<string | null>(null);
  const [soloSelezionati, setSoloSelezionati] = useState(false);
  // fase 4: sketch e spunto con cui aprire il configuratore ("Reitera")
  const [reitera, setReitera] = useState<{ sketchId: string; spunto: string; n: number } | null>(null);
  const [promptInviato, setPromptInviato] = useState(false);

  const [submissionDaSbloccare, setSubmissionDaSbloccare] = useState<Submission | null>(null);
  const [codiceSblocco, setCodiceSblocco] = useState('');
  const [erroreSblocco, setErroreSblocco] = useState('');
  const [verificaInCorso, setVerificaInCorso] = useState(false);

  const [submissionDaEliminare, setSubmissionDaEliminare] = useState<Submission | null>(null);
  const [codiceEliminazione, setCodiceEliminazione] = useState('');
  const [erroreEliminazione, setErroreEliminazione] = useState('');
  const [eliminazioneInCorso, setEliminazioneInCorso] = useState(false);

  useEffect(() => {
    if (!team) return;
    setGruppoNome(prev => prev || team.nome);
    setGruppoNum(prev => prev || String(team.numero));
    setCodiceNuovo(prev => prev || team.password);
  }, [team]);

  const caricaSubmissions = async () => {
    const { data, error } = await supabase
      .from('submission_crazy8')
      .select('*, immagini(*, generazioni_crazy8(*))')
      .eq('corso_id', corso.id)
      .order('created_at', { ascending: false });
    if (!error && data) setSubmissions((data as any[]).map(normalizza));
    setCaricate(true);
  };

  // L'autosalvataggio dei commenti genera molti eventi realtime ravvicinati
  // (da tutti i team): raggruppiamo i ricaricamenti invece di rifare il
  // fetch completo, con tutte le immagini, a ogni singolo evento.
  const timerRicarica = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ricaricaPresto = () => {
    if (timerRicarica.current) clearTimeout(timerRicarica.current);
    timerRicarica.current = setTimeout(caricaSubmissions, 700);
  };

  useEffect(() => {
    const caricaAttivita = async () => {
      const { data } = await supabase.from('attivita').select('*').eq('corso_id', corso.id).eq('tipo', 'crazy8_ai').maybeSingle();
      if (data) {
        setAttivitaInfo({ id: data.id, stato: data.stato, richiediLogPrompt: data.richiedi_log_prompt, richiediRiflessione: data.richiedi_riflessione });
      } else {
        setAttivitaInfo(null);
      }
    };
    const caricaSuggerimenti = async () => {
      const { data } = await supabase.from('prompt_suggeriti_crazy8').select('*').eq('corso_id', corso.id).order('ordine', { ascending: true });
      if (data) setSuggerimentiPrompt(data as any[]);
    };

    caricaAttivita();
    caricaSubmissions();
    caricaTagCorso(corso.id).then(({ dati }) => setTagCorso(dati));
    caricaSuggerimenti();
    setUrlPagina(`${window.location.origin}/crazy8`);

    try {
      if (!localStorage.getItem(TUTORIAL_VISTO_KEY)) setMostraTutorial(true);
    } catch { /* storage non disponibile */ }

    const channel = supabase
      .channel(`realtime-crazy8-studenti-${corso.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submission_crazy8' }, ricaricaPresto)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'immagini' }, ricaricaPresto)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'generazioni_crazy8' }, ricaricaPresto)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prompt_suggeriti_crazy8' }, caricaSuggerimenti)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (timerRicarica.current) clearTimeout(timerRicarica.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attiva = submissions.find(s => s.id === attivaId) || null;
  const raggiunta = attiva ? faseEffettiva(attiva) : 1;

  const apriCanvas = (id: string, codice: string, s?: Submission) => {
    setAttivaId(id);
    setAttivaCodice(codice);
    const sub = s || submissions.find(x => x.id === id);
    setFase(sub ? faseEffettiva(sub) : 2);
    setActiveTab('percorso');
  };

  // Con il team loggato (es. dal telefono, per scattare gli sketch) si
  // riapre da sola l'ultima consegna del team: niente elenco, niente codice.
  const autoAperturaTentata = useRef(false);
  useEffect(() => {
    if (!team || !caricate || attivaId || autoAperturaTentata.current) return;
    autoAperturaTentata.current = true;
    const delTeam = submissions.filter(s => String(s.gruppo_num) === String(team.numero));
    if (delTeam.length === 0) return;
    const ultima = delTeam[0];
    supabase.rpc('verifica_codice_submission_crazy8', { p_id: ultima.id, p_codice: team.password }).then(({ data, error }) => {
      if (!error && data) apriCanvas(ultima.id, team.password, ultima);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, caricate, attivaId, submissions]);

  const chiudiTutorial = () => {
    setMostraTutorial(false);
    try { localStorage.setItem(TUTORIAL_VISTO_KEY, '1'); } catch { /* non bloccante */ }
  };

  const chiudiCanvas = () => {
    setAttivaId(null);
    setAttivaCodice('');
    setFase(1);
    setSottoAmbiti(['']);
    if (!team) { setGruppoNome(''); setGruppoNum(''); setCodiceNuovo(''); }
  };

  // === aggiornamenti ottimistici locali (il realtime riallinea poi tutto) ===
  const patchSubmission = (patch: Partial<Submission>) =>
    setSubmissions(prev => prev.map(s => (s.id === attivaId ? { ...s, ...patch } : s)));
  const patchSketch = (sketchId: string, patch: Partial<Sketch>) =>
    setSubmissions(prev => prev.map(s => (s.id !== attivaId ? s : { ...s, immagini: s.immagini.map(i => (i.id === sketchId ? { ...i, ...patch } : i)) })));
  const patchGenerazione = (genId: string, patch: Partial<Generazione>) =>
    setSubmissions(prev => prev.map(s => (s.id !== attivaId ? s : {
      ...s,
      immagini: s.immagini.map(i => ({ ...i, generazioni_crazy8: i.generazioni_crazy8.map(g => (g.id === genId ? { ...g, ...patch } : g)) })),
    })));

  const salvaCampi = async (campi: Record<string, unknown>): Promise<boolean> => {
    if (!attivaId) return false;
    const { error } = await supabase.rpc('aggiorna_campi_submission_crazy8', { p_id: attivaId, p_codice: attivaCodice, p_campi: campi });
    if (error) { setErroreAzione(messaggioErrore(error.message)); return false; }
    return true;
  };

  const salvaSketch = async (sketchId: string, campi: Partial<Pick<Sketch, 'selezionato' | 'interpretazione' | 'sotto_ambito'>>): Promise<boolean> => {
    patchSketch(sketchId, campi);
    const { error } = await supabase.rpc('aggiorna_sketch_crazy8', { p_immagine_id: sketchId, p_codice: attivaCodice, p_campi: campi });
    if (error) { setErroreAzione(messaggioErrore(error.message)); ricaricaPresto(); return false; }
    return true;
  };

  const salvaGenerazione = async (genId: string, campi: Partial<Pick<Generazione, 'positivo' | 'negativo' | 'deduzione'>>): Promise<boolean> => {
    patchGenerazione(genId, campi);
    const { error } = await supabase.rpc('aggiorna_generazione_crazy8', { p_id: genId, p_codice: attivaCodice, p_campi: campi });
    if (error) { setErroreAzione(messaggioErrore(error.message)); return false; }
    return true;
  };

  const vaiAFase = (n: number) => {
    setFase(n);
    setErroreAzione('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const avanzaA = async (n: number, extra: Record<string, unknown> = {}) => {
    if (n > raggiunta || Object.keys(extra).length > 0) {
      patchSubmission({ fase_raggiunta: Math.max(raggiunta, n) });
      const ok = await salvaCampi({ fase_raggiunta: n, ...extra });
      if (!ok) return;
    }
    vaiAFase(n);
  };

  // === fase 1 ===
  const modificaSottoAmbito = (i: number, valore: string) => {
    // rinominando un sotto-ambito, segnale e visione già scritti lo seguono
    const vecchio = (sottoAmbiti[i] || '').trim();
    const nuovo = valore.trim();
    if (vecchio && nuovo && vecchio !== nuovo) {
      setScenarioBozza(v => {
        const mappa = { ...(v.sotto_ambiti || {}) };
        if (mappa[vecchio] && !mappa[nuovo]) { mappa[nuovo] = mappa[vecchio]; delete mappa[vecchio]; }
        return { ...v, sotto_ambiti: mappa };
      });
    }
    setSottoAmbiti(prev => prev.map((s, idx) => (idx === i ? valore : s)));
  };
  const aggiungiCampoSottoAmbito = () => setSottoAmbiti(prev => [...prev, '']);
  const rimuoviCampoSottoAmbito = (i: number) => setSottoAmbiti(prev => prev.filter((_, idx) => idx !== i));

  // quando si torna alla fase 1 di una consegna già aperta, i campi
  // ripartono dai sotto-ambiti salvati
  useEffect(() => {
    if (attiva && fase === 1) {
      const salvati = sottoAmbitiDi(attiva);
      setSottoAmbiti(salvati.length ? salvati : ['']);
      const sc = attiva.scenario || {};
      setScenarioBozza(sc.sotto_ambiti || !salvati[0]
        ? sc
        : { orizzonte: sc.orizzonte, sotto_ambiti: { [salvati[0]]: { segnale: sc.segnale, visione: sc.what_if } } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attivaId, fase]);

  const iniziaConsegna = async () => {
    setErroreCreazione('');
    const puliti = sottoAmbiti.map(s => s.trim()).filter(Boolean);
    if (!gruppoNome.trim() || !gruppoNum.trim() || puliti.length === 0 || codiceNuovo.trim().length < 4) {
      setErroreCreazione('Compila gruppo, almeno un sotto-ambito e un codice di almeno 4 caratteri.');
      return;
    }
    setCreazioneInCorso(true);
    const { data, error } = await supabase.rpc('crea_submission_crazy8', {
      p_attivita_id: attivitaInfo?.id ?? null,
      p_gruppo_nome: gruppoNome,
      p_gruppo_num: Number(gruppoNum),
      p_sotto_ambito: puliti.join('; '),
      p_codice: codiceNuovo,
    });
    if (error) {
      setCreazioneInCorso(false);
      setErroreCreazione(messaggioErrore(error.message));
      return;
    }
    await caricaSubmissions();
    setCreazioneInCorso(false);
    setAttivaId(data);
    setAttivaCodice(codiceNuovo);
    setSottoAmbitoUpload(puliti[0] || '');
    setScenarioBozza({});
    vaiAFase(1);
  };

  const salvaMondo = async () => {
    const puliti = sottoAmbiti.map(s => s.trim()).filter(Boolean);
    if (puliti.length === 0) { setErroreAzione('Serve almeno un sotto-ambito.'); return; }
    const mappa = scenarioBozza.sotto_ambiti || {};
    const scenario: Scenario = {
      orizzonte: scenarioBozza.orizzonte || '',
      sotto_ambiti: Object.fromEntries(puliti.map(sa => [sa, { segnale: (mappa[sa]?.segnale || '').trim(), visione: (mappa[sa]?.visione || '').trim() }])),
    };
    patchSubmission({ hmw_o_tema: puliti.join('; '), scenario });
    const ok = await salvaCampi({ sotto_ambito: puliti.join('; '), scenario });
    if (ok) avanzaA(2);
  };

  // === fase 2 ===
  const aggiungiSketch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!attivaId) return;
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setCaricamentoSketch(true);
    segnalaCaricamento(true);
    setErroreAzione('');
    try {
      for (const file of files) {
        const urlFile = await comprimiImmagine(file);
        const { data, error } = await supabase.rpc('aggiungi_sketch_crazy8', { p_submission_id: attivaId, p_codice: attivaCodice, p_url_file: urlFile });
        if (error) { setErroreAzione(messaggioErrore(error.message)); continue; }
        if (sottoAmbitoUpload && data) {
          await supabase.rpc('aggiorna_sketch_crazy8', { p_immagine_id: data, p_codice: attivaCodice, p_campi: { sotto_ambito: sottoAmbitoUpload } });
        }
      }
      await caricaSubmissions();
    } finally {
      setCaricamentoSketch(false);
      segnalaCaricamento(false);
    }
  };

  const rimuoviSketch = async (immagineId: string) => {
    if (!window.confirm('Eliminare questo sketch? Verranno eliminate anche le immagini generate a partire da esso.')) return;
    await supabase.rpc('elimina_sketch_crazy8', { p_immagine_id: immagineId, p_codice: attivaCodice });
    await caricaSubmissions();
  };

  // === fase 5 ===
  const aggiungiGenerazione = async (sketchId: string, prompt: string, urlImmagine: string, motore: string): Promise<boolean> => {
    const { error } = await supabase.rpc('aggiungi_generazione_crazy8', {
      p_sketch_immagine_id: sketchId, p_codice: attivaCodice, p_prompt_usato: prompt, p_url_immagine: urlImmagine, p_deduzione: null, p_motore: motore || null,
    });
    if (error) return false;
    await caricaSubmissions();
    return true;
  };

  const rimuoviGenerazione = async (genId: string) => {
    if (!window.confirm('Eliminare questa immagine generata?')) return;
    await supabase.rpc('elimina_generazione_crazy8', { p_id: genId, p_codice: attivaCodice });
    await caricaSubmissions();
  };

  // === elenco consegne ===
  const chiediSblocco = async (s: Submission) => {
    if (team) {
      const { data, error } = await supabase.rpc('verifica_codice_submission_crazy8', { p_id: s.id, p_codice: team.password });
      if (!error && data) { apriCanvas(s.id, team.password, s); return; }
    }
    setSubmissionDaSbloccare(s); setCodiceSblocco(''); setErroreSblocco('');
  };

  const confermaSblocco = async () => {
    if (!submissionDaSbloccare) return;
    setVerificaInCorso(true);
    setErroreSblocco('');
    const { data, error } = await supabase.rpc('verifica_codice_submission_crazy8', { p_id: submissionDaSbloccare.id, p_codice: codiceSblocco });
    setVerificaInCorso(false);
    if (error || !data) { setErroreSblocco('Codice errato. Riprova.'); return; }
    const s = submissionDaSbloccare;
    setSubmissionDaSbloccare(null);
    apriCanvas(s.id, codiceSblocco, s);
  };

  const chiediEliminazione = (s: Submission) => { setSubmissionDaEliminare(s); setCodiceEliminazione(team?.password || ''); setErroreEliminazione(''); };

  const confermaEliminazione = async () => {
    if (!submissionDaEliminare) return;
    setEliminazioneInCorso(true);
    setErroreEliminazione('');
    const { error } = await supabase.rpc('elimina_submission_crazy8', { p_id: submissionDaEliminare.id, p_codice: codiceEliminazione });
    setEliminazioneInCorso(false);
    if (error) { setErroreEliminazione('Codice errato. Riprova.'); return; }
    setSubmissionDaEliminare(null);
    if (attivaId === submissionDaEliminare.id) chiudiCanvas();
    await caricaSubmissions();
  };

  const submissionFiltrate = team
    ? submissions.filter(s => String(s.gruppo_num) === String(team.numero))
    : filtroGruppo.trim()
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

  // === dati derivati della consegna aperta ===
  const sketchTutti = attiva?.immagini || [];
  const sketchSelezionati = sketchTutti.filter(s => s.selezionato);
  const generazioniTutte = sketchTutti.flatMap(s => s.generazioni_crazy8);
  const sottoAmbitiAttiva = sottoAmbitiDi(attiva);
  const infoFase = FASI[fase - 1];
  const riflessioniScritte = generazioniTutte.filter(g => (g.positivo || '').trim() || (g.negativo || '').trim()).length;
  const vociMoodboard = attiva ? (attiva.moodboard || []).filter(v => risolviVoceMoodboard(attiva, v)) : [];
  const immaginiMoodboard = vociMoodboard.length;

  const sketchRevisione = sketchTutti.find(s => s.id === sketchInRevisione) || (soloSelezionati ? sketchSelezionati[0] : sketchTutti[0]) || null;
  const galleriaRevisione = soloSelezionati ? sketchSelezionati : sketchTutti;
  const indiceRevisione = sketchRevisione ? galleriaRevisione.findIndex(s => s.id === sketchRevisione.id) : -1;

  const renderFase = () => {
    if (!attiva) return null;
    switch (fase) {
      case 1: {
        const mappa = scenarioBozza.sotto_ambiti || {};
        const impostaVisione = (sa: string, campo: 'segnale' | 'visione', valore: string) =>
          setScenarioBozza(v => ({ ...v, sotto_ambiti: { ...(v.sotto_ambiti || {}), [sa]: { ...(v.sotto_ambiti?.[sa] || {}), [campo]: valore } } }));
        const conVisione = sottoAmbiti.filter(sa => sa.trim() && (mappa[sa.trim()]?.visione || '').trim()).length;
        return (
          <div className="space-y-5 max-w-3xl">
            <div className="space-y-3">
              {sottoAmbiti.map((sa, i) => (
                <section key={i} className="bg-white rounded-3xl border border-stone-200 p-5 space-y-3">
                  <div className="flex gap-1.5">
                    <input type="text" value={sa} onChange={e => modificaSottoAmbito(i, e.target.value)} placeholder={`Sotto-ambito ${i + 1}`} className="flex-1 border border-stone-200 rounded-xl p-3 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-stone-900" />
                    {sottoAmbiti.length > 1 && (
                      <button type="button" onClick={() => rimuoviCampoSottoAmbito(i)} className="text-stone-300 hover:text-red-600 px-2" aria-label="Rimuovi">✕</button>
                    )}
                  </div>
                  {sa.trim() && (
                    <div className="grid sm:grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-xs font-medium text-stone-700">Cosa sta cambiando oggi?</span>
                        <textarea rows={2} value={mappa[sa.trim()]?.segnale || ''} onChange={e => impostaVisione(sa.trim(), 'segnale', e.target.value)} placeholder="es. gli impollinatori in città sono in calo" className="mt-1 w-full border border-stone-200 rounded-xl p-2.5 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-stone-700">Come potrebbe essere tra qualche anno?</span>
                        <textarea rows={2} value={mappa[sa.trim()]?.visione || ''} onChange={e => impostaVisione(sa.trim(), 'visione', e.target.value)} placeholder="es. ogni balcone ospita piante e rifugi per gli insetti" className="mt-1 w-full border border-amber-200 rounded-xl p-2.5 text-sm bg-amber-50/40 focus:outline-none focus:ring-2 focus:ring-amber-500" />
                      </label>
                    </div>
                  )}
                </section>
              ))}
              <button type="button" onClick={aggiungiCampoSottoAmbito} className="text-xs text-stone-500 hover:text-stone-900 transition">+ Aggiungi un altro sotto-ambito</button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-stone-500">Orizzonte (facoltativo):</span>
              {ORIZZONTI.map(o => (
                <button key={o} type="button" aria-pressed={scenarioBozza.orizzonte === o} onClick={() => setScenarioBozza(v => ({ ...v, orizzonte: v.orizzonte === o ? '' : o }))} className={`text-xs px-3 py-1 rounded-full border transition ${scenarioBozza.orizzonte === o ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-500'}`}>{o}</button>
              ))}
            </div>
            <NavigazioneFase
              fase={1}
              onIndietro={() => {}}
              onAvanti={salvaMondo}
              avantiPossibile={sottoAmbiti.some(sa => sa.trim()) && conVisione > 0}
              motivoBlocco={!sottoAmbiti.some(sa => sa.trim()) ? 'Serve almeno un sotto-ambito' : 'Scrivete come potrebbe essere almeno un sotto-ambito'}
              etichettaAvanti="Salva e vai agli sketch"
            />
          </div>
        );
      }

      case 2:
        return (
          <div className="space-y-6">
            <div className="grid md:grid-cols-[1fr_280px] gap-4">
              <div className="bg-white rounded-3xl border border-stone-200 p-5 space-y-4">
                {sottoAmbitiAttiva.length > 1 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">I prossimi sketch sono per…</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sottoAmbitiAttiva.map(sa => (
                        <button key={sa} type="button" onClick={() => setSottoAmbitoUpload(sa === sottoAmbitoUpload ? '' : sa)} aria-pressed={sa === sottoAmbitoUpload} className={`text-xs px-3 py-1.5 rounded-full border transition ${sa === sottoAmbitoUpload ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-500'}`}>
                          {sa}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <label className={`flex flex-col items-center justify-center gap-1 h-32 rounded-2xl border-2 transition cursor-pointer ${caricamentoSketch ? 'border-stone-300 bg-stone-50' : 'border-stone-900 bg-stone-900 text-white hover:bg-stone-800'}`}>
                    {caricamentoSketch ? <ImpulsoCaricamento etichetta="Carico..." /> : (
                      <>
                        <span className="text-3xl" aria-hidden="true">📷</span>
                        <span className="text-sm font-bold">Scatta una foto</span>
                        <span className="text-[10px] opacity-70">dal telefono</span>
                      </>
                    )}
                    <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={aggiungiSketch} disabled={caricamentoSketch} />
                  </label>
                  <label className={`flex flex-col items-center justify-center gap-1 h-32 rounded-2xl border-2 border-dashed transition cursor-pointer ${caricamentoSketch ? 'border-stone-300 bg-stone-50' : 'border-stone-300 bg-white hover:border-stone-600'}`}>
                    {caricamentoSketch ? <ImpulsoCaricamento etichetta="Carico..." /> : (
                      <>
                        <span className="text-3xl" aria-hidden="true">🖼️</span>
                        <span className="text-sm font-bold text-stone-800">Dalla galleria</span>
                        <span className="text-[10px] text-stone-500">anche più foto insieme</span>
                      </>
                    )}
                    <input type="file" accept="image/*" multiple className="sr-only" onChange={aggiungiSketch} disabled={caricamentoSketch} />
                  </label>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 space-y-2 text-xs text-stone-700">
                <p className="font-bold text-stone-900">📱 Dal telefono</p>
                <p>Aprite <b className="break-all">{urlPagina || '/crazy8'}</b> e accedete con il team: questa consegna si apre da sola alla fase sketch.</p>
                <p className="text-stone-500">Foto dall&apos;alto, buona luce, un foglio per foto. Gli sketch compaiono qui in tempo reale.</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-500">I vostri sketch</h3>
                <span className="text-xs text-stone-500">{sketchTutti.length} / 8{sketchTutti.length >= 8 ? ' ✓' : ''}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {sketchTutti.map((s, i) => (
                  <div key={s.id} className="bg-white rounded-2xl border border-stone-200 p-2 space-y-2 animate-scale-in">
                    <div className="relative">
                      <Miniatura url={s.url_file} className="w-full aspect-square" />
                      <span className="absolute top-1.5 left-1.5 h-6 w-6 rounded-full bg-stone-900 text-white text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                      <button onClick={() => rimuoviSketch(s.id)} className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-white/90 text-stone-400 hover:text-red-600 text-xs" aria-label="Elimina sketch">✕</button>
                    </div>
                    <SelettoreSottoAmbito compatto valore={s.sotto_ambito} opzioni={sottoAmbitiAttiva} onCambia={v => salvaSketch(s.id, { sotto_ambito: v })} />
                  </div>
                ))}
                {Array.from({ length: Math.max(0, 8 - sketchTutti.length) }).map((_, i) => (
                  <div key={`vuoto-${i}`} className="aspect-square rounded-2xl border-2 border-dashed border-stone-200 flex items-center justify-center text-stone-300 text-lg font-bold">
                    {sketchTutti.length + i + 1}
                  </div>
                ))}
              </div>
            </div>

            <NavigazioneFase
              fase={2}
              onIndietro={() => vaiAFase(1)}
              onAvanti={() => avanzaA(3)}
              avantiPossibile={sketchTutti.length > 0}
              motivoBlocco="Caricate almeno uno sketch"
              etichettaAvanti={sketchTutti.length >= 8 ? 'Abbiamo tutti gli sketch: revisione' : 'Abbiamo finito: revisione'}
            />
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-6 items-start">
              {/* Galleria */}
              <section className="bg-white rounded-3xl border border-stone-200 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs text-stone-500"><b className="text-stone-900">{sketchSelezionati.length}</b> selezionati su {sketchTutti.length}</p>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setSoloSelezionati(false)} className={`text-[11px] px-2.5 py-1 rounded-full ${!soloSelezionati ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>Tutti</button>
                    <button type="button" onClick={() => setSoloSelezionati(true)} className={`text-[11px] px-2.5 py-1 rounded-full ${soloSelezionati ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>★ Selezionati</button>
                  </div>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-2">
                  {galleriaRevisione.map(s => (
                    <div key={s.id} className="relative">
                      <button
                        type="button"
                        onClick={() => setSketchInRevisione(s.id)}
                        className={`zoom-cornice w-full aspect-square rounded-xl border bg-stone-50 overflow-hidden flex items-center justify-center transition ${sketchRevisione?.id === s.id ? 'border-stone-900 ring-2 ring-stone-900' : 'border-stone-200 hover:border-stone-500'}`}
                      >
                        <img src={s.url_file} alt={`Sketch ${s.ordine + 1}`} loading="lazy" decoding="async" className="max-w-full max-h-full object-contain" />
                      </button>
                      <button
                        type="button"
                        onClick={() => salvaSketch(s.id, { selezionato: !s.selezionato })}
                        aria-pressed={s.selezionato}
                        aria-label={s.selezionato ? 'Togli dalla selezione' : 'Seleziona'}
                        className={`absolute top-1 right-1 h-7 w-7 rounded-full text-sm flex items-center justify-center shadow transition ${s.selezionato ? 'bg-amber-500 text-white' : 'bg-white/90 text-stone-400 hover:text-amber-500'}`}
                      >
                        ★
                      </button>
                      {s.interpretazione?.trim() && <span className="absolute bottom-1 left-1 text-[9px] bg-white/90 text-stone-600 px-1 rounded" title="Ha un'interpretazione">💬</span>}
                    </div>
                  ))}
                  {galleriaRevisione.length === 0 && <p className="col-span-full text-xs text-stone-400 py-6 text-center">Nessuno sketch selezionato ancora.</p>}
                </div>
              </section>

              {/* Dettaglio e commento */}
              {sketchRevisione ? (
                <section key={sketchRevisione.id} className="bg-white rounded-3xl border border-stone-200 p-5 space-y-4 lg:sticky lg:top-4 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Sketch {sketchRevisione.ordine + 1}</p>
                    <div className="flex items-center gap-1">
                      <button type="button" disabled={indiceRevisione <= 0} onClick={() => setSketchInRevisione(galleriaRevisione[indiceRevisione - 1]?.id || null)} className="h-8 w-8 rounded-full bg-stone-100 hover:bg-stone-200 disabled:opacity-30" aria-label="Sketch precedente">‹</button>
                      <span className="text-[11px] text-stone-400 w-10 text-center">{indiceRevisione + 1}/{galleriaRevisione.length}</span>
                      <button type="button" disabled={indiceRevisione >= galleriaRevisione.length - 1} onClick={() => setSketchInRevisione(galleriaRevisione[indiceRevisione + 1]?.id || null)} className="h-8 w-8 rounded-full bg-stone-100 hover:bg-stone-200 disabled:opacity-30" aria-label="Sketch successivo">›</button>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-stone-50 border border-stone-200 flex items-center justify-center h-[42vh] overflow-hidden">
                    <img src={sketchRevisione.url_file} alt={`Sketch ${sketchRevisione.ordine + 1}`} decoding="async" className="max-w-full max-h-full object-contain" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => salvaSketch(sketchRevisione.id, { selezionato: !sketchRevisione.selezionato })}
                      className={`text-xs px-4 py-2 rounded-full font-medium border transition ${sketchRevisione.selezionato ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-stone-300 text-stone-700 hover:border-amber-500'}`}
                    >
                      {sketchRevisione.selezionato ? '★ Selezionato per la fase generativa' : '☆ Seleziona questo sketch'}
                    </button>
                    <SelettoreSottoAmbito valore={sketchRevisione.sotto_ambito} opzioni={sottoAmbitiAttiva} onCambia={v => salvaSketch(sketchRevisione.id, { sotto_ambito: v })} />
                  </div>
                  <TestoAutosalvato
                    etichetta="La vostra interpretazione"
                    valore={sketchRevisione.interpretazione}
                    righe={4}
                    placeholder="Cosa ci vedete? Quale idea c'è dietro, per chi è, cosa la rende promettente?"
                    onSalva={t => salvaSketch(sketchRevisione.id, { interpretazione: t })}
                  />
                </section>
              ) : (
                <div className="bg-white rounded-3xl border border-stone-200 p-10 text-center text-sm text-stone-400">Scegliete uno sketch dalla galleria.</div>
              )}
            </div>
            <NavigazioneFase fase={3} onIndietro={() => vaiAFase(2)} onAvanti={() => avanzaA(4)} avantiPossibile={sketchSelezionati.length > 0} motivoBlocco="Selezionate almeno uno sketch (★)" />
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <PromptConfiguratore
              key={reitera ? `reitera-${reitera.n}` : 'config'}
              sketchSelezionati={sketchSelezionati}
              visioneDi={sa => visioneDi(attiva, sa)}
              orizzonte={attiva.scenario?.orizzonte || ''}
              sketchIniziale={reitera?.sketchId || null}
              spuntoIniziale={reitera?.spunto || null}
              suggerimentiDocente={suggerimentiPrompt}
              onPromptInviato={(sketchId, prompt, motore) => {
                try { localStorage.setItem(chiaveUltimoPrompt(sketchId), JSON.stringify({ prompt, motore })); } catch { /* non bloccante */ }
                setPromptInviato(true);
                if (raggiunta < 5) { patchSubmission({ fase_raggiunta: 5 }); salvaCampi({ fase_raggiunta: 5 }); }
              }}
            />
            {promptInviato && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 animate-fade-in-up">
                <p className="text-sm text-emerald-800">Quando il modello vi ha restituito qualcosa di interessante, salvate le immagini migliori e caricatele.</p>
                <button onClick={() => avanzaA(5)} className="text-xs bg-emerald-700 text-white px-4 py-2 rounded-full font-medium hover:bg-emerald-800 transition">Carica i risultati →</button>
              </div>
            )}
            <NavigazioneFase fase={4} onIndietro={() => vaiAFase(3)} onAvanti={() => avanzaA(5)} avantiPossibile={sketchSelezionati.length > 0} etichettaAvanti="Ho generato: carica i risultati" />
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            {sketchSelezionati.map(s => (
              <section key={s.id} className="bg-white rounded-3xl border border-stone-200 p-5 space-y-4">
                <div className="flex items-start gap-4">
                  <Miniatura url={s.url_file} className="w-20 h-20 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Sketch {s.ordine + 1}{s.sotto_ambito ? ` · ${s.sotto_ambito}` : ''}</p>
                    {s.interpretazione && <p className="text-xs text-stone-500 mt-1 line-clamp-2">{s.interpretazione}</p>}
                    <p className="text-xs text-stone-700 mt-1 font-medium">{s.generazioni_crazy8.length} immagini generate caricate</p>
                  </div>
                </div>
                {s.generazioni_crazy8.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {s.generazioni_crazy8.map(g => (
                      <div key={g.id} className="relative flex-shrink-0">
                        <Miniatura url={g.url_immagine} className="w-28 h-28" />
                        <span className="absolute bottom-1 left-1 text-[9px] bg-white/90 px-1 rounded text-stone-600">#{g.ordine}{g.motore ? ` · ${g.motore}` : ''}</span>
                        <button onClick={() => rimuoviGenerazione(g.id)} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-white/90 text-stone-400 hover:text-red-600 text-[10px]" aria-label="Elimina immagine">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <BloccoCaricaGenerate sketch={s} onAggiungi={aggiungiGenerazione} onCaricamentoChange={segnalaCaricamento} />
              </section>
            ))}
            <NavigazioneFase fase={5} onIndietro={() => vaiAFase(4)} onAvanti={() => avanzaA(6)} avantiPossibile={generazioniTutte.length > 0} motivoBlocco="Caricate almeno un'immagine generata" etichettaAvanti="Passa alla riflessione" />
          </div>
        );

      case 6:
        return (
          <div className="space-y-6">
            {sketchTutti.filter(s => s.generazioni_crazy8.length > 0).map(s => (
              <section key={s.id} className="bg-white rounded-3xl border border-stone-200 p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <Miniatura url={s.url_file} className="w-14 h-14 flex-shrink-0" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Dallo sketch {s.ordine + 1}{s.sotto_ambito ? ` · ${s.sotto_ambito}` : ''}</p>
                </div>
                <div className="space-y-4">
                  {s.generazioni_crazy8.map(g => (
                    <div key={g.id} className="grid md:grid-cols-[220px_1fr] gap-4 border-t border-stone-100 pt-4">
                      <div className="space-y-2">
                        <Miniatura url={g.url_immagine} className="w-full aspect-square" />
                        <p className="text-[10px] text-stone-400">Round {g.ordine}{g.motore ? ` · ${g.motore}` : ''}</p>
                        <details className="text-[11px] text-stone-500">
                          <summary className="cursor-pointer hover:text-stone-900">Prompt usato</summary>
                          <p className="mt-1 leading-relaxed">{g.prompt_usato}</p>
                        </details>
                      </div>
                      <div className="space-y-3">
                        <div className="grid sm:grid-cols-2 gap-3">
                          <TestoAutosalvato tono="positivo" etichetta="👍 Cosa funziona" valore={g.positivo} righe={3} placeholder="Cosa vi convince? Cosa terreste?" onSalva={t => salvaGenerazione(g.id, { positivo: t })} />
                          <TestoAutosalvato tono="negativo" etichetta="👎 Cosa non funziona" valore={g.negativo} righe={3} placeholder="Cosa sembra generico o poco credibile, o tradisce lo sketch?" onSalva={t => salvaGenerazione(g.id, { negativo: t })} />
                        </div>
                        <TestoAutosalvato tono="avanti" etichetta="→ Al prossimo giro chiederemo…" valore={g.deduzione} righe={2} placeholder="Cosa cambiereste nel prompt?" onSalva={t => salvaGenerazione(g.id, { deduzione: t })} />
                        <button
                          type="button"
                          onClick={() => { setReitera(r => ({ sketchId: s.id, spunto: (g.deduzione || '').trim(), n: (r?.n || 0) + 1 })); vaiAFase(4); }}
                          className="text-xs bg-amber-100 text-amber-900 border border-amber-300 px-4 py-2 rounded-full font-medium hover:bg-amber-200 transition"
                        >
                          ↻ Reitera: torna al configuratore con questo spunto
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            <section className="bg-white rounded-3xl border border-stone-200 p-5">
              <TestoAutosalvato
                etichetta={`Riflessione complessiva del team ${attivitaInfo.richiediRiflessione ? '(obbligatoria)' : '(facoltativa)'}`}
                valore={attiva.riflessione}
                righe={4}
                placeholder="Cosa vi ha insegnato il dialogo con il modello? Dove vi ha aiutato e dove vi ha portato fuori strada?"
                onSalva={async t => { patchSubmission({ riflessione: t }); return salvaCampi({ riflessione: t }); }}
              />
            </section>
            <NavigazioneFase
              fase={6}
              onIndietro={() => vaiAFase(5)}
              onAvanti={() => avanzaA(7)}
              avantiPossibile={riflessioniScritte > 0 && (!attivitaInfo.richiediRiflessione || !!(attiva.riflessione || '').trim())}
              motivoBlocco={riflessioniScritte === 0 ? 'Commentate almeno un\'immagine' : 'Scrivete la riflessione complessiva'}
              etichettaAvanti="Componi la moodboard"
            />
          </div>
        );

      case 7:
        return (
          <div className="space-y-6">
            <MoodboardEditor
              submission={attiva}
              onSalvaMoodboard={async (voci: VoceMoodboard[]) => { patchSubmission({ moodboard: voci }); return salvaCampi({ moodboard: voci }); }}
              onSalvaCampo={async (campo, valore) => { patchSubmission({ [campo]: valore } as Partial<Submission>); return salvaCampi({ [campo]: valore }); }}
            />
            <NavigazioneFase
              fase={7}
              onIndietro={() => vaiAFase(6)}
              onAvanti={() => avanzaA(8)}
              avantiPossibile={immaginiMoodboard >= MIN_MOODBOARD && !!(attiva.concept_titolo || '').trim()}
              motivoBlocco={immaginiMoodboard < MIN_MOODBOARD ? `Servono almeno ${MIN_MOODBOARD} immagini` : 'Date un nome al concept'}
              etichettaAvanti="Valuta le immagini finali"
            />
          </div>
        );

      case 8:
        return (
          <div className="space-y-6">
            <Valutazione
              submission={attiva}
              driverCorso={corso.configurazione.driver}
              framework={corso.configurazione.framework}
              tagCorso={tagCorso}
              onSalvaMoodboard={async (voci: VoceMoodboard[]) => { patchSubmission({ moodboard: voci }); return salvaCampi({ moodboard: voci }); }}
            />
            <NavigazioneFase
              fase={8}
              onIndietro={() => vaiAFase(7)}
              onAvanti={() => avanzaA(9, { stato: 'consegnato' })}
              avantiPossibile={vociMoodboard.length > 0 && vociMoodboard.every(v => valutazioneCompleta(v, tagCorso))}
              motivoBlocco="Ogni immagine ha bisogno di tag e dei 4 driver"
              etichettaAvanti="Pronti per lo share"
            />
          </div>
        );

      case 9:
        return (
          <div className="space-y-6">
            <Share submissions={submissions} propriaId={attiva.id} etichettaDriver={k => corso.configurazione.driver.find(d => d.chiave === k)?.etichetta || k} />
            <NavigazioneFase fase={9} onIndietro={() => vaiAFase(8)} avantiPossibile={false} />
          </div>
        );
    }
    return null;
  };

  return (
    <main className="min-h-screen bg-[#FBF9F5]">
      {caricamentiAttivi > 0 && <SfondoCaricamento />}
      {mostraTutorial && <TutorialOverlay onChiudi={chiudiTutorial} />}

      <div className="flex flex-wrap justify-between items-center gap-y-2 px-4 sm:px-6 py-4 border-b border-stone-200">
        <a href="/" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium">&larr; Home</a>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {team && (
            <span className="text-xs uppercase tracking-widest bg-stone-100 border border-stone-200 px-3 py-1.5 rounded-full text-stone-600 font-medium">
              {etichettaTeam(team)}
            </span>
          )}
          <a href="/manuali?attivita=crazy8_ai" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium px-2">📚 Manuale</a>
          <button onClick={() => setMostraTutorial(true)} className="text-xs text-stone-400 hover:text-stone-900 transition px-2">? Tutorial</button>
          <button onClick={() => setActiveTab('percorso')} className={`px-4 py-2.5 rounded-full text-xs font-medium transition ${activeTab === 'percorso' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200'}`}>
            {attiva ? 'Percorso' : '+ Nuova consegna'}
          </button>
          <button onClick={() => setActiveTab('share')} className={`px-4 py-2.5 rounded-full text-xs font-medium transition ${activeTab === 'share' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200'}`}>
            📣 Concept dei team
          </button>
          <button onClick={() => setActiveTab('elenco')} className={`px-4 py-2.5 rounded-full text-xs font-medium transition ${activeTab === 'elenco' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200'}`}>
            Consegne ({submissionFiltrate.length})
          </button>
        </div>
      </div>

      {activeTab === 'percorso' && (
        !attiva ? (
          <div className="min-h-[calc(100vh-65px)] flex items-center justify-center px-6 py-10">
            <div className="max-w-md w-full space-y-4 animate-fade-in-up">
              <div className="text-center mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Fase 1 di {NUMERO_FASI}</p>
                <h1 className="text-3xl font-serif mt-1">🧭 Su cosa lavorate?</h1>
                <p className="text-sm text-stone-500 mt-1">
                  {team ? 'Su quali sotto-ambiti progettuali lavora il team? Uno o più.' : 'Il vostro sotto-ambito progettuale, e un codice per ritrovare la consegna più tardi.'}
                </p>
              </div>
              {!team && (
                <div className="grid grid-cols-2 gap-3">
                  <input type="text" value={gruppoNome} onChange={e => setGruppoNome(e.target.value)} placeholder="Nome Gruppo" className="border border-stone-200 rounded-xl p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900" />
                  <input type="number" value={gruppoNum} onChange={e => setGruppoNum(e.target.value)} placeholder="Numero Gruppo" className="border border-stone-200 rounded-xl p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900" />
                </div>
              )}
              <div className="space-y-2">
                {sottoAmbiti.map((s, i) => (
                  <div key={i} className="flex gap-1.5">
                    <input type="text" value={s} onChange={e => modificaSottoAmbito(i, e.target.value)} placeholder={sottoAmbiti.length > 1 ? `Sotto-ambito ${i + 1}` : 'Sotto-ambito progettuale scelto'} className="flex-1 border border-stone-200 rounded-xl p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900" />
                    {sottoAmbiti.length > 1 && (
                      <button type="button" onClick={() => rimuoviCampoSottoAmbito(i)} className="text-stone-300 hover:text-red-600 px-2" aria-label="Rimuovi">✕</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={aggiungiCampoSottoAmbito} className="text-xs text-stone-500 hover:text-stone-900 transition">+ Aggiungi un altro sotto-ambito</button>
              </div>
              {!team && (
                <>
                  <input type="password" minLength={4} value={codiceNuovo} onChange={e => setCodiceNuovo(e.target.value)} placeholder="Scegli un codice (min. 4 caratteri)" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900" />
                  <p className="text-[11px] text-stone-400">Vi servirà per tornare a lavorarci: conservatelo, non è recuperabile.</p>
                </>
              )}
              {erroreCreazione && <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl p-3">{erroreCreazione}</p>}
              <button onClick={iniziaConsegna} disabled={creazioneInCorso} className="w-full bg-stone-900 text-white py-3 rounded-full text-sm font-medium hover:bg-stone-800 transition disabled:opacity-50">
                {creazioneInCorso ? 'Creazione...' : 'Avanti →'}
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
            <div className="flex flex-wrap justify-between items-start gap-3">
              <div>
                <span className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">Gruppo {attiva.gruppo_num} — {attiva.gruppo_nome}</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {sottoAmbitiAttiva.map(sa => <span key={sa} className="text-[11px] bg-white border border-stone-200 text-stone-700 px-2.5 py-1 rounded-full">{sa}</span>)}
                </div>
              </div>
              <button onClick={chiudiCanvas} className="text-xs text-stone-400 hover:text-stone-900 transition">Chiudi consegna</button>
            </div>

            <Stepper fase={fase} raggiunta={raggiunta} onVai={vaiAFase} />

            <header key={fase} className="animate-fade-in-up">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Fase {fase} di {NUMERO_FASI}</p>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold mt-1"><span aria-hidden="true">{infoFase.icona}</span> {infoFase.titolo}</h1>
              <p className="text-sm text-stone-500 mt-1 max-w-2xl">{infoFase.sottotitolo}</p>
            </header>

            {erroreAzione && (
              <p role="alert" className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl p-3 flex justify-between gap-3">
                {erroreAzione}
                <button onClick={() => setErroreAzione('')} aria-label="Chiudi">✕</button>
              </p>
            )}

            <div key={`contenuto-${fase}`} className="animate-fade-in">{renderFase()}</div>
          </div>
        )
      )}

      {activeTab === 'share' && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-4">
          <header>
            <h1 className="text-2xl font-serif font-bold">📣 I concept dei team</h1>
            <p className="text-sm text-stone-500 mt-1">Le moodboard composte da ogni team, pronte per la presentazione in aula.</p>
          </header>
          <Share submissions={submissions} propriaId={attiva?.id || null} etichettaDriver={k => corso.configurazione.driver.find(d => d.chiave === k)?.etichetta || k} />
        </div>
      )}

      {activeTab === 'elenco' && (
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
            <p className="text-stone-500 text-xs">
              {team ? 'Le consegne del tuo gruppo.' : 'Filtra per numero di gruppo per ritrovare la tua consegna.'}
            </p>
            {!team && (
              <div className="w-40">
                <input type="number" value={filtroGruppo} onChange={e => setFiltroGruppo(e.target.value)} placeholder="N. Gruppo..." className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
              </div>
            )}
          </div>

          <div className="space-y-3">
            {submissionFiltrate.length === 0 ? (
              <div className="bg-white p-12 rounded-2xl border border-stone-200 text-center text-stone-400 text-sm">Nessuna consegna trovata.</div>
            ) : (
              submissionFiltrate.map(s => (
                <div key={s.id} className="bg-white p-4 rounded-2xl border border-stone-200 flex items-center justify-between shadow-sm hover:border-stone-300 transition gap-3">
                  <div className="flex items-center space-x-4 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-stone-100 border border-stone-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                      {s.immagini?.[0] ? (
                        <img src={s.immagini[0].url_file} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-stone-400 font-bold">IMG</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-stone-900 truncate">{s.hmw_o_tema || 'Senza sotto-ambito'}</h3>
                      <p className="text-xs text-stone-500">
                        Gruppo {s.gruppo_num} — {s.gruppo_nome} · Fase {faseEffettiva(s)}/{NUMERO_FASI} {FASI[faseEffettiva(s) - 1].breve}
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-2 flex-shrink-0">
                    <button onClick={() => chiediSblocco(s)} className="text-xs bg-stone-100 hover:bg-stone-900 hover:text-white px-4 py-2 rounded-xl font-medium transition">Apri</button>
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
            <h2 className="font-serif font-bold text-lg">Sblocca per continuare</h2>
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
            <p className="text-xs text-stone-500">Questa azione è irreversibile, e cancella sketch, immagini generate e moodboard collegati. Inserisci il codice di gruppo per confermare.</p>
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
