'use client';

// Feedback visivo condiviso per la fase di compressione/upload di
// un'immagine: un indicatore "a impulsi" da mettere accanto al singolo
// controllo occupato, e una barra che percorre la cima della pagina, così
// che l'upload si senta "propagarsi" nell'interfaccia intera senza
// introdurre un sistema di notifica invasivo o uno stile fuori tono.

export function BarraCaricamento() {
  return (
    <div className="fixed top-0 left-0 right-0 h-1 z-50 overflow-hidden bg-stone-200/60" role="status" aria-label="Caricamento immagine in corso">
      <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-stone-900 to-transparent animate-barra-caricamento" />
    </div>
  );
}

export function ImpulsoCaricamento({ etichetta }: { etichetta: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-stone-500">
      <span className="relative flex h-3 w-3 flex-shrink-0" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full rounded-full bg-stone-900/50 animate-pulse-anello" />
        <span className="absolute inline-flex h-full w-full rounded-full bg-stone-900/50 animate-pulse-anello" style={{ animationDelay: '0.5s' }} />
        <span className="relative inline-flex rounded-full h-3 w-3 bg-stone-900" />
      </span>
      {etichetta}
    </span>
  );
}
