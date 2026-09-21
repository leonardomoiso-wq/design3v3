'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { comprimiImmagine } from '../../lib/immagine';
import { SfondoCaricamento, ImpulsoCaricamento } from '../../lib/caricamento';
import { useTeam } from '../../lib/team-context';

const TUTORIAL_VISTO_KEY = 'crazy8_tutorial_visto';

const TUTORIAL_SLIDES = [
  { icona: '✏️', titolo: 'Scegliete lo sketch giusto', testo: 'Dal Crazy 8 appena fatto in aula, portate qui 1-3 schizzi: quelli con l\'idea più chiara sul vostro sotto-ambito, non i più rifiniti.' },
  { icona: '💬', titolo: 'Scrivete un prompt mirato', testo: 'Potete chiedere: l\'ambientazione dell\'oggetto in un contesto d\'uso, un rendering dettagliato, o varianti di forma. Un aspetto alla volta.' },
  { icona: '🔄', titolo: "L'iterazione è il punto", testo: 'Guardate cosa vi restituisce l\'immagine generata: cosa avete dedotto? Usate quella deduzione per scrivere il prompt del round successivo.' },
  { icona: '📝', titolo: 'Ogni round lascia una traccia', testo: 'Prompt, immagine e deduzione di ogni round restano visibili: è il percorso del vostro pensiero, non solo il risultato finale.' },
];

const messaggioErrore = (codice: string) => {
  switch (codice) {
    case 'codice_errato': return 'Codice di gruppo errato.';
    case 'codice_troppo_corto': return 'Il codice di gruppo deve avere almeno 4 caratteri.';
    case 'submission_non_trovata': return 'Questa consegna non esiste più.';
    case 'sketch_non_trovato': return 'Questo sketch non esiste più.';
    case 'prompt_mancante': return 'Scrivi il prompt usato per questo round.';
    default: return 'Errore durante il salvataggio. Riprova.';
  }
};

// Le foto di sketch e generazioni arrivano spesso dritte dalla fotocamera
// del telefono (diversi MB): le compattiamo prima di salvarle, così le
// gallerie e la timeline restano rapide da caricare e scorrere.
const leggiFileComeDataUrl = comprimiImmagine;

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

function BloccoNuovaGenerazione({ sketchId, onAggiungi, suggerimenti, onCaricamentoChange }: { sketchId: string; onAggiungi: (sketchId: string, prompt: string, urlFile: string, deduzione: string) => Promise<boolean>; suggerimenti: any[]; onCaricamentoChange: (attivo: boolean) => void }) {
  const [prompt, setPrompt] = useState('');
  const [file, setFile] = useState<{ url: string; nome: string } | null>(null);
  const [deduzione, setDeduzione] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [comprimendo, setComprimendo] = useState(false);
  const [errore, setErrore] = useState('');

  const applicaSuggerimento = (testo: string) => {
    setPrompt(prev => (prev.trim() ? `${prev.trim()} ${testo}` : testo));
  };

  const carica = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setComprimendo(true);
    onCaricamentoChange(true);
    try {
      const url = await leggiFileComeDataUrl(f);
      setFile({ url, nome: f.name });
    } finally {
      setComprimendo(false);
      onCaricamentoChange(false);
    }
  };

  const invia = async () => {
    setErrore('');
    if (!prompt.trim() || !file) {
      setErrore('Servono almeno il prompt e l\'immagine generata.');
      return;
    }
    setInCorso(true);
    const ok = await onAggiungi(sketchId, prompt, file.url, deduzione);
    setInCorso(false);
    if (ok) {
      setPrompt(''); setFile(null); setDeduzione('');
    } else {
      setErrore('Errore durante il salvataggio. Riprova.');
    }
  };

  return (
    <div className="bg-stone-50 rounded-2xl border border-dashed border-stone-300 p-4 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">+ Nuovo round</p>
      {suggerimenti.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggerimenti.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => applicaSuggerimento(s.testo_prompt)}
              title={s.testo_prompt}
              className="text-[10px] bg-white border border-stone-300 text-stone-600 px-2.5 py-1 rounded-full hover:border-stone-900 hover:text-stone-900 transition"
            >
              💡 {s.etichetta}
            </button>
          ))}
        </div>
      )}
      <textarea rows={2} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Prompt usato (es. 'ambientazione in un salotto minimale')..." className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-stone-900" />
      <div className="flex items-center gap-2">
        <label className="text-xs bg-white border border-stone-200 rounded-lg px-3 py-2 cursor-pointer hover:border-stone-400 transition flex-shrink-0">
          {comprimendo ? <ImpulsoCaricamento etichetta="Comprimo..." /> : file ? '✓ Immagine caricata' : 'Carica immagine generata'}
          <input type="file" accept="image/*" className="sr-only" onChange={carica} disabled={comprimendo} />
        </label>
        {file && <img src={file.url} alt="" className="w-10 h-10 object-contain rounded-lg border border-stone-200 bg-white animate-scale-in" />}
      </div>
      <textarea rows={2} value={deduzione} onChange={e => setDeduzione(e.target.value)} placeholder="Cosa deducete da questa immagine? (informerà il prossimo prompt)" className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-stone-900" />
      {errore && <p className="text-[11px] text-red-600 font-medium">{errore}</p>}
      <button onClick={invia} disabled={inCorso} className="text-xs bg-stone-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-stone-800 transition disabled:opacity-50">
        {inCorso ? 'Salvataggio...' : 'Aggiungi al percorso'}
      </button>
    </div>
  );
}

