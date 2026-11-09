'use client';
import { useEffect, useRef, useState } from 'react';
import { Segmentato, Solidi, Ticker } from '@/components/moiso/Moiso';
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
        <p className="text-xs text-stone-500">È la prima scelta dei team entrando in Crazy 8. 0 = nessun limite.</p>
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

const riduci = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Wall delle domande da proiettare in aula. Due viste:
// - Wall: tutte le domande, che fluttuano e scorrono lente; un clic apre
//   il team a lato con revisione e sblocco degli sketch.
// - Una alla volta: la domanda in grande, scorre da sola (10 s) come una
//   presentazione; il team si svela solo quando lo chiedete.
export function WallHmw({ attivitaId, submissions, contesti, teams, passcode, onChiudi, onCambiato, stelle }: {
  stelle?: (submissionId: string, indice: number) => number;
  attivitaId: string;
  submissions: any[];
  contesti: Contesto[];
  teams: TeamAttivitaElenco[];
  passcode: string;
  onChiudi: () => void;
  onCambiato: () => void;
}) {
  const [vista, setVista] = useState<'wall' | 'una'>('wall');
  const [aperta, setAperta] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'tutte' | 'ok' | 'da_vedere' | 'votate'>('tutte');
  const [pausa, setPausa] = useState(false);
  const [indice, setIndice] = useState(0);
  const [svelato, setSvelato] = useState(false);
  const radice = useRef<HTMLDivElement>(null);
  const scorri = useRef<HTMLDivElement>(null);
  const barra = useRef<HTMLDivElement>(null);
  const trascorso = useRef(0);
  const DURATA = 10000;

  const domande: Domanda[] = submissions
    .filter(s => s.hmw_inviate && Array.isArray(s.hmw))
    .flatMap(s => (s.hmw as Hmw[]).map((h, i) => ({
      chiave: `${s.id}:${i}`, submission: s, indice: i, hmw: h,
      revisione: (Array.isArray(s.hmw_revisione) ? s.hmw_revisione[i] : null) || null,
    })))
    .filter(d => hmwCompleta(d.hmw))
    .filter(d => filtro === 'tutte' || filtro === 'votate' || (filtro === 'ok' ? d.revisione === 'ok' : d.revisione !== 'ok'))
    .sort((a, b) => (filtro === 'votate' ? (stelle?.(b.submission.id, b.indice) || 0) - (stelle?.(a.submission.id, a.indice) || 0) : 0));

  const corrente = domande.find(d => d.chiave === aperta) || null;
  const attuale = domande[Math.min(indice, Math.max(0, domande.length - 1))] || null;
  const daSbloccare = submissions.filter(s => s.team_attivita_id && !s.sketch_sbloccato).length;
  const nomiContesti = Array.from(new Set(domande.map(d => nomeContesto(d.hmw.contesto, contesti)).filter(Boolean)));

  const vai = (n: number) => {
    if (domande.length === 0) return;
    setIndice(((n % domande.length) + domande.length) % domande.length);
    setSvelato(false);
    trascorso.current = 0;
  };

  // Un solo ciclo: nel wall scorre la pagina, nella vista "una alla volta"
  // avanza la barra; si ferma passandoci sopra, in pausa o con un team aperto.
  useEffect(() => {
    if (riduci()) return;
    let raf = 0;
    let ultimo = performance.now();
    const passo = (t: number) => {
      const dt = t - ultimo;
      ultimo = t;
      if (vista === 'wall') {
        const el = scorri.current;
        if (el && !pausa && !aperta && el.scrollHeight > el.clientHeight + 4) {
          el.scrollTop += (dt / 1000) * 26;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) el.scrollTop = 0;
        }
      } else if (domande.length > 1) {
        if (!pausa && !svelato) trascorso.current += dt;
        const k = Math.min(1, trascorso.current / DURATA);
        if (barra.current) barra.current.style.transform = `scaleX(${k})`;
        if (k >= 1) { vai(indice + 1); }
      }
      raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, pausa, aperta, svelato, indice, domande.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (aperta) setAperta(null); else onChiudi(); }
      if (vista === 'una') {
        if (e.key === 'ArrowRight') vai(indice + 1);
        if (e.key === 'ArrowLeft') vai(indice - 1);
        if (e.key === ' ') { e.preventDefault(); setPausa(p => !p); }
        if (e.key === 'Enter') setSvelato(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aperta, onChiudi, vista, indice, domande.length]);

  const revisiona = async (d: Domanda, stato: 'ok' | 'rivedere' | null) => {
    const { error } = await supabase.rpc('docente_revisione_hmw_crazy8', { p_id: d.submission.id, p_indice: d.indice, p_stato: stato, p_passcode: passcode });
    if (!error) onCambiato();
  };

  const sblocca = async (submissionId: string, valore: boolean) => {
    const { error } = await supabase.rpc('docente_sblocca_sketch_crazy8', { p_id: submissionId, p_valore: valore, p_passcode: passcode });
    if (!error) onCambiato();
  };

  const sbloccaTutti = async () => {
    if (!window.confirm(`Sbloccare gli sketch a tutti i ${daSbloccare} team? Si apre anche la fase degli sketch nella regia.`)) return;
    const { error } = await supabase.rpc('docente_sblocca_sketch_tutti_crazy8', { p_attivita_id: attivitaId, p_valore: true, p_passcode: passcode });
    if (!error) onCambiato();
  };

  const schermoIntero = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else radice.current?.requestFullscreen?.().catch(() => {});
  };

  const teamDi = (s: any) => teams.find(t => t.id === s.team_attivita_id);
  const nomeTeam = (s: any) => teamDi(s)?.nome || s.gruppo_nome;

  const pulsantiRevisione = (d: Domanda) => (
    <div className="flex gap-2 flex-wrap">
      <button type="button" className={`mz-pill sm ${d.revisione === 'ok' ? 'b' : 'o'}`} onClick={() => revisiona(d, d.revisione === 'ok' ? null : 'ok')}>✓ Pertinente</button>
      <button type="button" className={`mz-pill sm ${d.revisione === 'rivedere' ? '' : 'o'}`} style={d.revisione === 'rivedere' ? { background: '#f87171', color: '#1c1917' } : undefined} onClick={() => revisiona(d, d.revisione === 'rivedere' ? null : 'rivedere')}>Da ritoccare</button>
    </div>
  );

  return (
    <div ref={radice} className="mz fixed inset-0 z-[60] flex flex-col" data-theme="dark" style={{ background: 'var(--bg)', color: 'var(--ink)' }} role="dialog" aria-modal="true" aria-label="Wall delle domande HMW">
      <header className="mz-rail" style={{ position: 'relative' }}>
        <span className="mz-mono" style={{ color: 'var(--ink)' }}>Come potremmo… ({String(domande.length).padStart(2, '0')})</span>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Segmentato etichetta="Vista" valore={vista} onCambia={v => { setVista(v); setAperta(null); vai(0); }} opzioni={[{ id: 'wall', label: 'Wall' }, { id: 'una', label: 'Una alla volta' }]} />
          {(['tutte', 'da_vedere', 'ok', 'votate'] as const).map(f => (
            <button key={f} type="button" className={`mz-chip max-md:hidden ${filtro === f ? 'on' : ''}`} onClick={() => { setFiltro(f); vai(0); }}>
              {f === 'tutte' ? 'Tutte' : f === 'ok' ? 'Pertinenti' : f === 'votate' ? '★ Più votate' : 'Da vedere'}
            </button>
          ))}
          <button type="button" className="mz-pill sm b" disabled={daSbloccare === 0} onClick={sbloccaTutti}>Sblocca gli sketch a tutti ({daSbloccare})</button>
          <button type="button" className="mz-pill sm ghost max-sm:hidden" onClick={schermoIntero}>⤢</button>
          <button type="button" className="mz-pill sm ghost" onClick={onChiudi} aria-label="Chiudi il wall">✕</button>
        </div>
      </header>
      {nomiContesti.length > 0 && <Ticker voci={nomiContesti} />}

      {domande.length === 0 ? (
        <div className="flex-1 grid place-items-center gap-6 text-center px-6">
          <div><Solidi cadono colore="#fafaf9" /></div>
          <p className="mz-display" style={{ fontSize: 'clamp(30px, 4.4vw, 64px)', color: 'var(--muted)', margin: 0 }}>Le domande arrivano qui.</p>
        </div>
      ) : vista === 'una' && attuale ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div style={{ height: 3, background: 'var(--line)' }}>
            <div ref={barra} style={{ height: '100%', background: 'var(--accento-vivo)', transformOrigin: '0 50%', transform: 'scaleX(0)' }} />
          </div>
          <div key={attuale.chiave} className="flex-1 min-h-0 overflow-y-auto grid content-center gap-8 px-[max(20px,6vw)] py-10">
            <span className="mz-mono c8-entra-sfocato" style={{ color: 'var(--accento)' }}>
              ({String(indice + 1).padStart(2, '0')} / {String(domande.length).padStart(2, '0')}) {nomeContesto(attuale.hmw.contesto, contesti)}{(stelle?.(attuale.submission.id, attuale.indice) || 0) > 0 ? `  ★ ${stelle!(attuale.submission.id, attuale.indice)}` : ''}
            </span>
            <p className="mz-display c8-entra-sfocato" style={{ fontSize: 'clamp(40px, 6.2vw, 112px)', margin: 0, maxWidth: '18ch', animationDelay: '120ms' }}>{testoHmw(attuale.hmw)}</p>
            <div className="flex flex-wrap items-end gap-6 justify-between">
              {svelato ? (
                <div className="c8-entra-sfocato">
                  <p className="mz-display" style={{ fontSize: 'clamp(28px, 3.4vw, 54px)', margin: 0, color: 'var(--accento)' }}>{nomeTeam(attuale.submission)}</p>
                  <p className="text-base mt-2" style={{ color: 'var(--ink-2)' }}>{(teamDi(attuale.submission)?.membri || []).join(', ')}</p>
                </div>
              ) : (
                <button type="button" className="mz-pill o lg" onClick={() => setSvelato(true)}>Chi l&apos;ha proposta?</button>
              )}
              <div className="grid gap-3 justify-items-end">
                {pulsantiRevisione(attuale)}
                {!attuale.submission.sketch_sbloccato
                  ? <button type="button" className="mz-pill sm b" onClick={() => sblocca(attuale.submission.id, true)}>Sblocca gli sketch a {nomeTeam(attuale.submission)}</button>
                  : <span className="mz-mono">Sketch aperti</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 py-4" style={{ borderTop: '1px solid var(--line)' }}>
            <button type="button" className="mz-pill sm ghost" onClick={() => vai(indice - 1)} aria-label="Precedente">←</button>
            <button type="button" className="mz-pill sm ghost" onClick={() => setPausa(p => !p)} aria-label={pausa ? 'Riprendi' : 'Pausa'}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">{pausa ? <path d="M2 1l9 5-9 5z" fill="currentColor" /> : <path d="M2 1h3v10H2zM7 1h3v10H7z" fill="currentColor" />}</svg>
            </button>
            <button type="button" className="mz-pill sm ghost" onClick={() => vai(indice + 1)} aria-label="Successiva">→</button>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex">
          <div ref={scorri} className="flex-1 overflow-y-auto px-[max(20px,3vw)] py-8" onMouseEnter={() => setPausa(true)} onMouseLeave={() => setPausa(false)}>
            <ul className="columns-1 md:columns-2 xl:columns-3 gap-5" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {domande.map((d, i) => (
                <li key={d.chiave} className="mz-in break-inside-avoid mb-5" style={{ animationDelay: `${Math.min(i, 12) * 50}ms` }}>
                  <div className="c8-fluttua" style={{ animationDelay: `${-(i * 1.7) % 7}s` }}>
                    <button
                      type="button"
                      onClick={() => setAperta(d.chiave)}
                      className="c8-carta-wall"
                      style={{
                        background: aperta === d.chiave ? 'var(--accento-vivo)' : 'var(--surface)',
                        color: aperta === d.chiave ? '#1c1917' : 'var(--ink)',
                        boxShadow: d.revisione === 'ok' ? 'inset 0 0 0 2px #34d399' : d.revisione === 'rivedere' ? 'inset 0 0 0 2px #f87171' : 'inset 0 0 0 1px var(--line)',
                      }}
                    >
                      <span className="mz-mono" style={{ color: aperta === d.chiave ? 'rgba(28,25,23,.7)' : 'var(--accento)' }}>
                        {nomeContesto(d.hmw.contesto, contesti) || 'Contesto'}{d.revisione === 'ok' ? ' ✓' : d.revisione === 'rivedere' ? ' — da ritoccare' : ''}{(stelle?.(d.submission.id, d.indice) || 0) > 0 ? `  ★ ${stelle!(d.submission.id, d.indice)}` : ''}
                      </span>
                      <span className="block mt-3" style={{ fontFamily: 'var(--f-display)', fontSize: 'clamp(22px, 2.2vw, 34px)', lineHeight: 1.1, letterSpacing: '-.02em' }}>
                        {testoHmw(d.hmw)}
                      </span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {corrente && (
            <aside className="w-full max-w-md flex-shrink-0 overflow-y-auto p-6 space-y-5 md:animate-sheet-destra" style={{ borderLeft: '1px solid var(--line)', background: 'var(--surface)' }}>
              <div className="flex justify-between items-start gap-3">
                <span className="mz-mono">Proposta da</span>
                <button type="button" className="mz-pill sm ghost" onClick={() => setAperta(null)} aria-label="Chiudi">✕</button>
              </div>
              <div>
                <p className="mz-display" style={{ fontSize: 44 }}>{nomeTeam(corrente.submission)}</p>
                <p className="text-sm mt-1" style={{ color: 'var(--ink-2)' }}>{(teamDi(corrente.submission)?.membri || []).join(', ') || `Gruppo ${corrente.submission.gruppo_num}`}</p>
              </div>
              {(corrente.submission.hmw as Hmw[]).map((h, i) => {
                const rev = (corrente.submission.hmw_revisione || [])[i] || null;
                const d: Domanda = { chiave: `${corrente.submission.id}:${i}`, submission: corrente.submission, indice: i, hmw: h, revisione: rev };
                return (
                  <div key={i} className="rounded-2xl p-4 space-y-3" style={{ boxShadow: i === corrente.indice ? 'inset 0 0 0 2px var(--accento-vivo)' : 'inset 0 0 0 1px var(--line)' }}>
                    <p className="mz-mono">({String(i + 1).padStart(2, '0')}) {nomeContesto(h.contesto, contesti)}</p>
                    <p style={{ fontFamily: 'var(--f-display)', fontSize: 20, lineHeight: 1.2, margin: 0 }}>{testoHmw(h)}</p>
                    {pulsantiRevisione(d)}
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
      )}
    </div>
  );
}
