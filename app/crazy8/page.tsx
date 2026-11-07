'use client';
import { useEffect, useRef, useState } from 'react';
import Info from '@/components/Info';
import { supabase } from '../../lib/supabase';
import { comprimiImmagine } from '../../lib/immagine';
import { SfondoCaricamento, ImpulsoCaricamento } from '../../lib/caricamento';
import { useTeam } from '../../lib/team-context';
import RichiedeCorso from '../../components/RichiedeCorso';
import { percorsoCorso, type Corso } from '../../lib/corsi';
import { Solidi, useTendina } from '../../components/moiso/Moiso';
import { Celebrazione } from '../../components/moiso/Celebrazione';
import { RisultatoDomanda, PresentazioneRisultati } from '../../components/crazy8/Finale';
import { Pila3D, RiquadroC8, useLightboxC8 } from '../../components/crazy8/Galleria';
import { due } from '../../components/Vetrina';
import {
  FASI, NUMERO_FASI, Miniatura, TestoAutosalvato, faseEffettiva, visioneDi, useControlloDbCrazy8,
  nomeContesto, testoHmw, type Contesto, type Generazione, type Hmw, type Sketch, type Submission,
} from '../../components/crazy8/shared';
import PromptConfiguratore, { MOTORI } from '../../components/crazy8/PromptConfiguratore';
import TeamAttivitaGate, { leggiTeamAttivita, salvaTeamAttivita, type TeamAttivita } from '../../components/crazy8/TeamAttivita';
import BachecaContesti from '../../components/crazy8/Contesti';
import ComponiHmw from '../../components/crazy8/ComponiHmw';

// Crazy 8 a fasi (lato studente). Il percorso è lineare: ogni fase si
// sblocca quando la precedente ha prodotto ciò che serve (almeno uno
// sketch, almeno uno selezionato, ...), ma si può sempre tornare a
// rivedere le fasi già raggiunte. Il punto raggiunto è salvato sulla
// consegna, così il telefono che scatta gli sketch e il portatile che li
// rivede restano allineati (con l'aggiornamento realtime).

const TUTORIAL_VISTO_KEY = 'crazy8_fasi_tutorial_visto';

const TUTORIAL_SLIDES = [
  { icona: '👥', titolo: 'Prima il team', testo: 'Ogni attività ha i suoi team: uno di voi lo crea, gli altri entrano con nome e password.' },
  { icona: '📌', titolo: 'Scegliete i contesti', testo: 'Dalla bacheca preparata dal docente scegliete i contesti su cui lavorare.' },
  { icona: '❓', titolo: 'Due domande "Come potremmo…"', testo: 'Riempite gli spazi della formula. Il docente le rivede in aula e sblocca gli sketch.' },
  { icona: '✏️', titolo: '8 sketch per domanda', testo: 'Su carta, poi una foto dal telefono. Scegliete il migliore per ogni domanda e miglioratelo con l\'AI.' },
];

