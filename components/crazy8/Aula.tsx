'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Solidi } from '@/components/moiso/Moiso';
import { FASI } from './shared';

// Regia dell'aula per Crazy 8, salvata in attivita.config:
// - timer: { fine (ms), durata (s), rimanente (s, se in pausa) }
//   lo vedono docente (anche proiettato) e studenti, in tempo reale;
// - fase_aperta: fin dove possono arrivare gli studenti (1–6).

export type TimerC8 = { fine?: number | null; durata?: number; rimanente?: number | null };
export type ConfigAula = { timer?: TimerC8; fase_aperta?: number };

export const due = (n: number) => String(n).padStart(2, '0');
export const formattaTempo = (s: number) => `${due(Math.floor(Math.max(0, s) / 60))}:${due(Math.floor(Math.max(0, s) % 60))}`;

// secondi rimasti, se il timer è in corso o in pausa; null se fermo
export function secondiRimasti(t: TimerC8 | undefined, adesso: number): number | null {
  if (!t) return null;
  if (typeof t.rimanente === 'number') return t.rimanente;
  if (typeof t.fine === 'number') return Math.max(0, Math.ceil((t.fine - adesso) / 1000));
  return null;
}

export function useAdesso(attivo: boolean, passo = 250) {
  const [adesso, setAdesso] = useState(() => Date.now());
  useEffect(() => {
    if (!attivo) return;
    const id = setInterval(() => setAdesso(Date.now()), passo);
    return () => clearInterval(id);
  }, [attivo, passo]);
  return adesso;
}

// segnale breve a fine tempo (tre note), senza file audio
function suonaFine() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.22, 0.44].forEach((t, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = [660, 880, 1100][i];
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.4);
    });
  } catch { /* audio non disponibile */ }
}

// Timer a tutto schermo, da proiettare
export function TimerProiezione({ timer, onChiudi, comandi }: { timer: TimerC8 | undefined; onChiudi: () => void; comandi?: React.ReactNode }) {
  const adesso = useAdesso(true, 200);
  const rimasti = secondiRimasti(timer, adesso);
  const durata = timer?.durata || 480;
  const finito = rimasti === 0;
  const suonato = useRef(false);
  const radice = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (finito && !suonato.current && typeof timer?.fine === 'number') { suonato.current = true; suonaFine(); }
    if (!finito) suonato.current = false;
  }, [finito, timer?.fine]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onChiudi(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChiudi]);

  const k = rimasti === null ? 0 : 1 - rimasti / durata;
  return (
    <div ref={radice} className={`mz c8-timer-scena ${finito ? 'finito' : ''}`} data-theme={finito ? undefined : 'dark'} role="dialog" aria-modal="true" aria-label="Timer di Crazy 8">
      <header className="mz-rail" style={{ position: 'relative', background: 'transparent', borderBottom: 0 }}>
        <span className="mz-mono" style={{ color: 'inherit' }}>Crazy 8: 8 idee in {Math.round(durata / 60)} minuti</span>
        <div className="flex gap-2 items-center">
          {comandi}
          <button type="button" className="mz-pill sm ghost" style={{ color: 'inherit' }} onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else radice.current?.requestFullscreen?.().catch(() => {}); }}>⤢</button>
          <button type="button" className="mz-pill sm ghost" style={{ color: 'inherit' }} onClick={onChiudi} aria-label="Chiudi">✕</button>
        </div>
      </header>
      <div className="c8-timer-corpo">
        {finito ? (
          <>
            <Solidi cadono colore="#1c1917" />
            <p className="mz-display c8-timer-cifre" style={{ fontSize: 'clamp(80px, 16vw, 260px)' }}>Tempo!</p>
            <p className="c8-timer-sotto">Matite giù: fotografate gli sketch.</p>
          </>
        ) : (
          <>
            <p className="mz-display c8-timer-cifre" aria-live="off">{rimasti === null ? formattaTempo(durata) : formattaTempo(rimasti)}</p>
            <p className="c8-timer-sotto">{rimasti === null ? 'Pronti?' : typeof timer?.rimanente === 'number' ? 'In pausa' : 'Un\'idea per foglio, senza fermarvi.'}</p>
          </>
        )}
      </div>
      <div className="c8-timer-barra"><div style={{ transform: `scaleX(${Math.min(1, Math.max(0, k))})` }} /></div>
    </div>
  );
}

