'use client';
// Dati del voto, vivi: totale con cifre che ruotano, countdown,
// affluenza, flusso degli ultimi voti (solo quando/da dove/come, mai chi
// né cosa), andamento minuto per minuto, provenienza, classifica (o la
// sua versione coperta finché non si svela).
import { useEffect, useRef, useState } from 'react';
import type { Proposta, Statistiche } from '@/lib/contest';
import { ETICHETTA_DISPOSITIVO, tempoFa, useAdesso } from '@/lib/contest';
import { Odometro, ContaSu } from './Moiso';
import { Countdown } from './Countdown';
import { Classifica } from './Classifica';

function Titoletto({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--ink)', paddingTop: 10, marginBottom: 16 }}>
      <span className="mz-mono" style={{ color: 'var(--ink)' }}>{children}</span>
      <span className="mz-mono mz-blue">({n})</span>
    </div>
  );
}

function Anello({ quota, etichetta }: { quota: number; etichetta: string }) {
  const r = 46, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 110 110" width="110" height="110" role="img" aria-label={etichetta}>
      <circle cx="55" cy="55" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
      <circle
        cx="55" cy="55" r={r} fill="none" stroke="var(--accento-vivo)" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, quota))}
        transform="rotate(-90 55 55)" style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)' }}
      />
      <text x="55" y="61" textAnchor="middle" style={{ font: '500 22px var(--f-display)', fill: 'var(--ink)' }}>
        {Math.round(Math.min(1, quota) * 100)}%
      </text>
    </svg>
  );
}

