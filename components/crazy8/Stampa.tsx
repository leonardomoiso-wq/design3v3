'use client';
import { useEffect } from 'react';

// Esportazione in PDF con la stampa del browser ("Salva come PDF"): una
// pagina per team con contesti, le domande, gli sketch scelti e le
// immagini generate. Si mostra solo in stampa.

export type ConsegnaStampa = {
  team: string;
  membri: string[];
  contesti: string[];
  domande: { testo: string; scelti: { sketch: string; generate: string[]; nota?: string | null }[] }[];
};

export function StampaCrazy8({ titolo, consegne, onFine }: { titolo: string; consegne: ConsegnaStampa[]; onFine: () => void }) {
  useEffect(() => {
    document.body.classList.add('c8-stampa-attiva');
    const fine = () => { document.body.classList.remove('c8-stampa-attiva'); onFine(); };
    window.addEventListener('afterprint', fine);
    // un attimo per caricare le immagini prima di aprire la stampa
    const t = setTimeout(() => window.print(), 600);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', fine); document.body.classList.remove('c8-stampa-attiva'); };
  }, [onFine]);

  return (
    <div className="c8-stampa">
      {consegne.map((c, k) => (
        <section key={k} className="c8-stampa-pagina">
          <p className="c8-stampa-sopra">{titolo}</p>
          <h1>{c.team}</h1>
          {c.membri.length > 0 && <p className="c8-stampa-membri">{c.membri.join(', ')}</p>}
          {c.contesti.length > 0 && <p className="c8-stampa-contesti">Contesti: {c.contesti.join(', ')}</p>}
          {c.domande.map((d, i) => (
            <div key={i} className="c8-stampa-domanda">
              <h2>({String(i + 1).padStart(2, '0')}) {d.testo || 'Domanda non scritta'}</h2>
              {d.scelti.map((s, j) => (
                <div key={j} className="c8-stampa-catena">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <figure><img src={s.sketch} alt="" /><figcaption>Sketch</figcaption></figure>
                  {s.generate.slice(0, 3).map((g, h) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <figure key={h}><img src={g} alt="" /><figcaption>Immagine AI {h + 1}</figcaption></figure>
                  ))}
                  {s.nota && <p className="c8-stampa-nota">«{s.nota}»</p>}
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
