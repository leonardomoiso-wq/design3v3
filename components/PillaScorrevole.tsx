'use client';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

// Pillola che scorre con una leggera molla sotto la voce attiva di un
// gruppo di pulsanti o link (menu docente, schede). Va messa dentro il
// contenitore (position: relative); la voce attiva si riconosce da
// `selettore` (di solito [aria-current="page"] o [aria-pressed="true"]).
// Le voci devono avere sfondo trasparente e stare sopra (relative z-10).
export default function PillaScorrevole({ selettore, classe, dipendenze }: {
  selettore: string;
  classe: string;
  dipendenze: unknown[];
}) {
  const pilla = useRef<HTMLSpanElement>(null);
  const posizionata = useRef(false);

  const posiziona = useCallback(() => {
    const p = pilla.current;
    const contenitore = p?.parentElement;
    const attiva = contenitore?.querySelector<HTMLElement>(selettore);
    if (!p) return;
    if (!attiva) { p.style.opacity = '0'; return; }
    // La prima volta compare già al suo posto, senza scorrere dall'angolo.
    if (!posizionata.current) p.style.transition = 'none';
    p.style.opacity = '1';
    p.style.width = `${attiva.offsetWidth}px`;
    p.style.height = `${attiva.offsetHeight}px`;
    p.style.transform = `translate(${attiva.offsetLeft}px, ${attiva.offsetTop}px)`;
    if (!posizionata.current) {
      posizionata.current = true;
      void p.offsetWidth;
      p.style.transition = '';
    }
  }, [selettore]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(posiziona, [posiziona, ...dipendenze]);

  useEffect(() => {
    const contenitore = pilla.current?.parentElement;
    if (!contenitore) return;
    const osservatore = new ResizeObserver(posiziona);
    osservatore.observe(contenitore);
    document.fonts?.ready.then(posiziona);
    return () => osservatore.disconnect();
  }, [posiziona]);

  return <span ref={pilla} aria-hidden="true" className={`pilla-scorrevole ${classe}`} style={{ opacity: 0 }} />;
}
