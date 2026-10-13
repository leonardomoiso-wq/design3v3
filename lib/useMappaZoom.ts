'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

// Navigazione "a mappa" per la matrice: zoom con rotella / pinch / doppio
// tocco / pulsanti e spostamento trascinando lo sfondo (o con un dito).
// La vista è salvata in frazioni del riquadro visibile (non in pixel),
// così resta coerente anche se la finestra cambia dimensione:
// - zoom: 1 = matrice intera, fino a ZOOM_MAX;
// - x, y: posizione dell'angolo in alto a sinistra della matrice rispetto
//   al riquadro, in unità di larghezza/altezza del riquadro (sempre <= 0).

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 8;
const SOGLIA_MOVIMENTO = 6; // px oltre cui un tocco diventa un trascinamento

export type Vista = { zoom: number; x: number; y: number };

const limita = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// La matrice deve sempre coprire tutto il riquadro: niente "vuoto" ai bordi.
function vincola(v: Vista): Vista {
  const zoom = limita(v.zoom, ZOOM_MIN, ZOOM_MAX);
  return { zoom, x: limita(v.x, 1 - zoom, 0), y: limita(v.y, 1 - zoom, 0) };
}

function eControllo(el: EventTarget | null) {
  return !!(el as HTMLElement | null)?.closest?.('button, a, input, select, textarea, label, [data-no-pan]');
}

