'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Solidi } from '@/components/moiso/Moiso';
import { SCALA, chiedeApprofondimento, componi, type Risposte } from '@/lib/questionari';

// Questionario anonimo, aperto da un link diretto (/questionario?q=<id>):
// non serve accedere al corso e non si salvano nome, team o dispositivo.
// Sullo stesso dispositivo si può riaprire e correggere quanto inviato.

type Info = { id: string; titolo: string; intro: string | null; domande: string[]; aperto: boolean; corso_nome: string };
type Mio = { id: string; token: string };

const chiaveBozza = (q: string) => `edu_questionario_bozza_${q}`;
const chiaveInvio = (q: string) => `edu_questionario_inviato_${q}`;
const leggi = <T,>(k: string): T | null => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
const scrivi = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* non bloccante */ } };
const nuovoToken = () => {
  try { return crypto.randomUUID() + crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2); }
};

export default function QuestionarioPage() {
  const [id, setId] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [risposte, setRisposte] = useState<Risposte>({});
  const [mio, setMio] = useState<Mio | null>(null);
  const [stato, setStato] = useState<'compila' | 'invio' | 'grazie'>('compila');
  const [errore, setErrore] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    setId(q);
    if (!q) { setInfo(null); return; }
    supabase.rpc('info_questionario', { p_id: q }).then(({ data, error }) => {
      const r = (Array.isArray(data) ? data[0] : data) as Info | undefined;
      setInfo(error || !r ? null : r);
    });
    const inviato = leggi<Mio>(chiaveInvio(q));
    if (inviato) { setMio(inviato); setStato('grazie'); }
    setRisposte(leggi<Risposte>(chiaveBozza(q)) || {});
  }, []);

  const voci = useMemo(() => componi(info?.domande || []), [info]);
  const daScala = voci.flatMap(v => v.domande).filter(d => d.domanda.tipo === 'scala');
  const date = daScala.filter(d => typeof risposte[d.domanda.id] === 'number').length;
  const completo = daScala.length > 0 && date === daScala.length;

  const imposta = (chiave: string, valore: number | string) => {
    setRisposte(prev => {
      const nuove = { ...prev, [chiave]: valore };
      if (id) scrivi(chiaveBozza(id), nuove);
      return nuove;
    });
  };

  const invia = async () => {
    if (!id || !info) return;
    setErrore('');
    setStato('invio');
    // si salvano solo le domande del questionario, e il perché solo se serve
    const pulite: Risposte = {};
    for (const v of voci) for (const { domanda } of v.domande) {
      const r = risposte[domanda.id];
      if (domanda.tipo === 'scala' && typeof r === 'number') {
        pulite[domanda.id] = r;
        const perche = risposte[`${domanda.id}__perche`];
        if (domanda.approfondimento && chiedeApprofondimento(r) && typeof perche === 'string' && perche.trim()) pulite[`${domanda.id}__perche`] = perche.trim();
      }
      if (domanda.tipo === 'aperta' && typeof r === 'string' && r.trim()) pulite[domanda.id] = r.trim();
    }
    const token = mio?.token || nuovoToken();
    const { data, error } = await supabase.rpc('invia_questionario', { p_id: id, p_risposte: pulite, p_token: token, p_risposta_id: mio?.id || null });
    if (error || !data) {
      setStato('compila');
      setErrore(error?.message === 'questionario_chiuso' ? 'Il questionario è stato chiuso: non accetta più risposte.' : 'Invio non riuscito. Controllate la connessione e riprovate.');
      return;
    }
    const nuovo = { id: data as string, token };
    setMio(nuovo);
    scrivi(chiaveInvio(id), nuovo);
    setStato('grazie');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (info === undefined) {
    return <main className="mz" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><span className="mz-mono mz-breathe">Caricamento…</span></main>;
  }

  if (info === null || (!info.aperto && stato !== 'grazie')) {
    return (
      <main className="mz mz-vetrina">
        <header className="mz-rail"><span className="mz-mono">Questionario</span></header>
        <section className="mz-ingresso">
          <div className="mz-ingresso-testo mz-in">
            <h1 className="mz-display mz-eroe-titolo">Questionario<span className="mz-sup">({info ? 'chiuso' : 'non trovato'})</span></h1>
            <p className="mz-ingresso-lead">{info ? 'Questo questionario non accetta risposte in questo momento.' : 'Il link non porta a nessun questionario: controllate di averlo copiato per intero.'}</p>
          </div>
          <div className="mz-in" style={{ animationDelay: '120ms' }}><Solidi cadono /></div>
        </section>
      </main>
    );
  }

  if (stato === 'grazie') {
    return (
      <main className="mz mz-vetrina">
        <header className="mz-rail"><span className="mz-mono" style={{ color: 'var(--ink)' }}>{info.corso_nome}</span></header>
        <section className="mz-ingresso">
          <div className="mz-ingresso-testo mz-in">
            <h1 className="mz-display mz-eroe-titolo">Grazie<span className="mz-sup">({info.titolo})</span></h1>
            <p className="mz-ingresso-lead">Le tue risposte sono arrivate, in forma anonima. Ci aiutano a migliorare le attività per chi verrà dopo di te.</p>
            {info.aperto && (
              <div><button type="button" className="mz-pill o" onClick={() => setStato('compila')}>Correggi le risposte</button></div>
            )}
          </div>
          <div className="mz-in" style={{ animationDelay: '120ms' }}><Solidi cadono /></div>
        </section>
      </main>
    );
  }

  return (
    <main className="mz q-pagina">
      <header className="mz-rail">
        <span className="mz-mono mz-abbrevia" style={{ color: 'var(--ink)', maxWidth: '60vw' }}>{info.corso_nome}</span>
        <span className="mz-mono" style={{ whiteSpace: 'nowrap' }} aria-live="polite">{date} / {daScala.length} risposte</span>
      </header>
      <div className="q-avanzamento" aria-hidden="true"><i style={{ transform: `scaleX(${daScala.length ? date / daScala.length : 0})` }} /></div>

      <header className="q-testata mz-in">
        <h1 className="mz-display" style={{ fontSize: 'clamp(44px, 8vw, 104px)', margin: 0, lineHeight: .95 }}>{info.titolo}<span className="mz-sup">(anonimo)</span></h1>
        <p className="q-intro">{info.intro || 'Qualche minuto per dirci com\'è andata. Non chiediamo nome né team: rispondi liberamente.'}</p>
        <p className="mz-mono" style={{ textTransform: 'none', letterSpacing: 0 }}>Da 1 (per niente) a 5 (molto). Se scegli 1 o 5 ti chiediamo il perché.</p>
      </header>

      <form className="q-corpo" onSubmit={e => { e.preventDefault(); if (completo) invia(); }}>
        {voci.map(v => (
          <section key={v.modulo.id} className="q-parte">
            <h2 className="q-parte-titolo">{v.modulo.titolo}</h2>
            {v.domande.map(({ domanda, numero }) => {
              const valore = risposte[domanda.id];
              const perche = `${domanda.id}__perche`;
              return (
                <fieldset key={domanda.id} className={`q-domanda ${typeof valore === 'number' ? 'risposta' : ''}`}>
                  <legend className="q-testo"><span className="q-numero">{numero}</span>{domanda.testo}</legend>
                  {domanda.tipo === 'scala' ? (
                    <>
                      <div className="q-scala" role="radiogroup" aria-label={`${numero}: da 1 a 5`}>
                        {SCALA.map(s => (
                          <button key={s.valore} type="button" role="radio" aria-checked={valore === s.valore} className={`q-voto ${valore === s.valore ? 'on' : ''}`} onClick={() => imposta(domanda.id, s.valore)}>
                            <b>{s.valore}</b><span>{s.etichetta}</span>
                          </button>
                        ))}
                      </div>
                      <div className="q-scala-estremi" aria-hidden="true"><span>1 · Per niente</span><span>5 · Molto</span></div>
                      {domanda.approfondimento && chiedeApprofondimento(valore) && (
                        <label className="q-perche entra-sezione">
                          <span className="mz-mono">{numero}.1</span>
                          <span className="q-perche-testo">{domanda.approfondimento}</span>
                          <textarea className="mz-input" rows={3} value={(risposte[perche] as string) || ''} onChange={e => imposta(perche, e.target.value)} placeholder="Facoltativo, ma ci aiuta molto" />
                        </label>
                      )}
                    </>
                  ) : (
                    <textarea className="mz-input" rows={4} aria-label={domanda.testo} value={(valore as string) || ''} onChange={e => imposta(domanda.id, e.target.value)} placeholder="Scrivi qui (facoltativo)" />
                  )}
                </fieldset>
              );
            })}
          </section>
        ))}

        <div className="q-invio">
          {errore && <p role="alert" className="text-sm text-red-700 m-0">{errore}</p>}
          {!completo && <span className="mz-mono" style={{ textTransform: 'none', letterSpacing: 0 }}>Mancano {daScala.length - date} risposte da 1 a 5. Le domande aperte sono facoltative.</span>}
          <button type="submit" className="mz-pill b lg" disabled={!completo || stato === 'invio'}>{stato === 'invio' ? 'Invio…' : mio ? 'Aggiorna le risposte →' : 'Invia, in forma anonima →'}</button>
        </div>
      </form>
    </main>
  );
}
