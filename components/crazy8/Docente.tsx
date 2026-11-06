'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { nomeContesto, testoHmw, hmwCompleta, type Contesto, type Hmw } from './shared';

// Strumenti docente di Crazy 8: bacheca dei contesti (con quanti contesti
// sceglie ogni team) e wall delle domande HMW da proiettare in aula.

export type TeamAttivitaElenco = { id: string; numero: number; nome: string; membri: string[] };

const errore = (codice: string) =>
  codice === 'passcode_errato' ? 'Password docente non valida per questo corso.'
    : codice === 'titolo_mancante' ? 'Scrivi il titolo del contesto.'
      : 'Operazione non riuscita. Riprova.';

export function PannelloContesti({ attivitaId, passcode, contesti, contestiPerTeam, onCambiato }: {
  attivitaId: string;
  passcode: string;
  contesti: Contesto[];
  contestiPerTeam: number;
  onCambiato: () => void;
}) {
  const [titolo, setTitolo] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [modificaId, setModificaId] = useState<string | null>(null);
  const [valore, setValore] = useState(String(contestiPerTeam));
  const [msg, setMsg] = useState('');

  useEffect(() => { setValore(String(contestiPerTeam)); }, [contestiPerTeam]);

  const salvaConfig = async (n: number) => {
    setValore(String(n));
    const { error } = await supabase.rpc('docente_imposta_config_attivita', { p_id: attivitaId, p_config: { contesti_per_team: n }, p_passcode: passcode });
    setMsg(error ? errore(error.message) : 'Salvato');
    if (!error) onCambiato();
  };

  const salvaContesto = async () => {
    const { error } = await supabase.rpc('docente_salva_contesto_crazy8', {
      p_attivita_id: attivitaId, p_id: modificaId, p_titolo: titolo, p_descrizione: descrizione, p_passcode: passcode,
    });
    if (error) { setMsg(errore(error.message)); return; }
    setTitolo(''); setDescrizione(''); setModificaId(null); setMsg('');
    onCambiato();
  };

  const elimina = async (c: Contesto) => {
    if (!window.confirm(`Togliere "${c.titolo}" dalla bacheca? I team che l'avevano scelto lo perdono.`)) return;
    const { error } = await supabase.rpc('docente_elimina_contesto_crazy8', { p_id: c.id, p_passcode: passcode });
    if (error) setMsg(errore(error.message)); else onCambiato();
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-sm font-medium text-stone-900">Quanti contesti sceglie ogni team</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {[1, 2, 3].map(n => (
            <button key={n} type="button" className={`mz-chip ${Number(valore) === n ? 'on' : ''}`} onClick={() => salvaConfig(n)}>{n}</button>
          ))}
          <button type="button" className={`mz-chip ${Number(valore) === 0 ? 'on' : ''}`} onClick={() => salvaConfig(0)}>Tutti quelli che vogliono</button>
          <label className="flex items-center gap-1.5 text-xs text-stone-500 ml-1">
            Altro:
            <input type="number" min={0} max={50} value={valore} onChange={e => setValore(e.target.value)} onBlur={() => salvaConfig(Math.max(0, Math.min(50, Number(valore) || 0)))} className="mz-input" style={{ width: 80, padding: '6px 10px' }} aria-label="Numero di contesti per team" />
          </label>
        </div>
        <p className="text-xs text-stone-500">Il sotto-ambito del team conta già come primo contesto. 0 = nessun limite.</p>
      </section>

      <section className="space-y-2">
        <p className="text-sm font-medium text-stone-900">Bacheca ({contesti.length})</p>
        <ul className="space-y-1.5">
          {contesti.map((c, i) => (
            <li key={c.id} className="flex items-start justify-between gap-3 bg-white border border-stone-200 rounded-xl px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-stone-900"><span className="mz-mono mr-1.5">({String(i + 1).padStart(2, '0')})</span>{c.titolo}</p>
                {c.descrizione && <p className="text-xs text-stone-500">{c.descrizione}</p>}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button type="button" className="mz-pill sm ghost" onClick={() => { setModificaId(c.id); setTitolo(c.titolo); setDescrizione(c.descrizione || ''); }}>Modifica</button>
                <button type="button" className="mz-pill sm ghost danger" onClick={() => elimina(c)} aria-label={`Elimina ${c.titolo}`}>✕</button>
              </div>
            </li>
          ))}
          {contesti.length === 0 && <li className="text-xs text-stone-400">Nessun contesto ancora: aggiungine qui sotto.</li>}
        </ul>
        <form className="grid gap-2 pt-2" onSubmit={e => { e.preventDefault(); salvaContesto(); }}>
          <input className="mz-input" value={titolo} onChange={e => setTitolo(e.target.value)} placeholder="Titolo del contesto (es. Mercato rionale)" aria-label="Titolo del contesto" />
          <input className="mz-input" value={descrizione} onChange={e => setDescrizione(e.target.value)} placeholder="Una riga di descrizione (facoltativa)" aria-label="Descrizione del contesto" />
          <div className="flex gap-2">
            <button type="submit" className="mz-pill sm" disabled={!titolo.trim()}>{modificaId ? 'Salva modifica' : '+ Aggiungi in bacheca'}</button>
            {modificaId && <button type="button" className="mz-pill sm ghost" onClick={() => { setModificaId(null); setTitolo(''); setDescrizione(''); }}>Annulla</button>}
          </div>
        </form>
        {msg && <p className="text-xs text-stone-500" aria-live="polite">{msg}</p>}
      </section>
    </div>
  );
}

