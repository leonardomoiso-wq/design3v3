'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Solidi } from '@/components/moiso/Moiso';

// Ogni attività ha la sua composizione dei team. Prima di iniziare Crazy 8
// uno studente crea il team (nome, membri, password) e gli altri entrano
// con nome e password. Il team resta ricordato nel browser per questa
// attività, separato dall'accesso al corso.

export type TeamAttivita = { id: string; numero: number; nome: string; membri: string[]; password: string };

const chiave = (attivitaId: string) => `edu_team_attivita_${attivitaId}`;

export function leggiTeamAttivita(attivitaId: string): TeamAttivita | null {
  try {
    const v = localStorage.getItem(chiave(attivitaId));
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}

export function salvaTeamAttivita(attivitaId: string, t: TeamAttivita | null) {
  try {
    if (t) localStorage.setItem(chiave(attivitaId), JSON.stringify(t));
    else localStorage.removeItem(chiave(attivitaId));
  } catch { /* non bloccante */ }
}

const messaggio = (codice: string) => {
  switch (codice) {
    case 'nome_troppo_corto': return 'Il nome del team deve avere almeno 2 caratteri.';
    case 'password_troppo_corta': return 'La password deve avere almeno 4 caratteri.';
    case 'nome_gia_usato': return 'Questo nome è già di un altro team: entrate con la sua password o sceglietene un altro.';
    case 'membri_mancanti': return 'Scrivete i nomi di chi fa parte del team.';
    case 'credenziali_errate': return 'Nome del team o password errati.';
    default: return 'Qualcosa non ha funzionato. Riprovate.';
  }
};

export default function TeamAttivitaGate({ attivitaId, titoloAttivita, membriSuggeriti, onEntrato, avviso }: {
  avviso?: string;
  attivitaId: string;
  titoloAttivita: string;
  membriSuggeriti: string[];
  onEntrato: (t: TeamAttivita) => void;
}) {
  const [modo, setModo] = useState<'crea' | 'entra'>('crea');
  const [esistenti, setEsistenti] = useState<{ id: string; numero: number; nome: string; membri: string[] }[]>([]);
  const [nome, setNome] = useState('');
  const [membri, setMembri] = useState<string[]>(membriSuggeriti.length ? membriSuggeriti : ['', '']);
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [aiuto, setAiuto] = useState(false);
  const [chiSono, setChiSono] = useState(membriSuggeriti.length === 1 ? membriSuggeriti[0] : '');
  const membriPieni = membri.map(m => m.trim()).filter(Boolean);

  useEffect(() => {
    supabase.rpc('elenco_team_attivita', { p_attivita_id: attivitaId }).then(({ data }) => {
      const lista = (data || []) as any[];
      setEsistenti(lista);
      if (lista.length > 0) setModo('entra');
    });
  }, [attivitaId]);

  const invia = async () => {
    setErrore('');
    setInCorso(true);
    const { data, error } = modo === 'crea'
      ? await supabase.rpc('crea_team_attivita', { p_attivita_id: attivitaId, p_nome: nome, p_membri: membri, p_password: password })
      : await supabase.rpc('accedi_team_attivita', { p_attivita_id: attivitaId, p_nome: nome, p_password: password });
    setInCorso(false);
    if (error) { setErrore(messaggio(error.message)); return; }
    const r = (Array.isArray(data) ? data[0] : data) as any;
    if (!r) { setErrore(messaggio('')); return; }
    let elenco: string[] = r.membri || [];
    // chi entra si aggiunge ai membri del team, se non c'è già
    const io = chiSono.trim().replace(/\s+/g, ' ');
    if (modo === 'entra' && io && !elenco.some(m => m.trim().toLowerCase() === io.toLowerCase())) {
      const { data: nuovi, error: e2 } = await supabase.rpc('aggiorna_membri_team_attivita', { p_id: r.id, p_password: password, p_membri: [...elenco, io] });
      if (!e2 && Array.isArray(nuovi)) elenco = nuovi as string[];
    }
    onEntrato({ id: r.id, numero: r.numero, nome: r.nome, membri: elenco, password });
  };

  return (
    <section className="mz-ingresso md:min-h-[calc(100vh-70px)]">
      <div className="mz-ingresso-testo mz-in">
        <h1 className="mz-display mz-eroe-titolo">Il team<span className="mz-sup">({titoloAttivita})</span></h1>
        <p className="mz-ingresso-lead">Uno di voi crea il team, gli altri entrano con nome e password.</p>
        {avviso && <p role="status" className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3">{avviso}</p>}
        <div className="max-md:hidden"><Solidi cadono /></div>
      </div>
      <form className="mz-ingresso-accesso mz-in" style={{ animationDelay: '120ms' }} onSubmit={e => { e.preventDefault(); invia(); }}>
        <div className="mz-seg" role="group" aria-label="Crea o entra">
          {(['crea', 'entra'] as const).map(m => (
            <button key={m} type="button" aria-current={modo === m ? 'true' : 'false'} onClick={() => { setModo(m); setErrore(''); }}
              style={modo === m ? { background: 'var(--ink)', color: 'var(--bg)' } : undefined}>
              {m === 'crea' ? 'Create il team' : `Entrate in un team (${esistenti.length})`}
            </button>
          ))}
        </div>

        {modo === 'entra' && esistenti.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {esistenti.map(t => (
              <button key={t.id} type="button" className={`mz-chip ${nome.toLowerCase() === t.nome.toLowerCase() ? 'on' : ''}`} onClick={() => setNome(t.nome)} title={t.membri.join(', ')}>
                <span className="mz-mono">{String(t.numero).padStart(2, '0')}</span>{t.nome}
              </button>
            ))}
          </div>
        )}

        <input className="mz-input" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome del team" aria-label="Nome del team" autoComplete="off" />

        {modo === 'crea' && (
          <div className="grid gap-2">
            {membri.map((m, i) => (
              <div key={i} className="flex gap-1.5 items-center">
                <input className="mz-input" value={m} onChange={e => setMembri(prev => prev.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Nome e cognome ${i + 1}`} aria-label={`Membro ${i + 1}`} />
                {membri.length > 1 && <button type="button" className="mz-pill sm ghost danger" onClick={() => setMembri(prev => prev.filter((_, j) => j !== i))} aria-label="Rimuovi">✕</button>}
              </div>
            ))}
            <button type="button" className="mz-pill sm ghost" style={{ justifySelf: 'start' }} onClick={() => setMembri(prev => [...prev, ''])}>+ Un altro membro</button>
          </div>
        )}

        {modo === 'entra' && (
          <input className="mz-input" value={chiSono} onChange={e => setChiSono(e.target.value)} placeholder="Il tuo nome e cognome" aria-label="Il tuo nome e cognome" autoComplete="name" />
        )}

        <input className="mz-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={modo === 'crea' ? 'Password del team (min. 4 caratteri)' : 'Password del team'} aria-label="Password del team" />
        {modo === 'entra' && (
          <div>
            <button type="button" className="text-sm underline underline-offset-2" style={{ color: 'var(--muted)' }} onClick={() => setAiuto(v => !v)} aria-expanded={aiuto}>Password dimenticata?</button>
            {aiuto && (
              <p className="text-sm m-0 mt-2 entra-sezione" style={{ color: 'var(--muted)' }}>
                Se qualcuno del team è ancora dentro su un altro dispositivo, può cambiarla da lì: tocca il nome del team in alto e poi «Cambia password». Altrimenti ditecelo in aula: la reimpostiamo in un attimo.
              </p>
            )}
          </div>
        )}
        {modo === 'crea' && membriPieni.length === 0 && <p className="text-sm m-0" style={{ color: 'var(--muted)' }}>Scrivete chi fa parte del team: almeno un nome.</p>}
        {errore && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 m-0">{errore}</p>}
        <button type="submit" disabled={inCorso || !nome.trim() || password.length < 4 || (modo === 'crea' ? membriPieni.length === 0 : chiSono.trim().length < 3)} className="mz-pill b lg" style={{ width: '100%' }}>
          {inCorso ? 'Un momento…' : modo === 'crea' ? 'Create il team →' : 'Entrate →'}
        </button>
      </form>
    </section>
  );
}

// Menu del team, nella barra in alto: cambiare la password o uscire.
export function MenuTeam({ team, onCambiata, onEsci }: {
  team: TeamAttivita;
  onCambiata: (t: TeamAttivita) => void;
  onEsci: () => void;
}) {
  const [forma, setForma] = useState(false);
  const [nuova, setNuova] = useState('');
  const [ripeti, setRipeti] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; testo: string } | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const cambia = async () => {
    if (nuova.trim().length < 4) { setMsg({ ok: false, testo: messaggio('password_troppo_corta') }); return; }
    if (nuova !== ripeti) { setMsg({ ok: false, testo: 'Le due password non coincidono.' }); return; }
    setInCorso(true);
    const { error } = await supabase.rpc('cambia_password_team_attivita', { p_id: team.id, p_password: team.password, p_nuova: nuova });
    setInCorso(false);
    if (error) { setMsg({ ok: false, testo: error.message === 'credenziali_errate' ? 'La password è già stata cambiata da un altro dispositivo: uscite e rientrate.' : messaggio(error.message) }); return; }
    onCambiata({ ...team, password: nuova });
    setNuova(''); setRipeti(''); setForma(false);
    setMsg({ ok: true, testo: 'Password cambiata. Ditela al resto del team: gli altri dispositivi dovranno rientrare.' });
  };

  return (
    <details className="c8-menu c8-menu-destra" onToggle={e => { if (!(e.currentTarget as HTMLDetailsElement).open) { setForma(false); setMsg(null); } }}>
      <summary className="mz-chip on mz-abbrevia" style={{ maxWidth: 220 }} title="Il vostro team">
        <span className="mz-mono">{String(team.numero).padStart(2, '0')}</span> {team.nome}
      </summary>
      <div className="c8-menu-voci" style={{ minWidth: 260 }}>
        <MembriTeam team={team} onCambiati={membri => onCambiata({ ...team, membri })} />
        {!forma ? (
          <button type="button" onClick={() => { setForma(true); setMsg(null); }}>Cambia password</button>
        ) : (
          <form className="grid gap-2 p-2" onSubmit={e => { e.preventDefault(); cambia(); }}>
            <input className="mz-input" type="password" value={nuova} onChange={e => setNuova(e.target.value)} placeholder="Nuova password (min. 4)" aria-label="Nuova password" autoFocus />
            <input className="mz-input" type="password" value={ripeti} onChange={e => setRipeti(e.target.value)} placeholder="Ripetetela" aria-label="Ripeti la nuova password" />
            <button type="submit" className="mz-pill b sm" disabled={inCorso}>{inCorso ? 'Un momento…' : 'Salva la nuova password'}</button>
          </form>
        )}
        {msg && <p role="status" className={`text-xs m-0 px-3 py-1 ${msg.ok ? 'text-emerald-800' : 'text-red-700'}`}>{msg.testo}</p>}
        <button type="button" onClick={onEsci}>Esci dal team</button>
      </div>
    </details>
  );
}

// I membri del team, modificabili da dentro l'attività
function MembriTeam({ team, onCambiati }: { team: TeamAttivita; onCambiati: (m: string[]) => void }) {
  const [nuovo, setNuovo] = useState('');
  const [errore, setErrore] = useState('');
  const salva = async (membri: string[]) => {
    setErrore('');
    if (membri.length === 0) { setErrore('Nel team deve restare almeno una persona.'); return; }
    const { data, error } = await supabase.rpc('aggiorna_membri_team_attivita', { p_id: team.id, p_password: team.password, p_membri: membri });
    if (error) { setErrore(messaggio(error.message)); return; }
    onCambiati((data as string[]) || membri);
  };
  const aggiungi = () => {
    const n = nuovo.trim().replace(/\s+/g, ' ');
    if (n.length < 3) return;
    if (team.membri.some(m => m.toLowerCase() === n.toLowerCase())) { setNuovo(''); return; }
    salva([...team.membri, n]);
    setNuovo('');
  };
  return (
    <div className="grid gap-1.5 px-3 pt-2 pb-1">
      <span className="mz-mono" style={{ fontSize: 11 }}>Membri ({team.membri.length})</span>
      <div className="flex flex-wrap gap-1.5">
        {team.membri.map(m => (
          <span key={m} className="mz-chip" style={{ cursor: 'default' }}>
            {m}
            <button type="button" onClick={() => salva(team.membri.filter(x => x !== m))} aria-label={`Togli ${m}`} style={{ marginLeft: 4, color: 'var(--muted)' }}>✕</button>
          </span>
        ))}
      </div>
      <form className="flex gap-1.5" onSubmit={e => { e.preventDefault(); aggiungi(); }}>
        <input className="mz-input" value={nuovo} onChange={e => setNuovo(e.target.value)} placeholder="Nome e cognome" aria-label="Aggiungi un membro" style={{ padding: '8px 12px' }} />
        <button type="submit" className="mz-pill sm o" disabled={nuovo.trim().length < 3}>+</button>
      </form>
      {errore && <p role="alert" className="text-xs text-red-700 m-0">{errore}</p>}
    </div>
  );
}
