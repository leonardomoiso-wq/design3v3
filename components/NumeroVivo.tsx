'use client';
import { useEffect, useRef } from 'react';
import { useContaSu } from '@/lib/useContaSu';

// Conteggio "vivo": conta fino al valore e, quando aumenta, fa un breve
// scatto a molla. Da usare dove i numeri cambiano in tempo reale.
export default function NumeroVivo({ valore, className = '' }: { valore: number; className?: string }) {
  const mostrato = useContaSu(valore);
  const rif = useRef<HTMLSpanElement>(null);
  const prima = useRef(valore);
  useEffect(() => {
    if (valore > prima.current && rif.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      rif.current.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 600, easing: 'cubic-bezier(0.2, 1.3, 0.35, 1)' });
    }
    prima.current = valore;
  }, [valore]);
  return <span ref={rif} className={`inline-block tabular-nums ${className}`}>{Math.round(mostrato)}</span>;
}
