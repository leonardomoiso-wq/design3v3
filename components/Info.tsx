'use client';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

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
  const nota = useRef<HTMLSpanElement>(null);

  // La nota è agganciata allo schermo (position: fixed), centrata
  // sull'icona e sempre dentro i bordi (12 px di margine): così non può
  // allargare la pagina su telefono. Scorrendo si chiude.
  useLayoutEffect(() => {
    const n = nota.current, c = contenitore.current;
    if (!aperta || !n || !c) return;
    const posiziona = () => {
      const ancora = c.getBoundingClientRect();
      const schermo = document.documentElement.clientWidth;
      const larghezza = n.offsetWidth;
      const margine = 12;
      const centro = ancora.left + ancora.width / 2;
      let sinistra = lato === 'destra' ? ancora.left - 6 : lato === 'sinistra' ? ancora.right + 6 - larghezza : centro - larghezza / 2;
      sinistra = Math.max(margine, Math.min(sinistra, schermo - margine - larghezza));
      n.style.left = `${sinistra}px`;
      n.style.top = `${ancora.bottom + 8}px`;
    };
    posiziona();
    const chiudi = () => setAperta(false);
    window.addEventListener('resize', posiziona);
    window.addEventListener('scroll', chiudi, true);
    return () => { window.removeEventListener('resize', posiziona); window.removeEventListener('scroll', chiudi, true); };
  }, [aperta, lato]);

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
        <span ref={nota} id={id} role="note" className="info-nota">
          {children}
        </span>
      )}
    </span>
  );
}
