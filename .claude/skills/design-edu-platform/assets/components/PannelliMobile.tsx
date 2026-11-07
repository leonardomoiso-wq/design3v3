'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

// Pannelli "dal basso" per la navigazione da smartphone:
// - BottomSheet: finestra modale che su mobile sale dal fondo dello
//   schermo (chiudibile trascinandola giù), mentre da desktop resta la
//   classica finestra centrata;
// - ActionSheet: elenco di azioni/destinazioni in un BottomSheet (menu di
//   navigazione, scelta della scheda attiva...);
// - SlidingPanel: pannello non modale ancorato al fondo con tre altezze
//   (peek / medio / pieno), da trascinare o toccare, che su mobile
//   sostituisce i pannelli laterali di dettaglio.
// Niente librerie esterne: pointer events + transizioni CSS.

const SOGLIA_TRASCINAMENTO = 48; // px oltre cui un trascinamento conta come gesto

function eControllo(el: EventTarget | null) {
  return !!(el as HTMLElement | null)?.closest?.('button, a, input, select, textarea, label');
}

function Maniglia() {
  return <span aria-hidden="true" className="block w-10 h-1.5 rounded-full bg-stone-300 mx-auto" />;
}

/* ------------------------------------------------------------------ */
/* BottomSheet                                                         */
/* ------------------------------------------------------------------ */

