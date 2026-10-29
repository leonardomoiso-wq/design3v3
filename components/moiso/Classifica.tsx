'use client';
// Classifica a barre che "corre": barre che crescono, numeri che salgono,
// righe che si riordinano scivolando (FLIP), un +1 che vola via quando
// una proposta riceve un voto. Una sola tinta: il blu.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Proposta } from '@/lib/contest';
import { riduciMovimento } from '@/lib/contest';
import { ContaSu } from './Moiso';

export type RigaClassifica = { proposta: Proposta; voti: number };

export function Classifica({ righe, coperta = false, scuro = false, compatta = false, evidenzia, onApri }: {
  righe: RigaClassifica[];
  coperta?: boolean;
  scuro?: boolean;
  compatta?: boolean;
  evidenzia?: number | null;
  onApri?: (p: Proposta) => void;
}) {
  const ordinate = [...righe].sort((a, b) => b.voti - a.voti || a.proposta.id - b.proposta.id);
  const massimo = Math.max(1, ...ordinate.map(r => r.voti));
  const totale = ordinate.reduce((s, r) => s + r.voti, 0);
  const nodi = useRef<Record<number, HTMLLIElement | null>>({});
  const posizioni = useRef<Record<number, number>>({});
  const votiPrima = useRef<Record<number, number>>({});
  const [piu, setPiu] = useState<{ id: number; chiave: number; n: number }[]>([]);
  const [hover, setHover] = useState<number | null>(null);

  // FLIP: le righe che cambiano posto scivolano dalla vecchia alla nuova.
  useLayoutEffect(() => {
    const ridotto = riduciMovimento();
    for (const r of ordinate) {
      const n = nodi.current[r.proposta.id];
      if (!n) continue;
      const top = n.offsetTop;
      const prima = posizioni.current[r.proposta.id];
      if (!ridotto && prima !== undefined && prima !== top) {
        n.animate([{ transform: `translateY(${prima - top}px)` }, { transform: 'none' }], { duration: 750, easing: 'cubic-bezier(.7,0,.25,1)' });
      }
      posizioni.current[r.proposta.id] = top;
    }
  });

  useEffect(() => {
    const nuovi: { id: number; chiave: number; n: number }[] = [];
    for (const r of righe) {
      const prima = votiPrima.current[r.proposta.id];
      if (prima !== undefined && r.voti > prima) nuovi.push({ id: r.proposta.id, chiave: Date.now() + r.proposta.id, n: r.voti - prima });
      votiPrima.current[r.proposta.id] = r.voti;
    }
    if (nuovi.length && !coperta) {
      setPiu(p => [...p, ...nuovi]);
      setTimeout(() => setPiu(p => p.filter(x => !nuovi.includes(x))), 1500);
    }
  }, [righe, coperta]);

  const altezza = compatta ? 46 : 64;

  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: compatta ? 8 : 12, position: 'relative' }}>
      {ordinate.map((r, i) => {
        const quota = coperta ? 0.12 + ((r.proposta.id * 37) % 50) / 100 : r.voti / massimo;
        const perc = totale ? Math.round((r.voti / totale) * 100) : 0;
        const primo = !coperta && i === 0 && r.voti > 0;
        const attivo = evidenzia === r.proposta.id;
        return (
          <li
            key={r.proposta.id}
            ref={el => { nodi.current[r.proposta.id] = el; }}
            style={{ position: 'relative', display: 'grid', gridTemplateColumns: `28px ${altezza}px minmax(0, 1fr) auto`, alignItems: 'center', gap: compatta ? 10 : 14 }}
            onMouseEnter={() => setHover(r.proposta.id)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="mz-mono mz-num" style={{ color: primo ? 'var(--blue)' : undefined }}>{coperta ? '··' : String(i + 1).padStart(2, '0')}</span>
            <button
              type="button"
              onClick={() => onApri?.(r.proposta)}
              aria-label={`Apri ${r.proposta.titolo}`}
              style={{ all: 'unset', cursor: onApri ? 'pointer' : 'default', width: altezza, height: altezza, borderRadius: 6, overflow: 'hidden', background: 'var(--card)', outline: attivo ? '2px solid var(--blue)' : undefined, outlineOffset: 2, filter: coperta ? 'blur(6px) grayscale(1)' : undefined, transition: 'filter .8s' }}
            >
              {r.proposta.immagine ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.proposta.immagine} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : <span style={{ display: 'block', width: '100%', height: '100%', background: 'var(--blue)' }} />}
            </button>
            <div style={{ minWidth: 0, display: 'grid', gap: 6 }}>
              <span
                className="mz-break"
                style={{ fontFamily: 'var(--f-display)', fontSize: compatta ? 16 : 'clamp(17px, 1.8vw, 24px)', letterSpacing: '-.02em', lineHeight: 1.1, filter: coperta ? 'blur(5px)' : undefined, transition: 'filter .8s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {r.proposta.titolo}
              </span>
              <div className="mz-track" style={{ height: compatta ? 8 : 12, background: scuro ? 'rgba(255,255,255,.08)' : undefined }}>
                <div className={`mz-bar ${coperta ? 'mz-breathe' : ''}`} style={{ width: `${Math.max(coperta ? 0 : 1.5, quota * 100)}%`, background: coperta ? 'var(--faint)' : undefined }} />
              </div>
            </div>
            <span style={{ textAlign: 'right', minWidth: 56 }}>
              {coperta ? (
                <span className="mz-mono">—</span>
              ) : (
                <>
                  <span className="mz-display mz-num" style={{ fontSize: compatta ? 22 : 'clamp(24px, 2.6vw, 38px)', display: 'block', lineHeight: 1 }}>
                    <ContaSu valore={r.voti} />
                  </span>
                  <span className="mz-mono mz-num">{perc}%</span>
                </>
              )}
            </span>
            {piu.filter(x => x.id === r.proposta.id).map(x => (
              <span key={x.chiave} className="mz-plus" style={{ right: compatta ? 70 : 90, top: 4 }}>+{x.n}</span>
            ))}
            {hover === r.proposta.id && !coperta && (
              <span className="mz-tip" style={{ left: '50%', top: 0 }}>
                {r.proposta.titolo}: {r.voti} {r.voti === 1 ? 'voto' : 'voti'} · {perc}%
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