function BarreOrizzontali({ voci, totale }: { voci: { nome: string; n: number }[]; totale: number }) {
  const max = Math.max(1, ...voci.map(v => v.n));
  if (voci.length === 0) return <p className="mz-muted" style={{ margin: 0, fontSize: 14 }}>Ancora nessun voto.</p>;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
      {voci.map(v => (
        <li key={v.nome} style={{ display: 'grid', gap: 6 }} title={`${v.nome}: ${v.n} voti`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14 }}>
            <span className="mz-break">{v.nome}</span>
            <span className="mz-num mz-muted">{v.n} · {totale ? Math.round((v.n / totale) * 100) : 0}%</span>
          </div>
          <div className="mz-track" style={{ height: 6 }}>
            <div className="mz-bar" style={{ width: `${(v.n / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Andamento({ dati, adesso }: { dati: Statistiche['andamento']; adesso: number }) {
  const [tip, setTip] = useState<{ x: number; testo: string } | null>(null);
  // Ultimi 30 minuti, anche quelli senza voti: si vede il ritmo.
  const minuti = 30;
  const fineMin = Math.floor(adesso / 60000) * 60000;
  const mappa = new Map(dati.map(d => [new Date(d.t).getTime(), d]));
  const serie = Array.from({ length: minuti }, (_, i) => {
    const t = fineMin - (minuti - 1 - i) * 60000;
    const d = mappa.get(t);
    return { t, remoto: d?.remoto || 0, live: d?.live || 0 };
  });
  const max = Math.max(1, ...serie.map(s => s.remoto + s.live));
  const haLive = serie.some(s => s.live > 0);
  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{ display: 'grid', gridTemplateColumns: `repeat(${minuti}, 1fr)`, gap: 2, alignItems: 'end', height: 120, borderBottom: '1px solid var(--line)' }}
        onMouseLeave={() => setTip(null)}
      >
        {serie.map((s, i) => {
          const tot = s.remoto + s.live;
          const ultimo = i === minuti - 1;
          return (
            <div
              key={s.t}
              style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: tot && s.live && s.remoto ? 2 : 0, cursor: 'default' }}
              onMouseEnter={e => {
                const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                const b = e.currentTarget.getBoundingClientRect();
                const ora = new Date(s.t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
                setTip({ x: b.left - r.left + b.width / 2, testo: `${ora} · ${tot} ${tot === 1 ? 'voto' : 'voti'}${haLive ? ` (${s.remoto} remoto, ${s.live} dal vivo)` : ''}` });
              }}
            >
              {s.live > 0 && <div className={ultimo ? 'mz-breathe' : ''} style={{ height: `${(s.live / max) * 100}%`, background: 'var(--ink)', borderRadius: '4px 4px 0 0', transition: 'height 1s cubic-bezier(.2,.8,.2,1)' }} />}
              <div className={ultimo && s.remoto ? 'mz-breathe' : ''} style={{ height: `${(s.remoto / max) * 100}%`, minHeight: tot ? 0 : 2, background: tot ? 'var(--accento-vivo)' : 'var(--line)', borderRadius: s.live ? 0 : '4px 4px 0 0', transition: 'height 1s cubic-bezier(.2,.8,.2,1)' }} />
            </div>
          );
        })}
      </div>
      {tip && <span className="mz-tip" style={{ left: tip.x, top: 0 }}>{tip.testo}</span>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <span className="mz-mono">−30 min</span>
        {haLive && (
          <span style={{ display: 'flex', gap: 14 }}>
            <span className="mz-mono" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><i style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accento-vivo)', display: 'inline-block' }} />Da remoto</span>
            <span className="mz-mono" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><i style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--ink)', display: 'inline-block' }} />Dal vivo</span>
          </span>
        )}
        <span className="mz-mono">ora</span>
      </div>
    </div>
  );
}

function Flusso({ ultimi, adesso }: { ultimi: Statistiche['ultimi']; adesso: number }) {
  const visti = useRef<Set<number> | null>(null);
  const primaVolta = visti.current === null;
  if (visti.current === null) visti.current = new Set(ultimi.map(u => u.id));
  const nuovi = ultimi.filter(u => !visti.current!.has(u.id)).map(u => u.id);
  useEffect(() => { ultimi.forEach(u => visti.current!.add(u.id)); });
  if (ultimi.length === 0) {
    return <p className="mz-muted" style={{ margin: 0, fontSize: 14 }}>Il primo voto comparirà qui, in diretta.</p>;
  }
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-live="polite">
      {ultimi.slice(0, 8).map((u, i) => (
        <li
          key={u.id + ':' + u.t}
          className={!primaVolta && nuovi.includes(u.id) ? 'mz-flash' : ''}
          style={{ display: 'grid', gridTemplateColumns: '64px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '10px 6px', borderTop: i ? '1px solid var(--line)' : undefined, borderRadius: 6, opacity: 1 - i * 0.08 }}
        >
          <span className="mz-mono mz-num">{tempoFa(u.t, adesso)}</span>
          <span className="mz-break" style={{ fontSize: 14 }}>
            Un voto {u.zona ? <>da <strong style={{ fontWeight: 600 }}>{u.zona}</strong></> : 'anonimo'}
            <span className="mz-muted"> · {ETICHETTA_DISPOSITIVO[u.dispositivo] || 'Altro'}</span>
          </span>
          <span className="mz-mono" style={{ color: u.fase === 'live' ? 'var(--ink)' : 'var(--accento)' }}>{u.fase === 'live' ? 'In aula' : 'Remoto'}</span>
        </li>
      ))}
    </ul>
  );
}

export function DashboardVoto({ stat, scarto, proposte, mioVoto, onApri, fase = 'remoto' }: {
  stat: Statistiche;
  scarto: number;
  proposte: Proposta[];
  mioVoto?: number | null;
  onApri?: (p: Proposta) => void;
  fase?: 'remoto' | 'live';
}) {
  const adesso = useAdesso(scarto, 500);
  const totale = stat.totale.remoto + stat.totale.live;
  const totaleFase = fase === 'live' ? stat.totale.live : stat.totale.remoto;
  const affluenza = stat.iscritti ? stat.totale.remoto / stat.iscritti : 0;
  const finito = stat.remoto_finito;
  const dispositivi = Object.entries(stat.dispositivi).map(([k, n]) => ({ nome: ETICHETTA_DISPOSITIVO[k] || k, n })).sort((a, b) => b.n - a.n);
  const zone = stat.zone.map(z => ({ nome: z.zona, n: z.n }));
  const perId = new Map((stat.per_proposta || []).map(p => [p.id, p]));
  const righe = proposte.map(p => ({ proposta: p, voti: (perId.get(p.id)?.remoto || 0) + (perId.get(p.id)?.live || 0) }));
  const coperta = !stat.classifica_visibile || !stat.per_proposta;

  return (
    <div style={{ display: 'grid', gap: 'clamp(40px, 6vw, 72px)' }}>
      {/* Riga eroe: totale, countdown, affluenza */}
      <section className="mz-in" style={{ display: 'grid', gap: 32, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', alignItems: 'end' }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <span className="mz-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span className={`mz-live-dot ${finito ? 'off' : ''}`} /> {finito ? 'Voti finali' : 'Voti anonimi, in diretta'}
          </span>
          <span className="mz-display" style={{ fontSize: 'clamp(84px, 14vw, 180px)', lineHeight: .85 }}>
            <Odometro valore={totaleFase} cifre={2} />
          </span>
          <span className="mz-muted" style={{ fontSize: 14 }}>
            {fase === 'remoto' ? 'voti da remoto' : 'voti dal vivo'}{stat.totale.live > 0 && fase === 'remoto' ? <> · <ContaSu valore={stat.totale.live} /> dal vivo in aula</> : null}
            {' · '}{stat.proposte} proposte in gara
          </span>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          <span className="mz-mono">{finito ? 'Votazione' : 'Alla chiusura mancano'}</span>
          {stat.voto_fine ? <Countdown fine={stat.voto_fine} inizio={stat.voto_inizio} adesso={adesso} grande={false} /> : <span className="mz-display" style={{ fontSize: 30 }}>—</span>}
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <Anello quota={affluenza} etichetta={`Affluenza ${Math.round(affluenza * 100)}%`} />
          <div style={{ display: 'grid', gap: 4 }}>
            <span className="mz-mono">Affluenza</span>
            <span style={{ fontSize: 14 }}><ContaSu valore={stat.totale.remoto} /> su <span className="mz-num">{stat.iscritti}</span> iscritti hanno votato</span>
          </div>
        </div>
      </section>

      <section style={{ display: 'grid', gap: 'clamp(32px, 5vw, 56px)', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))' }}>
        <div className="mz-in" style={{ animationDelay: '80ms' }}>
          <Titoletto n="01">Ultimi voti</Titoletto>
          <Flusso ultimi={stat.ultimi} adesso={adesso} />
        </div>
        <div className="mz-in" style={{ animationDelay: '140ms' }}>
          <Titoletto n="02">Ritmo del voto, minuto per minuto</Titoletto>
          <Andamento dati={stat.andamento} adesso={adesso} />
        </div>
      </section>

      <section style={{ display: 'grid', gap: 'clamp(32px, 5vw, 56px)', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
        <div className="mz-in" style={{ animationDelay: '200ms' }}>
          <Titoletto n="03">Da dove si vota</Titoletto>
          <BarreOrizzontali voci={zone} totale={totale} />
        </div>
        <div className="mz-in" style={{ animationDelay: '260ms' }}>
          <Titoletto n="04">Con quale dispositivo</Titoletto>
          <BarreOrizzontali voci={dispositivi} totale={totale} />
        </div>
        <div className="mz-in" style={{ animationDelay: '320ms' }}>
          <Titoletto n="05">Da remoto e in aula</Titoletto>
          <BarreOrizzontali voci={[{ nome: 'Da remoto', n: stat.totale.remoto }, { nome: 'Dal vivo, in aula', n: stat.totale.live }].filter(v => v.n > 0)} totale={totale} />
        </div>
      </section>

      <section className="mz-in" style={{ animationDelay: '380ms' }}>
        <Titoletto n="06">{coperta ? 'Classifica, coperta' : finito ? 'Classifica finale' : 'Classifica in diretta'}</Titoletto>
        {coperta && (
          <p style={{ margin: '0 0 18px', fontSize: 15, maxWidth: 560 }}>
            La classifica resta coperta fino allo scadere del countdown, così nessuno vota guardando chi è in testa.
          </p>
        )}
        <Classifica righe={righe} coperta={coperta} evidenzia={mioVoto ?? null} onApri={onApri} />
        {mioVoto && <p className="mz-mono" style={{ marginTop: 14 }}>Il contorno blu indica la proposta che hai votato. Lo vedi solo tu.</p>}
      </section>
    </div>
  );
}