const messaggioErrore = (codice: string) => {
  switch (codice) {
    case 'codice_errato': return 'Codice di gruppo errato.';
    case 'codice_troppo_corto': return 'Il codice di gruppo deve avere almeno 4 caratteri.';
    case 'submission_non_trovata': return 'Questa consegna non esiste più.';
    case 'sketch_non_trovato': return 'Questo sketch non esiste più.';
    case 'prompt_mancante': return 'Scrivi il prompt usato.';
    case 'troppi_contesti': return 'Avete scelto più contesti di quelli permessi.';
    case 'sketch_bloccati': return 'Gli sketch si aprono quando il/la docente approva le domande.';
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
    contesti: Array.isArray(s.contesti) ? s.contesti : [],
    hmw: Array.isArray(s.hmw) ? s.hmw : [],
    hmw_revisione: Array.isArray(s.hmw_revisione) ? s.hmw_revisione : [],
    hmw_inviate: !!s.hmw_inviate,
    sketch_sbloccato: !!s.sketch_sbloccato,
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
  const primo = indice === 0;
  const ultimo = indice === TUTORIAL_SLIDES.length - 1;
  const slide = TUTORIAL_SLIDES[indice];
  const avanti = () => (ultimo ? onChiudi() : setIndice(i => i + 1));
  const indietro = () => setIndice(i => Math.max(0, i - 1));

  // frecce della tastiera per scorrere, Esc per chiudere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndice(i => Math.min(TUTORIAL_SLIDES.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndice(i => Math.max(0, i - 1));
      if (e.key === 'Escape') onChiudi();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChiudi]);

  return (
    <div className="mz c8-tutorial" style={{ background: 'var(--ink)', color: 'var(--paper)' }} role="dialog" aria-modal="true" aria-label="Come funziona Crazy 8">
      <button type="button" className="mz-pill sm ghost" style={{ position: 'absolute', top: 20, right: 20, color: '#a8a29e' }} onClick={onChiudi} aria-label="Chiudi il tutorial">Salta ✕</button>
      <div key={indice} className="mz-in" style={{ maxWidth: 760, width: '100%', display: 'grid', gap: 22 }}>
        <span className="mz-mono" style={{ color: 'var(--accent-vivo)' }}>Crazy 8 ({due(indice + 1)} / {due(TUTORIAL_SLIDES.length)})</span>
        <h2 className="mz-display">{slide.titolo}</h2>
        <p style={{ margin: 0, fontSize: 'clamp(17px, 1.8vw, 22px)', lineHeight: 1.45, color: '#d6d3d1', maxWidth: 560 }}>{slide.testo}</p>
        <div style={{ display: 'flex', gap: 6 }} aria-hidden="true">
          {TUTORIAL_SLIDES.map((_, i) => (
            <span key={i} style={{ height: 4, width: i === indice ? 28 : 10, borderRadius: 4, background: i === indice ? 'var(--accent-vivo)' : '#57534e', transition: 'width .4s' }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingTop: 4 }}>
          <button type="button" className="mz-pill ghost" style={{ color: '#d6d3d1' }} disabled={primo} onClick={indietro}>← Indietro</button>
          <button type="button" className="mz-pill b lg" onClick={avanti}>{ultimo ? 'Inizia' : 'Avanti →'}</button>
        </div>
      </div>
    </div>
  );
}

// Indice delle 9 fasi: si apre una fase già raggiunta, le altre restano spente.
function Stepper({ fase, raggiunta, onVai }: { fase: number; raggiunta: number; onVai: (n: number) => void }) {
  const corrente = useRef<HTMLButtonElement>(null);
  useEffect(() => { corrente.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }, [fase]);
  return (
    <nav aria-label="Fasi dell'attività" className="c8-fasi">
      {FASI.map(f => {
        const bloccata = f.n > raggiunta;
        const attuale = f.n === fase;
        return (
          <button
            key={f.n}
            ref={attuale ? corrente : undefined}
            type="button"
            disabled={bloccata}
            onClick={() => onVai(f.n)}
            aria-current={attuale ? 'step' : undefined}
            className={`c8-fase ${f.n < raggiunta && !attuale ? 'fatta' : ''}`}
            title={bloccata ? 'Si apre quando la fase precedente è pronta' : undefined}
          >
            <span className="mz-mono" style={attuale ? { color: 'var(--accento)' } : undefined}>({due(f.n)}){f.n < raggiunta && !attuale ? ' ✓' : ''}</span>
            <span className="c8-fase-nome">{f.breve}</span>
          </button>
        );
      })}
    </nav>
  );
}

function NavigazioneFase({ fase, onIndietro, onAvanti, avantiPossibile, motivoBlocco, etichettaAvanti }: {
  fase: number; onIndietro: () => void; onAvanti?: () => void; avantiPossibile: boolean; motivoBlocco?: string; etichettaAvanti?: string;
}) {
  const prossima = FASI.find(f => f.n === fase + 1);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-5" style={{ borderTop: '1px solid var(--ink)' }}>
      {fase > 1 ? (
        <button type="button" onClick={onIndietro} className="mz-pill ghost">← {FASI[fase - 2].breve}</button>
      ) : <span />}
      {prossima && onAvanti && (
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {!avantiPossibile && motivoBlocco && <span className="mz-mono" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12.5, fontWeight: 500 }}>{motivoBlocco}</span>}
          <button type="button" onClick={onAvanti} disabled={!avantiPossibile} className="mz-pill b lg">
            {etichettaAvanti || `Avanti: ${prossima.breve}`} →
          </button>
        </div>
      )}
    </div>
  );
}

export default function Crazy8Page() {
  return <RichiedeCorso>{corso => <Crazy8PageCorso corso={corso} />}</RichiedeCorso>;
}

type InfoAttivita = { id: string; stato: string; titolo: string; config: { contesti_per_team?: number; sketch_per_domanda?: number } };

