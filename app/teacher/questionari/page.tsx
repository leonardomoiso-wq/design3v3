'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useDocente } from '@/lib/docente-context';
import { QR } from '@/components/moiso/QR';
import { MODULI, SCALA, colonne, componi, domandePredefinite, type Risposte } from '@/lib/questionari';
import { scaricaCsv, slugCsv } from '@/lib/csv';

// Questionari anonimi del corso: si compongono scegliendo le domande
// (non tutte le classi fanno tutte le attività), si aprono, si inoltra il
// link e si leggono i risultati.

type Q = { id: string; titolo: string; intro: string | null; domande: string[]; aperto: boolean; created_at: string; risposte: number };
type RigaRisposta = { id: string; risposte: Risposte; created_at: string; updated_at: string };

const due = (n: number) => String(n).padStart(2, '0');
const linkDi = (id: string) => (typeof window === 'undefined' ? '' : `${window.location.origin}/questionario?q=${id}`);

export default function QuestionariDocente() {
  const { passcode, corso } = useDocente();
  const [lista, setLista] = useState<Q[] | null>(null);
  const [tipiCorso, setTipiCorso] = useState<string[]>([]);
  const [modifica, setModifica] = useState<Partial<Q> | null>(null);
  const [risultatiDi, setRisultatiDi] = useState<string | null>(null);
  const [qrDi, setQrDi] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [errore, setErrore] = useState('');

  const carica = async () => {
    const { data, error } = await supabase.rpc('docente_questionari', { p_corso_id: corso.id, p_passcode: passcode });
    if (error) { setErrore('Questionari non disponibili: esegui la migrazione 20261027_questionari.sql nel SQL Editor.'); setLista([]); return; }
    setErrore('');
    setLista(((data || []) as any[]).map(r => ({ ...r, risposte: Number(r.risposte) })));
  };
  useEffect(() => {
    carica();
    supabase.from('attivita').select('tipo').eq('corso_id', corso.id).then(({ data }) => setTipiCorso(Array.from(new Set((data || []).map((a: any) => a.tipo)))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corso.id]);

  const avvisa = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 2500); };

  const salva = async (q: Partial<Q>) => {
    const { error } = await supabase.rpc('docente_salva_questionario', {
      p_corso_id: corso.id, p_passcode: passcode, p_id: q.id || null,
      p_titolo: q.titolo || '', p_intro: q.intro || '', p_domande: q.domande || [], p_aperto: !!q.aperto,
    });
    if (error) { avvisa(error.message === 'titolo_mancante' ? 'Scrivi un titolo.' : 'Non salvato.'); return false; }
    await carica();
    return true;
  };

  const copia = async (id: string) => {
    const link = linkDi(id);
    try { await navigator.clipboard.writeText(link); avvisa('Link copiato'); } catch { window.prompt('Copia il link:', link); }
  };

  const elimina = async (q: Q) => {
    if (!window.confirm(`Eliminare «${q.titolo}» e le sue ${q.risposte} risposte? Non si può annullare.`)) return;
    await supabase.rpc('docente_elimina_questionario', { p_corso_id: corso.id, p_passcode: passcode, p_id: q.id });
    if (risultatiDi === q.id) setRisultatiDi(null);
    carica();
  };

  const nuovo = () => setModifica({ titolo: `Com'è andata: ${corso.nome}`, intro: '', domande: domandePredefinite(tipiCorso), aperto: false });

  return (
    <div className="mz flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
      <div className="c8-doc-testata">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className="mz-display" style={{ fontSize: 'clamp(40px, 5vw, 72px)', margin: 0 }}>Questionari<span className="mz-sup">({due(lista?.length || 0)})</span></h1>
            <p className="text-sm m-0" style={{ color: 'var(--muted)', maxWidth: '62ch' }}>Anonimi: si compilano da un link, senza accedere al corso, e non salvano nome né team. Scegli le domande in base alle attività fatte con questa classe.</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {msg && <span className="mz-mono" role="status">{msg}</span>}
            <button type="button" className="mz-pill b" onClick={nuovo} disabled={!!errore}>+ Nuovo questionario</button>
          </div>
        </div>
      </div>

      <div className="px-[max(20px,2vw)] py-6 space-y-6" style={{ maxWidth: 1180 }}>
        {errore && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 m-0">{errore}</p>}

        {modifica && <Editor q={modifica} onAnnulla={() => setModifica(null)} onSalva={async q => { if (await salva(q)) { setModifica(null); avvisa('Salvato'); } }} />}

        {lista && lista.length === 0 && !modifica && !errore && (
          <div className="q-vuoto">
            <p className="mz-display m-0" style={{ fontSize: 32 }}>Nessun questionario per {corso.nome}</p>
            <p className="m-0" style={{ color: 'var(--muted)' }}>Creane uno: proponiamo le domande delle attività presenti nel corso, poi puoi togliere quelle che non ti servono.</p>
            <div><button type="button" className="mz-pill b" onClick={nuovo}>+ Nuovo questionario</button></div>
          </div>
        )}

        {lista?.map(q => (
          <article key={q.id} className="q-scheda">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <span className={`c8-badge ${q.aperto ? 'verde' : ''}`}>{q.aperto ? '● Aperto' : 'Chiuso'}</span>
                <h2 className="mz-display" style={{ fontSize: 'clamp(26px, 2.6vw, 36px)', margin: '6px 0 0', lineHeight: 1.05 }}>{q.titolo}</h2>
                <p className="text-sm m-0" style={{ color: 'var(--muted)' }}>{q.domande.length} domande · <b style={{ color: 'var(--ink)' }}>{q.risposte}</b> {q.risposte === 1 ? 'risposta' : 'risposte'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={`mz-pill sm ${q.aperto ? 'o' : 'b'}`} onClick={() => salva({ ...q, aperto: !q.aperto }).then(ok => ok && avvisa(q.aperto ? 'Chiuso' : 'Aperto: ora accetta risposte'))}>{q.aperto ? 'Chiudi' : 'Apri'}</button>
                <button type="button" className="mz-pill sm o" onClick={() => setModifica(q)}>Modifica</button>
                <button type="button" className="mz-pill sm o" onClick={() => setRisultatiDi(risultatiDi === q.id ? null : q.id)} aria-expanded={risultatiDi === q.id}>{risultatiDi === q.id ? 'Nascondi i risultati' : 'Risultati'}</button>
                <button type="button" className="mz-pill sm ghost danger" onClick={() => elimina(q)}>Elimina</button>
              </div>
            </div>
            <div className="q-link">
              <code className="mz-mono" style={{ textTransform: 'none', letterSpacing: 0, overflowWrap: 'anywhere' }}>{linkDi(q.id)}</code>
              <div className="flex gap-2">
                <button type="button" className="mz-pill sm o" onClick={() => copia(q.id)}>Copia il link</button>
                <button type="button" className="mz-pill sm o" onClick={() => setQrDi(qrDi === q.id ? null : q.id)}>{qrDi === q.id ? 'Nascondi il QR' : 'QR'}</button>
                <a className="mz-pill sm ghost" href={linkDi(q.id)} target="_blank" rel="noreferrer">Apri ↗</a>
              </div>
            </div>
            {qrDi === q.id && <div className="q-qr entra-sezione"><QR testo={linkDi(q.id)} dimensione={220} /><span className="mz-mono">Inquadrate per rispondere</span></div>}
            {!q.aperto && q.risposte === 0 && <p className="text-xs m-0" style={{ color: 'var(--muted)' }}>Finché è chiuso, chi apre il link vede «non accetta risposte». Aprilo quando vuoi raccoglierle.</p>}
            {risultatiDi === q.id && <Risultati q={q} corsoId={corso.id} passcode={passcode} nomeCorso={corso.nome} />}
          </article>
        ))}
      </div>
    </div>
  );
}

function Editor({ q, onAnnulla, onSalva }: { q: Partial<Q>; onAnnulla: () => void; onSalva: (q: Partial<Q>) => void }) {
  const [titolo, setTitolo] = useState(q.titolo || '');
  const [intro, setIntro] = useState(q.intro || '');
  const [scelte, setScelte] = useState<string[]>(q.domande || []);
  const set = new Set(scelte);
  const numeri = useMemo(() => Object.fromEntries(componi(scelte).flatMap(v => v.domande.map(d => [d.domanda.id, d.numero]))), [scelte]);
  const tutteLe = (ids: string[], on: boolean) => setScelte(prev => {
    const s = new Set(prev); ids.forEach(id => (on ? s.add(id) : s.delete(id)));
    return MODULI.flatMap(m => m.domande.map(d => d.id)).filter(id => s.has(id));
  });
  return (
    <section className="q-scheda q-editor entra-sezione" aria-label="Componi il questionario">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="mz-display m-0" style={{ fontSize: 32 }}>{q.id ? 'Modifica il questionario' : 'Nuovo questionario'}</h2>
        <span className="mz-mono">{scelte.length} domande</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1"><span className="mz-mono">Titolo</span><input className="mz-input" value={titolo} onChange={e => setTitolo(e.target.value)} /></label>
        <label className="grid gap-1"><span className="mz-mono">Frase di apertura (facoltativa)</span><input className="mz-input" value={intro} onChange={e => setIntro(e.target.value)} placeholder="Qualche minuto per dirci com'è andata…" /></label>
      </div>
      <div className="grid gap-3">
        {MODULI.map(m => {
          const ids = m.domande.map(d => d.id);
          const quante = ids.filter(id => set.has(id)).length;
          return (
            <fieldset key={m.id} className={`q-modulo ${quante ? 'on' : ''}`}>
              <legend className="sr-only">{m.titolo}</legend>
              <label className="q-modulo-testa">
                <input type="checkbox" checked={quante === ids.length} ref={el => { if (el) el.indeterminate = quante > 0 && quante < ids.length; }} onChange={e => tutteLe(ids, e.target.checked)} />
                <span><b>{m.titolo}</b><small>{m.descrizione}</small></span>
                <span className="mz-mono">{quante}/{ids.length}</span>
              </label>
              {quante > 0 && (
                <div className="q-modulo-domande">
                  {m.domande.map(d => (
                    <label key={d.id} className={set.has(d.id) ? '' : 'spenta'}>
                      <input type="checkbox" checked={set.has(d.id)} onChange={e => tutteLe([d.id], e.target.checked)} />
                      <span className="q-numero">{numeri[d.id] || '—'}</span>
                      <span>{d.testo}{d.tipo === 'aperta' ? <em> · aperta</em> : d.approfondimento ? <em> · con il perché su 1 e 5</em> : null}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="mz-pill ghost" onClick={onAnnulla}>Annulla</button>
        <button type="button" className="mz-pill b" disabled={scelte.length === 0 || titolo.trim().length < 2} onClick={() => onSalva({ ...q, titolo, intro, domande: scelte })}>Salva</button>
      </div>
    </section>
  );
}

function Risultati({ q, corsoId, passcode, nomeCorso }: { q: Q; corsoId: string; passcode: string; nomeCorso: string }) {
  const [righe, setRighe] = useState<RigaRisposta[] | null>(null);
  useEffect(() => {
    supabase.rpc('docente_risposte_questionario', { p_corso_id: corsoId, p_passcode: passcode, p_id: q.id })
      .then(({ data }) => setRighe((data || []) as RigaRisposta[]));
  }, [q.id, q.risposte, corsoId, passcode]);
  const voci = componi(q.domande);
  const col = colonne(q.domande);

  const esporta = () => {
    if (!righe) return;
    scaricaCsv(`questionario-${slugCsv(nomeCorso)}-${slugCsv(q.titolo)}`,
      ['Risposta', 'Inviata il', ...col.map(c => `${c.numero} ${c.testo}`)],
      righe.map((r, i) => [i + 1, new Date(r.created_at).toLocaleString('it-IT'), ...col.map(c => r.risposte[c.chiave] ?? '')]));
  };

  if (!righe) return <p className="mz-mono mz-breathe">Carico le risposte…</p>;
  if (righe.length === 0) return <p className="text-sm m-0" style={{ color: 'var(--muted)' }}>Ancora nessuna risposta.</p>;

  return (
    <div className="q-risultati entra-sezione">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="mz-mono">{righe.length} {righe.length === 1 ? 'risposta' : 'risposte'} anonime</span>
        <button type="button" className="mz-pill sm o" onClick={esporta}>CSV ↓</button>
      </div>
      {voci.map(v => (
        <section key={v.modulo.id} className="grid gap-3">
          <h3 className="q-parte-titolo" style={{ fontSize: 24 }}>{v.modulo.titolo}</h3>
          {v.domande.map(({ domanda, numero }) => {
            if (domanda.tipo === 'aperta') {
              const testi = righe.map(r => r.risposte[domanda.id]).filter((t): t is string => typeof t === 'string' && !!t.trim());
              return (
                <details key={domanda.id} className="q-ris-domanda">
                  <summary><span className="q-numero">{numero}</span>{domanda.testo} <span className="mz-mono">({testi.length})</span></summary>
                  <ul className="q-citazioni">{testi.map((t, i) => <li key={i}>{t}</li>)}</ul>
                </details>
              );
            }
            const valori = righe.map(r => r.risposte[domanda.id]).filter((x): x is number => typeof x === 'number');
            const media = valori.length ? valori.reduce((a, b) => a + b, 0) / valori.length : 0;
            const conta = SCALA.map(s => valori.filter(x => x === s.valore).length);
            const massimo = Math.max(1, ...conta);
            const perche = righe.map(r => r.risposte[`${domanda.id}__perche`]).filter((t): t is string => typeof t === 'string' && !!t.trim());
            return (
              <div key={domanda.id} className="q-ris-domanda">
                <div className="q-ris-testa">
                  <p className="m-0"><span className="q-numero">{numero}</span>{domanda.testo}</p>
                  <strong className="q-media" title="Media da 1 a 5">{valori.length ? media.toFixed(1).replace('.', ',') : '—'}</strong>
                </div>
                <div className="q-barre" role="img" aria-label={SCALA.map((s, i) => `${s.etichetta}: ${conta[i]}`).join(', ')}>
                  {SCALA.map((s, i) => (
                    <div key={s.valore} className="q-barra">
                      <span className="q-barra-n">{conta[i]}</span>
                      <i style={{ height: `${(conta[i] / massimo) * 100}%` }} />
                      <span className="q-barra-et">{s.valore} · {s.etichetta}</span>
                    </div>
                  ))}
                </div>
                {perche.length > 0 && (
                  <details>
                    <summary className="mz-mono" style={{ cursor: 'pointer' }}>{numero}.1 · i perché ({perche.length})</summary>
                    <ul className="q-citazioni">{perche.map((t, i) => <li key={i}>{t}</li>)}</ul>
                  </details>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
