'use client';
// Iscrizione e accesso: da solo/a (individuale) o come gruppo.
// Il contest dice quali tipi accetta; qui si sceglie quello giusto.
import { useState } from 'react';
import type { Iscrizione } from '@/lib/contest';
import type { TipoPartecipante } from '@/lib/partecipante';
import { Segmentato, Solidi } from './Moiso';

export function AccessoPartecipante({ ammessi = 'entrambe', onRegistra, onAccedi, titolo }: {
  ammessi?: Iscrizione;
  titolo?: string;
  onRegistra: (tipo: TipoPartecipante, nome: string, password: string, membri: string[]) => Promise<string>;
  onAccedi: (nome: string, password: string) => Promise<string>;
}) {
  const [modo, setModo] = useState<'accedi' | 'iscriviti'>('iscriviti');
  const [tipo, setTipo] = useState<TipoPartecipante>(ammessi === 'gruppo' ? 'gruppo' : 'individuale');
  const [nome, setNome] = useState('');
  const [password, setPassword] = useState('');
  const [membri, setMembri] = useState<string[]>(['', '']);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const invia = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    const msg = modo === 'accedi'
      ? await onAccedi(nome, password)
      : await onRegistra(tipo, nome, password, tipo === 'gruppo' ? membri.map(m => m.trim()).filter(Boolean) : []);
    setInvio(false);
    if (msg) setErrore(msg);
  };

  const valido = nome.trim().length >= 2 && password.length >= 4 && (modo === 'accedi' || tipo === 'individuale' || membri.some(m => m.trim()));

  return (
    <section style={{ minHeight: 'calc(100vh - 58px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 'clamp(28px, 6vw, 80px)', alignItems: 'center', padding: 'clamp(28px, 6vw, 72px) max(20px, env(safe-area-inset-left))', maxWidth: 1280, margin: '0 auto' }}>
      <div className="mz-in" style={{ display: 'grid', gap: 22 }}>
        <Solidi cadono piccoli />
        <span className="mz-mono">Accesso al contest</span>
        <h1 className="mz-display" style={{ fontSize: 'clamp(46px, 7vw, 96px)' }}>
          Partecipa <span className="mz-blue">da solo/a</span> o <span className="mz-blue">in gruppo</span>.
        </h1>
        <p className="mz-muted" style={{ fontSize: 17, maxWidth: 480, margin: 0 }}>
          {titolo ? <>Per «{titolo}» </> : 'Per alcune attività '}l'impegno è {ammessi === 'gruppo' ? 'di gruppo' : ammessi === 'individuale' ? 'individuale' : 'individuale o di gruppo'}. Il voto resta anonimo: nessuno vede chi ha votato cosa.
        </p>
      </div>

      <form onSubmit={invia} className="mz-in" style={{ animationDelay: '120ms', display: 'grid', gap: 18, background: 'var(--surface)', borderRadius: 22, padding: 'clamp(20px, 3vw, 32px)', boxShadow: '0 30px 80px rgba(10,12,30,.08)' }}>
        <Segmentato
          etichetta="Accedi o iscriviti"
          valore={modo}
          onCambia={v => { setModo(v); setErrore(''); }}
          opzioni={[{ id: 'iscriviti', label: 'Mi iscrivo' }, { id: 'accedi', label: 'Ho già un accesso' }]}
          className="w-fit"
        />

        {modo === 'iscriviti' && (
          <div className="mz-field">
            <span className="mz-mono">Come partecipi</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {(['individuale', 'gruppo'] as TipoPartecipante[]).map(t => {
                const disabilitato = ammessi !== 'entrambe' && ammessi !== t;
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={disabilitato}
                    aria-pressed={tipo === t}
                    onClick={() => setTipo(t)}
                    style={{ all: 'unset', cursor: disabilitato ? 'not-allowed' : 'pointer', opacity: disabilitato ? .35 : 1, padding: '14px 16px', borderRadius: 14, boxShadow: `inset 0 0 0 ${tipo === t ? 2 : 1}px ${tipo === t ? 'var(--blue)' : 'var(--line)'}`, display: 'grid', gap: 4, transition: 'box-shadow .3s' }}
                  >
                    <span style={{ fontFamily: 'var(--f-display)', fontSize: 20, letterSpacing: '-.02em' }}>{t === 'individuale' ? 'Da solo/a' : 'Come gruppo'}</span>
                    <span className="mz-muted" style={{ fontSize: 12.5 }}>{t === 'individuale' ? 'Il tuo nome, il tuo voto.' : 'Un nome per tutto il gruppo.'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <label className="mz-field">
          <span className="mz-mono">{modo === 'iscriviti' && tipo === 'gruppo' ? 'Nome del gruppo' : modo === 'accedi' ? 'Nome (persona o gruppo)' : 'Nome e cognome'}</span>
          <input className="mz-input" value={nome} onChange={e => setNome(e.target.value)} autoComplete="username" maxLength={80} required />
        </label>

        {modo === 'iscriviti' && tipo === 'gruppo' && (
          <div className="mz-field">
            <span className="mz-mono">Membri del gruppo</span>
            {membri.map((m, i) => (
              <input key={i} className="mz-input" value={m} placeholder={`Membro ${i + 1}`} aria-label={`Membro ${i + 1}`}
                onChange={e => setMembri(prev => prev.map((x, j) => (j === i ? e.target.value : x)))} maxLength={80} />
            ))}
            <button type="button" className="mz-pill sm ghost" style={{ justifySelf: 'start' }} onClick={() => setMembri(p => [...p, ''])}>+ Aggiungi membro</button>
          </div>
        )}

        <label className="mz-field">
          <span className="mz-mono">Password {modo === 'iscriviti' && '(almeno 4 caratteri)'}</span>
          <input className="mz-input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={modo === 'accedi' ? 'current-password' : 'new-password'} required />
        </label>

        {errore && <p role="alert" style={{ margin: 0, color: '#d22', fontSize: 14 }}>{errore}</p>}

        <button type="submit" className="mz-pill b lg" disabled={!valido || invio}>
          {invio ? 'Un momento…' : modo === 'accedi' ? 'Entra →' : 'Iscriviti ed entra →'}
        </button>
        <p className="mz-muted" style={{ margin: 0, fontSize: 12.5 }}>
          Hai dimenticato la password? Chiedi al/alla docente di reimpostarla.
        </p>
      </form>
    </section>
  );
}
