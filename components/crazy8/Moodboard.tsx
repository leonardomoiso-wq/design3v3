'use client';
import { useEffect, useRef, useState } from 'react';
import Sep from '@/components/Sep';
import {
  MAX_MOODBOARD, MIN_MOODBOARD, Miniatura, TestoAutosalvato, risolviVoceMoodboard, sottoAmbitiDi,
  type Submission, type VoceMoodboard,
} from './shared';

// Griglia "editoriale" della moodboard: la prima immagine è la copertina
// del concept (più grande), le altre la accompagnano. Usata sia in
// anteprima nell'editor sia nella modalità share (anche a tutto schermo).
export function MoodboardGriglia({ submission, scuro = false, grande = false }: { submission: Submission; scuro?: boolean; grande?: boolean }) {
  const voci = (submission.moodboard || [])
    .map(v => ({ voce: v, img: risolviVoceMoodboard(submission, v) }))
    .filter(x => x.img) as { voce: VoceMoodboard; img: NonNullable<ReturnType<typeof risolviVoceMoodboard>> }[];

  if (voci.length === 0) {
    return <p className={`text-sm ${scuro ? 'text-stone-500' : 'text-stone-400'}`}>Moodboard ancora vuota.</p>;
  }

  const sfondo = scuro ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-200';
  const didascalia = scuro ? 'text-stone-300' : 'text-stone-600';
  const altezzaCopertina = grande ? 'min-h-[40vh] sm:min-h-[55vh]' : 'min-h-[220px] sm:min-h-[320px]';
  const altezzaAltre = grande ? 'h-40 sm:h-[26vh]' : 'h-32 sm:h-40';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {voci.map(({ voce, img }, i) => (
        <figure
          key={`${voce.tipo}-${voce.id}`}
          className={`rounded-2xl border overflow-hidden flex flex-col ${sfondo} ${i === 0 ? 'col-span-2 sm:row-span-2' : ''}`}
        >
          <div className={`zoom-cornice flex-1 flex items-center justify-center ${scuro ? 'bg-stone-950' : 'bg-stone-50'} ${i === 0 ? altezzaCopertina : altezzaAltre}`}>
            <img src={img.url} alt={voce.didascalia || img.etichetta} loading="lazy" decoding="async" className="max-w-full max-h-full object-contain" />
          </div>
          {(voce.didascalia || img.sottoAmbito || voce.titolo) && (
            <figcaption className={`px-3 py-2 text-xs leading-snug ${didascalia}`}>
              {img.sottoAmbito && <span className={`block text-[9px] font-bold uppercase tracking-widest mb-0.5 ${scuro ? 'text-amber-400' : 'text-amber-700'}`}>{img.sottoAmbito}</span>}
              {voce.titolo && <span className={`block font-bold ${scuro ? 'text-white' : 'text-stone-900'}`}>{voce.titolo}</span>}
              {voce.didascalia}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}

export function MoodboardEditor({
  submission, onSalvaMoodboard, onSalvaCampo,
}: {
  submission: Submission;
  onSalvaMoodboard: (voci: VoceMoodboard[]) => Promise<boolean>;
  onSalvaCampo: (campo: 'concept_titolo' | 'concept_descrizione' | 'concept_motivazioni', valore: string) => Promise<boolean>;
}) {
  // le voci che puntano a immagini nel frattempo eliminate vengono scartate
  const vociValide = (submission.moodboard || []).filter(v => risolviVoceMoodboard(submission, v));
  const [voci, setVoci] = useState<VoceMoodboard[]>(vociValide);
  const [errore, setErrore] = useState('');
  const [filtro, setFiltro] = useState<'tutte' | 'sketch' | 'generata'>('tutte');
  // l'autosalvataggio delle didascalie scatta in ritardo: lavora sempre
  // sull'elenco più recente, non su quello del render in cui è partito
  const vociRef = useRef(voci);
  vociRef.current = voci;

  // sincronizza con modifiche arrivate dagli altri dispositivi del team
  const firmaRemota = JSON.stringify(vociValide);
  useEffect(() => {
    setVoci(JSON.parse(firmaRemota));
  }, [firmaRemota]);

  const salva = async (nuove: VoceMoodboard[]) => {
    const precedenti = voci;
    setVoci(nuove);
    setErrore('');
    const ok = await onSalvaMoodboard(nuove);
    if (!ok) {
      setVoci(precedenti);
      setErrore('Non sono riuscito a salvare la moodboard. Riprova.');
    }
  };

  const presente = (tipo: VoceMoodboard['tipo'], id: string) => voci.some(v => v.tipo === tipo && v.id === id);

  const toggle = (tipo: VoceMoodboard['tipo'], id: string) => {
    if (presente(tipo, id)) {
      salva(voci.filter(v => !(v.tipo === tipo && v.id === id)));
    } else if (voci.length < MAX_MOODBOARD) {
      salva([...voci, { tipo, id, didascalia: '' }]);
    } else {
      setErrore(`La moodboard ha già ${MAX_MOODBOARD} immagini: toglietene una per aggiungerne un'altra.`);
    }
  };

  const sposta = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= voci.length) return;
    const nuove = voci.slice();
    [nuove[i], nuove[j]] = [nuove[j], nuove[i]];
    salva(nuove);
  };

  const aggiornaDidascalia = async (voce: VoceMoodboard, testo: string) => {
    const nuove = vociRef.current.map(v => (v.tipo === voce.tipo && v.id === voce.id ? { ...v, didascalia: testo } : v));
    setVoci(nuove);
    return onSalvaMoodboard(nuove);
  };

  // tutte le immagini disponibili: sketch selezionati (o tutti, se nessuno
  // lo è) e le immagini generate a partire da ciascuno
  const sketchDisponibili = submission.immagini.some(s => s.selezionato) ? submission.immagini.filter(s => s.selezionato) : submission.immagini;
  const disponibili = sketchDisponibili.flatMap(s => [
    { tipo: 'sketch' as const, id: s.id, url: s.url_file, etichetta: `Sketch ${s.ordine + 1}`, sottoAmbito: s.sotto_ambito },
    ...s.generazioni_crazy8.map(g => ({ tipo: 'generata' as const, id: g.id, url: g.url_immagine, etichetta: `Sketch ${s.ordine + 1}, round ${g.ordine}`, sottoAmbito: s.sotto_ambito })),
  ]).filter(x => filtro === 'tutte' || x.tipo === filtro);

  const sottoAmbiti = sottoAmbitiDi(submission);

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-6 items-start">
        {/* Archivio immagini */}
        <section className="bg-white rounded-3xl border border-stone-200 p-5 space-y-3 lg:sticky lg:top-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Le vostre immagini</h3>
            <div className="flex gap-1">
              {(['tutte', 'generata', 'sketch'] as const).map(f => (
                <button key={f} type="button" onClick={() => setFiltro(f)} className={`text-[11px] px-2.5 py-1 rounded-full transition ${filtro === f ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>
                  {f === 'tutte' ? 'Tutte' : f === 'generata' ? 'Generate' : 'Sketch'}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-stone-500">Cliccate per aggiungere o togliere. {voci.length}/{MAX_MOODBOARD} scelte.</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto pr-1">
            {disponibili.map(d => {
              const scelta = presente(d.tipo, d.id);
              const pos = voci.findIndex(v => v.tipo === d.tipo && v.id === d.id);
              return (
                <button
                  key={`${d.tipo}-${d.id}`}
                  type="button"
                  onClick={() => toggle(d.tipo, d.id)}
                  aria-pressed={scelta}
                  title={d.etichetta}
                  className={`relative aspect-square rounded-xl border overflow-hidden bg-stone-50 flex items-center justify-center transition ${scelta ? 'border-amber-500 ring-2 ring-amber-500' : 'border-stone-200 hover:border-stone-500'}`}
                >
                  <img src={d.url} alt={d.etichetta} loading="lazy" decoding="async" className="max-w-full max-h-full object-contain" />
                  {scelta && <span className="absolute top-1 right-1 h-5 w-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">{pos + 1}</span>}
                  {d.tipo === 'sketch' && <span className="absolute bottom-1 left-1 text-[8px] uppercase tracking-widest bg-white/90 text-stone-600 px-1 rounded">sketch</span>}
                </button>
              );
            })}
            {disponibili.length === 0 && <p className="col-span-full text-xs text-stone-400">Nessuna immagine disponibile.</p>}
          </div>
        </section>

        {/* Composizione */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Composizione</h3>
            <span className={`text-[11px] font-medium ${voci.length >= MIN_MOODBOARD ? 'text-emerald-700' : 'text-stone-400'}`}>
              {voci.length >= MIN_MOODBOARD ? '✓ Moodboard completa' : `Ancora ${MIN_MOODBOARD - voci.length} immagin${MIN_MOODBOARD - voci.length === 1 ? 'e' : 'i'}`}
            </span>
          </div>
          {errore && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-2.5">{errore}</p>}
          {voci.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-stone-300 p-10 text-center text-sm text-stone-400">
              Scegliete 4-5 immagini dall&apos;archivio. La prima sarà la copertina del concept.
            </div>
          ) : (
            <div className="space-y-2">
              {voci.map((v, i) => {
                const img = risolviVoceMoodboard(submission, v);
                if (!img) return null;
                return (
                  <div key={`${v.tipo}-${v.id}`} className={`bg-white rounded-2xl border p-3 flex gap-3 items-start ${i === 0 ? 'border-amber-300' : 'border-stone-200'}`}>
                    <Miniatura url={img.url} className={i === 0 ? 'w-24 h-24 flex-shrink-0' : 'w-16 h-16 flex-shrink-0'} />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                        {i === 0 ? '★ Copertina' : `Immagine ${i + 1}`}<Sep />{img.etichetta}
                      </p>
                      <TestoAutosalvato
                        key={`${v.tipo}-${v.id}`}
                        valore={v.didascalia}
                        righe={2}
                        placeholder="Didascalia: cosa racconta questa immagine del concept?"
                        onSalva={t => aggiornaDidascalia(v, t)}
                      />
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button type="button" onClick={() => sposta(i, -1)} disabled={i === 0} className="text-stone-400 hover:text-stone-900 disabled:opacity-20 text-sm px-1" aria-label="Sposta su">↑</button>
                      <button type="button" onClick={() => sposta(i, 1)} disabled={i === voci.length - 1} className="text-stone-400 hover:text-stone-900 disabled:opacity-20 text-sm px-1" aria-label="Sposta giù">↓</button>
                      <button type="button" onClick={() => toggle(v.tipo, v.id)} className="text-stone-300 hover:text-red-600 text-sm px-1" aria-label="Rimuovi dalla moodboard">✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="bg-white rounded-3xl border border-stone-200 p-5 space-y-4">
        <h3 className="text-sm font-bold text-stone-900">Il concept in parole</h3>
        {sottoAmbiti.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {sottoAmbiti.map(s => <span key={s} className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-1 rounded-full">{s}</span>)}
          </div>
        )}
        <TestoAutosalvato etichetta="Nome del concept" valore={submission.concept_titolo} righe={1} placeholder="Un titolo breve e memorabile" onSalva={t => onSalvaCampo('concept_titolo', t)} />
        <TestoAutosalvato etichetta="Caratteristiche del concept" valore={submission.concept_descrizione} righe={3} placeholder="Cos'è, come funziona, per chi è, cosa lo rende diverso…" onSalva={t => onSalvaCampo('concept_descrizione', t)} />
        <TestoAutosalvato etichetta="Perché queste scelte" valore={submission.concept_motivazioni} righe={3} placeholder="Perché queste immagini, questi materiali, questa atmosfera? Cosa avete scartato e perché?" onSalva={t => onSalvaCampo('concept_motivazioni', t)} />
      </section>

      {voci.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Anteprima</h3>
          <MoodboardGriglia submission={{ ...submission, moodboard: voci }} />
        </section>
      )}
    </div>
  );
}
