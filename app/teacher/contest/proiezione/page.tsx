'use client';
// Schermo da proiettare in aula. Mostra la votazione in corso (totale
// che sale, onde a ogni voto, gara delle proposte, flusso dei voti),
// il QR e il codice per votare, e la sequenza che svela il vincitore:
// tendina blu → 3, 2, 1 → immagine che si apre, titolo che sale lettera
// per lettera, voti che contano, solidi che cadono e oscillano.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useDocente } from '@/lib/docente-context';
import {
  ETICHETTA_DISPOSITIVO, pad, riduciMovimento, tempoFa, useAdesso, useStatistiche,
  type Contest, type Proposta,
} from '@/lib/contest';
import { Odometro, Segmentato, Solidi, ContaSu, Cornice } from '@/components/moiso/Moiso';
import { Classifica } from '@/components/moiso/Classifica';
import { Countdown } from '@/components/moiso/Countdown';
import { QR } from '@/components/moiso/QR';

type Base = 'live' | 'remoto' | 'combinato';
type Fase = 'gara' | 'tendina' | 'rullo' | 'vincitore';

function Rivelazione({ fase, vincitore, secondi, podio, base, onChiudi, numeroRullo }: {
  fase: Fase; vincitore: { p: Proposta; n: number; pari: Proposta[] } | null; secondi: number;
  podio: { p: Proposta; n: number }[]; base: Base; onChiudi: () => void; numeroRullo: number;
}) {
  const tenda = useRef<HTMLDivElement>(null);
  const scena = useRef<HTMLDivElement>(null);
  const ridotto = riduciMovimento();

  useEffect(() => {
    if (fase === 'tendina' && tenda.current && !ridotto) {
      tenda.current.animate([{ transform: 'translateY(-101%)' }, { transform: 'none' }], { duration: 700, easing: 'cubic-bezier(.7,0,.25,1)', fill: 'both' });
    }
    if (fase === 'vincitore' && scena.current && !ridotto) {
      const s = scena.current;
      s.querySelector<HTMLElement>('[data-img]')?.animate(
        [{ clipPath: 'inset(100% 0 0 0)', transform: 'scale(1.15)' }, { clipPath: 'inset(0 0 0 0)', transform: 'none' }],
        { duration: 1100, delay: 200, easing: 'cubic-bezier(.7,0,.25,1)', fill: 'backwards' },
      );
      s.querySelectorAll<HTMLElement>('[data-l]').forEach((l, i) =>
        l.animate([{ transform: 'translateY(110%)' }, { transform: 'none' }], { duration: 900, delay: 700 + i * 35, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }),
      );
      s.querySelectorAll<HTMLElement>('[data-podio]').forEach((l, i) =>
        l.animate([{ opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: 1800 + i * 150, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }),
      );
    }
  }, [fase, ridotto]);

  if (fase === 'gara') return null;

  if (fase === 'tendina' || fase === 'rullo') {
    return (
      <div ref={tenda} style={{ position: 'fixed', inset: 0, zIndex: 120, background: '#1d3cf5', color: '#fff', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 40 }}>
        <div style={{ display: 'grid', gap: 30, justifyItems: 'center' }}>
          <Solidi colore="#fff" />
          {fase === 'tendina' ? (
            <span className="mz-display mz-fade" style={{ fontSize: 'clamp(48px, 7vw, 120px)' }}>E il progetto vincitore è…</span>
          ) : (
            <span key={numeroRullo} className="mz-display mz-num" style={{ fontSize: 'clamp(160px, 30vw, 420px)', lineHeight: .8, animation: ridotto ? undefined : 'mz-rullo .9s cubic-bezier(.2,1.3,.35,1) both' }}>{numeroRullo}</span>
          )}
          <span className="mz-mono" style={{ color: 'rgba(255,255,255,.75)', fontSize: 14 }}>
            {base === 'live' ? 'Voti dal vivo' : base === 'remoto' ? 'Voti da remoto' : 'Voti da remoto e dal vivo'}
          </span>
        </div>
        <style>{'@keyframes mz-rullo{0%{transform:scale(1.6);opacity:0;filter:blur(8px)}60%{opacity:1;filter:none}100%{transform:scale(1);opacity:1}}'}</style>
      </div>
    );
  }

  if (!vincitore) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: '#1d3cf5', color: '#fff', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div style={{ display: 'grid', gap: 20, justifyItems: 'center' }}>
          <span className="mz-display" style={{ fontSize: 'clamp(48px, 7vw, 110px)' }}>Ancora nessun voto.</span>
          <button type="button" className="mz-pill lg" style={{ background: '#fff', color: '#0b0c10' }} onClick={onChiudi}>Torna alla gara</button>
        </div>
      </div>
    );
  }

  const titolo = vincitore.pari.length > 1 ? vincitore.pari.map(p => p.titolo).join(' · ') : vincitore.p.titolo;

  return (
    <div ref={scena} style={{ position: 'fixed', inset: 0, zIndex: 120, background: '#1d3cf5', color: '#fff', display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: 'clamp(24px, 4vw, 64px)', padding: 'clamp(28px, 4vw, 64px)', alignItems: 'center' }}>
      <div data-img style={{ height: '78vh', borderRadius: 6, overflow: 'hidden', boxShadow: '0 60px 120px rgba(0,0,30,.35)' }}>
        <Cornice src={vincitore.p.immagine} alt="" style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={{ display: 'grid', gap: 22, alignContent: 'center', minWidth: 0 }}>
        <Solidi cadono colore="#fff" piccoli />
        <span className="mz-mono" style={{ color: 'rgba(255,255,255,.8)', fontSize: 14 }}>{vincitore.pari.length > 1 ? 'Vincitori a pari merito' : 'Il progetto vincitore'}</span>
        <h1 className="mz-display" style={{ fontSize: `clamp(48px, ${titolo.length > 30 ? 5 : 7.5}vw, 150px)`, display: 'flex', flexWrap: 'wrap', columnGap: '.25em', overflowWrap: 'anywhere' }}>
          {titolo.split(' ').map((w, i) => (
            <span key={i} style={{ overflow: 'hidden', display: 'inline-flex', paddingBottom: '.06em' }}>
              {w.split('').map((c, j) => <span key={j} data-l style={{ display: 'inline-block' }}>{c}</span>)}
            </span>
          ))}
        </h1>
        <span style={{ fontSize: 'clamp(16px, 1.6vw, 22px)' }} className="mz-break">{vincitore.p.autori}</span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span className="mz-display" style={{ fontSize: 'clamp(60px, 7vw, 120px)', lineHeight: 1 }}><ContaSu valore={vincitore.n} /></span>
          <span className="mz-mono" style={{ color: 'rgba(255,255,255,.8)', fontSize: 14 }}>voti · {secondi}% del totale</span>
        </span>
        {podio.length > 0 && (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10, borderTop: '1px solid rgba(255,255,255,.4)', paddingTop: 16 }}>
            {podio.map((r, i) => (
              <li key={r.p.id} data-podio style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 'clamp(16px, 1.5vw, 22px)' }}>
                <span className="mz-break"><span className="mz-mono" style={{ color: 'rgba(255,255,255,.75)' }}>{pad(i + 2)}</span> {r.p.titolo}</span>
                <span className="mz-num">{r.n}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <button type="button" onClick={onChiudi} className="mz-pill sm" style={{ position: 'fixed', top: 20, right: 20, background: 'rgba(255,255,255,.15)', color: '#fff' }}>Torna alla gara ✕</button>
    </div>
  );
}

