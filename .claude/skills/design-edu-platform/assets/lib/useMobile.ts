'use client';
import { useState, useEffect } from 'react';

// true sotto il breakpoint "md" di Tailwind (768px): è la soglia sotto cui
// l'area docente passa dai pannelli laterali ai pannelli dal basso
// (bottom sheet / sliding panel). Al primo render (anche lato server) vale
// false, così il markup desktop resta quello di sempre.
export function useMobile(query = '(max-width: 767px)') {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const aggiorna = () => setMobile(mq.matches);
    aggiorna();
    mq.addEventListener('change', aggiorna);
    return () => mq.removeEventListener('change', aggiorna);
  }, [query]);

  return mobile;
}
