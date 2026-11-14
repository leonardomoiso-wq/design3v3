'use client';
// Momento del voto: una pagina blu si apre a cerchio dal pulsante
// premuto, i solidi cadono e oscillano, la frase sale lettera per
// lettera, il contatore mostra il numero del voto; poi tutto si richiude.
import { useEffect, useRef } from 'react';
import { riduciMovimento, pad } from '@/lib/contest';
import { Solidi } from './Moiso';

export function Celebrazione({ origine, titolo, sottotitolo, numero, onFine, durata = 2900 }: {
  origine: { x: number; y: number } | null;
  titolo: string;
  sottotitolo: string;
  numero: number | null;
  onFine: () => void;
  durata?: number;
}) {
  const rif = useRef<HTMLDivElement>(null);
  const contatore = useRef<HTMLSpanElement>(null);
  const fine = useRef(onFine);
  fine.current = onFine;

  useEffect(() => {
    const n = rif.current;
    if (!n) return;
    const ridotto = riduciMovimento();
    const x = origine ? (origine.x / window.innerWidth) * 100 : 50;
    const y = origine ? (origine.y / window.innerHeight) * 100 : 60;
    document.body.style.overflow = 'hidden';
    if (!ridotto) {
      n.animate([{ clipPath: `circle(0% at ${x}% ${y}%)` }, { clipPath: `circle(150% at ${x}% ${y}%)` }], { duration: 750, easing: 'cubic-bezier(.7,0,.25,1)', fill: 'both' });
      n.querySelectorAll<HTMLElement>('.mz-cel-l').forEach((s, i) =>
        s.animate([{ transform: 'translateY(110%)' }, { transform: 'none' }], { duration: 900, delay: 380 + i * 32, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }),
      );
    }
    // Contatore 000 → numero del voto
    let raf = 0;
    if (numero !== null && contatore.current) {
      const t0 = performance.now() + 500;
      const f = (now: number) => {
        const k = Math.max(0, Math.min(1, (now - t0) / 1300));
        if (contatore.current) contatore.current.textContent = pad(Math.round(numero * (1 - Math.pow(1 - k, 3))), 3);
        if (k < 1) raf = requestAnimationFrame(f);
      };
      raf = requestAnimationFrame(f);
    }
    const chiudi = setTimeout(async () => {
      if (!ridotto && rif.current) {
        await rif.current.animate([{ clipPath: `circle(150% at 50% 0%)`, opacity: 1 }, { clipPath: `circle(0% at 50% 0%)`, opacity: 1 }], { duration: 650, easing: 'cubic-bezier(.7,0,.25,1)', fill: 'forwards' }).finished;
      }
      document.body.style.overflow = '';
      fine.current();
    }, ridotto ? 1600 : durata);
    return () => { clearTimeout(chiudi); cancelAnimationFrame(raf); document.body.style.overflow = ''; };
  }, [origine, numero, durata]);

  return (
    <div
      ref={rif}
      role="status"
      aria-live="assertive"
      style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'var(--scena)', color: 'var(--scena-testo)', display: 'grid', gridTemplateRows: '1fr auto auto', gap: 18, padding: '28px max(20px, env(safe-area-inset-left))' }}
    >
      <div style={{ alignSelf: 'center', color: 'var(--scena-testo)' }}>
        <Solidi cadono colore="var(--scena-testo)" />
      </div>
      <div className="mz-display" style={{ fontSize: 'clamp(54px, 11vw, 168px)', lineHeight: .9, display: 'flex', flexWrap: 'wrap', overflow: 'hidden', columnGap: '.25em' }}>
        {titolo.split(' ').map((parola, i) => (
          <span key={i} style={{ overflow: 'hidden', display: 'inline-flex' }}>
            {parola.split('').map((c, j) => <span key={j} className="mz-cel-l" style={{ display: 'inline-block' }}>{c}</span>)}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 18, flexWrap: 'wrap', borderTop: '1px solid var(--scena-filo)', paddingTop: 14 }}>
        <span style={{ fontSize: 'clamp(15px, 1.6vw, 19px)', maxWidth: 560 }} className="mz-break">{sottotitolo}</span>
        {numero !== null && (
          <span style={{ display: 'grid', justifyItems: 'end' }}>
            <span className="mz-mono" style={{ color: 'var(--scena-tenue)' }}>Voto anonimo n.</span>
            <span ref={contatore} className="mz-num" style={{ fontFamily: 'var(--f-display)', fontSize: 'clamp(30px, 4vw, 56px)', lineHeight: 1 }}>000</span>
          </span>
        )}
      </div>
    </div>
  );
}
