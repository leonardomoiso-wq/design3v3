'use client';

// Feedback visivo condiviso per la fase di compressione/upload di
// un'immagine: un indicatore "a impulsi" da mettere accanto al singolo
// controllo occupato, e un bagliore che pulsa su tutto lo sfondo della
// pagina, così che l'upload si senta chiaramente "propagarsi"
// nell'interfaccia intera, senza però coprire i contenuti (è solo un
// bordo/aura, il centro resta trasparente) né introdurre colori o forme
// estranei alla palette esistente (riusa l'ambra già usata per gli
// stati "in evidenza" nel radar e nella matrice).
export function SfondoCaricamento() {
  return (
    <div
      className="fixed inset-0 z-40 pointer-events-none animate-sfondo-pulsa"
      style={{ boxShadow: 'inset 0 0 0 6px rgba(217,119,6,0.45), inset 0 0 140px 40px rgba(217,119,6,0.22)' }}
      role="status"
      aria-label="Caricamento immagine in corso"
    />
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