export function useMappaZoom(attivo: boolean) {
  const [vista, setVista] = useState<Vista>({ zoom: 1, x: 0, y: 0 });
  const [animata, setAnimata] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const vistaRef = useRef(vista);
  vistaRef.current = vista;

  const puntatori = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<{ inizio: { x: number; y: number }; distanza: number | null; spostato: boolean } | null>(null);
  const ultimoGestoSpostato = useRef(false);
  const ultimoTocco = useRef<{ t: number; x: number; y: number } | null>(null);

  const imposta = useCallback((v: Vista, conAnimazione: boolean) => {
    const finale = vincola(v);
    // Aggiornato subito (non al prossimo render): più eventi di movimento
    // possono arrivare prima che React ridisegni.
    vistaRef.current = finale;
    setAnimata(conAnimazione);
    setVista(finale);
  }, []);

  // Zoom di un fattore attorno a un punto del riquadro (in px dal suo
  // angolo in alto a sinistra); senza punto, attorno al centro.
  const zoomDi = useCallback((fattore: number, punto?: { x: number; y: number }, conAnimazione = false) => {
    const el = viewportRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const v = vistaRef.current;
    const cx = punto ? punto.x / r.width : 0.5;
    const cy = punto ? punto.y / r.height : 0.5;
    const nuovoZoom = limita(v.zoom * fattore, ZOOM_MIN, ZOOM_MAX);
    const k = nuovoZoom / v.zoom;
    imposta({ zoom: nuovoZoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }, conAnimazione);
  }, [imposta]);

  // Centra la vista su un punto della matrice (frazioni 0..1), con lo zoom
  // indicato o quello corrente.
  const centraSu = useCallback((fx: number, fy: number, zoom?: number, conAnimazione = true) => {
    const z = limita(zoom ?? vistaRef.current.zoom, ZOOM_MIN, ZOOM_MAX);
    imposta({ zoom: z, x: 0.5 - fx * z, y: 0.5 - fy * z }, conAnimazione);
  }, [imposta]);

  const reimposta = useCallback(() => imposta({ zoom: 1, x: 0, y: 0 }, true), [imposta]);

  // Rotella (e pinch del trackpad, che arriva come rotella con ctrlKey):
  // serve un listener non passivo per poter bloccare lo scroll della pagina.
  useEffect(() => {
    const el = viewportRef.current;
    if (!attivo || !el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const intensita = e.ctrlKey ? 0.01 : 0.0015;
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomDi(Math.exp(-delta * intensita), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [attivo, zoomDi]);

  const finePuntatore = useCallback((e: PointerEvent) => {
    const p = puntatori.current;
    if (!p.has(e.pointerId)) return;
    p.delete(e.pointerId);
    const g = gesto.current;
    if (p.size === 0) {
      if (g) ultimoGestoSpostato.current = g.spostato;
      // Doppio tocco (touch) per ingrandire, come sulle mappe.
      if (g && !g.spostato && e.pointerType === 'touch' && viewportRef.current) {
        const ora = Date.now();
        const u = ultimoTocco.current;
        if (u && ora - u.t < 300 && Math.hypot(e.clientX - u.x, e.clientY - u.y) < 30) {
          const r = viewportRef.current.getBoundingClientRect();
          zoomDi(2, { x: e.clientX - r.left, y: e.clientY - r.top }, true);
          ultimoTocco.current = null;
        } else {
          ultimoTocco.current = { t: ora, x: e.clientX, y: e.clientY };
        }
      }
      gesto.current = null;
    } else if (g) {
      // Da due dita a una: si riparte da lì senza salti.
      const [rimasto] = Array.from(p.values());
      g.inizio = rimasto;
      g.distanza = null;
    }
  }, [zoomDi]);

  const movimento = useCallback((e: PointerEvent) => {
    const p = puntatori.current;
    const g = gesto.current;
    const el = viewportRef.current;
    if (!p.has(e.pointerId) || !g || !el) return;
    const prima = p.get(e.pointerId)!;
    p.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = el.getBoundingClientRect();

    if (p.size === 1) {
      if (!g.spostato && Math.hypot(e.clientX - g.inizio.x, e.clientY - g.inizio.y) < SOGLIA_MOVIMENTO) return;
      g.spostato = true;
      const v = vistaRef.current;
      imposta({ zoom: v.zoom, x: v.x + (e.clientX - prima.x) / r.width, y: v.y + (e.clientY - prima.y) / r.height }, false);
      return;
    }

    // Due dita: pinch attorno al punto medio, più spostamento del punto medio.
    const [a, b] = Array.from(p.values());
    const distanza = Math.hypot(a.x - b.x, a.y - b.y);
    const medio = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
    g.spostato = true;
    if (g.distanza) {
      const v = vistaRef.current;
      const nuovoZoom = limita(v.zoom * (distanza / g.distanza), ZOOM_MIN, ZOOM_MAX);
      const k = nuovoZoom / v.zoom;
      const cx = medio.x / r.width;
      const cy = medio.y / r.height;
      const dx = (e.clientX - prima.x) / 2 / r.width;
      const dy = (e.clientY - prima.y) / 2 / r.height;
      imposta({ zoom: nuovoZoom, x: cx - (cx - v.x) * k + dx, y: cy - (cy - v.y) * k + dy }, false);
    }
    g.distanza = distanza;
  }, [imposta]);

  useEffect(() => {
    window.addEventListener('pointermove', movimento);
    window.addEventListener('pointerup', finePuntatore);
    window.addEventListener('pointercancel', finePuntatore);
    return () => {
      window.removeEventListener('pointermove', movimento);
      window.removeEventListener('pointerup', finePuntatore);
      window.removeEventListener('pointercancel', finePuntatore);
    };
  }, [movimento, finePuntatore]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (eControllo(e.target)) return;
    if (e.pointerType === 'mouse') {
      // Col mouse le schede si trascinano per riposizionarle: lo
      // spostamento della mappa parte solo dallo sfondo.
      if (e.button !== 0 || (e.target as HTMLElement).closest('[data-caso]')) return;
      e.preventDefault();
    }
    puntatori.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesto.current) {
      ultimoGestoSpostato.current = false;
      gesto.current = { inizio: { x: e.clientX, y: e.clientY }, distanza: null, spostato: false };
    } else {
      gesto.current.distanza = null;
    }
  }, []);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    if (eControllo(e.target) || (e.target as HTMLElement).closest('[data-caso]')) return;
    const r = e.currentTarget.getBoundingClientRect();
    zoomDi(e.shiftKey ? 0.5 : 2, { x: e.clientX - r.left, y: e.clientY - r.top }, true);
  }, [zoomDi]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    const v = vistaRef.current;
    const passo = 0.1;
    const azioni: Record<string, () => void> = {
      '+': () => zoomDi(1.5, undefined, true),
      '=': () => zoomDi(1.5, undefined, true),
      '-': () => zoomDi(1 / 1.5, undefined, true),
      '0': reimposta,
      ArrowLeft: () => imposta({ ...v, x: v.x + passo }, true),
      ArrowRight: () => imposta({ ...v, x: v.x - passo }, true),
      ArrowUp: () => imposta({ ...v, y: v.y + passo }, true),
      ArrowDown: () => imposta({ ...v, y: v.y - passo }, true),
    };
    const azione = azioni[e.key];
    if (azione) { e.preventDefault(); azione(); }
  }, [zoomDi, reimposta, imposta]);

  return {
    vista,
    animata,
    viewportRef,
    zoomDi,
    centraSu,
    reimposta,
    // true se il tocco appena concluso era uno spostamento della mappa: il
    // click che ne segue non deve selezionare la scheda sotto il dito.
    eraSpostamento: () => ultimoGestoSpostato.current,
    gestori: { onPointerDown, onDoubleClick, onKeyDown },
  };
}
