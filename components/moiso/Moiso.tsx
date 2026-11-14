'use client';
// Pezzi del Moiso design language in React: tipi Funnel, contatori a
// cifre che ruotano, tendina tra sezioni, switch segmentato con pillola
// a molla, sheet, solidi di Fröbel, ticker, immagine che segue il mouse.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { riduciMovimento } from '@/lib/contest';

// Numero che sale con le cifre che ruotano come un contachilometri.
export function Odometro({ valore, cifre = 0, className = '' }: { valore: number; cifre?: number; className?: string }) {
  const testo = String(Math.max(0, Math.round(valore))).padStart(cifre, '0');
  const [montato, setMontato] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setMontato(true)); return () => cancelAnimationFrame(t); }, []);
  return (
    <span className={`mz-odo ${className}`} aria-label={testo} role="text">
      {testo.split('').map((c, i) => {
        const n = Number(c);
        return (
          <span className="mz-odo-d" key={testo.length - i} aria-hidden="true">
            <span className="mz-odo-col" style={{ transform: `translateY(-${montato ? n : 0}em)`, transitionDelay: `${(testo.length - i) * 40}ms` }}>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => <span key={d}>{d}</span>)}
            </span>
          </span>
        );
      })}
    </span>
  );
}

// Conteggio animato condiviso con il resto della piattaforma.
export { useContaSu } from '@/lib/useContaSu';
import { useContaSu } from '@/lib/useContaSu';

export function ContaSu({ valore, className = '' }: { valore: number; className?: string }) {
  const v = useContaSu(valore);
  return <span className={`mz-num ${className}`}>{Math.round(v)}</span>;
}

