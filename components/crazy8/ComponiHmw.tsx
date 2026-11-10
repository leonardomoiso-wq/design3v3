'use client';
import { useEffect, useRef, useState } from 'react';
import { HMW_VUOTA, hmwCompleta, testoHmw, type Hmw } from './shared';

// Due domande "How Might We" composte riempiendo gli spazi della formula:
// Come potremmo [azione] per [chi] così che [risultato]?
// La formula è mostrata a blocchi (come nello schema dell'Interaction
// Design Foundation): il blocco dello spazio che si sta scrivendo si
// accende e sotto compare il consiglio per quello spazio.

type Spazio = 'azione' | 'utente' | 'risultato';

const GUIDA: Record<Spazio, { blocco: string; nota: string; consiglio: string; esempio: string }> = {
  azione: { blocco: 'Azione', nota: 'un verbo', consiglio: 'Cosa volete fare? Un verbo all\'infinito, seguito da cosa.', esempio: 'ridurre lo spreco di cibo' },
  utente: { blocco: 'Per chi', nota: 'chi ne beneficia', consiglio: 'Il più preciso possibile: non "le persone", ma chi esattamente.', esempio: 'i venditori del mercato rionale' },
  risultato: { blocco: 'Così che', nota: 'il risultato', consiglio: 'Cosa cambia per loro? L\'effetto che volete ottenere, non la soluzione.', esempio: 'gli scarti diventino una risorsa' },
};

// Un verbo all'infinito finisce in -are/-ere/-ire (o -rre, -rsi…)
const sembraVerbo = (t: string) => {
  const prima = t.trim().split(/\s+/)[0]?.toLowerCase() || '';
  return !prima || /(are|ere|ire|rre|rsi|arsi|ersi|irsi)$/.test(prima);
};

function Formula({ attivo, esempio }: { attivo: Spazio | null; esempio?: boolean }) {
  const pezzo = (testo: string) => <span className="c8-formula-fisso">{testo}</span>;
  const blocco = (s: Spazio) => (
    <span className={`c8-formula-blocco ${attivo === s ? 'acceso' : ''}`}>
      <b>{esempio ? GUIDA[s].esempio : GUIDA[s].blocco}</b>
      {!esempio && <small>{GUIDA[s].nota}</small>}
    </span>
  );
  return (
    <div className="c8-formula" aria-hidden={esempio ? undefined : true}>
      {pezzo('Come potremmo')}<i>+</i>{blocco('azione')}<i>+</i>{pezzo('per')}<i>+</i>{blocco('utente')}<i>+</i>{pezzo('così che')}<i>+</i>{blocco('risultato')}<span className="c8-formula-fisso">?</span>
    </div>
  );
}

function Campo({ valore, onCambia, spazio, onFuoco, i }: { valore: string; onCambia: (v: string) => void; spazio: Spazio; onFuoco: (s: Spazio | null) => void; i: number }) {
  return (
    <input
      value={valore}
      onChange={e => onCambia(e.target.value)}
      onFocus={() => onFuoco(spazio)}
      onBlur={() => onFuoco(null)}
      placeholder={GUIDA[spazio].nota}
      aria-label={`Domanda ${i + 1}: ${GUIDA[spazio].blocco}`}
      data-spazio={spazio}
      style={{ width: `min(100%, ${Math.max(GUIDA[spazio].nota.length, valore.length, 8) + 1}ch)` }}
      className="c8-spazio"
    />
  );
}