type Domanda = { chiave: string; submission: any; indice: number; hmw: Hmw; revisione: 'ok' | 'rivedere' | null };

export function WallHmw({ attivitaId, submissions, contesti, teams, passcode, onChiudi, onCambiato }: {
  attivitaId: string;
  submissions: any[];
  contesti: Contesto[];
  teams: TeamAttivitaElenco[];
  passcode: string;
  onChiudi: () => void;
  onCambiato: () => void;
}) {
  const [aperta, setAperta] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'tutte' | 'ok' | 'da_vedere'>('tutte');
  const [pausa, setPausa] = useState(false);
  const scorri = useRef<HTMLDivElement>(null);

  const domande: Domanda[] = submissions
    .filter(s => s.hmw_inviate && Array.isArray(s.hmw))
    .flatMap(s => (s.hmw as Hmw[]).map((h, i) => ({
      chiave: `${s.id}:${i}`, submission: s, indice: i, hmw: h,
      revisione: (Array.isArray(s.hmw_revisione) ? s.hmw_revisione[i] : null) || null,
    })))
    .filter(d => hmwCompleta(d.hmw))
    .filter(d => filtro === 'tutte' || (filtro === 'ok' ? d.revisione === 'ok' : d.revisione !== 'ok'));

  const corrente = domande.find(d => d.chiave === aperta) || null;
  const daSbloccare = submissions.filter(s => s.hmw_inviate && !s.sketch_sbloccato).length;

  // Scorrimento lento e continuo, come un wall; si ferma passandoci sopra
  // o quando una domanda è aperta.
  useEffect(() => {
    let raf = 0;
    let ultimo = performance.now();
    const passo = (t: number) => {
      const el = scorri.current;
      if (el && !pausa && !aperta && el.scrollHeight > el.clientHeight + 4) {
        el.scrollTop += ((t - ultimo) / 1000) * 28;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) el.scrollTop = 0;
      }
      ultimo = t;
      raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [pausa, aperta]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (aperta) setAperta(null); else onChiudi(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aperta, onChiudi]);

  const revisiona = async (d: Domanda, stato: 'ok' | 'rivedere' | null) => {
    const { error } = await supabase.rpc('docente_revisione_hmw_crazy8', { p_id: d.submission.id, p_indice: d.indice, p_stato: stato, p_passcode: passcode });
    if (!error) onCambiato();
  };

  const sblocca = async (submissionId: string, valore: boolean) => {
    const { error } = await supabase.rpc('docente_sblocca_sketch_crazy8', { p_id: submissionId, p_valore: valore, p_passcode: passcode });
    if (!error) onCambiato();
  };

  const sbloccaTutti = async () => {
    if (!window.confirm(`Sbloccare gli sketch a tutti i ${daSbloccare} team che hanno inviato le domande?`)) return;
    const { error } = await supabase.rpc('docente_sblocca_sketch_tutti_crazy8', { p_attivita_id: attivitaId, p_valore: true, p_passcode: passcode });
    if (!error) onCambiato();
  };

  const teamDi = (s: any) => teams.find(t => t.id === s.team_attivita_id);

  return (
    <div className="mz fixed inset-0 z-[60] flex flex-col" data-theme="dark" style={{ background: 'var(--bg)', color: 'var(--ink)' }} role="dialog" aria-modal="true" aria-label="Wall delle domande HMW">
      <header className="mz-rail" style={{ position: 'relative' }}>
        <span className="mz-mono" style={{ color: 'var(--ink)' }}>Come potremmo… ({String(domande.length).padStart(2, '0')})</span>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {(['tutte', 'da_vedere', 'ok'] as const).map(f => (
            <button key={f} type="button" className={`mz-chip ${filtro === f ? 'on' : ''}`} onClick={() => setFiltro(f)}>
              {f === 'tutte' ? 'Tutte' : f === 'ok' ? 'Pertinenti' : 'Da vedere'}
            </button>
          ))}
          <button type="button" className="mz-pill sm b" disabled={daSbloccare === 0} onClick={sbloccaTutti}>Sblocca gli sketch a tutti ({daSbloccare})</button>
          <button type="button" className="mz-pill sm ghost" onClick={onChiudi} aria-label="Chiudi il wall">✕</button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <div ref={scorri} className="flex-1 overflow-y-auto px-[max(20px,3vw)] py-8" onMouseEnter={() => setPausa(true)} onMouseLeave={() => setPausa(false)}>
          {domande.length === 0 ? (
            <p className="mz-display" style={{ fontSize: 'clamp(28px, 4vw, 56px)', color: 'var(--muted)' }}>Nessuna domanda inviata ancora.</p>
          ) : (
            <ul className="columns-1 md:columns-2 xl:columns-3 gap-5" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {domande.map((d, i) => (
                <li key={d.chiave} className="mz-in break-inside-avoid mb-5" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
                  <button
                    type="button"
                    onClick={() => setAperta(d.chiave)}
                    className="w-full text-left rounded-3xl p-6 transition"
                    style={{
                      background: aperta === d.chiave ? 'var(--accento-vivo)' : 'var(--surface)',
                      color: aperta === d.chiave ? '#1c1917' : 'var(--ink)',
                      boxShadow: d.revisione === 'ok' ? 'inset 0 0 0 2px #34d399' : d.revisione === 'rivedere' ? 'inset 0 0 0 2px #f87171' : 'inset 0 0 0 1px var(--line)',
                    }}
                  >
                    <span className="mz-mono" style={{ color: aperta === d.chiave ? 'rgba(28,25,23,.7)' : 'var(--accento)' }}>
                      {nomeContesto(d.hmw.contesto, contesti) || 'Contesto'}{d.revisione === 'ok' ? ' ✓' : d.revisione === 'rivedere' ? ' — da rivedere' : ''}
                    </span>
                    <span className="block mt-3" style={{ fontFamily: 'var(--f-display)', fontSize: 'clamp(22px, 2.2vw, 34px)', lineHeight: 1.1, letterSpacing: '-.02em' }}>
                      {testoHmw(d.hmw)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {corrente && (
          <aside className="w-full max-w-md flex-shrink-0 overflow-y-auto p-6 space-y-5 animate-fade-in" style={{ borderLeft: '1px solid var(--line)', background: 'var(--surface)' }}>
            <div className="flex justify-between items-start gap-3">
              <span className="mz-mono">Proposta da</span>
              <button type="button" className="mz-pill sm ghost" onClick={() => setAperta(null)} aria-label="Chiudi">✕</button>
            </div>
            <div>
              <p className="mz-display" style={{ fontSize: 40 }}>{teamDi(corrente.submission)?.nome || corrente.submission.gruppo_nome}</p>
              <p className="text-sm mt-1" style={{ color: 'var(--ink-2)' }}>{(teamDi(corrente.submission)?.membri || []).join(', ') || `Gruppo ${corrente.submission.gruppo_num}`}</p>
              {corrente.submission.hmw_o_tema && <p className="mz-mono mt-2" style={{ textTransform: 'none' }}>Sotto-ambito: {corrente.submission.hmw_o_tema}</p>}
            </div>
            {(corrente.submission.hmw as Hmw[]).map((h, i) => {
              const rev = (corrente.submission.hmw_revisione || [])[i] || null;
              const d: Domanda = { chiave: `${corrente.submission.id}:${i}`, submission: corrente.submission, indice: i, hmw: h, revisione: rev };
              return (
                <div key={i} className="rounded-2xl p-4 space-y-3" style={{ boxShadow: i === corrente.indice ? 'inset 0 0 0 2px var(--accento-vivo)' : 'inset 0 0 0 1px var(--line)' }}>
                  <p className="mz-mono">Domanda ({String(i + 1).padStart(2, '0')}) — {nomeContesto(h.contesto, contesti)}</p>
                  <p style={{ fontFamily: 'var(--f-display)', fontSize: 20, lineHeight: 1.2 }}>{testoHmw(h)}</p>
                  <div className="flex gap-2 flex-wrap">
                    <button type="button" className={`mz-pill sm ${rev === 'ok' ? 'b' : 'o'}`} onClick={() => revisiona(d, rev === 'ok' ? null : 'ok')}>✓ Pertinente</button>
                    <button type="button" className={`mz-pill sm ${rev === 'rivedere' ? '' : 'o'}`} style={rev === 'rivedere' ? { background: '#f87171', color: '#1c1917' } : undefined} onClick={() => revisiona(d, rev === 'rivedere' ? null : 'rivedere')}>Da rivedere</button>
                  </div>
                </div>
              );
            })}
            <div className="pt-2" style={{ borderTop: '1px solid var(--line)' }}>
              {corrente.submission.sketch_sbloccato ? (
                <button type="button" className="mz-pill sm ghost" onClick={() => sblocca(corrente.submission.id, false)}>Sketch aperti — richiudi</button>
              ) : (
                <button type="button" className="mz-pill b" onClick={() => sblocca(corrente.submission.id, true)}>Sblocca gli sketch a questo team</button>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