// Tendina d'inchiostro: scende (560 ms), mostra il nome, cambia il
// contenuto sotto, esce verso il basso (620 ms).
export function useTendina() {
  const rif = useRef<HTMLDivElement>(null);
  const testo = useRef<HTMLSpanElement>(null);
  const occupata = useRef(false);
  const mostra = useCallback(async (nome: string, cambia: () => void, pausa = 140) => {
    const c = rif.current, t = testo.current;
    if (!c || !t || riduciMovimento()) { cambia(); return; }
    if (occupata.current) { cambia(); return; }
    occupata.current = true;
    t.textContent = nome;
    const E = 'cubic-bezier(.7,0,.25,1)';
    // Discesa più breve; il testo compare insieme alla tendina.
    const discesa = c.animate([{ transform: 'translateY(-101%)' }, { transform: 'none' }], { duration: 420, easing: E, fill: 'forwards' });
    t.animate([{ opacity: 0, transform: 'translateY(28px)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 160, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
    await discesa.finished;
    // Il cambio di contenuto avviene a tendina chiusa; l'uscita parte solo
    // dopo che il browser ha disegnato la nuova schermata (due frame), così
    // il lavoro di React non "inceppa" l'animazione di uscita.
    cambia();
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    await new Promise(r => setTimeout(r, pausa));
    await c.animate([{ transform: 'none' }, { transform: 'translateY(101%)' }], { duration: 480, easing: E, fill: 'forwards' }).finished;
    c.getAnimations().forEach(a => a.cancel());
    t.getAnimations().forEach(a => a.cancel());
    occupata.current = false;
  }, []);
  const nodo = (
    <div ref={rif} className="mz-curtain" aria-hidden="true">
      <span ref={testo} />
    </div>
  );
  return { nodo, mostra };
}

export type OpzioneSeg<T extends string> = { id: T; label: React.ReactNode };

export function Segmentato<T extends string>({ opzioni, valore, onCambia, etichetta, className = '' }: {
  opzioni: OpzioneSeg<T>[]; valore: T; onCambia: (v: T) => void; etichetta: string; className?: string;
}) {
  const cont = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const sposta = useCallback(() => {
    const b = cont.current?.querySelector<HTMLButtonElement>('button[aria-current="true"]');
    const p = pill.current;
    if (!b || !p) return;
    p.style.width = b.offsetWidth + 'px';
    p.style.height = b.offsetHeight + 'px';
    p.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop}px)`;
  }, []);
  useLayoutEffect(sposta, [valore, opzioni.length, sposta]);
  useEffect(() => {
    const r = new ResizeObserver(sposta);
    if (cont.current) r.observe(cont.current);
    document.fonts?.ready.then(sposta);
    return () => r.disconnect();
  }, [sposta]);
  return (
    <div ref={cont} className={`mz-seg ${className}`} role="group" aria-label={etichetta}>
      <span ref={pill} className="mz-seg-pill" aria-hidden="true" />
      {opzioni.map(o => (
        <button key={o.id} type="button" aria-current={o.id === valore ? 'true' : 'false'} onClick={() => onCambia(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Dialog laterale (desktop) o dal basso (telefono). Escape chiude, il
// fuoco entra e torna al punto di partenza, trascinare giù chiude.
export function Sheet({ aperto, onChiudi, categoria, children, azioni }: {
  aperto: boolean; onChiudi: () => void; categoria: React.ReactNode; children: React.ReactNode; azioni?: React.ReactNode;
}) {
  const pannello = useRef<HTMLDivElement>(null);
  const origine = useRef<HTMLElement | null>(null);
  const trascina = useRef<{ y0: number; dy: number } | null>(null);
  const chiudi = useRef(onChiudi);
  chiudi.current = onChiudi;

  useEffect(() => {
    if (!aperto) return;
    origine.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => pannello.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') chiudi.current(); };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
      origine.current?.focus?.();
    };
  }, [aperto]);

  if (!aperto) return null;

  const inizio = (e: React.PointerEvent) => {
    if (window.innerWidth > 760) return;
    trascina.current = { y0: e.clientY, dy: 0 };
    const muovi = (ev: PointerEvent) => {
      if (!trascina.current || !pannello.current) return;
      trascina.current.dy = Math.max(0, ev.clientY - trascina.current.y0);
      pannello.current.style.transform = `translateY(${trascina.current.dy}px)`;
    };
    const fine = () => {
      window.removeEventListener('pointermove', muovi);
      window.removeEventListener('pointerup', fine);
      const dy = trascina.current?.dy || 0;
      trascina.current = null;
      if (pannello.current) {
        pannello.current.style.transition = 'transform .4s cubic-bezier(.7,0,.25,1)';
        pannello.current.style.transform = '';
        setTimeout(() => { if (pannello.current) pannello.current.style.transition = ''; }, 400);
      }
      if (dy > 120) onChiudi();
    };
    window.addEventListener('pointermove', muovi);
    window.addEventListener('pointerup', fine);
  };

  return (
    <>
      <div className="mz-scrim" onClick={onChiudi} aria-hidden="true" />
      <div ref={pannello} className="mz-sheet" role="dialog" aria-modal="true" tabIndex={-1} style={{ outline: 'none' }}>
        <div className="mz-sheet-bar" onPointerDown={inizio}>
          <span className="mz-handle" aria-hidden="true" />
          <span className="mz-mono">{categoria}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {azioni}
            <button type="button" className="mz-pill sm o" onClick={onChiudi}>Chiudi ✕</button>
          </div>
        </div>
        <div className="mz-sheet-body">{children}</div>
      </div>
    </>
  );
}

export function Solidi({ cadono = false, piccoli = false, className = '', colore }: { cadono?: boolean; piccoli?: boolean; className?: string; colore?: string }) {
  return (
    <div className={`mz-solids ${cadono ? 'drop' : ''} ${piccoli ? 'sm' : ''} ${colore ? 'inv' : ''} ${className}`} style={colore ? { color: colore } : undefined} aria-hidden="true">
      <i className="mz-solid s1" />
      <i className="mz-solid s2" />
      <i className="mz-solid s3" />
    </div>
  );
}

export function Ticker({ voci }: { voci: string[] }) {
  if (voci.length === 0) return null;
  const giro = [...voci, ...voci, ...voci].slice(0, Math.max(9, voci.length * 2));
  const tutte = [...giro, ...giro];
  return (
    <div className="mz-ticker" aria-hidden="true">
      <div className="mz-ticker-track">
        {tutte.map((v, i) => (
          <span key={i}>{v} <i>✳</i></span>
        ))}
      </div>
    </div>
  );
}

// Immagine dentro una cornice ferma: si ingrandisce e si sposta in
// direzione opposta al puntatore.
export function Cornice({ src, alt, className = '', style, etichettaVuota = 'Immagine in arrivo' }: {
  src?: string; alt: string; className?: string; style?: React.CSSProperties; etichettaVuota?: string;
}) {
  const img = useRef<HTMLImageElement>(null);
  const muovi = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || riduciMovimento() || !img.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * -4;
    const y = ((e.clientY - r.top) / r.height - 0.5) * -4;
    img.current.style.transform = `scale(1.08) translate(${x}%, ${y}%)`;
  };
  const esci = () => { if (img.current) img.current.style.transform = ''; };
  return (
    <div className={`mz-frame ${className}`} style={style} onPointerMove={muovi} onPointerLeave={esci}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={img} src={src} alt={alt} loading="lazy" draggable={false} />
      ) : (
        <div className="mz-placeholder"><span className="mz-mono" style={{ color: 'var(--accento)' }}>{etichettaVuota}</span></div>
      )}
    </div>
  );
}
