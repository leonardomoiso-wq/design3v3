'use client';
// Pezzi della vetrina pubblica (home e pagine di ateneo), nello stesso
// linguaggio del Contest: barra in alto, indice a righe, nastro di parole.
import type { ReactNode } from 'react';
import { NOME_PIATTAFORMA } from '@/lib/corsi';

export function RailVetrina({ sinistra, destra }: { sinistra?: ReactNode; destra?: ReactNode }) {
  return (
    <header className="mz-rail">
      <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', minWidth: 0 }}>
        <a href="/" className="mz-vetrina-rail-nome">{NOME_PIATTAFORMA}</a>
        {sinistra}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {destra}
        <a href="/teacher" className="mz-pill sm ghost">Area docente</a>
      </div>
    </header>
  );
}

export const due = (n: number) => String(n).padStart(2, '0');

export function RigaIndice({ indice, titolo, meta, href, onClick, ritardo = 0 }: {
  indice: number; titolo: ReactNode; meta?: ReactNode; href?: string; onClick?: () => void; ritardo?: number;
}) {
  const corpo = (
    <>
      <span className="mz-mono">({due(indice)})</span>
      <span className="mz-riga-titolo">{titolo}</span>
      <span className="mz-riga-meta">
        {meta}
        <span className="mz-riga-freccia" aria-hidden="true">→</span>
      </span>
    </>
  );
  return (
    <li className="mz-in" style={{ animationDelay: `${ritardo}ms` }}>
      {href ? <a href={href} className="mz-riga">{corpo}</a> : <button type="button" onClick={onClick} className="mz-riga">{corpo}</button>}
    </li>
  );
}