function Crazy8PageCorso({ corso }: { corso: Corso }) {
  const { team } = useTeam();
  const problemiDb = useControlloDbCrazy8();
  const [attivitaInfo, setAttivitaInfo] = useState<InfoAttivita | null | undefined>(undefined);
  const [teamAtt, setTeamAtt] = useState<TeamAttivita | null | undefined>(undefined);
  const [attiva, setAttiva] = useState<Submission | null>(null);
  const [contesti, setContesti] = useState<Contesto[]>([]);
  const [mostraTutorial, setMostraTutorial] = useState(false);
  const [suggerimentiPrompt, setSuggerimentiPrompt] = useState<any[]>([]);
  const [caricamentiAttivi, setCaricamentiAttivi] = useState(0);
  const [caricamentoSketch, setCaricamentoSketch] = useState<number | null>(null);
  const segnalaCaricamento = (attivo: boolean) => setCaricamentiAttivi(n => Math.max(0, n + (attivo ? 1 : -1)));
  const [fase, setFase] = useState(1);
  const [erroreAzione, setErroreAzione] = useState('');
  const [promptInviato, setPromptInviato] = useState(false);
  const [sketchInRevisione, setSketchInRevisione] = useState<string | null>(null);
  const faseImpostata = useRef(false);
  const tendina = useTendina();
  const lightbox = useLightboxC8();
  const [festa, setFesta] = useState<{ titolo: string; sottotitolo: string; origine: { x: number; y: number } | null } | null>(null);
  const [presenta, setPresenta] = useState(false);

  const codice = teamAtt?.password || '';

  // === caricamenti ===
  const caricaAttivita = async () => {
    const { data } = await supabase.from('attivita').select('*').eq('corso_id', corso.id).eq('tipo', 'crazy8_ai').maybeSingle();
    setAttivitaInfo(data ? { id: data.id, stato: data.stato, titolo: data.titolo || 'Crazy 8', config: data.config || {} } : null);
    return data?.id as string | undefined;
  };

  const caricaContesti = async (attivitaId: string) => {
    const { data } = await supabase.from('contesti_crazy8').select('id, titolo, descrizione, ordine').eq('attivita_id', attivitaId).order('ordine');
    setContesti((data || []) as Contesto[]);
  };

  const caricaConsegna = async (id: string) => {
    const { data } = await supabase.from('submission_crazy8').select('*, immagini(*, generazioni_crazy8(*))').eq('id', id).maybeSingle();
    if (data) setAttiva(normalizza(data));
  };

  // Entrando con il team dell'attività si apre (o nasce) la sua consegna.
  const apriConsegnaTeam = async (t: TeamAttivita) => {
    const { data, error } = await supabase.rpc('crea_submission_crazy8_team', { p_team_attivita_id: t.id, p_password: t.password });
    if (error || !data) {
      // il team è stato eliminato dal/dalla docente: si ricomincia dalla composizione
      if (attivitaInfo) salvaTeamAttivita(attivitaInfo.id, null);
      setTeamAtt(null);
      return;
    }
    await caricaConsegna(data as string);
  };

  useEffect(() => {
    let id: string | undefined;
    const ricaricaConsegna = () => setAttiva(a => { if (a) caricaConsegna(a.id); return a; });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const presto = () => { if (timer) clearTimeout(timer); timer = setTimeout(ricaricaConsegna, 600); };

    (async () => {
      id = await caricaAttivita();
      if (!id) return;
      caricaContesti(id);
      setTeamAtt(leggiTeamAttivita(id));
    })();
    supabase.from('prompt_suggeriti_crazy8').select('*').eq('corso_id', corso.id).order('ordine', { ascending: true })
      .then(({ data }) => { if (data) setSuggerimentiPrompt(data as any[]); });
    try { if (!localStorage.getItem(TUTORIAL_VISTO_KEY)) setMostraTutorial(true); } catch { /* storage non disponibile */ }

    const channel = supabase
      .channel(`realtime-crazy8-studenti-${corso.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submission_crazy8' }, presto)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'immagini' }, presto)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'generazioni_crazy8' }, presto)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contesti_crazy8' }, () => { if (id) caricaContesti(id); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'attivita' }, () => { caricaAttivita(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (teamAtt) apriConsegnaTeam(teamAtt);
    else setAttiva(null);
    faseImpostata.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamAtt?.id]);

  const raggiunta = attiva ? faseEffettiva(attiva) : 1;

  // alla prima apertura si riparte dal punto raggiunto
  useEffect(() => {
    if (attiva && !faseImpostata.current) {
      faseImpostata.current = true;
      setFase(faseEffettiva(attiva));
    }
  }, [attiva]);

  const entraNelTeam = (t: TeamAttivita) => {
    if (!attivitaInfo) return;
    salvaTeamAttivita(attivitaInfo.id, t);
    setTeamAtt(t);
  };

  const cambiaTeam = () => {
    if (!attivitaInfo) return;
    if (!window.confirm('Uscire da questo team? Potrete rientrare con nome e password.')) return;
    salvaTeamAttivita(attivitaInfo.id, null);
    setTeamAtt(null);
  };

  const chiudiTutorial = () => {
    setMostraTutorial(false);
    try { localStorage.setItem(TUTORIAL_VISTO_KEY, '1'); } catch { /* non bloccante */ }
  };

  // === scritture ===
  const patch = (p: Partial<Submission>) => setAttiva(a => (a ? { ...a, ...p } : a));
  const patchSketch = (sketchId: string, p: Partial<Sketch>) =>
    setAttiva(a => (a ? { ...a, immagini: a.immagini.map(i => (i.id === sketchId ? { ...i, ...p } : i)) } : a));

  const salvaCampi = async (campi: Record<string, unknown>): Promise<boolean> => {
    if (!attiva) return false;
    const { error } = await supabase.rpc('aggiorna_campi_submission_crazy8', { p_id: attiva.id, p_codice: codice, p_campi: campi });
    if (error) { setErroreAzione(messaggioErrore(error.message)); return false; }
    return true;
  };

  const salvaSketch = async (sketchId: string, campi: Partial<Pick<Sketch, 'selezionato' | 'interpretazione'>>): Promise<boolean> => {
    patchSketch(sketchId, campi);
    const { error } = await supabase.rpc('aggiorna_sketch_crazy8', { p_immagine_id: sketchId, p_codice: codice, p_campi: campi });
    if (error) { setErroreAzione(messaggioErrore(error.message)); if (attiva) caricaConsegna(attiva.id); return false; }
    return true;
  };

  // Cambio di fase con la tendina d'inchiostro che porta il nome della fase
  const vaiAFase = (n: number) => {
    setErroreAzione('');
    if (n === fase) return;
    tendina.mostra(FASI[n - 1]?.breve || '', () => setFase(n));
  };

  const avanzaA = async (n: number, extra: Record<string, unknown> = {}) => {
    if (n > raggiunta || Object.keys(extra).length > 0) {
      patch({ fase_raggiunta: Math.max(raggiunta, n) });
      const ok = await salvaCampi({ fase_raggiunta: n, ...extra });
      if (!ok) return;
    }
    vaiAFase(n);
  };

  // === fase 4: sketch per domanda ===
  const aggiungiSketch = async (e: React.ChangeEvent<HTMLInputElement>, domanda: number) => {
    if (!attiva) return;
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setCaricamentoSketch(domanda);
    segnalaCaricamento(true);
    setErroreAzione('');
    try {
      for (const file of files) {
        const urlFile = await comprimiImmagine(file);
        const { error } = await supabase.rpc('aggiungi_sketch_crazy8', { p_submission_id: attiva.id, p_codice: codice, p_url_file: urlFile, p_domanda: domanda });
        if (error) { setErroreAzione(messaggioErrore(error.message)); break; }
      }
      await caricaConsegna(attiva.id);
    } finally {
      setCaricamentoSketch(null);
      segnalaCaricamento(false);
    }
  };

  const rimuoviSketch = async (immagineId: string) => {
    if (!attiva || !window.confirm('Eliminare questo sketch? Verranno eliminate anche le immagini generate a partire da esso.')) return;
    await supabase.rpc('elimina_sketch_crazy8', { p_immagine_id: immagineId, p_codice: codice });
    await caricaConsegna(attiva.id);
  };

  // per ogni domanda si scelgono al massimo N sketch (impostato dal docente);
  // con N = 1 scegliere un altro sketch sostituisce quello già scelto
  const scegliMigliore = async (s: Sketch) => {
    if (!attiva) return;
    const d = s.domanda ?? 0;
    if (s.selezionato) { await salvaSketch(s.id, { selezionato: false }); return; }
    const giaScelti = attiva.immagini.filter(x => (x.domanda ?? 0) === d && x.selezionato && x.id !== s.id);
    if (giaScelti.length >= sketchPerDomanda) {
      if (sketchPerDomanda > 1) { setErroreAzione(`Per la domanda ${d + 1} potete sceglierne ${sketchPerDomanda}: togliete prima uno di quelli scelti.`); return; }
      for (const altro of giaScelti) await salvaSketch(altro.id, { selezionato: false });
    }
    await salvaSketch(s.id, { selezionato: true });
  };

  // === fase 7 ===
  const aggiungiGenerazione = async (sketchId: string, prompt: string, urlImmagine: string, motore: string): Promise<boolean> => {
    const { error } = await supabase.rpc('aggiungi_generazione_crazy8', {
      p_sketch_immagine_id: sketchId, p_codice: codice, p_prompt_usato: prompt, p_url_immagine: urlImmagine, p_deduzione: null, p_motore: motore || null,
    });
    if (error) return false;
    if (attiva) await caricaConsegna(attiva.id);
    return true;
  };

  const rimuoviGenerazione = async (genId: string) => {
    if (!attiva || !window.confirm('Eliminare questa immagine generata?')) return;
    await supabase.rpc('elimina_generazione_crazy8', { p_id: genId, p_codice: codice });
    await caricaConsegna(attiva.id);
  };

  // === schermate di attesa ===
  if (attivitaInfo === undefined || (attivitaInfo && teamAtt === undefined)) {
    return <main className="mz" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><span className="mz-mono mz-breathe">Caricamento…</span></main>;
  }

  const rail = (
    <header className="mz-rail">
      <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', minWidth: 0 }}>
        <a href={percorsoCorso(corso)} className="mz-mono mz-abbrevia" style={{ textDecoration: 'none', maxWidth: '34vw' }} title={corso.nome}>← {corso.nome}</a>
        <span className="mz-vetrina-rail-nome max-sm:hidden">Crazy 8</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
        {teamAtt && (
          <button type="button" onClick={cambiaTeam} className="mz-chip on mz-abbrevia" style={{ maxWidth: 220 }} title="Cambia team">
            <span className="mz-mono">{String(teamAtt.numero).padStart(2, "0")}</span> {teamAtt.nome}
          </button>
        )}
        <a href="/manuali?attivita=crazy8_ai" className="mz-pill sm ghost max-sm:hidden">Manuale</a>
        <button type="button" onClick={() => setMostraTutorial(true)} className="mz-pill sm ghost" aria-label="Come funziona">?</button>
      </div>
    </header>
  );

  if (attivitaInfo === null || attivitaInfo.stato !== 'attiva') {
    return (
      <main className="mz mz-vetrina">
        <header className="mz-rail">
          <a href={percorsoCorso(corso)} className="mz-mono" style={{ textDecoration: 'none' }}>← {corso.nome}</a>
        </header>
        <section className="mz-ingresso">
          <div className="mz-ingresso-testo mz-in">
            <h1 className="mz-display mz-eroe-titolo">Crazy 8<span className="mz-sup">(in arrivo)</span></h1>
            <p className="mz-ingresso-lead">Il/la docente non l&apos;ha ancora aperta. Tornate più tardi.</p>
          </div>
          <div className="mz-in" style={{ animationDelay: '120ms' }}><Solidi cadono /></div>
        </section>
      </main>
    );
  }

  const avvisoDb = problemiDb.length > 0 && (
    <p role="alert" className="max-w-6xl mx-4 sm:mx-auto mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      Crazy 8 è in aggiornamento: alcune azioni potrebbero non salvarsi. Avvisate il/la docente.
    </p>
  );

  if (!teamAtt) {
    return (
      <main className="mz" style={{ minHeight: '100vh' }}>
        {mostraTutorial && <TutorialOverlay onChiudi={chiudiTutorial} />}
        {rail}
        {avvisoDb}
        <TeamAttivitaGate attivitaId={attivitaInfo.id} titoloAttivita="Crazy 8" membriSuggeriti={team?.membri || []} onEntrato={entraNelTeam} />
      </main>
    );
  }

  if (!attiva) {
    return <main className="mz" style={{ minHeight: '100vh' }}>{rail}<div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}><span className="mz-mono mz-breathe">Apro la consegna del team…</span></div></main>;
  }

  // === dati derivati ===
  const massimoContesti = Number(attivitaInfo.config?.contesti_per_team ?? 2);
  const sketchPerDomanda = Math.max(1, Number(attivitaInfo.config?.sketch_per_domanda ?? 1));
  const sceltiValidi = attiva.contesti.filter(id => contesti.some(c => c.id === id));
  const contestiRichiesti = contesti.length === 0 ? 0 : massimoContesti > 0 ? Math.min(massimoContesti, contesti.length) : 1;
  const opzioniContesto = [
    ...sceltiValidi.map(id => ({ id, etichetta: nomeContesto(id, contesti), proprio: false })),
  ];
  const sketchTutti = attiva.immagini;
  const sketchDi = (d: number) => sketchTutti.filter(s => (s.domanda ?? 0) === d);
  const sketchSelezionati = sketchTutti.filter(s => s.selezionato);
  const sceltiDi = (d: number) => sketchDi(d).filter(s => s.selezionato);
  const richiestiDi = (d: number) => Math.min(sketchPerDomanda, sketchDi(d).length);
  const sceltaCompleta = [0, 1].every(d => sceltiDi(d).length >= Math.max(1, richiestiDi(d)));
  const hmwDi = (d: number): Hmw | undefined => attiva.hmw[d];
  const infoFase = FASI[fase - 1];

  const renderFase = () => {
    switch (fase) {
      case 1:
        return (
          <div className="space-y-6">
            <BachecaContesti
              contesti={contesti}
              scelti={sceltiValidi}
              massimo={massimoContesti}
              onCambia={ids => {
                const titoli = ids.map(id => nomeContesto(id, contesti)).filter(Boolean).join('; ');
                patch({ contesti: ids, hmw_o_tema: titoli });
                salvaCampi({ contesti: ids, sotto_ambito: titoli });
              }}
            />
            <NavigazioneFase
              fase={1}
              onIndietro={() => {}}
              onAvanti={() => avanzaA(2)}
              avantiPossibile={sceltiValidi.length >= contestiRichiesti}
              motivoBlocco={massimoContesti > 0 ? `Scegliete ${contestiRichiesti} contest${contestiRichiesti === 1 ? 'o' : 'i'}` : 'Scegliete almeno un contesto'}
              etichettaAvanti="Avanti: le domande"
            />
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <ComponiHmw
              hmw={attiva.hmw}
              opzioniContesto={opzioniContesto}
              revisione={attiva.hmw_revisione}
              inviate={attiva.hmw_inviate}
              sketchSbloccati={attiva.sketch_sbloccato}
              onSalva={async h => { patch({ hmw: h }); return salvaCampi({ hmw: h }); }}
              onInvia={async origine => {
                patch({ hmw_inviate: true });
                if (await salvaCampi({ hmw_inviate: true })) setFesta({ titolo: 'Domande inviate', sottotitolo: 'Il docente le legge in aula', origine });
              }}
            />
            <NavigazioneFase
              fase={2}
              onIndietro={() => vaiAFase(1)}
              onAvanti={() => avanzaA(3)}
              avantiPossibile={attiva.sketch_sbloccato}
              motivoBlocco={attiva.hmw_inviate ? 'In attesa che il/la docente sblocchi gli sketch' : 'Inviate le due domande al docente'}
              etichettaAvanti="Avanti: gli sketch"
            />
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-5">
              {[0, 1].map(d => {
                const lista = sketchDi(d);
                return (
                  <section key={d} className="bg-white rounded-3xl border border-stone-200 p-5 space-y-4">
                    <div className="space-y-1">
                      <span className="mz-mono" style={{ color: 'var(--accento)' }}>Domanda ({String(d + 1).padStart(2, '0')}) {lista.length} / 8</span>
                      <p className="text-lg leading-snug text-stone-900" style={{ fontFamily: 'var(--f-display)' }}>{testoHmw(hmwDi(d)) || 'Domanda non ancora scritta'}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className={`flex flex-col items-center justify-center gap-1 h-24 rounded-2xl transition cursor-pointer ${caricamentoSketch === d ? 'bg-stone-100' : 'bg-stone-900 text-white hover:bg-stone-800'}`}>
                        {caricamentoSketch === d ? <ImpulsoCaricamento etichetta="Carico..." /> : <><span className="text-2xl" aria-hidden="true">📷</span><span className="text-sm font-bold">Scatta una foto</span></>}
                        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => aggiungiSketch(e, d)} disabled={caricamentoSketch !== null} />
                      </label>
                      <label className={`flex flex-col items-center justify-center gap-1 h-24 rounded-2xl border-2 border-dashed transition cursor-pointer ${caricamentoSketch === d ? 'border-stone-300 bg-stone-50' : 'border-stone-300 hover:border-stone-600'}`}>
                        {caricamentoSketch === d ? <ImpulsoCaricamento etichetta="Carico..." /> : <><span className="text-2xl" aria-hidden="true">🖼️</span><span className="text-sm font-bold text-stone-800">Dalla galleria</span></>}
                        <input type="file" accept="image/*" multiple className="sr-only" onChange={e => aggiungiSketch(e, d)} disabled={caricamentoSketch !== null} />
                      </label>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {lista.map((s, i) => (
                        <div key={s.id} className="relative c8-arrivo" style={{ animationDelay: `${i * 40}ms` }}>
                          <RiquadroC8 src={s.url_file} alt={`Sketch ${i + 1}`} onApri={el => lightbox.apri(lista.map((x, k) => ({ src: x.url_file, titolo: `Domanda ${d + 1}: sketch ${k + 1}`, meta: testoHmw(hmwDi(d)) })), i, el)} />
                          <span className="c8-sketch-numero">{i + 1}</span>
                          <button type="button" onClick={() => rimuoviSketch(s.id)} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-white/90 text-stone-400 hover:text-red-600 text-[10px]" aria-label="Elimina sketch">✕</button>
                        </div>
                      ))}
                      {Array.from({ length: Math.max(0, 8 - lista.length) }).map((_, i) => (
                        <div key={`v${i}`} className="aspect-square rounded-xl border-2 border-dashed border-stone-200 flex items-center justify-center text-stone-300 text-sm font-bold">{lista.length + i + 1}</div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
            <NavigazioneFase
              fase={3}
              onIndietro={() => vaiAFase(2)}
              onAvanti={() => avanzaA(4)}
              avantiPossibile={sketchDi(0).length > 0 && sketchDi(1).length > 0}
              motivoBlocco="Caricate gli sketch di entrambe le domande"
              etichettaAvanti="Abbiamo finito: scegliamo i migliori"
            />
          </div>
        );

      case 4: {
        const inPrimoPiano = sketchTutti.find(s => s.id === sketchInRevisione) || sketchSelezionati[0] || sketchTutti[0] || null;
        return (
          <div className="space-y-8">
            {/* gli sketch scelti, in una pila 3D che scorre da sola */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="mz-mono" style={{ color: 'var(--ink)' }}>I vostri scelti ({due(sketchSelezionati.length)} / {due(richiestiDi(0) + richiestiDi(1))})</span>
                <span className="text-sm text-stone-500">{sketchPerDomanda === 1 ? 'Uno per domanda.' : `${sketchPerDomanda} per domanda.`}</span>
              </div>
              <Pila3D
                vuoto="Toccate ★ su uno sketch per sceglierlo: comparirà qui."
                immagini={sketchSelezionati.map(sk => ({ src: sk.url_file, titolo: `Domanda ${(sk.domanda ?? 0) + 1}: sketch ${sketchDi(sk.domanda ?? 0).indexOf(sk) + 1}` }))}
                onApri={(i, el) => lightbox.apri(sketchSelezionati.map(sk => ({ src: sk.url_file, titolo: `Domanda ${(sk.domanda ?? 0) + 1}`, meta: testoHmw(hmwDi(sk.domanda ?? 0)) })), i, el)}
              />
            </section>

            <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-6 items-start">
              <div className="space-y-5">
                {[0, 1].map(d => {
                  const scelti = sceltiDi(d).length;
                  const pieno = scelti >= richiestiDi(d) && sketchPerDomanda > 1;
                  return (
                    <section key={d} className="c8-scelta">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-base leading-snug text-stone-900 m-0" style={{ fontFamily: 'var(--f-display)' }}>
                          <span className="mz-mono mr-1" style={{ color: 'var(--accento)' }}>({due(d + 1)})</span>{testoHmw(hmwDi(d))}
                        </p>
                        <span className={`c8-contatore ${scelti >= Math.max(1, richiestiDi(d)) ? 'ok' : ''}`}>{scelti} / {Math.max(1, richiestiDi(d))}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {sketchDi(d).map((s, k) => {
                          const pos = sceltiDi(d).indexOf(s);
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => { setSketchInRevisione(s.id); scegliMigliore(s); }}
                              aria-pressed={s.selezionato}
                              aria-label={`Sketch ${k + 1}${s.selezionato ? ', scelto' : ''}`}
                              className={`c8-sketch-scelta ${s.selezionato ? 'scelto' : pieno ? 'spento' : ''} ${inPrimoPiano?.id === s.id ? 'fuoco' : ''}`}
                            >
                              <img src={s.url_file} alt="" loading="lazy" decoding="async" />
                              <span className="c8-sketch-numero">{k + 1}</span>
                              <span className="c8-sketch-stella" aria-hidden="true">{s.selezionato ? (sketchPerDomanda > 1 ? `★ ${pos + 1}` : '★') : '☆'}</span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
              {inPrimoPiano && (
                <section key={inPrimoPiano.id} className="c8-scelta lg:sticky lg:top-20 animate-fade-in">
                  <button type="button" className="c8-anteprima" onClick={e => lightbox.apri([{ src: inPrimoPiano.url_file, titolo: `Domanda ${(inPrimoPiano.domanda ?? 0) + 1}` }], 0, e.currentTarget)} aria-label="Ingrandisci">
                    <img src={inPrimoPiano.url_file} alt="Sketch in primo piano" decoding="async" />
                  </button>
                  <button type="button" onClick={() => scegliMigliore(inPrimoPiano)} className={`mz-pill ${inPrimoPiano.selezionato ? 'b' : 'o'}`}>
                    {inPrimoPiano.selezionato ? `★ Scelto per la domanda ${(inPrimoPiano.domanda ?? 0) + 1}` : `☆ Sceglilo per la domanda ${(inPrimoPiano.domanda ?? 0) + 1}`}
                  </button>
                  <TestoAutosalvato etichetta="Cosa ci vedete" valore={inPrimoPiano.interpretazione} righe={3} placeholder="Come risponde alla domanda?" onSalva={t => salvaSketch(inPrimoPiano.id, { interpretazione: t })} />
                </section>
              )}
            </div>
            <NavigazioneFase
              fase={4}
              onIndietro={() => vaiAFase(3)}
              onAvanti={() => avanzaA(5)}
              avantiPossibile={sceltaCompleta}
              motivoBlocco={sketchPerDomanda === 1 ? 'Scegliete uno sketch per ogni domanda' : `Scegliete ${sketchPerDomanda} sketch per ogni domanda`}
              etichettaAvanti="Avanti: il prompt"
            />
          </div>
        );
      }

      case 5:
        return (
          <div className="space-y-6">
            <PromptConfiguratore
              sketchSelezionati={sketchSelezionati}
              visioneDi={sa => visioneDi(attiva, sa)}
              orizzonte={attiva.scenario?.orizzonte || ''}
              domandaDi={sk => {
                const h = hmwDi(sk.domanda ?? 0);
                return h ? { domanda: testoHmw(h), contesto: nomeContesto(h.contesto, contesti) } : null;
              }}
              suggerimentiDocente={suggerimentiPrompt}
              onApriImmagine={(imm, i, el) => lightbox.apri(imm, i, el)}
              onPromptInviato={(sketchId, prompt, motore) => {
                try { localStorage.setItem(chiaveUltimoPrompt(sketchId), JSON.stringify({ prompt, motore })); } catch { /* non bloccante */ }
                setPromptInviato(true);
                if (raggiunta < 6) { patch({ fase_raggiunta: 6 }); salvaCampi({ fase_raggiunta: 6 }); }
              }}
            />
            {promptInviato && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 animate-fade-in-up">
                <p className="text-sm text-emerald-800 m-0">Avete le immagini? Caricatele.</p>
                <button type="button" onClick={() => avanzaA(6)} className="mz-pill sm">Carica le immagini →</button>
              </div>
            )}
            <NavigazioneFase fase={5} onIndietro={() => vaiAFase(4)} onAvanti={() => avanzaA(6)} avantiPossibile={sketchSelezionati.length > 0} etichettaAvanti="Ho generato: carico le immagini" />
          </div>
        );

      case 6: {
        const consegnato = attiva.stato === 'consegnato' || attiva.stato === 'revisionato';
        const conImmagini = sketchSelezionati.some(sk => sk.generazioni_crazy8.length > 0);
        return (
          <div className="space-y-6">
            {sketchSelezionati.map((sk, k) => {
              const d = sk.domanda ?? 0;
              const ultimo = leggiUltimoPrompt(sk.id);
              return (
                <RisultatoDomanda
                  key={sk.id}
                  indice={k}
                  domanda={testoHmw(hmwDi(d))}
                  sketch={sk}
                  promptIniziale={ultimo.prompt}
                  motoreIniziale={ultimo.motore}
                  motori={MOTORI}
                  onAggiungi={aggiungiGenerazione}
                  onRimuovi={rimuoviGenerazione}
                  onCaricamento={segnalaCaricamento}
                  onApri={(imm, i, el) => lightbox.apri(imm, i, el)}
                />
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-5" style={{ borderTop: '1px solid var(--ink)' }}>
              <button type="button" onClick={() => vaiAFase(5)} className="mz-pill ghost">← Prompt</button>
              <div className="flex flex-wrap items-center gap-2">
                {conImmagini && <button type="button" className="mz-pill o" onClick={() => setPresenta(true)}>Presenta ⤢</button>}
                {consegnato ? (
                  <span className="mz-chip on" style={{ cursor: 'default' }}>✓ Consegnato</span>
                ) : (
                  <button type="button" className="mz-pill b lg" disabled={!conImmagini}
                    onClick={async e => {
                      const origine = { x: e.clientX, y: e.clientY };
                      patch({ stato: 'consegnato' });
                      if (await salvaCampi({ stato: 'consegnato' })) setFesta({ titolo: 'Consegnato', sottotitolo: teamAtt.nome, origine });
                    }}>
                    Consegniamo ✓
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      }
    }
    return null;
  };

  return (
    <main className="mz" style={{ minHeight: '100vh' }}>
      {caricamentiAttivi > 0 && <SfondoCaricamento />}
      {mostraTutorial && <TutorialOverlay onChiudi={chiudiTutorial} />}
      {tendina.nodo}
      {lightbox.nodo}
      {festa && <Celebrazione origine={festa.origine} titolo={festa.titolo} sottotitolo={festa.sottotitolo} numero={null} onFine={() => setFesta(null)} />}
      {presenta && (
        <PresentazioneRisultati
          titolo={teamAtt.nome}
          onChiudi={() => setPresenta(false)}
          diapositive={sketchSelezionati.map(sk => {
            const d = sk.domanda ?? 0;
            const h = hmwDi(d);
            return { chiave: sk.id, sopra: `Domanda ${due(d + 1)}`, domanda: testoHmw(h), contesto: h ? nomeContesto(h.contesto, contesti) : '', sketch: sk.url_file, immagini: sk.generazioni_crazy8.map(g => g.url_immagine) };
          })}
        />
      )}
      {rail}
      {avvisoDb}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <div className="c8-testata">
          <div key={fase} className="mz-in" style={{ display: 'grid', gap: 12, minWidth: 0 }}>
            <h1 className="mz-display c8-titolo">
              {infoFase.titolo}
              <span className="mz-sup">({due(fase)} / {due(NUMERO_FASI)})</span>
            </h1>
            <p className="c8-sottotitolo">{infoFase.sottotitolo}</p>
            {sceltiValidi.length > 0 && fase > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {sceltiValidi.map(id => <span key={id} className="mz-chip on" style={{ cursor: 'default' }}>{nomeContesto(id, contesti)}</span>)}
              </div>
            )}
          </div>
        </div>

        <Stepper fase={fase} raggiunta={raggiunta} onVai={vaiAFase} />

        {erroreAzione && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 flex justify-between gap-3">
            {erroreAzione}
            <button type="button" onClick={() => setErroreAzione('')} aria-label="Chiudi">✕</button>
          </p>
        )}

        <div key={`contenuto-${fase}`} className="entra-sezione">{renderFase()}</div>
      </div>
    </main>
  );
}
