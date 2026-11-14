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

// Dimensione di un titolo grande secondo la lunghezza del testo: i nomi
// lunghi scendono di corpo, e la parola più lunga deve stare nella riga
// (niente parole spezzate a metà su telefono). `larghezza` è la quota
// dello schermo occupata dal titolo (1 = tutta).
export function scalaTitolo(testo: string, { min, vw, max, larghezza = 1 }: { min: number; vw: number; max: number; larghezza?: number }) {
  const n = testo.trim().length;
  const fattore = n <= 14 ? 1 : n <= 22 ? 0.84 : n <= 32 ? 0.7 : n <= 48 ? 0.58 : 0.48;
  const parola = Math.max(4, ...testo.split(/\s+/).map(p => p.length));
  // In Helvetica una lettera è larga circa 0,56 volte il corpo.
  const vwParola = (92 * larghezza) / (parola * 0.56);
  const minParola = (340 * larghezza) / (parola * 0.56);
  const vwFinale = Math.min(vw * fattore, vwParola);
  const minFinale = Math.round(Math.min(min * Math.max(fattore, 0.72), minParola));
  const maxFinale = Math.round(Math.max(minFinale, max * fattore));
  return `clamp(${minFinale}px, ${vwFinale.toFixed(2)}vw, ${maxFinale}px)`;
}

export function RigaIndice({ indice, titolo, meta, href, onClick, ritardo = 0, sotto, spenta = false }: {
  indice: number; titolo: ReactNode; meta?: ReactNode; href?: string; onClick?: () => void; ritardo?: number;
  sotto?: ReactNode; spenta?: boolean;
}) {
  const corpo = (
    <>
      <span className="mz-mono">({due(indice)})</span>
      <span style={{ display: 'grid', gap: 10, minWidth: 0 }}>
        <span className="mz-riga-titolo" style={typeof titolo === 'string' ? { fontSize: scalaTitolo(titolo, { min: 30, vw: 5.8, max: 100, larghezza: 0.62 }) } : undefined}>{titolo}</span>
        {sotto && <span className="mz-riga-sotto">{sotto}</span>}
      </span>
      <span className="mz-riga-meta">
        {meta}
        <span className="mz-riga-freccia" aria-hidden="true">→</span>
      </span>
    </>
  );
  return (
    <li className="mz-in" style={{ animationDelay: `${ritardo}ms` }}>
      {spenta ? <div className="mz-riga spenta">{corpo}</div>
        : href ? <a href={href} className="mz-riga">{corpo}</a>
        : <button type="button" onClick={onClick} className="mz-riga">{corpo}</button>}
    </li>
  );
}
