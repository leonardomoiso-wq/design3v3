'use client';
// Voto dal pubblico, in aula: niente iscrizione, un voto per
// dispositivo, il codice a 4 cifre proiettato sullo schermo (o
// già dentro il QR code).
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { NOME_PIATTAFORMA } from '@/lib/brand';
import {
  COLONNE_PROPOSTA, idDispositivo, messaggioErroreContest, rilevaDispositivo,
  useAdesso, useStatistiche, type Contest, type Proposta,
} from '@/lib/contest';
import { Cornice, Odometro, Solidi, Sheet } from '@/components/moiso/Moiso';
import { Countdown } from '@/components/moiso/Countdown';
import { Celebrazione } from '@/components/moiso/Celebrazione';
import { DettaglioProposta } from '@/components/moiso/Proposte';

export default function VotoLivePage() {
  const [contest, setContest] = useState<Contest | null>(null);
  const [caricato, setCaricato] = useState(false);
  const [proposte, setProposte] = useState<Proposta[]>([]);
  const [codice, setCodice] = useState('');
  const [codiceOk, setCodiceOk] = useState(false);
  const [erroreCodice, setErroreCodice] = useState('');
  const [scelta, setScelta] = useState<number | null>(null);
  const [mioVoto, setMioVoto] = useState<number | null>(null);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [festa, setFesta] = useState<{ x: number; y: number; cambio: boolean } | null>(null);
  const [dettaglio, setDettaglio] = useState<Proposta | null>(null);
  const caselle = useRef<(HTMLInputElement | null)[]>([]);
  const { stat, scarto } = useStatistiche(contest?.id || null, 2000);
  const adesso = useAdesso(scarto, 500);

  // Il contest si trova dal codice proiettato: lo scrive il pubblico o
  // arriva dentro il QR (?codice=1234). Così non serve scegliere il corso.
  const [contestId, setContestId] = useState<string | null>(null);
  const CHIAVE = 'design3_voto_live';

  const carica = useCallback(async () => {
    if (!contestId) { setCaricato(true); return; }
    const { data } = await supabase.from('contest').select('*').eq('id', contestId).maybeSingle();
    const c = (data as Contest) || null;
    setContest(prev => (prev && c && JSON.stringify(prev) === JSON.stringify(c) ? prev : c));
    setCaricato(true);
  }, [contestId]);

  useEffect(() => {
    carica();
    if (!contestId) return;
    const ch = supabase.channel(`contest-live-${contestId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contest', filter: `id=eq.${contestId}` }, carica).subscribe();
    const t = setInterval(carica, 4000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [carica, contestId]);

  const prova = useCallback(async (valore: string, silenzioso = false) => {
    if (valore.length !== 4) return;
    setErroreCodice('');
    const { data } = await supabase.rpc('trova_voto_live', { p_codice: valore });
    if (data) {
      setContestId(data as string);
      setCodice(valore);
      setCodiceOk(true);
      try { sessionStorage.setItem(CHIAVE, JSON.stringify({ id: data, codice: valore })); } catch {}
    } else if (!silenzioso) {
      setErroreCodice('Codice non corretto, o voto non ancora aperto. Guarda quello proiettato.');
      caselle.current[0]?.focus();
      setCodice('');
    }
    setCaricato(true);
  }, []);

  useEffect(() => {
    const daUrl = new URLSearchParams(window.location.search).get('codice') || '';
    let salvato: { id: string; codice: string } | null = null;
    try { salvato = JSON.parse(sessionStorage.getItem(CHIAVE) || 'null'); } catch {}
    if (daUrl) prova(daUrl);
    else if (salvato?.id) {
      // Riapertura della pagina: si resta sul contest (per vedere la chiusura o il vincitore).
      setContestId(salvato.id);
      setCodice(salvato.codice);
      supabase.rpc('verifica_codice_live', { p_contest_id: salvato.id, p_codice: salvato.codice }).then(({ data }) => setCodiceOk(!!data));
    } else setCaricato(true);
  }, [prova]);

  const cid = contest?.id;
  useEffect(() => {
    if (!cid) return;
    supabase.from('contest_proposte').select(COLONNE_PROPOSTA).eq('contest_id', cid).order('creato_il')
      .then(({ data }) => setProposte(((data || []) as any[]).map(p => ({ ...p, id: Number(p.id), galleria: p.galleria || [] }))));
    supabase.rpc('mio_voto_live', { p_contest_id: cid, p_dispositivo_id: idDispositivo() })
      .then(({ data }) => { if (data) { setMioVoto(Number(data)); setScelta(Number(data)); } });
  }, [cid]);

  const verifica = (valore: string) => prova(valore);

  const scriviCifra = (i: number, v: string) => {
    const cifre = v.replace(/\D/g, '');
    if (cifre.length > 1) { // incolla
      const tutto = (codice.slice(0, i) + cifre).slice(0, 4);
      setCodice(tutto);
      if (tutto.length === 4) verifica(tutto); else caselle.current[tutto.length]?.focus();
      return;
    }
    const arr = codice.padEnd(4, ' ').split('');
    arr[i] = cifre || ' ';
    const nuovo = arr.join('').replace(/\s+$/, '');
    setCodice(nuovo);
    if (cifre && i < 3) caselle.current[i + 1]?.focus();
    if (nuovo.replace(/\s/g, '').length === 4) verifica(nuovo);
  };

  const vota = async (e: React.MouseEvent) => {
    if (!contest || scelta === null) return;
    const origine = { x: e.clientX, y: e.clientY };
    setInvio(true);
    setErrore('');
    const { error } = await supabase.rpc('vota_live', {
      p_contest_id: contest.id, p_proposta_id: scelta, p_dispositivo_id: idDispositivo(), p_codice: codice,
      p_dispositivo: rilevaDispositivo(), p_zona: 'In aula',
    });
    setInvio(false);
    if (error) {
      if (error.message === 'codice_errato') { setCodiceOk(false); setCodice(''); }
      setErrore(messaggioErroreContest(error.message));
      return;
    }
    setFesta({ ...origine, cambio: mioVoto !== null });
    setMioVoto(scelta);
  };

  const aperto = contest?.live_stato === 'aperto' && (!contest.live_fine || new Date(contest.live_fine).getTime() > adesso);
  const sceltaP = proposte.find(p => p.id === scelta) || null;

  const cornice = (contenuto: React.ReactNode) => (
    <main style={{ minHeight: '100vh', display: 'grid', gridTemplateRows: 'auto 1fr', gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <header className="mz-rail">
        <span style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}><span style={{ fontWeight: 600, fontSize: 14 }}>{NOME_PIATTAFORMA}</span><span className="mz-mono">Voto dal vivo</span></span>
        <span className="mz-mono" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><span className={`mz-live-dot ${aperto ? '' : 'off'}`} />{aperto ? 'Aperto' : 'Chiuso'}</span>
      </header>
      {contenuto}
    </main>
  );

  if (!caricato) return cornice(<div style={{ display: 'grid', placeItems: 'center' }}><Solidi /></div>);

  // Vincitore svelato in aula: lo mostriamo anche sui telefoni.
  if (contest && contest.vincitore_rivelato && stat?.per_proposta) {
    const ord = [...stat.per_proposta].sort((a, b) => (b.live + b.remoto) - (a.live + a.remoto));
    const v = proposte.find(p => p.id === ord[0]?.id);
    if (v) {
      return cornice(
        <section style={{ background: 'var(--scena)', color: 'var(--scena-testo)', display: 'grid', alignContent: 'center', gap: 18, padding: 24 }}>
          <Solidi cadono colore="var(--scena-testo)" piccoli />
          <span className="mz-mono" style={{ color: 'var(--scena-tenue)' }}>Il progetto vincitore</span>
          <Cornice src={v.immagine} alt="" style={{ aspectRatio: '16 / 10' }} />
          <h1 className="mz-display mz-break" style={{ fontSize: 'clamp(44px, 12vw, 120px)' }}>{v.titolo}</h1>
          <span className="mz-break">{v.autori}</span>
          {mioVoto === v.id && <span className="mz-chip" style={{ background: 'var(--scena-testo)', color: 'var(--scena-su-testo)', justifySelf: 'start' }}>Hai votato anche tu questa proposta</span>}
        </section>,
      );
    }
  }

  if (contest && !aperto) {
    return cornice(
      <section style={{ display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
        <div style={{ display: 'grid', gap: 18, justifyItems: 'center', maxWidth: 560 }}>
          <Solidi />
          <h1 className="mz-display" style={{ fontSize: 'clamp(40px, 9vw, 84px)' }}>
            {mioVoto ? <>Voto chiuso. <span className="mz-blue">Guarda lo schermo</span>.</> : <>Il voto dal vivo <span className="mz-blue">non è aperto</span>.</>}
          </h1>
          <p className="mz-muted" style={{ margin: 0 }}>Questa pagina si aggiorna da sola: quando il/la docente riapre il voto, compare qui.</p>
          <button type="button" className="mz-pill sm ghost" onClick={() => { try { sessionStorage.removeItem(CHIAVE); } catch {} setContest(null); setContestId(null); setCodiceOk(false); setCodice(''); setMioVoto(null); setScelta(null); }}>Ho un nuovo codice</button>
        </div>
      </section>,
    );
  }

  if (!codiceOk) {
    return cornice(
      <section style={{ display: 'grid', alignContent: 'center', justifyItems: 'center', gap: 22, padding: 24, textAlign: 'center' }}>
        <span className="mz-mono">Voto dal vivo</span>
        <h1 className="mz-display" style={{ fontSize: 'clamp(40px, 10vw, 84px)' }}>Inserisci il <span className="mz-blue">codice</span> sullo schermo.</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          {[0, 1, 2, 3].map(i => (
            <input
              key={i}
              ref={el => { caselle.current[i] = el; }}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label={`Cifra ${i + 1} del codice`}
              value={(codice[i] || '').trim()}
              onChange={e => scriviCifra(i, e.target.value)}
              onKeyDown={e => { if (e.key === 'Backspace' && !(codice[i] || '').trim() && i > 0) caselle.current[i - 1]?.focus(); }}
              autoFocus={i === 0}
              className="mz-input mz-num"
              style={{ width: 'clamp(56px, 18vw, 84px)', height: 'clamp(70px, 22vw, 100px)', textAlign: 'center', fontFamily: 'var(--f-display)', fontSize: 'clamp(36px, 10vw, 56px)', borderRadius: 14 }}
            />
          ))}
        </div>
        {erroreCodice && <p role="alert" style={{ margin: 0, color: '#dc2626' }}>{erroreCodice}</p>}
        <p className="mz-muted" style={{ margin: 0, fontSize: 14 }}>Un voto per dispositivo, anonimo. Puoi cambiarlo finché il voto resta aperto.</p>
      </section>,
    );
  }

  if (!contest) return cornice(<div style={{ display: 'grid', placeItems: 'center' }}><Solidi /></div>);

  return cornice(
    <div style={{ paddingBottom: 140 }}>
      <section style={{ padding: '28px max(20px, env(safe-area-inset-left)) 18px', display: 'grid', gap: 14, maxWidth: 1100, margin: '0 auto' }}>
        <span className="mz-mono">{contest.titolo}</span>
        <h1 className="mz-display" style={{ fontSize: 'clamp(40px, 10vw, 96px)' }}>
          {mioVoto ? <>Votato. Vuoi <span className="mz-blue">cambiare</span>?</> : <>Scegli il <span className="mz-blue">progetto migliore</span>.</>}
        </h1>
        <div style={{ display: 'flex', gap: 22, alignItems: 'end', flexWrap: 'wrap' }}>
          {stat && (
            <span style={{ display: 'grid' }}>
              <span className="mz-display" style={{ fontSize: 48, lineHeight: 1 }}><Odometro valore={stat.totale.live} cifre={2} /></span>
              <span className="mz-mono">voti in aula</span>
            </span>
          )}
          {contest.live_fine && <Countdown fine={contest.live_fine} adesso={adesso} grande={false} finito="Tempo scaduto" />}
        </div>
      </section>

      <ul style={{ listStyle: 'none', margin: 0, padding: '0 max(20px, env(safe-area-inset-left))', display: 'grid', gap: 18, maxWidth: 1100, marginInline: 'auto', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))' }}>
        {proposte.map((p, i) => {
          const sel = scelta === p.id;
          return (
            <li key={p.id} className="mz-in" style={{ animationDelay: `${i * 50}ms` }}>
              <div
                style={{ borderRadius: 14, overflow: 'hidden', background: 'var(--surface)', boxShadow: sel ? 'inset 0 0 0 3px var(--accento-vivo), 0 20px 40px rgba(245,158,11,.22)' : 'inset 0 0 0 1px var(--line)', transform: sel ? 'translateY(-3px)' : 'none', transition: 'box-shadow .35s, transform .5s var(--spring)' }}
              >
                <button type="button" onClick={() => setScelta(p.id)} aria-pressed={sel} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
                  <div style={{ position: 'relative' }}>
                    <Cornice src={p.immagine} alt="" style={{ aspectRatio: '16 / 10' }} />
                    <span style={{ position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 99, display: 'grid', placeItems: 'center', background: sel ? 'var(--accento-vivo)' : 'rgba(255,255,255,.9)', color: 'var(--ink)', transition: 'background .3s, transform .5s var(--spring)', transform: sel ? 'scale(1.1)' : 'none', fontSize: 16 }} aria-hidden="true">{sel ? '✓' : String(i + 1)}</span>
                  </div>
                  <div style={{ padding: '14px 16px 6px', display: 'grid', gap: 6 }}>
                    <span className="mz-display mz-break" style={{ fontSize: 26 }}>{p.titolo}</span>
                    {p.sintesi && <span className="mz-break" style={{ fontSize: 15, lineHeight: 1.35 }}>{p.sintesi}</span>}
                    <span className="mz-mono mz-break">{p.autori}</span>
                  </div>
                </button>
                <div style={{ padding: '6px 16px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {mioVoto === p.id ? <span className="mz-chip on" style={{ cursor: 'default', fontSize: 12 }}>● Il tuo voto</span> : <span />}
                  <button type="button" className="mz-pill sm ghost" onClick={() => setDettaglio(p)}>Leggi tutto</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, padding: '14px max(16px, env(safe-area-inset-left)) calc(14px + env(safe-area-inset-bottom))', background: 'color-mix(in srgb, var(--bg) 88%, transparent)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderTop: '1px solid var(--line)', display: 'grid', gap: 8 }}>
        {errore && <p role="alert" style={{ margin: 0, color: '#dc2626', fontSize: 14 }}>{errore}</p>}
        <button type="button" className="mz-pill b lg" disabled={!sceltaP || invio || scelta === mioVoto} onClick={vota} style={{ width: '100%', maxWidth: 560, justifySelf: 'center' }}>
          {invio ? 'Invio…' : !sceltaP ? 'Tocca un progetto per sceglierlo' : scelta === mioVoto ? 'Hai votato questo progetto' : <span className="mz-break" style={{ whiteSpace: 'normal' }}>{mioVoto ? 'Sposta il voto su' : 'Vota'} «{sceltaP.titolo}»</span>}
        </button>
      </div>

      <Sheet aperto={!!dettaglio} onChiudi={() => setDettaglio(null)} categoria="Proposta">
        {dettaglio && (
          <>
            <DettaglioProposta p={dettaglio} indice={proposte.findIndex(p => p.id === dettaglio.id)} />
            <div style={{ padding: '0 clamp(20px, 4vw, 44px) 32px' }}>
              <button type="button" className="mz-pill b lg" onClick={() => { setScelta(dettaglio.id); setDettaglio(null); }}>Scegli questo progetto</button>
            </div>
          </>
        )}
      </Sheet>

      {festa && (
        <Celebrazione
          origine={festa}
          titolo={festa.cambio ? 'Voto cambiato' : 'Voto in aula!'}
          numero={stat && !festa.cambio ? stat.totale.live + 1 : null}
          sottotitolo="Ora guarda lo schermo: il tuo voto è appena entrato nel conteggio."
          onFine={() => setFesta(null)}
          durata={2400}
        />
      )}
    </div>,
  );
}