export default function ProiezionePage() {
  const { passcode } = useDocente();
  const [id, setId] = useState<string | null>(null);
  const [contest, setContest] = useState<Contest | null>(null);
  const [proposte, setProposte] = useState<Proposta[]>([]);
  const [codice, setCodice] = useState<string | null>(null);
  const [base, setBase] = useState<Base>('live');
  const [coperta, setCoperta] = useState(false);
  const [fase, setFase] = useState<Fase>('gara');
  const [rullo, setRullo] = useState(3);
  const [comandi, setComandi] = useState(true);
  const [onde, setOnde] = useState<number[]>([]);
  const [origine, setOrigine] = useState('');
  const baseScelta = useRef(false);
  const { stat, scarto } = useStatistiche(id, 1500, passcode);
  const adesso = useAdesso(scarto, 250);

  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get('id'));
    setOrigine(window.location.origin);
  }, []);

  const carica = useCallback(async () => {
    if (!id) return;
    const [{ data: lista }, { data: prop }, { data: cod }] = await Promise.all([
      supabase.rpc('docente_lista_contest', { p_passcode: passcode }),
      supabase.rpc('docente_lista_proposte', { p_contest_id: id, p_passcode: passcode }),
      supabase.rpc('docente_codice_live', { p_id: id, p_passcode: passcode }),
    ]);
    const c = ((lista || []) as Contest[]).find(x => x.id === id) || null;
    setContest(c);
    setProposte(((prop || []) as any[]).filter(p => !p.nascosta).map(p => ({ ...p, id: Number(p.id), galleria: p.galleria || [] })));
    setCodice((cod as string) || null);
    if (c && !baseScelta.current) { setBase(c.live_stato !== 'chiuso' ? 'live' : 'remoto'); baseScelta.current = true; }
  }, [id, passcode]);

  useEffect(() => {
    carica();
    const t = setInterval(carica, 5000);
    return () => clearInterval(t);
  }, [carica]);

  // Un'onda blu parte dal totale a ogni nuovo voto.
  const totale = stat ? (base === 'live' ? stat.totale.live : base === 'remoto' ? stat.totale.remoto : stat.totale.live + stat.totale.remoto) : 0;
  const totalePrima = useRef<number | null>(null);
  useEffect(() => {
    if (totalePrima.current !== null && totale > totalePrima.current && !riduciMovimento()) {
      const k = Date.now();
      setOnde(o => [...o.slice(-4), k]);
      setTimeout(() => setOnde(o => o.filter(x => x !== k)), 1800);
    }
    totalePrima.current = totale;
  }, [totale]);
  useEffect(() => { totalePrima.current = null; }, [base]);

  // I comandi spariscono quando il mouse è fermo.
  useEffect(() => {
    let t: any;
    const muovi = () => { setComandi(true); clearTimeout(t); t = setTimeout(() => setComandi(false), 3500); };
    window.addEventListener('pointermove', muovi);
    muovi();
    return () => { window.removeEventListener('pointermove', muovi); clearTimeout(t); };
  }, []);

  const azione = async (a: 'apri' | 'chiudi' | 'rivela' | 'copri', durata = 0) => {
    if (!id) return;
    const { data } = await supabase.rpc('docente_live_contest', { p_id: id, p_azione: a, p_durata_sec: durata, p_passcode: passcode });
    if (data && (data as any).codice) setCodice((data as any).codice);
    carica();
  };

  const conti = (p: Proposta) => {
    const r = stat?.per_proposta?.find(x => x.id === p.id);
    if (!r) return 0;
    return base === 'live' ? r.live : base === 'remoto' ? r.remoto : r.live + r.remoto;
  };
  const righe = proposte.map(p => ({ proposta: p, voti: conti(p) }));
  const ordinate = [...righe].sort((a, b) => b.voti - a.voti);
  const vincitore = ordinate[0] && ordinate[0].voti > 0
    ? { p: ordinate[0].proposta, n: ordinate[0].voti, pari: ordinate.filter(r => r.voti === ordinate[0].voti).map(r => r.proposta) }
    : null;
  const somma = righe.reduce((s, r) => s + r.voti, 0);

  const rivela = async () => {
    if (fase !== 'gara') return;
    const ridotto = riduciMovimento();
    setFase('tendina');
    await new Promise(r => setTimeout(r, ridotto ? 200 : 2200));
    setFase('rullo');
    for (const n of [3, 2, 1]) { setRullo(n); await new Promise(r => setTimeout(r, ridotto ? 150 : 950)); }
    setFase('vincitore');
    azione('rivela');
  };

  const schermoIntero = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') schermoIntero();
      if (e.key === 'r' || e.key === 'R') rivela();
      if (e.key === 'c' || e.key === 'C') setCoperta(x => !x);
      if (e.key === 'Escape' && fase === 'vincitore') setFase('gara');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const liveAperto = contest?.live_stato === 'aperto' && (!contest.live_fine || new Date(contest.live_fine).getTime() > adesso);
  const remotoAperto = contest?.fase === 'voto' && contest.voto_fine && new Date(contest.voto_fine).getTime() > adesso;
  const linkVoto = `${origine}/contest/live${codice ? `?codice=${codice}` : ''}`;
  const fine = base === 'live' ? contest?.live_fine : contest?.voto_fine;
  const inizio = base === 'live' ? contest?.live_inizio : contest?.voto_inizio;

  return (
    <div className="mz" data-theme="dark" style={{ position: 'fixed', inset: 0, zIndex: 100, overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', cursor: comandi ? 'default' : 'none' }}>
      {/* Barra alta */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, padding: '22px clamp(24px, 3vw, 48px)', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', minWidth: 0 }}>
          <span className="mz-mono">Design 3 · Contest</span>
          <span className="mz-display mz-break" style={{ fontSize: 'clamp(22px, 2.2vw, 34px)', lineHeight: 1.2, paddingBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contest?.titolo || '…'}</span>
        </div>
        <span className="mz-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
          <span className={`mz-live-dot ${(base === 'live' ? liveAperto : remotoAperto) ? '' : 'off'}`} />
          {base === 'live' ? (liveAperto ? 'Voto dal vivo aperto' : 'Voto dal vivo chiuso') : base === 'remoto' ? (remotoAperto ? 'Voto da remoto aperto' : 'Voto da remoto chiuso') : 'Remoto + dal vivo'}
        </span>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) clamp(300px, 28vw, 440px)', minHeight: 0 }}>
        {/* Gara */}
        <section style={{ padding: 'clamp(24px, 3vw, 48px)', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 'clamp(20px, 3vh, 40px)', minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 30, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              {onde.map(k => (
                <span key={k} aria-hidden="true" style={{ position: 'absolute', left: '18%', top: '50%', width: 160, height: 160, margin: '-80px 0 0 -80px', borderRadius: 999, border: '2px solid var(--blue)', animation: 'mz-onda 1.8s cubic-bezier(.2,.8,.2,1) forwards', pointerEvents: 'none' }} />
              ))}
              <span className="mz-display" style={{ fontSize: 'clamp(110px, 15vw, 260px)', lineHeight: .8, display: 'block' }}>
                <Odometro valore={totale} cifre={3} />
              </span>
              <span className="mz-mono" style={{ fontSize: 14 }}>{base === 'live' ? 'voti in aula' : base === 'remoto' ? 'voti da remoto' : 'voti in tutto'}, anonimi</span>
            </div>
            {fine && <Countdown fine={fine} inizio={inizio} adesso={adesso} finito="Voto chiuso" />}
          </div>
          <div style={{ minHeight: 0, overflow: 'hidden' }}>
            <Classifica righe={righe} coperta={coperta} scuro compatta={righe.length > 6} />
          </div>
        </section>

        {/* Vota ora */}
        <aside style={{ borderLeft: '1px solid var(--line)', padding: 'clamp(24px, 3vw, 40px)', display: 'grid', gridTemplateRows: 'auto auto minmax(0, 1fr)', gap: 26, minHeight: 0 }}>
          {base !== 'remoto' ? (
            <div style={{ display: 'grid', gap: 16, justifyItems: 'start' }}>
              <span className="mz-mono" style={{ color: 'var(--ink)', fontSize: 13 }}>Vota ora dal telefono</span>
              <div className="mz-float"><QR testo={linkVoto} dimensione={Math.min(260, 220)} scuro="#0b0c10" chiaro="#ffffff" /></div>
              <span className="mz-mono mz-break" style={{ fontSize: 13 }}>{origine.replace(/^https?:\/\//, '')}/contest/live</span>
              <div style={{ display: 'grid' }}>
                <span className="mz-mono">Codice</span>
                <span className="mz-display mz-num" style={{ fontSize: 'clamp(70px, 7vw, 120px)', lineHeight: .9, color: liveAperto ? 'var(--blue)' : 'var(--faint)', letterSpacing: '.02em' }}>{codice || '····'}</span>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <span className="mz-mono" style={{ color: 'var(--ink)', fontSize: 13 }}>Voto da remoto</span>
              <span style={{ fontSize: 18 }}>Gli iscritti votano da <strong>{origine.replace(/^https?:\/\//, '')}/contest</strong></span>
              {stat && <span className="mz-muted"><ContaSu valore={stat.totale.remoto} /> su {stat.iscritti} iscritti hanno votato</span>}
            </div>
          )}
          <div className="mz-hair" />
          <div style={{ minHeight: 0, overflow: 'hidden', display: 'grid', alignContent: 'start', gap: 10 }}>
            <span className="mz-mono">Ultimi voti</span>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {(stat?.ultimi || []).filter(u => base === 'combinato' || u.fase === base).slice(0, 7).map((u, i) => (
                <li key={u.id + u.t} className={i === 0 ? 'mz-flash' : ''} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 6px', borderTop: i ? '1px solid var(--line)' : undefined, borderRadius: 6, opacity: 1 - i * 0.11, fontSize: 15 }}>
                  <span>{u.zona || 'Anonimo'} · <span className="mz-muted">{ETICHETTA_DISPOSITIVO[u.dispositivo] || 'Altro'}</span></span>
                  <span className="mz-mono mz-num">{tempoFa(u.t, adesso)}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {/* Comandi (spariscono da soli) */}
      <div style={{ position: 'fixed', left: '50%', bottom: 20, transform: `translate(-50%, ${comandi ? 0 : 140}%)`, transition: 'transform .6s cubic-bezier(.7,0,.25,1)', zIndex: 110, display: 'flex', gap: 8, alignItems: 'center', padding: 8, borderRadius: 99, background: 'color-mix(in srgb, var(--surface) 90%, transparent)', backdropFilter: 'blur(14px)', boxShadow: '0 20px 60px rgba(0,0,0,.4)', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '96vw' }}>
        <Segmentato etichetta="Voti da mostrare" valore={base} onCambia={v => { setBase(v); baseScelta.current = true; }} opzioni={[{ id: 'live', label: 'Dal vivo' }, { id: 'remoto', label: 'Remoto' }, { id: 'combinato', label: 'Tutti' }]} />
        {liveAperto
          ? <button type="button" className="mz-pill sm o" onClick={() => azione('chiudi')}>Chiudi voto</button>
          : <>
              <button type="button" className="mz-pill sm b" onClick={() => azione('apri', 120)}>Apri 2 min</button>
              <button type="button" className="mz-pill sm o" onClick={() => azione('apri', 0)}>Apri senza limite</button>
            </>}
        <button type="button" className="mz-pill sm o" onClick={() => setCoperta(x => !x)}>{coperta ? 'Scopri classifica' : 'Copri classifica'} (C)</button>
        <button type="button" className="mz-pill sm b" onClick={rivela}>Svela il vincitore (R)</button>
        {contest?.vincitore_rivelato && <button type="button" className="mz-pill sm ghost" onClick={() => azione('copri')}>Nascondi agli studenti</button>}
        <button type="button" className="mz-pill sm ghost" onClick={schermoIntero}>Schermo intero (F)</button>
        <a href="/teacher/contest" className="mz-pill sm ghost">Esci</a>
      </div>

      <Rivelazione
        fase={fase}
        vincitore={vincitore}
        secondi={vincitore && somma ? Math.round((vincitore.n / somma) * 100) : 0}
        podio={ordinate.slice(1, 3).filter(r => r.voti > 0).map(r => ({ p: r.proposta, n: r.voti }))}
        base={base}
        numeroRullo={rullo}
        onChiudi={() => setFase('gara')}
      />
      <style>{'@keyframes mz-onda{0%{transform:scale(.3);opacity:.9}100%{transform:scale(3.2);opacity:0}}'}</style>
    </div>
  );
}
