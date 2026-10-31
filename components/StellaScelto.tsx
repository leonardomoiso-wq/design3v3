'use client';

// Il contrassegno di interesse di un caso studio: 0 (nessuna), 0.5 (mezza
// stellina) o 1 (stellina intera). Senza onCambia è solo un'indicazione
// visiva (badge in matrice, radar, peer review); con onCambia diventa
// interattivo, con due pulsanti — mezza stellina e stellina intera —
// invece di un'etichetta testuale.

function Stella({ piena, meta }: { piena: boolean; meta?: boolean }) {
  return (
    <span
      className={`inline-block overflow-hidden leading-none select-none ${piena ? 'text-amber-400' : 'text-stone-300'}`}
      style={{ width: meta ? '0.5em' : '1em' }}
    >
      ★
    </span>
  );
}

export default function StellaScelto({
  valore,
  onCambia,
  className = '',
}: {
  valore: number;
  onCambia?: (nuovoValore: number) => void;
  className?: string;
}) {
  if (!onCambia) {
    if (!valore) return null;
    return (
      <span
        className={`inline-flex items-center ${className}`}
        title={valore >= 1 ? 'Contrassegnato: stellina intera' : 'Contrassegnato: mezza stellina'}
        aria-label={valore >= 1 ? 'Contrassegnato: stellina intera' : 'Contrassegnato: mezza stellina'}
      >
        <Stella piena meta={valore < 1} />
      </span>
    );
  }

  const imposta = (v: number) => onCambia(valore === v ? 0 : v);

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); imposta(0.5); }}
        aria-label="Segna mezza stellina"
        aria-pressed={valore === 0.5}
        className="hover:scale-110 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 rounded"
      >
        <Stella piena={valore >= 0.5} meta />
      </button>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); imposta(1); }}
        aria-label="Segna una stellina intera"
        aria-pressed={valore === 1}
        className="hover:scale-110 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 rounded"
      >
        <Stella piena={valore >= 1} />
      </button>
    </span>
  );
}
