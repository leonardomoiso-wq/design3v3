'use client';
import { useEffect, useRef, useState } from 'react';
import { HMW_VUOTA, hmwCompleta, testoHmw, type Hmw } from './shared';

// Due domande "How Might We" composte riempiendo gli spazi vuoti della
// formula: Come potremmo [azione] per [utente] così che [risultato]?
// Ogni domanda nasce da uno dei contesti del team. Si salvano da sole;
// il/la docente le rivede (ok / da rivedere) e sblocca gli sketch.

function Spazio({ valore, onCambia, segnaposto, etichetta }: { valore: string; onCambia: (v: string) => void; segnaposto: string; etichetta: string }) {
  return (
    <input
      value={valore}
      onChange={e => onCambia(e.target.value)}
      placeholder={segnaposto}
      aria-label={etichetta}
      size={Math.max(segnaposto.length, valore.length, 8)}
      style={{ maxWidth: '100%' }}
      className="bg-transparent border-0 border-b-2 border-amber-400 focus:border-stone-900 focus:outline-none px-1 py-0.5 text-amber-800 placeholder:text-stone-400 font-medium"
    />
  );
}

export default function ComponiHmw({ hmw, opzioniContesto, revisione, inviate, sketchSbloccati, onSalva, onInvia }: {
  hmw: Hmw[];
  opzioniContesto: { id: string; etichetta: string; proprio: boolean }[];
  revisione: (('ok' | 'rivedere') | null)[];
  inviate: boolean;
  sketchSbloccati: boolean;
  onSalva: (hmw: Hmw[]) => Promise<boolean>;
  onInvia: () => void;
}) {
  const normalizza = (h: Hmw[]) => [0, 1].map(i => ({ ...HMW_VUOTA, ...(h[i] || {}) }));
  const [bozza, setBozza] = useState<Hmw[]>(normalizza(hmw));
  const [stato, setStato] = useState<'idle' | 'salvando' | 'salvato' | 'errore'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inModifica = useRef(false);

  // aggiornamenti dagli altri dispositivi del team, se qui non si scrive
  const firma = JSON.stringify(hmw);
  useEffect(() => {
    if (!inModifica.current) setBozza(normalizza(JSON.parse(firma)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

  const aggiorna = (i: number, patch: Partial<Hmw>) => {
    inModifica.current = true;
    const nuove = bozza.map((h, j) => (j === i ? { ...h, ...patch } : h));
    setBozza(nuove);
    setStato('idle');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setStato('salvando');
      const ok = await onSalva(nuove);
      setStato(ok ? 'salvato' : 'errore');
      inModifica.current = false;
    }, 900);
  };

  const pronte = bozza.every(h => hmwCompleta(h) && h.contesto);

  return (
    <div className="space-y-5">
      {bozza.map((h, i) => {
        const rev = revisione[i] || null;
        return (
          <section key={i} className={`bg-white rounded-3xl border p-5 sm:p-6 space-y-4 ${rev === 'ok' ? 'border-emerald-300' : rev === 'rivedere' ? 'border-red-300' : 'border-stone-200'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="mz-mono" style={{ color: 'var(--ink)' }}>Domanda ({String(i + 1).padStart(2, '0')})</span>
              {inviate && (
                <span className={`text-xs font-medium px-3 py-1 rounded-full ${rev === 'ok' ? 'bg-emerald-50 text-emerald-800' : rev === 'rivedere' ? 'bg-red-50 text-red-800' : 'bg-stone-100 text-stone-600'}`}>
                  {rev === 'ok' ? '✓ Approvata dal/dalla docente' : rev === 'rivedere' ? 'Da rivedere: ne parliamo in aula' : 'Inviata, in attesa'}
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-stone-500">Da quale contesto parte?</p>
              <div className="flex flex-wrap gap-1.5">
                {opzioniContesto.map(c => (
                  <button key={c.id} type="button" aria-pressed={h.contesto === c.id} className={`mz-chip ${h.contesto === c.id ? 'on' : ''}`} onClick={() => aggiorna(i, { contesto: c.id })}>
                    {c.proprio && <span className="mz-mono">Vostro</span>}{c.etichetta}
                  </button>
                ))}
              </div>
            </div>

            <p className="font-serif text-xl sm:text-2xl leading-relaxed text-stone-900" style={{ fontFamily: 'var(--f-display)', letterSpacing: '-.01em' }}>
              Come potremmo{' '}
              <Spazio valore={h.azione} onCambia={v => aggiorna(i, { azione: v })} segnaposto="azione (verbo)" etichetta="Azione" />{' '}
              per{' '}
              <Spazio valore={h.utente} onCambia={v => aggiorna(i, { utente: v })} segnaposto="chi" etichetta="Utente" />{' '}
              così che{' '}
              <Spazio valore={h.risultato} onCambia={v => aggiorna(i, { risultato: v })} segnaposto="risultato desiderato" etichetta="Risultato desiderato" />?
            </p>
            {hmwCompleta(h) && <p className="text-sm text-stone-500 italic">&ldquo;{testoHmw(h)}&rdquo;</p>}
          </section>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-stone-400" aria-live="polite">
          {stato === 'salvando' ? 'Salvo…' : stato === 'salvato' ? '✓ Salvato' : stato === 'errore' ? <span className="text-red-600">Non salvato, riprovate</span> : ''}
        </span>
        {!inviate ? (
          <button type="button" className="mz-pill b lg" disabled={!pronte} onClick={onInvia}>Inviate al docente →</button>
        ) : !sketchSbloccati ? (
          <p className="text-sm text-stone-600 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 m-0">
            Domande inviate. Potete ancora perfezionarle: gli sketch si aprono quando il/la docente le approva.
          </p>
        ) : null}
      </div>
    </div>
  );
}
