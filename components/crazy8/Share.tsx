'use client';
import { useEffect, useState } from 'react';
import { MoodboardGriglia } from './Moodboard';
import { MIN_MOODBOARD, risolviVoceMoodboard, sottoAmbitiDi, type Submission } from './shared';

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

function Presentazione({ elenco, indiceIniziale, onChiudi }: { elenco: Submission[]; indiceIniziale: number; onChiudi: () => void }) {
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
          <MoodboardGriglia submission={s} scuro grande />
        </div>
        <aside className="lg:sticky lg:top-24 self-start bg-stone-900 border border-stone-800 rounded-3xl p-6">
          <SchedaConcept s={s} scuro />
        </aside>
      </div>
    </div>
  );
}

export default function Share({ submissions, propriaId }: { submissions: Submission[]; propriaId: string | null }) {
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
          <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-6">
            <MoodboardGriglia submission={propria} />
            <div className="bg-stone-50 rounded-2xl border border-stone-100 p-5">
              <SchedaConcept s={propria} />
            </div>
          </div>
          <div className="text-xs text-stone-500 bg-stone-50 rounded-xl p-3 border border-stone-100">
            <b className="text-stone-700">Traccia per la presentazione (2-3 minuti):</b> 1) il nome del concept e il sotto-ambito · 2) le caratteristiche,
            immagine per immagine · 3) perché queste scelte, e cosa avete scartato lungo le iterazioni.
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

      {presentaDa !== null && <Presentazione elenco={elenco} indiceIniziale={presentaDa} onChiudi={() => setPresentaDa(null)} />}
    </div>
  );
}
