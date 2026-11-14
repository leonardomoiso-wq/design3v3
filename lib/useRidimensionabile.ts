'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

// Rende un pannello laterale ridimensionabile trascinando un bordo col
// cursore: la larghezza scelta viene ricordata (localStorage) così resta
// la stessa alla prossima visita. "direzione" dice da che lato si trova
// la maniglia rispetto al pannello: 'destra' per un pannello ancorato a
// sinistra (trascinare verso destra lo allarga), 'sinistra' per un
// pannello ancorato a destra (trascinare verso sinistra lo allarga).
export function usePannelloRidimensionabile(
  chiave: string,
  larghezzaIniziale: number,
  minimo: number,
  massimo: number,
  direzione: 'sinistra' | 'destra'
) {
  const [larghezza, setLarghezza] = useState(larghezzaIniziale);
  const trascinando = useRef(false);
  const inizio = useRef({ x: 0, larghezza: larghezzaIniziale });

  useEffect(() => {
    try {
      const salvata = window.localStorage.getItem(chiave);
      if (salvata) {
        const v = Number(salvata);
        if (!Number.isNaN(v)) setLarghezza(Math.min(massimo, Math.max(minimo, v)));
      }
    } catch {
      // localStorage non disponibile: si resta sulla larghezza di default.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiave]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!trascinando.current) return;
      const delta = direzione === 'destra' ? e.clientX - inizio.current.x : inizio.current.x - e.clientX;
      setLarghezza(Math.min(massimo, Math.max(minimo, inizio.current.larghezza + delta)));
    };
    const onUp = () => {
      if (!trascinando.current) return;
      trascinando.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setLarghezza(corrente => {
        try {
          window.localStorage.setItem(chiave, String(corrente));
        } catch {
          // idem
        }
        return corrente;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [chiave, minimo, massimo, direzione]);

  const iniziaTrascinamento = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    trascinando.current = true;
    inizio.current = { x: e.clientX, larghezza };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [larghezza]);

  return { larghezza, iniziaTrascinamento };
}