export function BottomSheet({
  aperto,
  onChiudi,
  etichetta,
  titolo,
  children,
  larghezzaDesktop = 'md:max-w-lg',
  classePannello = 'p-6 space-y-4',
}: {
  aperto: boolean;
  onChiudi: () => void;
  etichetta: string;
  titolo?: React.ReactNode;
  children: React.ReactNode;
  larghezzaDesktop?: string;
  classePannello?: string;
}) {
  const [offset, setOffset] = useState(0);
  const inizio = useRef<number | null>(null);
  const chiudiRef = useRef(onChiudi);
  chiudiRef.current = onChiudi;

  useEffect(() => {
    if (!aperto) return;
    setOffset(0);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') chiudiRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aperto]);

  if (!aperto) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (eControllo(e.target)) return;
    inizio.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (inizio.current === null) return;
    setOffset(Math.max(0, e.clientY - inizio.current));
  };
  const onPointerUp = () => {
    if (inizio.current === null) return;
    inizio.current = null;
    if (offset > SOGLIA_TRASCINAMENTO * 2) onChiudi();
    else setOffset(0);
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-stone-900/60 backdrop-blur-sm flex items-end md:items-center justify-center md:p-6 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={etichetta}
      onClick={onChiudi}
    >
      <div
        className={`bg-white w-full ${larghezzaDesktop} rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[90dvh] md:max-h-[85vh] flex flex-col overflow-hidden animate-sheet-up md:animate-scale-in pb-[env(safe-area-inset-bottom)]`}
        style={offset ? { transform: `translateY(${offset}px)`, transition: 'none' } : undefined}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="md:hidden pt-2.5 pb-1 touch-none cursor-grab flex-shrink-0"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <Maniglia />
        </div>
        <div className={`overflow-y-auto overscroll-contain ${classePannello}`}>
          {titolo !== undefined && (
            <div className="flex justify-between items-center gap-3">
              <h2 className="font-serif font-bold text-lg">{titolo}</h2>
              <button onClick={onChiudi} aria-label="Chiudi" className="text-stone-400 hover:text-stone-900 text-xl leading-none w-8 h-8 flex items-center justify-center flex-shrink-0">✕</button>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ActionSheet                                                         */
/* ------------------------------------------------------------------ */

export type Azione = {
  chiave: string;
  etichetta: React.ReactNode;
  descrizione?: React.ReactNode;
  attiva?: boolean;
  pericolo?: boolean;
  href?: string;
  onSeleziona?: () => void;
};

export function ActionSheet({
  aperto,
  onChiudi,
  titolo,
  azioni,
}: {
  aperto: boolean;
  onChiudi: () => void;
  titolo: string;
  azioni: Azione[];
}) {
  const classe = (a: Azione) =>
    `w-full flex items-center justify-between gap-3 text-left px-4 py-3.5 rounded-2xl text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 ${
      a.attiva
        ? 'bg-stone-900 text-white'
        : a.pericolo
          ? 'bg-white text-red-600 hover:bg-red-50'
          : 'bg-white text-stone-800 hover:bg-stone-100'
    }`;

  const contenuto = (a: Azione) => (
    <>
      <span className="min-w-0">
        <span className="block truncate">{a.etichetta}</span>
        {a.descrizione && <span className={`block text-[11px] font-normal ${a.attiva ? 'text-stone-300' : 'text-stone-500'}`}>{a.descrizione}</span>}
      </span>
      {a.attiva && <span aria-hidden="true" className="text-xs">●</span>}
    </>
  );

  return (
    <BottomSheet aperto={aperto} onChiudi={onChiudi} etichetta={titolo} larghezzaDesktop="md:max-w-sm" classePannello="px-3 pb-3 pt-1 md:pt-3 space-y-2">
      <p className="px-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-stone-400">{titolo}</p>
      <ul className="bg-stone-50 border border-stone-200 rounded-3xl p-1.5 space-y-1">
        {azioni.map(a => (
          <li key={a.chiave}>
            {a.href ? (
              <Link href={a.href} onClick={onChiudi} className={classe(a)} aria-current={a.attiva ? 'page' : undefined}>
                {contenuto(a)}
              </Link>
            ) : (
              <button onClick={() => { onChiudi(); a.onSeleziona?.(); }} className={classe(a)} aria-pressed={a.attiva}>
                {contenuto(a)}
              </button>
            )}
          </li>
        ))}
      </ul>
      <button onClick={onChiudi} className="w-full bg-white border border-stone-200 rounded-2xl py-3.5 text-sm font-bold text-stone-700 hover:bg-stone-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900">
        Annulla
      </button>
    </BottomSheet>
  );
}

/* ------------------------------------------------------------------ */
/* SlidingPanel                                                        */
/* ------------------------------------------------------------------ */

export type StatoPannello = 'peek' | 'medio' | 'pieno';
const ORDINE: StatoPannello[] = ['peek', 'medio', 'pieno'];

export function SlidingPanel({
  stato,
  onCambiaStato,
  intestazione,
  children,
  etichetta,
  altezzaPeek = 84,
}: {
  stato: StatoPannello;
  onCambiaStato: (s: StatoPannello) => void;
  intestazione: React.ReactNode;
  children: React.ReactNode;
  etichetta: string;
  altezzaPeek?: number;
}) {
  const [altezzaFinestra, setAltezzaFinestra] = useState(0);
  const [altezzaTrascinata, setAltezzaTrascinata] = useState<number | null>(null);
  const inizio = useRef<{ y: number; h: number } | null>(null);
  const spostato = useRef(false);

  useEffect(() => {
    const aggiorna = () => setAltezzaFinestra(window.innerHeight);
    aggiorna();
    window.addEventListener('resize', aggiorna);
    return () => window.removeEventListener('resize', aggiorna);
  }, []);

  const altezzaDi = useCallback((s: StatoPannello) => {
    if (s === 'peek') return altezzaPeek;
    if (s === 'medio') return Math.round(altezzaFinestra * 0.5);
    return Math.round(altezzaFinestra * 0.88);
  }, [altezzaFinestra, altezzaPeek]);

  const altezza = altezzaTrascinata ?? altezzaDi(stato);

  const onPointerDown = (e: React.PointerEvent) => {
    if (eControllo(e.target)) return;
    inizio.current = { y: e.clientY, h: altezzaDi(stato) };
    spostato.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!inizio.current) return;
    const delta = inizio.current.y - e.clientY;
    if (Math.abs(delta) > 4) spostato.current = true;
    if (!spostato.current) return;
    setAltezzaTrascinata(Math.min(altezzaDi('pieno'), Math.max(altezzaPeek, inizio.current.h + delta)));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!inizio.current) return;
    const delta = inizio.current.y - e.clientY;
    inizio.current = null;
    setAltezzaTrascinata(null);
    const i = ORDINE.indexOf(stato);
    if (!spostato.current) {
      // Tocco senza trascinamento: apre al livello successivo, o richiude.
      onCambiaStato(stato === 'pieno' ? 'peek' : ORDINE[i + 1]);
      return;
    }
    // Trascinamento: si va al livello più vicino, ma basta un gesto deciso
    // per passare al successivo/precedente anche senza arrivarci.
    const finale = altezzaDi(stato) + delta;
    let vicino = ORDINE.reduce((best, s) => (Math.abs(altezzaDi(s) - finale) < Math.abs(altezzaDi(best) - finale) ? s : best), stato);
    if (vicino === stato && Math.abs(delta) > SOGLIA_TRASCINAMENTO) {
      vicino = ORDINE[Math.max(0, Math.min(ORDINE.length - 1, i + (delta > 0 ? 1 : -1)))];
    }
    onCambiaStato(vicino);
  };

  return (
    <section
      aria-label={etichetta}
      className="fixed inset-x-0 bottom-0 z-30 bg-[#FBF9F5] border-t border-stone-200 rounded-t-3xl shadow-[0_-8px_30px_rgba(28,25,23,0.12)] flex flex-col pb-[env(safe-area-inset-bottom)]"
      style={{
        height: altezzaFinestra ? altezza : altezzaPeek,
        transition: altezzaTrascinata !== null ? 'none' : 'height 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div
        className="flex-shrink-0 touch-none cursor-grab px-5 pt-2 pb-2"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button
          onClick={() => onCambiaStato(stato === 'pieno' ? 'peek' : ORDINE[ORDINE.indexOf(stato) + 1])}
          aria-label={stato === 'pieno' ? 'Riduci il pannello' : 'Espandi il pannello'}
          aria-expanded={stato !== 'peek'}
          className="w-full py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 rounded-full"
        >
          <Maniglia />
        </button>
        {intestazione}
      </div>
      <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-6 ${stato === 'peek' && altezzaTrascinata === null ? 'invisible' : ''}`}>
        {children}
      </div>
    </section>
  );
}
