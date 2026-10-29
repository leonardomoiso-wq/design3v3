'use client';
// Campi di una proposta, compilati dal/dalla docente. Seguono l'ordine
// in cui chi vota legge: immagine e titolo → una frase che convince →
// problema → proposta → perché votarla.
import { useState } from 'react';
import { comprimiImmagine } from '@/lib/contest';

const LIMITE_SINTESI = 220;

export type DatiProposta = {
  titolo: string; sintesi: string; problema: string; proposta: string; perche: string;
  immagine: string; galleria: string[]; autori?: string;
};

export function CampiProposta({ dati, onCambia, conAutori = false }: {
  dati: DatiProposta; onCambia: (d: DatiProposta) => void; conAutori?: boolean;
}) {
  const [caricando, setCaricando] = useState(false);
  const set = (k: keyof DatiProposta, v: any) => onCambia({ ...dati, [k]: v });

  const copertina = async (f?: File) => {
    if (!f) return;
    setCaricando(true);
    try { set('immagine', await comprimiImmagine(f)); } finally { setCaricando(false); }
  };
  const aggiungi = async (files: FileList | null) => {
    if (!files) return;
    setCaricando(true);
    try {
      const nuove: string[] = [];
      for (const f of Array.from(files).slice(0, 4 - dati.galleria.length)) nuove.push(await comprimiImmagine(f, 1400, 0.78));
      onCambia({ ...dati, galleria: [...dati.galleria, ...nuove] });
    } finally { setCaricando(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {conAutori && (
        <label className="mz-field">
          <span className="mz-mono">Autori</span>
          <input className="mz-input" value={dati.autori || ''} onChange={e => set('autori', e.target.value)} maxLength={160} />
        </label>
      )}
      <div className="mz-field">
        <span className="mz-mono">01 · Immagine di copertina</span>
        <span className="mz-muted" style={{ fontSize: 13.5 }}>È la prima cosa che si vede: scegline una grande e leggibile, orizzontale.</span>
        <label style={{ cursor: 'pointer', display: 'block', borderRadius: 14, overflow: 'hidden', boxShadow: 'inset 0 0 0 1px var(--line)', background: 'var(--surface)', aspectRatio: '16 / 9', position: 'relative' }}>
          {dati.immagine
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={dati.immagine} alt="Copertina" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }} className="mz-mono">{caricando ? 'Carico…' : '+ Scegli un\'immagine'}</span>}
          <input type="file" accept="image/*" onChange={e => copertina(e.target.files?.[0])} style={{ position: 'absolute', opacity: 0, inset: 0, cursor: 'pointer' }} aria-label="Immagine di copertina" />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {dati.galleria.map((g, i) => (
            <span key={i} style={{ position: 'relative', width: 84, height: 56, borderRadius: 6, overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button type="button" aria-label="Togli immagine" onClick={() => set('galleria', dati.galleria.filter((_, j) => j !== i))}
                style={{ all: 'unset', cursor: 'pointer', position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: 99, background: 'rgba(0,0,0,.65)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11 }}>✕</button>
            </span>
          ))}
          {dati.galleria.length < 4 && (
            <label className="mz-pill sm ghost" style={{ position: 'relative' }}>
              + Altre immagini ({dati.galleria.length}/4)
              <input type="file" accept="image/*" multiple onChange={e => aggiungi(e.target.files)} style={{ position: 'absolute', opacity: 0, inset: 0, cursor: 'pointer' }} />
            </label>
          )}
        </div>
      </div>

      <label className="mz-field">
        <span className="mz-mono">02 · Titolo</span>
        <input className="mz-input" value={dati.titolo} onChange={e => set('titolo', e.target.value)} maxLength={90}
          style={{ fontFamily: 'var(--f-display)', fontSize: 24, letterSpacing: '-.02em' }} placeholder="Un nome che si ricorda" />
      </label>

      <label className="mz-field">
        <span className="mz-mono" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>03 · In una frase</span>
          <span className="mz-num" style={{ color: dati.sintesi.length > LIMITE_SINTESI - 20 ? 'var(--accento)' : undefined }}>{dati.sintesi.length}/{LIMITE_SINTESI}</span>
        </span>
        <span className="mz-muted" style={{ fontSize: 13.5 }}>Cosa fa e per chi. È la riga che chi vota legge sotto il titolo.</span>
        <textarea className="mz-input" value={dati.sintesi} onChange={e => set('sintesi', e.target.value.slice(0, LIMITE_SINTESI))} style={{ minHeight: 70 }}
          placeholder="Es. Un sistema di vasi modulari che trasforma i balconi delle scuole in orti didattici." />
      </label>

      <label className="mz-field">
        <span className="mz-mono">04 · Il problema</span>
        <textarea className="mz-input" value={dati.problema} onChange={e => set('problema', e.target.value)} maxLength={1200} placeholder="Quale situazione volete cambiare? Per chi è un problema?" />
      </label>
      <label className="mz-field">
        <span className="mz-mono">05 · La proposta</span>
        <textarea className="mz-input" value={dati.proposta} onChange={e => set('proposta', e.target.value)} maxLength={2000} style={{ minHeight: 130 }} placeholder="Come funziona, con quali materiali o servizi, cosa cambia rispetto a oggi." />
      </label>
      <label className="mz-field">
        <span className="mz-mono mz-blue">06 · Perché votarla</span>
        <textarea className="mz-input" value={dati.perche} onChange={e => set('perche', e.target.value)} maxLength={600} placeholder="Il motivo più forte, in due o tre righe. Comparirà evidenziato in blu." />
      </label>
    </div>
  );
}

export const PROPOSTA_VUOTA: DatiProposta = { titolo: '', sintesi: '', problema: '', proposta: '', perche: '', immagine: '', galleria: [] };
