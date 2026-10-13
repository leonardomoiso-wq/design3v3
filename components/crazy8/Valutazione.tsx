'use client';
import { useEffect, useRef, useState } from 'react';
import { MAX_DRIVER, type ChiaveDriver } from '@/lib/driver';
import type { DriverConfig } from '@/lib/corsi';
import type { TagCorso } from '@/lib/tag';
import {
  CHIAVI_DRIVER_C8, Miniatura, TestoAutosalvato, risolviVoceMoodboard,
  type Submission, type VoceMoodboard,
} from './shared';

// Fase 8: le immagini finali della moodboard vengono valutate con gli
// stessi strumenti dei casi studio (tag
// del corso e 4 driver con motivazione). Questi dati alimentano poi il
// radar del/della docente, accanto ai casi studio.

// Categorie obbligatorie del corso ancora senza una voce scelta.
export function categorieMancanti(tags: string[], tagCorso: TagCorso) {
  return tagCorso.categorie.filter(c => c.obbligatoria && c.tag.length > 0 && !c.tag.some(t => tags.includes(t.testo)));
}

export function valutazioneCompleta(v: VoceMoodboard, tagCorso: TagCorso) {
  const tags = v.tags || [];
  return tags.length > 0
    && categorieMancanti(tags, tagCorso).length === 0
    && CHIAVI_DRIVER_C8.every(k => typeof v.driver?.[k]?.valore === 'number');
}

function MiniRadar({ voce, colore = '#d97706' }: { voce: VoceMoodboard; colore?: string }) {
  const R = 46;
  const C = 60;
  const punto = (i: number, valore: number) => {
    const a = (Math.PI * 2 * i) / 4 - Math.PI / 2;
    const d = (valore / MAX_DRIVER) * R;
    return `${C + d * Math.cos(a)},${C + d * Math.sin(a)}`;
  };
  const valori = CHIAVI_DRIVER_C8.map(k => voce.driver?.[k]?.valore ?? 0);
  return (
    <svg viewBox="0 0 120 120" className="w-24 h-24" role="img" aria-label={`Profilo sui 4 driver: ${valori.join(', ')}`}>
      {[0.5, 1].map(f => <circle key={f} cx={C} cy={C} r={R * f} fill="none" stroke="#e7e5e4" />)}
      {[0, 1, 2, 3].map(i => <line key={i} x1={C} y1={C} x2={punto(i, MAX_DRIVER).split(',')[0]} y2={punto(i, MAX_DRIVER).split(',')[1]} stroke="#e7e5e4" />)}
      <polygon points={valori.map((v, i) => punto(i, v)).join(' ')} fill={colore} fillOpacity={0.25} stroke={colore} strokeWidth={2} />
    </svg>
  );
}

