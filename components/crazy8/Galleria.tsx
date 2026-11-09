'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Visualizzazione delle immagini di Crazy 8 nello stile del Moiso design
// language (adattato alla piattaforma: ambra al posto del blu):
// - LightboxC8: l'immagine si ingrandisce dalla miniatura (FLIP), frecce
//   ai bordi, contatore 03 / 51, Esc, frecce e swipe.
// - StrisceC8: ogni consegna è una riga di immagini preceduta dalla sua
//   etichetta; le righe scorrono lente e seguono il puntatore, quella
//   sotto il mouse si allarga.
// - Pila3D: copertine in prospettiva che arretrano verso destra, scorrono
//   da sole (una ogni ~7 s), galleggiano e seguono il puntatore.

const riduci = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const due = (n: number) => String(n).padStart(2, '0');

export type ImmagineC8 = { src: string; titolo: string; meta?: string; tipo?: 'sketch' | 'scelto' | 'generata'; mini?: string };

// ---------------------------------------------------------------- Lightbox
export function LightboxC8({ immagini, indice, origine, onCambia, onChiudi }: {
  immagini: ImmagineC8[];
  indice: number;
  origine?: DOMRect | null;
  onCambia: (i: number) => void;
  onChiudi: () => void;
}) {
  const img = useRef<HTMLImageElement>(null);
  const tocco = useRef<number | null>(null);
  const primaApertura = useRef(true);
  const corrente = immagini[indice];

  const vai = useCallback((n: number) => onCambia((n + immagini.length) % immagini.length), [immagini.length, onCambia]);

  // apertura: zoom dalla miniatura alla dimensione adattata
  useLayoutEffect(() => {
    const el = img.current;
    if (!el || !primaApertura.current) return;
    primaApertura.current = false;
    if (!origine || riduci()) return;
    const anima = () => {
      const fine = el.getBoundingClientRect();
      if (!fine.width) return;
      const dx = origine.left + origine.width / 2 - (fine.left + fine.width / 2);
      const dy = origine.top + origine.height / 2 - (fine.top + fine.height / 2);
      const s = Math.max(origine.width / fine.width, origine.height / fine.height);
      el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})`, borderRadius: '16px' }, { transform: 'none', borderRadius: '6px' }], { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)' });
    };
    if (el.complete) anima(); else el.onload = anima;
  }, [origine]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChiudi();
      if (e.key === 'ArrowRight') vai(indice + 1);
      if (e.key === 'ArrowLeft') vai(indice - 1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [indice, vai, onChiudi]);

  if (!corrente) return null;
  return (
    <div
      className="mz c8-lightbox"
      role="dialog" aria-modal="true" aria-label="Immagine a grandezza intera"
      onClick={onChiudi}
      onTouchStart={e => { tocco.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (tocco.current === null) return;
        const dx = e.changedTouches[0].clientX - tocco.current;
        tocco.current = null;
        if (Math.abs(dx) > 50) vai(indice + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="c8-lightbox-barra" onClick={e => e.stopPropagation()}>
        <span className="mz-mono" style={{ color: '#d6d3d1' }}>{due(indice + 1)} / {due(immagini.length)}</span>
        <div className="flex gap-2 items-center">
          <button type="button" className="mz-pill sm ghost" style={{ color: '#d6d3d1' }} onClick={() => apriInNuovaScheda(corrente.src, corrente.titolo)}>Apri in una nuova scheda ↗</button>
          <button type="button" className="mz-pill sm ghost" style={{ color: '#d6d3d1' }} onClick={onChiudi}>Chiudi ✕</button>
        </div>
      </div>
      <figure className="c8-lightbox-figura" onClick={e => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={img} key={corrente.src.slice(-64) + indice} src={corrente.src} alt={corrente.titolo} className={primaApertura.current ? '' : 'c8-lightbox-cambio'} />
        <figcaption>
          <span className="c8-lightbox-titolo">{corrente.titolo}</span>
          {corrente.meta && <span className="mz-mono" style={{ color: '#a8a29e', textTransform: 'none' }}>{corrente.meta}</span>}
        </figcaption>
      </figure>
      {immagini.length > 1 && (
        <>
          <button type="button" className="c8-lightbox-freccia sx" onClick={e => { e.stopPropagation(); vai(indice - 1); }}>← Precedente</button>
          <button type="button" className="c8-lightbox-freccia dx" onClick={e => { e.stopPropagation(); vai(indice + 1); }}>Successiva →</button>
        </>
      )}
    </div>
  );
}

// Stato del lightbox, comodo da usare ovunque
// Apre l'immagine da sola in una scheda nuova (anche le foto salvate come
// data URL, che il browser non apre direttamente in una scheda).
export function apriInNuovaScheda(src: string, titolo = 'Immagine') {
  const w = window.open('', '_blank');
  if (!w) { window.location.assign(src); return; }
  const testo = titolo.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string));
  w.document.write(`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${testo}</title>`
    + '<style>html,body{margin:0;height:100%;background:#0c0a09}body{display:grid;place-items:center}img{max-width:100vw;max-height:100vh;object-fit:contain}</style>'
    + `</head><body><img alt="${testo}"></body></html>`);
  w.document.close();
  const img = w.document.querySelector('img');
  if (img) img.src = src;
}

export function useLightboxC8() {
  const [stato, setStato] = useState<{ immagini: ImmagineC8[]; indice: number; origine: DOMRect | null } | null>(null);
  const apri = (immagini: ImmagineC8[], indice: number, el?: Element | null) =>
    setStato({ immagini, indice, origine: el ? el.getBoundingClientRect() : null });
  const nodo = stato ? (
    <LightboxC8
      immagini={stato.immagini}
      indice={stato.indice}
      origine={stato.origine}
      onCambia={i => setStato(s => (s ? { ...s, indice: i } : s))}
      onChiudi={() => setStato(null)}
    />
  ) : null;
  return { apri, nodo };
}

// ----------------------------------------------------------------- Strisce
export type RigaC8 = { chiave: string; titolo: string; sotto?: string; immagini: ImmagineC8[] };

export function StrisceC8({ righe, onApri }: { righe: RigaC8[]; onApri: (riga: RigaC8, indice: number, el: Element) => void }) {
  const tracce = useRef<(HTMLDivElement | null)[]>([]);
  const [aperta, setAperta] = useState<string | null>(null);
  const puntatore = useRef(0.5);

  // un solo ciclo: deriva lenta e perpetua, ogni riga sfasata, e un
  // leggero spostamento che segue il puntatore (solo con il mouse)
  useEffect(() => {
    if (riduci()) return;
    let raf = 0;
    const offset = righe.map((_, i) => (i % 2 ? 0.35 : 0.1));
    const passo = (t: number) => {
      tracce.current.forEach((el, i) => {
        if (!el) return;
        const max = Math.max(0, el.scrollWidth - el.clientWidth);
        if (max <= 0) return;
        const deriva = (Math.sin(t / 9000 + i * 1.3) + 1) / 2;
        const obiettivo = max * (0.7 * deriva + 0.3 * (puntatore.current + offset[i]) / 1.35);
        el.scrollLeft += (obiettivo - el.scrollLeft) * 0.035;
      });
      raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [righe]);

  return (
    <div className="c8-strisce" onPointerMove={e => { if (e.pointerType === 'mouse') puntatore.current = e.clientX / window.innerWidth; }}>
      {righe.map((r, i) => (
        <div
          key={r.chiave}
          className={`c8-striscia mz-in ${aperta === r.chiave ? 'aperta' : aperta ? 'spenta' : ''}`}
          style={{ animationDelay: `${Math.min(i, 10) * 60}ms` }}
          onPointerEnter={e => { if (e.pointerType === 'mouse') setAperta(r.chiave); }}
          onPointerLeave={e => { if (e.pointerType === 'mouse') setAperta(null); }}
        >
          <div className="c8-striscia-etichetta">
            <span className="mz-mono">({due(i + 1)})</span>
            <span className="c8-striscia-titolo">{r.titolo}</span>
            {r.sotto && <span className="c8-striscia-sotto">{r.sotto}</span>}
            <span className="mz-mono">{r.immagini.length} immagini</span>
          </div>
          <div className="c8-striscia-traccia" ref={el => { tracce.current[i] = el; }}>
            {r.immagini.length === 0 && <span className="mz-mono" style={{ alignSelf: 'center' }}>Nessuna immagine ancora</span>}
            {r.immagini.map((im, k) => (
              <button key={k} type="button" className={`c8-striscia-img tipo-${im.tipo || 'generata'}`} onClick={e => onApri(r, k, e.currentTarget)} aria-label={`${r.titolo}: ${im.titolo}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.mini || im.src} alt="" loading="lazy" draggable={false} />
                <span className="c8-striscia-tag">{im.tipo === 'generata' ? 'AI' : im.tipo === 'scelto' ? '★ Sketch' : 'Sketch'}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Pila 3D
export function Pila3D({ immagini, onApri, vuoto }: { immagini: ImmagineC8[]; onApri?: (indice: number, el: Element) => void; vuoto?: string }) {
  const scena = useRef<HTMLDivElement>(null);
  const carte = useRef<(HTMLButtonElement | null)[]>([]);
  const fuoco = useRef(0);       // posizione continua (scorre)
  const obiettivo = useRef(0);   // posizione verso cui si scivola
  const inclina = useRef({ x: 0, y: 0 });
  const [attiva, setAttiva] = useState(0);
  const n = immagini.length;

  useEffect(() => { obiettivo.current = Math.min(obiettivo.current, Math.max(0, n - 1)); }, [n]);

  useEffect(() => {
    if (n === 0) return;
    const ridotto = riduci();
    let raf = 0;
    let ultimoCambio = performance.now();
    const passo = (t: number) => {
      if (!ridotto && n > 1 && t - ultimoCambio > 7000) {
        obiettivo.current = (Math.round(obiettivo.current) + 1) % n;
        ultimoCambio = t;
      }
      fuoco.current += (obiettivo.current - fuoco.current) * (ridotto ? 1 : 0.045);
      const W = scena.current?.clientWidth || 600;
      const H = scena.current?.clientHeight || 300;
      const C = Math.min(W * 0.46, 380, H * 0.82);
      carte.current.forEach((el, i) => {
        if (!el) return;
        let d = i - fuoco.current;
        if (d < -0.6) d += n; // chi è passato torna in fondo alla pila
        const galleggia = ridotto ? 0 : Math.sin(t / 1000 * 0.45 + i * 1.7) * 6;
        const x = d * C * 0.34;
        const z = -d * C * 0.6;
        const ry = -14 + inclina.current.x * 6;
        const rx = inclina.current.y * -4;
        el.style.transform = `translate3d(${x}px, ${galleggia}px, ${z}px) rotateY(${ry}deg) rotateX(${rx}deg)`;
        el.style.opacity = d > n - 0.5 || d > 4.5 ? '0' : String(Math.max(0.15, 1 - d * 0.18));
        el.style.zIndex = String(100 - Math.round(d * 10));
        el.style.width = `${C}px`;
        el.style.marginTop = `${-C / 2}px`;
      });
      const nuova = ((Math.round(fuoco.current) % n) + n) % n;
      setAttiva(a => (a === nuova ? a : nuova));
      raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [n]);

  if (n === 0) return vuoto ? <p className="c8-pila-vuota">{vuoto}</p> : null;
  const corrente = immagini[attiva];
  return (
    <div className="c8-pila">
      <div
        ref={scena}
        className="c8-pila-scena"
        onPointerMove={e => {
          const r = e.currentTarget.getBoundingClientRect();
          inclina.current = { x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 };
        }}
        onPointerLeave={() => { inclina.current = { x: 0, y: 0 }; }}
      >
        {immagini.map((im, i) => (
          <button
            key={im.src.slice(-48) + i}
            ref={el => { carte.current[i] = el; }}
            type="button"
            className="c8-pila-carta"
            onClick={e => {
              if (i !== attiva) { obiettivo.current = i; return; }
              onApri?.(i, e.currentTarget);
            }}
            aria-label={im.titolo}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={im.src} alt="" draggable={false} />
          </button>
        ))}
      </div>
      <div className="c8-pila-controlli">
        <button type="button" className="mz-pill sm ghost" onClick={() => { obiettivo.current = (Math.round(obiettivo.current) - 1 + n) % n; }} aria-label="Precedente">←</button>
        <span className="mz-mono" style={{ color: 'var(--ink)' }}>{due(attiva + 1)} / {due(n)}</span>
        <button type="button" className="mz-pill sm ghost" onClick={() => { obiettivo.current = (Math.round(obiettivo.current) + 1) % n; }} aria-label="Successiva">→</button>
        <span className="c8-pila-titolo">{corrente?.titolo}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Riquadro
// Immagine intera (contain) dentro una cornice ferma: al passaggio si
// ingrandisce e si sposta opposta al puntatore; un clic la apre in grande.
export function RiquadroC8({ src, alt, onApri, etichetta, accento, className = '', rapporto = '1 / 1' }: {
  src: string; alt: string; onApri?: (el: Element) => void; etichetta?: string; accento?: boolean; className?: string; rapporto?: string;
}) {
  const img = useRef<HTMLImageElement>(null);
  const muovi = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse' || riduci() || !img.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * -5;
    const y = ((e.clientY - r.top) / r.height - 0.5) * -5;
    img.current.style.transform = `scale(1.08) translate(${x}%, ${y}%)`;
  };
  const esci = () => { if (img.current) img.current.style.transform = ''; };
  return (
    <button
      type="button"
      className={`c8-riquadro ${accento ? 'accento' : ''} ${className}`}
      style={{ aspectRatio: rapporto }}
      onPointerMove={muovi}
      onPointerLeave={esci}
      onClick={e => onApri?.(e.currentTarget)}
      aria-label={`Ingrandisci: ${alt}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={img} src={src} alt={alt} loading="lazy" decoding="async" draggable={false} />
      {etichetta && <span className={`c8-riquadro-tag ${accento ? 'ai' : ''}`}>{etichetta}</span>}
    </button>
  );
}
