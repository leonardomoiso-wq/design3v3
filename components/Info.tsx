'use client';
import { useEffect, useId, useRef, useState } from 'react';

// Icona ⓘ che apre una nota breve: le spiegazioni che servono solo a chi
// vuole approfondire stanno qui, non nel testo della pagina. Si apre al
// tocco o al clic, si chiude toccando fuori o con Esc.
export default function Info({ children, etichetta = 'Approfondisci', lato = 'centro' }: {
  children: React.ReactNode;
  etichetta?: string;
  lato?: 'centro' | 'sinistra' | 'destra';
}) {
  const [aperta, setAperta] = useState(false);
  const id = useId();
  const contenitore = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!aperta) return;
    const fuori = (e: PointerEvent) => { if (!contenitore.current?.contains(e.target as Node)) setAperta(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAperta(false); };
    window.addEventListener('pointerdown', fuori);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', fuori); window.removeEventListener('keydown', esc); };
  }, [aperta]);

  return (
    <span ref={contenitore} className="info-ancora">
      <button
        type="button"
        className="info-punto"
        aria-label={etichetta}
        aria-expanded={aperta}
        aria-controls={id}
        onClick={e => { e.stopPropagation(); setAperta(a => !a); }}
      >
        i
      </button>
      {aperta && (
        <span id={id} role="note" className={`info-nota info-${lato}`}>
          {children}
        </span>
      )}
    </span>
  );
}