export default function Valutazione({
  submission, driverCorso, framework, tagCorso, onSalvaMoodboard,
}: {
  submission: Submission;
  driverCorso: DriverConfig[];
  framework: string;
  tagCorso: TagCorso;
  onSalvaMoodboard: (voci: VoceMoodboard[]) => Promise<boolean>;
}) {
  const vociValide = (submission.moodboard || []).filter(v => risolviVoceMoodboard(submission, v));
  const [voci, setVoci] = useState<VoceMoodboard[]>(vociValide);
  const [errore, setErrore] = useState('');
  const vociRef = useRef(voci);
  vociRef.current = voci;

  const firmaRemota = JSON.stringify(vociValide);
  useEffect(() => { setVoci(JSON.parse(firmaRemota)); }, [firmaRemota]);

  // applica una modifica a una sola voce, partendo sempre dall'elenco più recente
  const aggiornaVoce = async (voce: VoceMoodboard, modifica: (v: VoceMoodboard) => VoceMoodboard): Promise<boolean> => {
    const nuove = vociRef.current.map(v => (v.tipo === voce.tipo && v.id === voce.id ? modifica(v) : v));
    setVoci(nuove);
    vociRef.current = nuove;
    setErrore('');
    const ok = await onSalvaMoodboard(nuove);
    if (!ok) setErrore('Non sono riuscito a salvare la valutazione. Riprova.');
    return ok;
  };

  const impostaDriver = (voce: VoceMoodboard, chiave: ChiaveDriver, valore: number) =>
    aggiornaVoce(voce, v => ({ ...v, driver: { ...(v.driver || {}), [chiave]: { valore, nota: v.driver?.[chiave]?.nota || '' } } }));

  const impostaNota = (voce: VoceMoodboard, chiave: ChiaveDriver, nota: string) =>
    aggiornaVoce(voce, v => ({ ...v, driver: { ...(v.driver || {}), [chiave]: { valore: v.driver?.[chiave]?.valore ?? Math.round(MAX_DRIVER / 2), nota } } }));

  const toggleTag = (voce: VoceMoodboard, testo: string, esclusiviCon: string[] = []) =>
    aggiornaVoce(voce, v => {
      const attuali = v.tags || [];
      const tags = attuali.includes(testo)
        ? attuali.filter(t => t !== testo)
        : [...attuali.filter(t => !esclusiviCon.includes(t)), testo];
      return { ...v, tags };
    });

  const categorie = [
    ...tagCorso.categorie.filter(c => c.tag.length > 0),
    ...(tagCorso.senzaCategoria.length > 0
      ? [{ id: 'altri', nome: tagCorso.categorie.length > 0 ? 'Altri temi' : 'Temi', selezione: 'multipla' as const, obbligatoria: false, tag: tagCorso.senzaCategoria }]
      : []),
  ];

  const completate = voci.filter(v => valutazioneCompleta(v, tagCorso)).length;

  if (voci.length === 0) {
    return <div className="bg-white rounded-3xl border border-stone-200 p-10 text-center text-sm text-stone-500">La moodboard è vuota: tornate alla fase 7 e scegliete le immagini finali.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-stone-200 px-4 py-3">
        <p className="text-xs text-stone-600">
          Usate gli stessi criteri dei casi studio ({framework}): così le vostre idee si possono confrontare sul radar con i casi reali.
        </p>
        <span className={`text-xs font-bold ${completate === voci.length ? 'text-emerald-700' : 'text-stone-500'}`}>{completate}/{voci.length} valutate</span>
      </div>
      {errore && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-2.5">{errore}</p>}

      {voci.map((v, i) => {
        const img = risolviVoceMoodboard(submission, v);
        if (!img) return null;
        const tags = v.tags || [];
        const mancanti = categorieMancanti(tags, tagCorso);
        const completa = valutazioneCompleta(v, tagCorso);
        return (
          <section key={`${v.tipo}-${v.id}`} className={`bg-white rounded-3xl border p-5 space-y-5 ${completa ? 'border-emerald-200' : 'border-stone-200'}`}>
            <div className="grid md:grid-cols-[240px_1fr] gap-5">
              <div className="space-y-3">
                <Miniatura url={img.url} className="w-full aspect-square" />
                <div className="flex items-center gap-3">
                  <MiniRadar voce={v} />
                  <div className="text-[11px] text-stone-500 space-y-0.5">
                    <p className="font-bold text-stone-700">{i === 0 ? '★ Copertina' : `Immagine ${i + 1}`}</p>
                    <p>{img.etichetta}</p>
                    <p className={completa ? 'text-emerald-700 font-medium' : ''}>{completa ? '✓ Valutata' : 'Da completare'}</p>
                  </div>
                </div>
                {v.didascalia && <p className="text-xs text-stone-500 italic">&ldquo;{v.didascalia}&rdquo;</p>}
              </div>

              <div className="space-y-5 min-w-0">
                <TestoAutosalvato
                  etichetta="Nome dell'idea"
                  valore={v.titolo || ''}
                  righe={1}
                  placeholder="Come la chiamereste?"
                  onSalva={t => aggiornaVoce(v, x => ({ ...x, titolo: t }))}
                />

                <div className="space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Tag</p>
                  {categorie.length === 0 && <p className="text-xs text-stone-400">Il/la docente non ha ancora impostato i tag del corso.</p>}
                  {categorie.map(c => {
                    const singola = c.selezione === 'singola';
                    const manca = mancanti.some(m => m.id === c.id);
                    return (
                      <div key={c.id} className="space-y-1.5">
                        <p className="text-[11px] text-stone-500">
                          <b className="text-stone-700">{c.nome}</b>{c.obbligatoria && <span className="text-red-600"> *</span>}
                          <span className="text-stone-400"> · {singola ? 'una sola voce' : 'una o più voci'}</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {c.tag.map(t => {
                            const scelto = tags.includes(t.testo);
                            return (
                              <button
                                key={t.id}
                                type="button"
                                aria-pressed={scelto}
                                onClick={() => toggleTag(v, t.testo, singola ? c.tag.map(x => x.testo) : [])}
                                className={`text-xs px-3 py-1.5 rounded-full border transition ${scelto ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-500'} ${manca ? 'border-red-200' : ''}`}
                              >
                                {t.testo}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">I 4 driver · da 0 a {MAX_DRIVER}</p>
                  {driverCorso.map(d => {
                    const valore = v.driver?.[d.chiave]?.valore;
                    return (
                      <div key={d.chiave} className="space-y-1.5">
                        <div className="flex justify-between items-baseline gap-2">
                          <span className="text-sm font-medium text-stone-900">{d.etichetta}</span>
                          <span className="text-xs text-stone-500">{typeof valore === 'number' ? `${valore}/${MAX_DRIVER}` : '—'}</span>
                        </div>
                        {d.domanda && <p className="text-[11px] text-stone-400">{d.domanda}</p>}
                        <div role="radiogroup" aria-label={`${d.etichetta}, da 0 a ${MAX_DRIVER}`} className="flex gap-1.5">
                          {Array.from({ length: MAX_DRIVER + 1 }, (_, n) => n).map(n => (
                            <button
                              key={n}
                              type="button"
                              role="radio"
                              aria-checked={valore === n}
                              onClick={() => impostaDriver(v, d.chiave, n)}
                              className={`flex-1 py-2 rounded-xl text-sm font-bold border transition ${valore === n ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-200 text-stone-600 hover:border-stone-400'}`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                        <TestoAutosalvato
                          valore={v.driver?.[d.chiave]?.nota || ''}
                          righe={1}
                          placeholder="Perché?"
                          onSalva={t => impostaNota(v, d.chiave, t)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
