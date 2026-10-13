'use client';
import { useEffect, useState } from 'react';
import { MoodboardGriglia } from './Moodboard';
import type { ChiaveDriver } from '@/lib/driver';
import { CHIAVI_DRIVER_C8, MIN_MOODBOARD, risolviVoceMoodboard, sottoAmbitiDi, visioniDi, type Submission } from './shared';

type EtichettaDriver = (k: ChiaveDriver) => string;

// Domande per aprire la discussione dopo ogni presentazione
const DOMANDE_CRITICHE = [
  'Cosa vi convince di più di questo concept?',
  'Chi ne avrebbe vantaggio, e chi potrebbe restarne fuori?',
  'Quale cambiamento di oggi lo rende credibile?',
  'Cosa cambiereste voi?',
];

// I sotto-ambiti del team: cosa sta cambiando oggi → come potrebbe essere
function SchedaScenario({ s, scuro = false }: { s: Submission; scuro?: boolean }) {
  const voci = visioniDi(s);
  if (voci.length === 0) return null;
  const orizzonte = s.scenario?.orizzonte;
  return (
    <div className={`rounded-2xl p-4 space-y-3 ${scuro ? 'bg-amber-400/10 border border-amber-400/30' : 'bg-amber-50 border border-amber-200'}`}>
      <p className={`text-[10px] font-bold uppercase tracking-widest ${scuro ? 'text-amber-300' : 'text-amber-800'}`}>
        I sotto-ambiti{orizzonte ? ` · verso il ${orizzonte}` : ''}
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {voci.map(v => (
          <div key={v.sottoAmbito || 'unico'} className="space-y-0.5">
            {v.sottoAmbito && <p className={`text-xs font-bold ${scuro ? 'text-white' : 'text-stone-900'}`}>{v.sottoAmbito}</p>}
            {v.segnale && <p className={`text-xs ${scuro ? 'text-stone-400' : 'text-stone-500'}`}>Oggi: {v.segnale}</p>}
            {v.visione && <p className={`text-sm leading-snug ${scuro ? 'text-stone-200' : 'text-stone-800'}`}>→ {v.visione}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Profilo medio del concept sui 4 driver, dalle immagini valutate
function ProfiloDriver({ s, etichettaDriver, scuro = false }: { s: Submission; etichettaDriver: EtichettaDriver; scuro?: boolean }) {
  const voci = (s.moodboard || []).filter(v => v.driver && risolviVoceMoodboard(s, v));
  if (voci.length === 0) return null;
  const tags = Array.from(new Set(voci.flatMap(v => v.tags || [])));
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {CHIAVI_DRIVER_C8.map(k => {
          const valori = voci.map(v => v.driver?.[k]?.valore).filter((x): x is number => typeof x === 'number');
          const media = valori.length ? valori.reduce((a, b) => a + b, 0) / valori.length : 0;
          return (
            <div key={k} className="text-xs">
              <div className="flex justify-between"><span className={scuro ? 'text-stone-400' : 'text-stone-500'}>{etichettaDriver(k)}</span><b className={scuro ? 'text-white' : 'text-stone-900'}>{media.toFixed(1)}</b></div>
              <div className={`h-1.5 rounded-full overflow-hidden ${scuro ? 'bg-stone-800' : 'bg-stone-100'}`}>
                <div className={`h-full rounded-full ${scuro ? 'bg-amber-400' : 'bg-stone-900'}`} style={{ width: `${(media / 5) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map(t => <span key={t} className={`text-[10px] px-2 py-0.5 rounded-full border ${scuro ? 'border-stone-700 text-stone-300' : 'border-stone-200 text-stone-600'}`}>{t}</span>)}
        </div>
      )}
    </div>
  );
}

// Modalità share: ogni team presenta la propria moodboard e motiva le
// scelte. La traccia "1. concept · 2. caratteristiche · 3. perché" è
// sempre visibile, così chi presenta ha una scaletta e chi ascolta sa
// cosa aspettarsi.

const contaImmagini = (s: Submission) => (s.moodboard || []).filter(v => risolviVoceMoodboard(s, v)).length;

function SchedaConcept({ s, scuro = false }: { s: Submission; scuro?: boolean }) {
  const testo = scuro ? 'text-stone-300' : 'text-stone-600';
  const etichetta = scuro ? 'text-stone-500' : 'text-stone-400';
  const blocchi = [
    { n: 1, titolo: 'Il concept', contenuto: s.concept_titolo },
    { n: 2, titolo: 'Caratteristiche', contenuto: s.concept_descrizione },
    { n: 3, titolo: 'Perché queste scelte', contenuto: s.concept_motivazioni },
  ];
  return (
    <div className="space-y-4">
      {blocchi.map(b => (
        <div key={b.n}>
          <p className={`text-[10px] font-bold uppercase tracking-widest ${etichetta}`}>
            <span className={`inline-flex items-center justify-center h-4 w-4 rounded-full mr-1.5 text-[9px] ${scuro ? 'bg-amber-400 text-stone-900' : 'bg-stone-900 text-white'}`}>{b.n}</span>
            {b.titolo}
          </p>
          <p className={`text-sm leading-relaxed mt-1 whitespace-pre-line ${b.n === 1 ? (scuro ? 'text-white font-bold text-lg' : 'text-stone-900 font-bold text-lg') : testo}`}>
            {b.contenuto?.trim() || <span className="italic opacity-60">—</span>}
          </p>
        </div>
      ))}
    </div>
  );
}

function Presentazione({ elenco, indiceIniziale, onChiudi, etichettaDriver }: { elenco: Submission[]; indiceIniziale: number; onChiudi: () => void; etichettaDriver: EtichettaDriver }) {
  const [indice, setIndice] = useState(indiceIniziale);
  const s = elenco[indice];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChiudi();
      if (e.key === 'ArrowRight') setIndice(i => Math.min(elenco.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndice(i => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [elenco.length, onChiudi]);

  if (!s) return null;

  return (
    <div className="fixed inset-0 z-50 bg-stone-950 text-white overflow-y-auto animate-fade-in" role="dialog" aria-modal="true" aria-label="Presentazione dei concept">
      <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 sticky top-0 bg-stone-950/95 backdrop-blur z-10">
        <span className="text-xs uppercase tracking-widest text-stone-400">
          Gruppo {s.gruppo_num} — {s.gruppo_nome} · {indice + 1}/{elenco.length}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => setIndice(i => Math.max(0, i - 1))} disabled={indice === 0} className="h-9 w-9 rounded-full bg-stone-800 hover:bg-stone-700 disabled:opacity-30" aria-label="Team precedente">‹</button>
          <button onClick={() => setIndice(i => Math.min(elenco.length - 1, i + 1))} disabled={indice === elenco.length - 1} className="h-9 w-9 rounded-full bg-stone-800 hover:bg-stone-700 disabled:opacity-30" aria-label="Team successivo">›</button>
          <button onClick={onChiudi} className="ml-2 text-stone-400 hover:text-white text-2xl leading-none" aria-label="Chiudi">✕</button>
        </div>
      </div>
      <div key={s.id} className="max-w-7xl mx-auto px-6 py-8 grid lg:grid-cols-[minmax(0,1fr)_340px] gap-8 animate-fade-in-up">
        <div className="space-y-4 min-w-0">
          <div className="flex flex-wrap gap-1.5">
            {sottoAmbitiDi(s).map(x => <span key={x} className="text-[11px] border border-amber-400/40 text-amber-300 px-2.5 py-1 rounded-full">{x}</span>)}
          </div>
          <SchedaScenario s={s} scuro />
          <MoodboardGriglia submission={s} scuro grande />
        </div>
        <aside className="lg:sticky lg:top-24 self-start space-y-4">
          <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 space-y-5">
            <SchedaConcept s={s} scuro />
            <ProfiloDriver s={s} etichettaDriver={etichettaDriver} scuro />
          </div>
          <div className="bg-stone-900/60 border border-stone-800 rounded-3xl p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">Domande per la classe</p>
            <ul className="text-xs text-stone-300 space-y-1.5 list-disc list-inside">
              {DOMANDE_CRITICHE.map(d => <li key={d}>{d}</li>)}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function Share({ submissions, propriaId, etichettaDriver }: { submissions: Submission[]; propriaId: string | null; etichettaDriver: EtichettaDriver }) {
  const [presentaDa, setPresentaDa] = useState<number | null>(null);
  // si mostrano solo i team che hanno già una moodboard; il proprio per primo
  const elenco = submissions
    .filter(s => contaImmagini(s) > 0)
    .sort((a, b) => (a.id === propriaId ? -1 : b.id === propriaId ? 1 : a.gruppo_num - b.gruppo_num));
  const propria = elenco.find(s => s.id === propriaId) || null;

  return (
    <div className="space-y-8">
      {propria ? (
        <section className="bg-white rounded-3xl border border-stone-200 p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Il vostro concept</p>
              <h3 className="text-xl font-serif font-bold">{propria.concept_titolo || 'Senza titolo'}</h3>
            </div>
            <button onClick={() => setPresentaDa(0)} className="bg-stone-900 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-stone-800 transition">
              ▶ Presenta a schermo intero
            </button>
          </div>
          {contaImmagini(propria) < MIN_MOODBOARD && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5">La moodboard ha meno di {MIN_MOODBOARD} immagini: completatela nella fase 7 prima di presentare.</p>
          )}
          <SchedaScenario s={propria} />
          <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-6">
            <MoodboardGriglia submission={propria} />
            <div className="bg-stone-50 rounded-2xl border border-stone-100 p-5 space-y-5">
              <SchedaConcept s={propria} />
              <ProfiloDriver s={propria} etichettaDriver={etichettaDriver} />
            </div>
          </div>
          <div className="text-xs text-stone-500 bg-stone-50 rounded-xl p-3 border border-stone-100">
            <b className="text-stone-700">Traccia per la presentazione (2-3 minuti):</b> 1) i sotto-ambiti: cosa sta cambiando e come potrebbe essere ·
            2) il concept, immagine per immagine · 3) perché queste scelte, cosa avete scartato e come le avete valutate. Chiudete con una domanda alla classe.
          </div>
        </section>
      ) : (
        <div className="bg-white rounded-3xl border border-stone-200 p-8 text-center text-sm text-stone-500">
          La vostra moodboard è ancora vuota: componetela nella fase 7 per presentarla qui.
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-500">I concept di tutti i team ({elenco.length})</h3>
          {elenco.length > 0 && (
            <button onClick={() => setPresentaDa(0)} className="text-xs text-stone-500 hover:text-stone-900">Presenta tutti in sequenza →</button>
          )}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {elenco.map((s, i) => {
            const copertina = s.moodboard?.map(v => risolviVoceMoodboard(s, v)).find(Boolean);
            return (
              <button key={s.id} onClick={() => setPresentaDa(i)} className="text-left bg-white rounded-2xl border border-stone-200 overflow-hidden hover:border-stone-500 transition group">
                <div className="h-40 bg-stone-50 flex items-center justify-center overflow-hidden">
                  {copertina && <img src={copertina.url} alt="" loading="lazy" decoding="async" className="max-w-full max-h-full object-contain group-hover:scale-105 transition" />}
                </div>
                <div className="p-3">
                  <p className="text-sm font-bold text-stone-900 truncate">{s.concept_titolo || 'Concept senza titolo'}</p>
                  <p className="text-xs text-stone-500 truncate">Gruppo {s.gruppo_num} — {s.gruppo_nome}{s.id === propriaId ? ' · voi' : ''}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {presentaDa !== null && <Presentazione elenco={elenco} indiceIniziale={presentaDa} onChiudi={() => setPresentaDa(null)} etichettaDriver={etichettaDriver} />}
    </div>
  );
}