export default function ComponiHmw({ hmw, numero = 2, opzioniContesto, revisione, inviate, sketchSbloccati, onSalva, onInvia, onRichiediRivalutazione }: {
  onRichiediRivalutazione?: (indice: number) => Promise<boolean>;
  hmw: Hmw[];
  numero?: number;
  opzioniContesto: { id: string; etichetta: string; proprio: boolean }[];
  revisione: (('ok' | 'rivedere' | 'richiesta') | null)[];
  inviate: boolean;
  sketchSbloccati: boolean;
  onSalva: (hmw: Hmw[]) => Promise<boolean>;
  onInvia: (origine: { x: number; y: number }) => void;
}) {
  const normalizza = (h: Hmw[]) => Array.from({ length: numero }, (_, i) => ({ ...HMW_VUOTA, ...(h[i] || {}) }));
  const [bozza, setBozza] = useState<Hmw[]>(normalizza(hmw));
  const [stato, setStato] = useState<'idle' | 'salvando' | 'salvato' | 'errore'>('idle');
  const [fuoco, setFuoco] = useState<{ i: number; s: Spazio } | null>(null);
  const [mostraEsempio, setMostraEsempio] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inModifica = useRef(false);

  // aggiornamenti dagli altri dispositivi del team, se qui non si scrive
  const firma = JSON.stringify(hmw);
  useEffect(() => {
    if (!inModifica.current) { const n = normalizza(JSON.parse(firma)); ultima.current = n; setBozza(n); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, numero]);

  // Si salva sempre l'ultima versione scritta: un salvataggio partito
  // prima non deve riportare indietro quello che si è scritto nel frattempo.
  const ultima = useRef(bozza);
  const aggiorna = (i: number, patch: Partial<Hmw>) => {
    inModifica.current = true;
    const nuove = ultima.current.map((h, j) => (j === i ? { ...h, ...patch } : h));
    ultima.current = nuove;
    setBozza(nuove);
    setStato('idle');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      timer.current = null;
      setStato('salvando');
      const ok = await onSalva(ultima.current);
      setStato(ok ? 'salvato' : 'errore');
      if (!timer.current) inModifica.current = false;
    }, 900);
  };

  const completa = (h: Hmw) => hmwCompleta(h) && !!h.contesto;
  const pronte = bozza.some(completa);
  const incomplete = bozza.map((h, i) => (completa(h) ? -1 : i)).filter(i => i >= 0);
  const [chiesta, setChiesta] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      {/* La formula, a blocchi */}
      <section className="c8-formula-guida mz-in">
        <Formula attivo={fuoco?.s || null} />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="mz-pill sm ghost" onClick={() => setMostraEsempio(v => !v)} aria-expanded={mostraEsempio}>
            {mostraEsempio ? 'Nascondi l\'esempio' : 'Vedi un esempio'}
          </button>
          {mostraEsempio && <span className="text-sm text-stone-600 entra-sezione">«Come potremmo <b>ridurre lo spreco di cibo</b> per <b>i venditori del mercato rionale</b> così che <b>gli scarti diventino una risorsa</b>?»</span>}
        </div>
      </section>

      {bozza.map((h, i) => {
        const rev = revisione[i] || null;
        const consiglio = fuoco && fuoco.i === i ? GUIDA[fuoco.s].consiglio : null;
        const avvisoVerbo = h.azione.trim() && !sembraVerbo(h.azione);
        return (
          <section key={i} className={`c8-domanda ${rev === 'ok' ? 'ok' : rev === 'rivedere' ? 'rivedere' : ''} ${inviate && !completa(h) ? 'incompleta' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="mz-mono" style={{ color: 'var(--ink)' }}>Domanda ({String(i + 1).padStart(2, '0')})</span>
              {inviate && (
                <span className="flex flex-wrap items-center gap-1.5">
                  {rev === 'rivedere' && onRichiediRivalutazione && (
                    <button type="button" className="mz-pill sm o" disabled={chiesta === i}
                      onClick={async () => { setChiesta(i); await onRichiediRivalutazione(i); setChiesta(null); }}>
                      {chiesta === i ? 'Un momento…' : 'Ritoccata: rileggetela ↻'}
                    </button>
                  )}
                  <span className={`text-xs font-medium px-3 py-1 rounded-full ${!completa(h) ? 'bg-stone-100 text-stone-500' : rev === 'ok' ? 'bg-emerald-50 text-emerald-800' : rev === 'rivedere' ? 'bg-red-50 text-red-800' : rev === 'richiesta' ? 'bg-amber-50 text-amber-900' : 'bg-stone-100 text-stone-600'}`}>
                    {!completa(h) ? 'Da completare' : rev === 'ok' ? '✓ Chiara' : rev === 'rivedere' ? 'Da ritoccare' : rev === 'richiesta' ? '↻ Da rileggere' : 'La stiamo leggendo'}
                  </span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Contesto della domanda ${i + 1}`}>
              {opzioniContesto.map(c => (
                <button key={c.id} type="button" role="radio" aria-checked={h.contesto === c.id} className={`mz-chip ${h.contesto === c.id ? 'on' : ''}`} onClick={() => aggiorna(i, { contesto: c.id })}>
                  {c.etichetta}
                </button>
              ))}
            </div>

            <p className="c8-frase">
              Come potremmo{' '}
              <Campo i={i} spazio="azione" valore={h.azione} onCambia={v => aggiorna(i, { azione: v })} onFuoco={s => setFuoco(s ? { i, s } : null)} />{' '}
              per{' '}
              <Campo i={i} spazio="utente" valore={h.utente} onCambia={v => aggiorna(i, { utente: v })} onFuoco={s => setFuoco(s ? { i, s } : null)} />{' '}
              così che{' '}
              <Campo i={i} spazio="risultato" valore={h.risultato} onCambia={v => aggiorna(i, { risultato: v })} onFuoco={s => setFuoco(s ? { i, s } : null)} />?
            </p>

            <p className="c8-suggerimento" aria-live="polite">
              {avvisoVerbo ? <span className="text-amber-800">L&apos;azione inizia meglio con un verbo all&apos;infinito: «ridurre», «aiutare», «trasformare»…</span>
                : consiglio ? <span className="text-stone-500">{consiglio}</span>
                  : hmwCompleta(h) ? <span className="text-stone-500 italic">{testoHmw(h)}</span> : null}
            </p>
          </section>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-stone-400" aria-live="polite">
          {stato === 'salvando' ? 'Salvo…' : stato === 'salvato' ? '✓ Salvato' : stato === 'errore' ? <span className="text-red-600">Non salvato, riprovate</span> : ''}
        </span>
        {!inviate ? (
          <span className="flex flex-col items-end gap-1">
            {pronte && incomplete.length > 0 && (
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {incomplete.length === 1 ? `La domanda ${incomplete[0] + 1} non è completa: potete inviare le altre e finirla dopo.` : `Le domande ${incomplete.map(i => i + 1).join(' e ')} non sono complete: potete inviare le altre e finirle dopo.`}
              </span>
            )}
            <button type="button" className="mz-pill b lg" disabled={!pronte} onClick={e => onInvia({ x: e.clientX, y: e.clientY })}>{incomplete.length > 0 && pronte ? 'Inviate quelle pronte →' : 'Inviate le domande →'}</button>
          </span>
        ) : !sketchSbloccati ? (
          <p className="text-sm text-stone-600 m-0"><span className="mz-live-dot inline-block mr-2 align-middle" />Le stiamo leggendo insieme in aula. Intanto potete ancora perfezionarle.</p>
        ) : null}
      </div>
    </div>
  );
}
