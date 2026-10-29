'use client';
import { useEffect, useRef, useState } from 'react';

// Un numero che sale (o scende) fino al nuovo valore in ~1 s, con
// rallentamento finale: usato per i conteggi che cambiano in diretta
// (voti, partecipanti), così il cambiamento si vede invece di "saltare".
export function useContaSu(valore: number, durata = 1100) {
  const [mostrato, setMostrato] = useState(0);
  const da = useRef(0);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMostrato(valore); da.current = valore; return;
    }
    const inizio = da.current;
    const t0 = performance.now();
    let raf = 0;
    const f = (now: number) => {
      const k = Math.min(1, (now - t0) / durata);
      const v = inizio + (valore - inizio) * (1 - Math.pow(1 - k, 3));
      setMostrato(v);
      da.current = v;
      if (k < 1) raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [valore, durata]);
  return mostrato;
}