export default function Crazy8Page() {
  const { team } = useTeam();
  const [attivitaInfo, setAttivitaInfo] = useState<{ id: string; stato: string; richiediLogPrompt: boolean; richiediRiflessione: boolean } | null | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'crea' | 'gestisci'>('crea');
  const [mostraTutorial, setMostraTutorial] = useState(false);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [filtroGruppo, setFiltroGruppo] = useState('');
  const [suggerimentiPrompt, setSuggerimentiPrompt] = useState<any[]>([]);
  // Contatore di compressioni/upload in corso in un punto qualsiasi della
  // pagina: quando > 0 la barra di caricamento in cima si anima, a far
  // sentire che l'attività si "propaga" oltre il singolo controllo.
  const [caricamentiAttivi, setCaricamentiAttivi] = useState(0);
  const [caricamentoSketch, setCaricamentoSketch] = useState(false);
  const segnalaCaricamento = (attivo: boolean) => setCaricamentiAttivi(n => Math.max(0, n + (attivo ? 1 : -1)));

  // La consegna aperta al momento nel "canvas" (creata ora o sbloccata dall'elenco)
  const [attivaId, setAttivaId] = useState<string | null>(null);
  const [attivaCodice, setAttivaCodice] = useState('');

  const [gruppoNome, setGruppoNome] = useState('');
  const [gruppoNum, setGruppoNum] = useState('');
  // Un team può portare avanti più di un sotto-ambito in parallelo: un
  // elenco dinamico invece di un solo campo di testo, uniti con "; " nel
  // titolo della consegna (colonna hmw_o_tema, invariata).
  const [sottoAmbiti, setSottoAmbiti] = useState<string[]>(['']);
  const [codiceNuovo, setCodiceNuovo] = useState('');
  const [erroreCreazione, setErroreCreazione] = useState('');
  const [creazioneInCorso, setCreazioneInCorso] = useState(false);

  // Con un team già loggato, non serve reinserire nome/numero né inventare
  // un codice: si precompila con l'identità del team, restando comunque
  // modificabile per chi vuole un codice diverso per questa consegna.
  useEffect(() => {
    if (!team) return;
    setGruppoNome(prev => prev || team.nome);
    setGruppoNum(prev => prev || String(team.numero));
    setCodiceNuovo(prev => prev || team.password);
  }, [team]);

  const [motoreUsato, setMotoreUsato] = useState('');
  const [notePrompt, setNotePrompt] = useState('');
  const [riflessione, setRiflessione] = useState('');
  const [erroreChiusura, setErroreChiusura] = useState('');
  const [chiusuraInCorso, setChiusuraInCorso] = useState(false);
  const [consegnaConfermata, setConsegnaConfermata] = useState(false);

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
      .select('*, immagini(*, generazioni_crazy8(*))')
      .order('created_at', { ascending: false });
    if (!error && data) {
      const formattate = (data as any[]).map(s => ({
        ...s,
        immagini: (s.immagini || [])
          .slice()
          .sort((a: any, b: any) => a.ordine - b.ordine)
          .map((img: any) => ({ ...img, generazioni_crazy8: (img.generazioni_crazy8 || []).slice().sort((a: any, b: any) => a.ordine - b.ordine) })),
      }));
      setSubmissions(formattate);
    }
  };

  useEffect(() => {
    const caricaAttivita = async () => {
      const { data } = await supabase.from('attivita').select('*').eq('tipo', 'crazy8_ai').maybeSingle();
      if (data) {
        setAttivitaInfo({ id: data.id, stato: data.stato, richiediLogPrompt: data.richiedi_log_prompt, richiediRiflessione: data.richiedi_riflessione });
      } else {
        setAttivitaInfo(null);
      }
    };

    const caricaSuggerimenti = async () => {
      const { data } = await supabase.from('prompt_suggeriti_crazy8').select('*').order('ordine', { ascending: true });
      if (data) setSuggerimentiPrompt(data as any[]);
    };

    caricaAttivita();
    caricaSubmissions();
    caricaSuggerimenti();

    try {
      if (!localStorage.getItem(TUTORIAL_VISTO_KEY)) setMostraTutorial(true);
    } catch {
      // storage non disponibile: niente tutorial automatico, resta raggiungibile a mano
    }

    const channel = supabase
      .channel('realtime-crazy8-studenti')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submission_crazy8' }, caricaSubmissions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'immagini' }, caricaSubmissions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'generazioni_crazy8' }, caricaSubmissions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prompt_suggeriti_crazy8' }, caricaSuggerimenti)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chiudiTutorial = () => {
    setMostraTutorial(false);
    try { localStorage.setItem(TUTORIAL_VISTO_KEY, '1'); } catch { /* non bloccante */ }
  };

  const attiva = submissions.find(s => s.id === attivaId) || null;

  const apriCanvas = (id: string, codice: string) => {
    setAttivaId(id);
    setAttivaCodice(codice);
    const s = submissions.find(x => x.id === id);
    setMotoreUsato(s?.motore_usato || '');
    setNotePrompt(s?.note_prompt || '');
    setRiflessione(s?.riflessione || '');
    setConsegnaConfermata(false);
    setActiveTab('crea');
  };

  const chiudiCanvas = () => {
    setAttivaId(null);
    setAttivaCodice('');
    setGruppoNome(''); setGruppoNum(''); setSottoAmbiti(['']); setCodiceNuovo('');
    setMotoreUsato(''); setNotePrompt(''); setRiflessione('');
  };

  const modificaSottoAmbito = (i: number, valore: string) => setSottoAmbiti(prev => prev.map((s, idx) => (idx === i ? valore : s)));
  const aggiungiCampoSottoAmbito = () => setSottoAmbiti(prev => [...prev, '']);
  const rimuoviCampoSottoAmbito = (i: number) => setSottoAmbiti(prev => prev.filter((_, idx) => idx !== i));

  const iniziaConsegna = async () => {
    setErroreCreazione('');
    const sottoAmbitiPuliti = sottoAmbiti.map(s => s.trim()).filter(Boolean);
    if (!gruppoNome.trim() || !gruppoNum.trim() || sottoAmbitiPuliti.length === 0 || codiceNuovo.trim().length < 4) {
      setErroreCreazione('Compila gruppo, almeno un sotto-ambito e un codice di almeno 4 caratteri.');
      return;
    }
    setCreazioneInCorso(true);
    const { data, error } = await supabase.rpc('crea_submission_crazy8', {
      p_attivita_id: attivitaInfo?.id ?? null,
      p_gruppo_nome: gruppoNome,
      p_gruppo_num: Number(gruppoNum),
      p_sotto_ambito: sottoAmbitiPuliti.join('; '),
      p_codice: codiceNuovo,
    });
    setCreazioneInCorso(false);
    if (error) {
      setErroreCreazione(messaggioErrore(error.message));
      return;
    }
    await caricaSubmissions();
    apriCanvas(data, codiceNuovo);
  };

  const aggiungiSketch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!attivaId) return;
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setCaricamentoSketch(true);
    segnalaCaricamento(true);
    try {
      for (const file of files) {
        const urlFile = await leggiFileComeDataUrl(file);
        await supabase.rpc('aggiungi_sketch_crazy8', { p_submission_id: attivaId, p_codice: attivaCodice, p_url_file: urlFile });
      }
      await caricaSubmissions();
    } finally {
      setCaricamentoSketch(false);
      segnalaCaricamento(false);
    }
  };

  const rimuoviSketch = async (immagineId: string) => {
    await supabase.rpc('elimina_sketch_crazy8', { p_immagine_id: immagineId, p_codice: attivaCodice });
    await caricaSubmissions();
  };

  const aggiungiGenerazione = async (sketchId: string, prompt: string, urlImmagine: string, deduzione: string): Promise<boolean> => {
    const { error } = await supabase.rpc('aggiungi_generazione_crazy8', {
      p_sketch_immagine_id: sketchId, p_codice: attivaCodice, p_prompt_usato: prompt, p_url_immagine: urlImmagine, p_deduzione: deduzione,
    });
    if (error) return false;
    await caricaSubmissions();
    return true;
  };

  const chiudiConsegna = async () => {
    if (!attiva) return;
    setErroreChiusura('');
    if (attivitaInfo?.richiediLogPrompt && !notePrompt.trim()) {
      setErroreChiusura('Il log prompt riassuntivo è obbligatorio per questa attività.');
      return;
    }
    if (attivitaInfo?.richiediRiflessione && !riflessione.trim()) {
      setErroreChiusura('La riflessione finale è obbligatoria per questa attività.');
      return;
    }
    setChiusuraInCorso(true);
    const { error } = await supabase.rpc('aggiorna_dettagli_submission_crazy8', {
      p_id: attiva.id, p_codice: attivaCodice, p_gruppo_nome: attiva.gruppo_nome, p_gruppo_num: attiva.gruppo_num,
      p_sotto_ambito: attiva.hmw_o_tema, p_motore_usato: motoreUsato, p_note_prompt: notePrompt, p_riflessione: riflessione, p_stato: 'consegnato',
    });
    setChiusuraInCorso(false);
    if (error) {
      setErroreChiusura(messaggioErrore(error.message));
      return;
    }
    setConsegnaConfermata(true);
    await caricaSubmissions();
  };

  const chiediSblocco = async (s: any) => {
    // Con un team già loggato proviamo prima la sua password: se è quella
    // usata alla creazione, si riapre subito il canvas senza altro.
    if (team) {
      const { data, error } = await supabase.rpc('verifica_codice_submission_crazy8', { p_id: s.id, p_codice: team.password });
      if (!error && data) {
        apriCanvas(s.id, team.password);
        return;
      }
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
    apriCanvas(s.id, codiceSblocco);
  };

  const chiediEliminazione = (s: any) => { setSubmissionDaEliminare(s); setCodiceEliminazione(team?.password || ''); setErroreEliminazione(''); };

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
      {caricamentiAttivi > 0 && <SfondoCaricamento />}
      {mostraTutorial && <TutorialOverlay onChiudi={chiudiTutorial} />}

      <div className="flex justify-between items-center px-6 py-4 border-b border-stone-200">
        <a href="/" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium">&larr; Home</a>
        <div className="flex items-center gap-2">
          {team && (
            <span className="text-xs uppercase tracking-widest bg-stone-100 border border-stone-200 px-3 py-1.5 rounded-full text-stone-600 font-medium">
              Gruppo {team.numero} — {team.nome}
            </span>
          )}
          <a href="/manuali?attivita=crazy8_ai" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium px-2">📚 Manuale</a>
          <button onClick={() => setMostraTutorial(true)} className="text-xs text-stone-400 hover:text-stone-900 transition px-2">? Tutorial</button>
          <button onClick={() => { chiudiCanvas(); setActiveTab('crea'); }} className={`px-4 py-2 rounded-full text-xs font-medium transition ${activeTab === 'crea' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200'}`}>
            {attiva ? attiva.hmw_o_tema || 'Consegna aperta' : '+ Nuova Consegna'}
          </button>
          <button onClick={() => setActiveTab('gestisci')} className={`px-4 py-2 rounded-full text-xs font-medium transition ${activeTab === 'gestisci' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200'}`}>
            Elenco ({submissions.length})
          </button>
        </div>
      </div>

      {activeTab === 'crea' ? (
        !attiva ? (
          <div className="min-h-[calc(100vh-65px)] flex items-center justify-center px-6">
            <div className="max-w-md w-full space-y-4 animate-fade-in-up">
              <div className="text-center mb-2">
                <h1 className="text-3xl font-serif">🎨 Iniziamo</h1>
                <p className="text-sm text-stone-500 mt-1">
                  {team ? 'Il vostro sotto-ambito progettuale, uno o più.' : 'Il vostro sotto-ambito progettuale, e un codice per ritrovare la consegna più tardi.'}
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
                {creazioneInCorso ? 'Creazione...' : 'Apri il canvas →'}
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
            <div className="flex justify-between items-start animate-fade-in-up">
              <div>
                <span className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">Gruppo {attiva.gruppo_num} — {attiva.gruppo_nome}</span>
                <h1 className="text-2xl font-serif font-bold mt-1">{attiva.hmw_o_tema}</h1>
              </div>
              <button onClick={chiudiCanvas} className="text-xs text-stone-400 hover:text-stone-900 transition">Chiudi consegna</button>
            </div>

            <div className="space-y-5">
              {attiva.immagini.map((sketch: any) => (
                <div key={sketch.id} className="bg-white rounded-3xl border border-stone-200 shadow-sm p-5 space-y-4 animate-scale-in">
                  <div className="flex items-start gap-4">
                    <div className="w-24 h-24 rounded-2xl bg-stone-50 border border-stone-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                      <img src={sketch.url_file} alt="Sketch" loading="lazy" decoding="async" className="max-w-full max-h-full object-contain" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">Sketch</p>
                      <p className="text-xs text-stone-500 mt-1">{sketch.generazioni_crazy8.length} round di generazione</p>
                    </div>
                    <button onClick={() => rimuoviSketch(sketch.id)} className="text-[11px] text-stone-300 hover:text-red-600 transition flex-shrink-0">Rimuovi sketch</button>
                  </div>

                  {sketch.generazioni_crazy8.map((g: any, i: number) => (
                    <div key={g.id} className="grid sm:grid-cols-[auto_1fr] gap-3 pl-4 border-l-2 border-stone-100 animate-fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
                      <div className="w-20 h-20 rounded-xl bg-stone-50 border border-stone-200 overflow-hidden flex items-center justify-center">
                        <img src={g.url_immagine} alt={`Round ${g.ordine}`} loading="lazy" decoding="async" className="max-w-full max-h-full object-contain" />
                      </div>
                      <div className="text-xs space-y-1">
                        <p className="font-bold text-stone-700">Round {g.ordine}</p>
                        <p className="text-stone-600"><b>Prompt:</b> {g.prompt_usato}</p>
                        {g.deduzione && <p className="text-stone-500 italic">Deduzione: &ldquo;{g.deduzione}&rdquo;</p>}
                      </div>
                    </div>
                  ))}

                  <BloccoNuovaGenerazione sketchId={sketch.id} onAggiungi={aggiungiGenerazione} suggerimenti={suggerimentiPrompt} onCaricamentoChange={segnalaCaricamento} />
                </div>
              ))}

              <label className={`flex items-center justify-center gap-2 h-20 rounded-2xl border-2 border-dashed transition cursor-pointer animate-fade-in-up ${caricamentoSketch ? 'border-stone-400 bg-stone-50' : 'border-stone-300 bg-white hover:border-stone-500 hover:bg-stone-50'}`}>
                {caricamentoSketch ? (
                  <ImpulsoCaricamento etichetta="Comprimo lo sketch..." />
                ) : (
                  <>
                    <span className="text-xl" aria-hidden="true">✏️</span>
                    <span className="text-sm font-medium text-stone-700">Aggiungi un altro sketch</span>
                  </>
                )}
                <input type="file" accept="image/*" multiple className="sr-only" onChange={aggiungiSketch} disabled={caricamentoSketch} />
              </label>
            </div>

            <div className="bg-white rounded-3xl border border-stone-200 shadow-sm p-5 space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">Chiudete la consegna</h2>
              <input type="text" value={motoreUsato} onChange={e => setMotoreUsato(e.target.value)} placeholder="Motore AI usato (Midjourney, DALL·E...)" className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
              <textarea rows={2} value={notePrompt} onChange={e => setNotePrompt(e.target.value)} placeholder={`Log prompt riassuntivo ${attivitaInfo.richiediLogPrompt ? '(obbligatorio)' : '(facoltativo)'}`} className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
              <textarea rows={2} value={riflessione} onChange={e => setRiflessione(e.target.value)} placeholder={`Riflessione finale ${attivitaInfo.richiediRiflessione ? '(obbligatoria)' : '(facoltativa)'}`} className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
              {erroreChiusura && <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl p-2.5">{erroreChiusura}</p>}
              {consegnaConfermata && <p className="text-xs text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">Consegna registrata come completa. Potete comunque continuare ad aggiungere round.</p>}
              <button onClick={chiudiConsegna} disabled={chiusuraInCorso} className="bg-stone-900 text-white px-6 py-2.5 rounded-full text-xs font-medium hover:bg-stone-800 transition disabled:opacity-50">
                {chiusuraInCorso ? 'Salvataggio...' : 'Segna come consegnata ✨'}
              </button>
            </div>
          </div>
        )
      ) : (
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
            <p className="text-stone-500 text-xs">Filtra per numero di gruppo per ritrovare la tua consegna.</p>
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
                        <img src={s.immagini[0].url_file} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-stone-400 font-bold">IMG</span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-stone-900">{s.hmw_o_tema || 'Senza sotto-ambito'}</h3>
                      <p className="text-xs text-stone-500">Gruppo {s.gruppo_num} — {s.gruppo_nome} · <span className="capitalize">{s.stato.replace('_', ' ')}</span></p>
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
            <p className="text-xs text-stone-500">Questa azione è irreversibile, e cancella tutti i round di generazione collegati. Inserisci il codice di gruppo per confermare.</p>
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
