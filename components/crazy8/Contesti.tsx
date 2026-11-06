'use client';
import type { Contesto } from './shared';

// Bacheca dei contesti preparata dal/dalla docente: il team ne sceglie
// quanti ne permette l'attività (0 = quanti vuole). Il sotto-ambito del
// team è sempre il primo contesto, già "appuntato".
export default function BachecaContesti({ contesti, scelti, massimo, sottoAmbiti, onCambia }: {
  contesti: Contesto[];
  scelti: string[];
  massimo: number;
  sottoAmbiti: string[];
  onCambia: (ids: string[]) => void;
}) {
  const pieno = massimo > 0 && scelti.length >= massimo;
  const toggle = (id: string) => {
    if (scelti.includes(id)) onCambia(scelti.filter(x => x !== id));
    else if (!pieno) onCambia([...scelti, id]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="mz-mono" style={{ color: 'var(--ink)' }}>
          {massimo > 0 ? `Scelti ${scelti.length} / ${massimo}` : `Scelti ${scelti.length}`}
        </span>
        {pieno && <span className="text-xs text-stone-500">Per cambiarne uno, togliete prima un contesto scelto.</span>}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 entra-cascata">
        {sottoAmbiti.map(sa => (
          <div key={sa} className="rounded-2xl p-5 bg-stone-900 text-white min-h-[140px] flex flex-col justify-between">
            <span className="mz-mono" style={{ color: 'var(--accent-vivo)' }}>Il vostro sotto-ambito</span>
            <span className="text-2xl leading-tight" style={{ fontFamily: 'var(--f-display)', letterSpacing: '-.02em' }}>{sa}</span>
          </div>
        ))}
        {contesti.map((c, i) => {
          const on = scelti.includes(c.id);
          const spento = !on && pieno;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              disabled={spento}
              onClick={() => toggle(c.id)}
              className={`card-viva text-left rounded-2xl p-5 min-h-[140px] flex flex-col justify-between gap-3 border transition ${on ? 'bg-amber-100 border-amber-400' : 'bg-white border-stone-200 hover:border-stone-500'} ${spento ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <span className="flex items-center justify-between w-full">
                <span className="mz-mono">({String(i + 1).padStart(2, '0')})</span>
                <span className={`h-7 w-7 rounded-full flex items-center justify-center text-sm ${on ? 'bg-stone-900 text-white' : 'border border-stone-300 text-stone-300'}`}>{on ? '✓' : '+'}</span>
              </span>
              <span className="space-y-1">
                <span className="block text-2xl leading-tight text-stone-900" style={{ fontFamily: 'var(--f-display)', letterSpacing: '-.02em' }}>{c.titolo}</span>
                {c.descrizione && <span className="block text-sm text-stone-600">{c.descrizione}</span>}
              </span>
            </button>
          );
        })}
        {contesti.length === 0 && (
          <p className="text-sm text-stone-500 bg-white rounded-2xl border border-dashed border-stone-300 p-5">Il/la docente non ha ancora appuntato contesti in bacheca.</p>
        )}
      </div>
    </div>
  );
}