// Piccolo timer per gli studenti (nella barra in alto)
export function TimerStudente({ timer }: { timer: TimerC8 | undefined }) {
  const attivo = !!timer && (typeof timer.fine === 'number' || typeof timer.rimanente === 'number');
  const adesso = useAdesso(attivo, 500);
  const rimasti = secondiRimasti(timer, adesso);
  if (!attivo || rimasti === null) return null;
  const poco = rimasti <= 60;
  return (
    <span className={`c8-timer-pill ${rimasti === 0 ? 'finito' : poco ? 'poco' : ''}`} role="timer" aria-label={`Tempo rimasto ${formattaTempo(rimasti)}`}>
      <span className="mz-live-dot" style={{ width: 7, height: 7 }} />
      {rimasti === 0 ? 'Tempo!' : formattaTempo(rimasti)}
    </span>
  );
}

// Pannello di regia per il docente: timer e fasi aperte
export function PannelloRegia({ attivitaId, passcode, config, onCambiato, onProietta }: {
  attivitaId: string;
  passcode: string;
  config: ConfigAula;
  onCambiato: () => void;
  onProietta: () => void;
}) {
  const [msg, setMsg] = useState('');
  const adesso = useAdesso(true, 500);
  const timer = config.timer || {};
  const rimasti = secondiRimasti(timer, adesso);
  const inCorso = typeof timer.fine === 'number' && rimasti !== 0;
  const inPausa = typeof timer.rimanente === 'number';
  const durata = timer.durata || 480;
  const faseAperta = config.fase_aperta || FASI.length;

  const salva = async (patch: ConfigAula) => {
    const { error } = await supabase.rpc('docente_imposta_config_attivita', { p_id: attivitaId, p_config: patch, p_passcode: passcode });
    setMsg(error ? 'Non salvato: controlla il database o la password.' : '');
    if (!error) onCambiato();
  };

  const avvia = () => salva({ timer: { durata, fine: Date.now() + (inPausa ? timer.rimanente! : durata) * 1000, rimanente: null } });
  const pausa = () => rimasti !== null && salva({ timer: { durata, fine: null, rimanente: rimasti } });
  const azzera = () => salva({ timer: { durata, fine: null, rimanente: null } });

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <p className="text-sm font-medium text-stone-900">Timer</p>
        <p className="mz-display m-0" style={{ fontSize: 56 }}>{formattaTempo(rimasti ?? durata)}</p>
        <div className="flex flex-wrap gap-1.5">
          {[5, 8, 10].map(m => (
            <button key={m} type="button" className={`mz-chip ${durata === m * 60 ? 'on' : ''}`} disabled={inCorso} onClick={() => salva({ timer: { durata: m * 60, fine: null, rimanente: null } })}>{m} min</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {inCorso ? (
            <button type="button" className="mz-pill" onClick={pausa}>Pausa</button>
          ) : (
            <button type="button" className="mz-pill b" onClick={avvia}>{inPausa ? 'Riprendi' : rimasti === 0 ? 'Riparti' : 'Avvia'}</button>
          )}
          <button type="button" className="mz-pill o" onClick={azzera}>Azzera</button>
          <button type="button" className="mz-pill o" onClick={onProietta}>Proietta ⤢</button>
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-sm font-medium text-stone-900">Fin dove possono arrivare gli studenti</p>
        <div className="flex flex-wrap gap-1.5">
          {FASI.map(f => (
            <button key={f.n} type="button" className={`mz-chip ${faseAperta === f.n ? 'on' : ''}`} onClick={() => salva({ fase_aperta: f.n })}>
              <span className="mz-mono">{due(f.n)}</span>{f.breve}
            </button>
          ))}
        </div>
        <p className="text-xs text-stone-500 m-0">Le fasi successive restano chiuse finché non le apri. Gli sketch si aprono comunque solo ai team con le domande approvate.</p>
      </section>
      {msg && <p className="text-xs text-red-600" role="alert">{msg}</p>}
    </div>
  );
}
