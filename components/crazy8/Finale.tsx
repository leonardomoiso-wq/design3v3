'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Cornice, Solidi } from '@/components/moiso/Moiso';
import { comprimiImmagine } from '@/lib/immagine';
import { ImpulsoCaricamento } from '@/lib/caricamento';
import type { Generazione, Sketch } from './shared';

// Ultima parte di Crazy 8: per ogni domanda un "prima → dopo" (lo sketch
// scelto e le immagini generate), il caricamento in un gesto solo e una
// presentazione a schermo intero che scorre da sola, usata anche dal
// docente per proiettare i risultati in aula.

const riduci = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export type Diapositiva = {
  chiave: string;
  sopra: string;        // team, o "Domanda 01"
  domanda: string;      // testo HMW
  contesto: string;
  sketch: string | null;
  immagini: string[];
};

export function PresentazioneRisultati({ diapositive, titolo, onChiudi }: { diapositive: Diapositiva[]; titolo: string; onChiudi: () => void }) {
  const [i, setI] = useState(0);
  const [pausa, setPausa] = useState(false);
  const DURATA = 9000;
  const trascorso = useRef(0);
  const ultimo = useRef(0);
  const contenitore = useRef<HTMLDivElement>(null);
  const barra = useRef<HTMLDivElement>(null);

  const vai = useCallback((n: number) => {
    setI(((n % diapositive.length) + diapositive.length) % diapositive.length);
    trascorso.current = 0;
  }, [diapositive.length]);

  // avanzamento automatico (una domanda ogni 9 s) e barra di progresso,
  // in un solo ciclo; in pausa il tempo si ferma
  useEffect(() => {
    if (diapositive.length < 2 || riduci()) return;
    let raf = 0;
    ultimo.current = performance.now();
    const passo = (t: number) => {
      if (!pausa) trascorso.current += t - ultimo.current;
      ultimo.current = t;
      const k = Math.min(1, trascorso.current / DURATA);
      if (barra.current) barra.current.style.transform = `scaleX(${k})`;
      if (k >= 1) { vai(i + 1); return; }
      raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [i, pausa, vai, diapositive.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChiudi();
      if (e.key === 'ArrowRight') vai(i + 1);
      if (e.key === 'ArrowLeft') vai(i - 1);
      if (e.key === ' ') { e.preventDefault(); setPausa(p => !p); }
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [i, vai, onChiudi]);

  const schermoIntero = () => {
    const el = contenitore.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => {});
  };

  const d = diapositive[i];
  return (
    <div ref={contenitore} className="mz fixed inset-0 z-[70] flex flex-col" data-theme="dark" style={{ background: 'var(--bg)', color: 'var(--ink)' }} role="dialog" aria-modal="true" aria-label={titolo}>
      <header className="mz-rail" style={{ position: 'relative' }}>
        <span className="mz-mono" style={{ color: 'var(--ink)' }}>{titolo} ({String(i + 1).padStart(2, '0')} / {String(diapositive.length).padStart(2, '0')})</span>
        <div className="flex items-center gap-2">
          <button type="button" className="mz-pill sm ghost" onClick={() => vai(i - 1)} aria-label="Precedente">←</button>
          <button type="button" className="mz-pill sm ghost" onClick={() => setPausa(p => !p)} aria-label={pausa ? 'Riprendi' : 'Pausa'}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">{pausa ? <path d="M2 1l9 5-9 5z" fill="currentColor" /> : <path d="M2 1h3v10H2zM7 1h3v10H7z" fill="currentColor" />}</svg>
          </button>
          <button type="button" className="mz-pill sm ghost" onClick={() => vai(i + 1)} aria-label="Successiva">→</button>
          <button type="button" className="mz-pill sm ghost max-sm:hidden" onClick={schermoIntero}>Schermo intero ⤢</button>
          <button type="button" className="mz-pill sm ghost" onClick={onChiudi} aria-label="Chiudi">✕</button>
        </div>
      </header>
      <div style={{ height: 3, background: 'var(--line)' }}>
        <div ref={barra} style={{ height: '100%', background: 'var(--accento-vivo)', transformOrigin: '0 50%', transform: 'scaleX(0)' }} />
      </div>

      {!d ? (
        <div className="flex-1 grid place-items-center"><Solidi cadono colore="#fafaf9" /></div>
      ) : (
        <div key={d.chiave} className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-[clamp(20px,4vw,64px)] items-center px-[max(20px,4vw)] py-8 overflow-y-auto">
          <div className="space-y-5">
            <span className="mz-mono c8-entra-sfocato" style={{ color: 'var(--accento)' }}>{d.sopra}{d.contesto ? ` — ${d.contesto}` : ''}</span>
            <p className="mz-display c8-entra-sfocato" style={{ fontSize: 'clamp(34px, 4.6vw, 76px)', margin: 0, animationDelay: '120ms' }}>{d.domanda}</p>
          </div>
          <div className="c8-palco">
            {d.sketch && (
              <figure className="c8-palco-sketch mz-float" style={{ animationDelay: '-2s' }}>
                <Cornice src={d.sketch} alt="Sketch" style={{ aspectRatio: '1 / 1' }} />
                <figcaption className="mz-mono">Sketch</figcaption>
              </figure>
            )}
            {d.immagini.slice(0, 3).map((src, k) => (
              <figure key={src.slice(-40) + k} className={`c8-palco-img c8-palco-img-${k} mz-float`} style={{ animationDelay: `${-k * 2.3}s` }}>
                <Cornice src={src} alt={`Immagine generata ${k + 1}`} style={{ aspectRatio: '1 / 1' }} />
              </figure>
            ))}
            {d.immagini.length === 0 && <p className="mz-mono" style={{ alignSelf: 'center' }}>Nessuna immagine generata</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// Caricamento delle immagini generate per uno sketch: si scelgono i file
// e partono subito, con il prompt e il modello inviati dal configuratore.
export function RisultatoDomanda({ indice, domanda, sketch, promptIniziale, motoreIniziale, motori, onAggiungi, onRimuovi, onCaricamento }: {
  indice: number;
  domanda: string;
  sketch: Sketch;
  promptIniziale: string;
  motoreIniziale: string;
  motori: { id: string; nome: string }[];
  onAggiungi: (sketchId: string, prompt: string, url: string, motore: string) => Promise<boolean>;
  onRimuovi: (genId: string) => void;
  onCaricamento: (attivo: boolean) => void;
}) {
  const [prompt, setPrompt] = useState(promptIniziale);
  const [motore, setMotore] = useState(motoreIniziale);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState('');
  const [inPrimoPiano, setInPrimoPiano] = useState(0);
  useEffect(() => { setPrompt(p => p || promptIniziale); setMotore(m => m || motoreIniziale); }, [promptIniziale, motoreIniziale]);

  const generate: Generazione[] = sketch.generazioni_crazy8;
  const copertina = generate[Math.min(inPrimoPiano, generate.length - 1)] || null;

  const carica = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const lista = Array.from(e.target.files || []);
    e.target.value = '';
    if (lista.length === 0) return;
    if (!prompt.trim()) { setErrore('Incollate il prompt usato, poi scegliete le immagini.'); return; }
    setErrore('');
    setInCorso(true);
    onCaricamento(true);
    try {
      for (const f of lista) {
        const url = await comprimiImmagine(f);
        if (!(await onAggiungi(sketch.id, prompt, url, motore))) { setErrore('Un\'immagine non è stata salvata. Riprovate.'); break; }
      }
      setInPrimoPiano(generate.length);
    } finally {
      setInCorso(false);
      onCaricamento(false);
    }
  };

  return (
    <section className="c8-risultato mz-in" style={{ animationDelay: `${indice * 90}ms` }}>
      <p className="c8-risultato-domanda"><span className="mz-mono" style={{ color: 'var(--accento)' }}>({String(indice + 1).padStart(2, '0')})</span> {domanda}</p>

      <div className="c8-prima-dopo">
        <figure>
          <Cornice src={sketch.url_file} alt="Sketch scelto" style={{ aspectRatio: '1 / 1' }} />
          <figcaption className="mz-mono">Prima</figcaption>
        </figure>
        <span className="c8-freccia" aria-hidden="true">→</span>
        <figure>
          {copertina ? (
            <Cornice src={copertina.url_immagine} alt="Immagine generata" style={{ aspectRatio: '1 / 1' }} />
          ) : (
            <label className="c8-carica" aria-busy={inCorso}>
              {inCorso ? <ImpulsoCaricamento etichetta="Carico…" /> : <><span className="text-3xl" aria-hidden="true">＋</span><span>Aggiungete le immagini generate</span></>}
              <input type="file" accept="image/*" multiple className="sr-only" onChange={carica} disabled={inCorso} />
            </label>
          )}
          <figcaption className="mz-mono">Dopo{copertina?.motore ? ` — ${copertina.motore}` : ''}</figcaption>
        </figure>
      </div>

      {generate.length > 0 && (
        <div className="flex gap-2 items-center flex-wrap">
          {generate.map((g, k) => (
            <div key={g.id} className="relative">
              <button type="button" onClick={() => setInPrimoPiano(k)} className={`block w-16 h-16 rounded-xl overflow-hidden ${k === inPrimoPiano ? 'ring-2 ring-stone-900' : 'opacity-70 hover:opacity-100'}`} aria-label={`Mostra l'immagine ${k + 1}`}>
                <img src={g.url_immagine} alt="" className="w-full h-full object-cover" loading="lazy" />
              </button>
              <button type="button" onClick={() => onRimuovi(g.id)} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-stone-900 text-white text-[10px]" aria-label="Elimina immagine">✕</button>
            </div>
          ))}
          <label className="w-16 h-16 rounded-xl border-2 border-dashed border-stone-300 hover:border-stone-700 grid place-items-center cursor-pointer text-xl text-stone-400" aria-label="Aggiungi altre immagini">
            {inCorso ? '…' : '＋'}
            <input type="file" accept="image/*" multiple className="sr-only" onChange={carica} disabled={inCorso} />
          </label>
        </div>
      )}

      <details className="c8-dettagli" open={!promptIniziale}>
        <summary className="mz-mono">Prompt e modello</summary>
        <div className="grid gap-2 pt-2">
          <textarea rows={3} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Il prompt usato" className="mz-input" style={{ minHeight: 0, fontSize: 13 }} />
          <div className="flex flex-wrap gap-1.5">
            {[...motori, { id: 'Altro', nome: 'Altro' }].map(m => (
              <button key={m.id} type="button" className={`mz-chip ${motore === m.id ? 'on' : ''}`} onClick={() => setMotore(m.id)}>{m.nome}</button>
            ))}
          </div>
        </div>
      </details>
      {errore && <p role="alert" className="text-sm text-red-700 m-0">{errore}</p>}
    </section>
  );
}

export { riduci as riduciMovimentoC8 };
