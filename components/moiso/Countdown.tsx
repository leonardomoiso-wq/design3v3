'use client';
import { useEffect, useRef } from 'react';
import { pad, scomponiDurata } from '@/lib/contest';

// Una cifra che, quando cambia, scivola via verso l'alto e lascia
// entrare la nuova dal basso.
function Cella({ valore, etichetta, grande }: { valore: string; etichetta: string; grande: boolean }) {
  const rif = useRef<HTMLSpanElement>(null);
  const prima = useRef(valore);
  useEffect(() => {
    if (prima.current !== valore && rif.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      rif.current.animate(
        [{ transform: 'translateY(45%)', opacity: 0, filter: 'blur(3px)' }, { transform: 'none', opacity: 1, filter: 'none' }],
        { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
    }
    prima.current = valore;
  }, [valore]);
  return (
    <div style={{ display: 'grid', gap: 4, justifyItems: 'start' }}>
      <span style={{ overflow: 'hidden', display: 'block', lineHeight: 1 }}>
        <span
          ref={rif}
          className="mz-display mz-num"
          style={{ display: 'block', fontSize: grande ? 'clamp(44px, 7vw, 96px)' : 'clamp(28px, 4vw, 40px)', lineHeight: 1 }}
        >
          {valore}
        </span>
      </span>
      <span className="mz-mono">{etichetta}</span>
    </div>
  );
}

export function Countdown({ fine, inizio, adesso, grande = true, finito = 'Votazione chiusa' }: {
  fine: string | null; inizio?: string | null; adesso: number; grande?: boolean; finito?: string;
}) {
  if (!fine) return null;
  const tFine = new Date(fine).getTime();
  const resto = tFine - adesso;
  const { g, h, m, s } = scomponiDurata(resto);
  const tInizio = inizio ? new Date(inizio).getTime() : null;
  const avanzamento = tInizio && tFine > tInizio ? Math.min(1, Math.max(0, (adesso - tInizio) / (tFine - tInizio))) : null;
  const ultimiSecondi = resto > 0 && resto < 60_000;

  if (resto <= 0) {
    return (
      <div className="mz-in" style={{ display: 'grid', gap: 10 }}>
        <span className="mz-display" style={{ fontSize: grande ? 'clamp(40px, 6vw, 80px)' : 30 }}>{finito}</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }} role="timer" aria-label={`Mancano ${g} giorni, ${h} ore, ${m} minuti`}>
      <div style={{ display: 'flex', gap: grande ? 'clamp(14px, 3vw, 34px)' : 16, alignItems: 'flex-start', flexWrap: 'wrap', color: ultimiSecondi ? 'var(--blue)' : undefined }}>
        {g > 0 && <Cella valore={pad(g)} etichetta={g === 1 ? 'giorno' : 'giorni'} grande={grande} />}
        <Cella valore={pad(h)} etichetta="ore" grande={grande} />
        <Cella valore={pad(m)} etichetta="minuti" grande={grande} />
        <Cella valore={pad(s)} etichetta="secondi" grande={grande} />
      </div>
      {avanzamento !== null && (
        <div className="mz-track" style={{ height: 4 }} aria-hidden="true">
          <div className="mz-bar" style={{ width: `${avanzamento * 100}%`, transition: 'width .3s linear' }} />
        </div>
      )}
    </div>
  );
}
