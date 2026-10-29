'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useDocente } from '@/lib/docente-context';
import type { StatoAttivita } from '@/lib/attivita';
import { ascoltaCorso } from '@/lib/realtime';
import {
  ETICHETTA_FASE, ETICHETTA_ISCRIZIONE, messaggioErroreContest, pad, useAdesso, useStatistiche,
  type Contest, type FaseContest, type Iscrizione, type Proposta,
} from '@/lib/contest';
import { Segmentato, Sheet, Cornice } from '@/components/moiso/Moiso';
import { DashboardVoto } from '@/components/moiso/DashboardVoto';
import { Countdown } from '@/components/moiso/Countdown';
import { CampiProposta, PROPOSTA_VUOTA, type DatiProposta } from '@/components/moiso/CampiProposta';
import { QR } from '@/components/moiso/QR';

type Sezione = 'gestione' | 'proposte' | 'dati' | 'iscritti';
type Iscritto = { numero: number; tipo?: 'individuale' | 'gruppo'; nome: string; membri: string[]; creato_il: string };
const STATI_ATTIVITA: { id: StatoAttivita; label: string }[] = [
  { id: 'bozza', label: 'Bozza' }, { id: 'prossimamente', label: 'In arrivo' }, { id: 'attiva', label: 'Attiva' }, { id: 'archiviata', label: 'Archiviata' },
];

const FASI: FaseContest[] = ['bozza', 'anteprima', 'voto', 'chiuso'];
const DESCR_FASE: Record<FaseContest, string> = {
  bozza: 'Solo tu lo vedi. Prepara testi e proposte.',
  anteprima: 'Gli studenti vedono le proposte (e, se previsto, candidano la loro). Il voto non è ancora aperto.',
  voto: 'Gli iscritti votano da remoto fino alla scadenza.',
  chiuso: 'Voto chiuso, risultati visibili a tutti.',
};
const DURATE = [{ s: 60, l: '1 min' }, { s: 120, l: '2 min' }, { s: 180, l: '3 min' }, { s: 300, l: '5 min' }, { s: 0, l: 'Senza limite' }];

const inLocale = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function Riquadro({ n, titolo, children, azioni }: { n: string; titolo: string; children: React.ReactNode; azioni?: React.ReactNode }) {
  return (
    <section className="mz-in" style={{ display: 'grid', gap: 18, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 24, padding: 'clamp(18px, 2.4vw, 28px)', boxShadow: '0 1px 2px rgba(28,25,23,.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span className="mz-mono" style={{ color: 'var(--ink-2)' }}><span className="mz-blue">{n}</span> · {titolo}</span>
        {azioni}
      </div>
      {children}
    </section>
  );
}

export default function ContestDocentePage() {
  const { passcode, corso } = useDocente();
  const [attivitaContest, setAttivitaContest] = useState<{ id: string; stato: StatoAttivita } | null>(null);
  const [lista, setLista] = useState<Contest[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [proposte, setProposte] = useState<Proposta[]>([]);
  const [iscritti, setIscritti] = useState<Iscritto[]>([]);
  const [sezione, setSezione] = useState<Sezione>('gestione');
  const [messaggio, setMessaggio] = useState<{ testo: string; errore?: boolean } | null>(null);
  const [bozza, setBozza] = useState({ titolo: '', sottotitolo: '', descrizione: '', iscrizione: 'individuale' as Iscrizione, mostra_classifica: false, proposte_da: 'docente' as Contest['proposte_da'] });
  const [scadenza, setScadenza] = useState('');
  const [durata, setDurata] = useState(120);
  const [codiceLive, setCodiceLive] = useState<string | null>(null);
  const [modifica, setModifica] = useState<{ id: number | null; dati: DatiProposta } | null>(null);
  const [conferma, setConferma] = useState<string | null>(null);
  const [origine, setOrigine] = useState('');

  const sel = lista.find(c => c.id === selId) || null;
  const { stat, scarto } = useStatistiche(sel?.id || null, 2500, passcode);
  const adesso = useAdesso(scarto, 1000);

  useEffect(() => { setOrigine(window.location.origin); }, []);

  const avvisa = (testo: string, errore = false) => {
    setMessaggio({ testo, errore });
    setTimeout(() => setMessaggio(m => (m?.testo === testo ? null : m)), 3500);
  };

  const caricaLista = useCallback(async () => {
    const { data, error } = await supabase.rpc('docente_lista_contest', { p_corso_id: corso.id, p_passcode: passcode });
    if (error) { avvisa(messaggioErroreContest(error.message), true); return; }
    const l = (data || []) as Contest[];
    setLista(l);
    setSelId(prev => (prev && l.some(c => c.id === prev) ? prev : l[0]?.id || null));
  }, [passcode, corso.id]);

  const caricaProposte = useCallback(async () => {
    if (!selId) { setProposte([]); return; }
    const { data } = await supabase.rpc('docente_lista_proposte', { p_contest_id: selId, p_passcode: passcode });
    setProposte(((data || []) as any[]).map(p => ({ ...p, id: Number(p.id), galleria: p.galleria || [] })));
  }, [selId, passcode]);

  const caricaIscritti = useCallback(async () => {
    const { data } = await supabase.rpc('docente_lista_team', { p_corso_id: corso.id, p_passcode: passcode });
    setIscritti((data || []) as Iscritto[]);
  }, [corso.id, passcode]);

  // Lo stato dell'attività è quello del pannello Attività (tabella attivita).
  const caricaAttivita = useCallback(async () => {
    const { data } = await supabase.from('attivita').select('id, stato').eq('corso_id', corso.id).eq('tipo', 'contest_voto').maybeSingle();
    setAttivitaContest(data ? (data as any) : null);
  }, [corso.id]);

  useEffect(() => {
    caricaLista(); caricaIscritti(); caricaAttivita();
    const ch = ascoltaCorso(supabase.channel(`contest-docente-attivita-${corso.id}`), 'attivita', corso.id, caricaAttivita).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [caricaLista, caricaIscritti, caricaAttivita, corso.id]);
  useEffect(() => {
    caricaProposte();
    const t = setInterval(caricaProposte, 15000);
    return () => clearInterval(t);
  }, [caricaProposte]);

  useEffect(() => {
    if (!sel) return;
    setBozza({ titolo: sel.titolo, sottotitolo: sel.sottotitolo, descrizione: sel.descrizione, iscrizione: sel.iscrizione, mostra_classifica: sel.mostra_classifica, proposte_da: sel.proposte_da || 'docente' });
    setScadenza(inLocale(sel.voto_fine && new Date(sel.voto_fine).getTime() > Date.now() ? sel.voto_fine : new Date(Date.now() + 86400000).toISOString()));
    supabase.rpc('docente_codice_live', { p_id: sel.id, p_passcode: passcode }).then(({ data }) => setCodiceLive((data as string) || null));
  }, [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rpc = async (nome: string, args: Record<string, any>, ok?: string) => {
    const { data, error } = await supabase.rpc(nome, { ...args, p_passcode: passcode });
    if (error) { avvisa(messaggioErroreContest(error.message), true); return { ok: false, data: null }; }
    if (ok) avvisa(ok);
    await caricaLista();
    return { ok: true, data };
  };

  const nuovo = async () => {
    const r = await rpc('docente_salva_contest', { p_corso_id: corso.id, p_id: null, p_titolo: 'Il progetto migliore', p_sottotitolo: 'Votate la proposta che cambierebbe di più le cose.', p_descrizione: '', p_iscrizione: 'entrambe', p_mostra_classifica: false }, 'Contest creato in bozza');
    if (r.ok && r.data) { setSelId(r.data as string); setSezione('proposte'); }
  };

  const salvaImpostazioni = () => sel && rpc('docente_salva_contest', {
    p_corso_id: corso.id,
    p_id: sel.id, p_titolo: bozza.titolo, p_sottotitolo: bozza.sottotitolo, p_descrizione: bozza.descrizione,
    p_iscrizione: bozza.iscrizione, p_mostra_classifica: bozza.mostra_classifica, p_proposte_da: bozza.proposte_da,
  }, 'Impostazioni salvate');

  const impostaFase = (fase: FaseContest) => {
    if (!sel) return;
    const fine = fase === 'voto' ? (scadenza ? new Date(scadenza).toISOString() : null) : null;
    rpc('docente_imposta_fase_contest', { p_id: sel.id, p_fase: fase, p_voto_fine: fine }, `Fase: ${ETICHETTA_FASE[fase]}`);
  };

  const live = async (azione: 'apri' | 'chiudi' | 'rivela' | 'copri' | 'azzera') => {
    if (!sel) return;
    const r = await rpc('docente_live_contest', { p_id: sel.id, p_azione: azione, p_durata_sec: durata }, azione === 'apri' ? 'Voto dal vivo aperto' : azione === 'chiudi' ? 'Voto dal vivo chiuso' : azione === 'azzera' ? 'Voto dal vivo azzerato' : undefined);
    if (r.ok) setCodiceLive((r.data as any)?.codice || null);
  };

  const impostaStatoAttivita = async (s: StatoAttivita) => {
    if (!attivitaContest) return;
    const { error } = await supabase.rpc('docente_imposta_stato_attivita', { p_id: attivitaContest.id, p_stato: s, p_passcode: passcode });
    if (error) avvisa(messaggioErroreContest(error.message), true); else avvisa(`Attività: ${STATI_ATTIVITA.find(x => x.id === s)?.label}`);
    caricaAttivita();
  };

  const salvaProposta = async () => {
    if (!sel || !modifica) return;
    const d = modifica.dati;
    const { error } = await supabase.rpc('docente_salva_proposta', {
      p_contest_id: sel.id, p_id: modifica.id, p_autori: d.autori || '', p_titolo: d.titolo, p_sintesi: d.sintesi,
      p_problema: d.problema, p_proposta: d.proposta, p_perche: d.perche, p_immagine: d.immagine, p_galleria: d.galleria, p_passcode: passcode,
    });
    if (error) return avvisa(messaggioErroreContest(error.message), true);
    setModifica(null);
    avvisa('Proposta salvata');
    caricaProposte();
  };

  const azioneProposta = async (nome: string, args: Record<string, any>, ok: string) => {
    const { error } = await supabase.rpc(nome, { ...args, p_passcode: passcode });
    if (error) return avvisa(messaggioErroreContest(error.message), true);
    avvisa(ok);
    setConferma(null);
    caricaProposte();
  };


  const votiPer = useMemo(() => new Map((stat?.per_proposta || []).map(p => [p.id, p])), [stat]);
  const linkLive = sel && codiceLive ? `${origine}/contest/live?codice=${codiceLive}` : `${origine}/contest/live`;
  const liveAperto = sel?.live_stato === 'aperto' && (!sel.live_fine || new Date(sel.live_fine).getTime() > adesso);
  const visibili = proposte.filter(p => !p.nascosta);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', minHeight: '100%' }} className="mz-docente">
      <style>{`@media (max-width: 860px){ .mz-docente{ grid-template-columns: 1fr !important; } .mz-docente > aside{ position: static !important; height: auto !important; border-right: 0 !important; border-bottom: 1px solid var(--line); } }`}</style>
      {/* Elenco contest */}
      <aside style={{ borderRight: '1px solid var(--line)', padding: 20, display: 'grid', alignContent: 'start', gap: 14, position: 'sticky', top: 0, height: '100%', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="mz-mono" style={{ color: 'var(--ink)' }}>Contest</span>
          <button type="button" className="mz-pill sm b" onClick={nuovo}>+ Nuovo</button>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {lista.map((c, i) => (
            <li key={c.id}>
              <button type="button" onClick={() => setSelId(c.id)} aria-current={c.id === selId}
                style={{ all: 'unset', cursor: 'pointer', display: 'grid', gap: 2, width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, background: c.id === selId ? 'var(--ink)' : 'transparent', color: c.id === selId ? 'var(--bg)' : 'inherit', transition: 'background .3s' }}>
                <span className="mz-mono" style={{ color: 'inherit', opacity: .7 }}>({pad(lista.length - i)}) · {ETICHETTA_FASE[c.fase]}{c.live_stato === 'aperto' ? ' · live' : ''}</span>
                <span className="mz-break" style={{ fontFamily: 'var(--f-display)', fontSize: 18, letterSpacing: '-.02em' }}>{c.titolo}</span>
              </button>
            </li>
          ))}
          {lista.length === 0 && <li className="mz-muted" style={{ fontSize: 14 }}>Nessun contest. Creane uno.</li>}
        </ul>
        <div className="mz-hair" style={{ paddingTop: 14, display: 'grid', gap: 8 }}>
          <span className="mz-mono">Attività in home · come nel pannello Attività</span>
          {attivitaContest ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {STATI_ATTIVITA.map(o => (
                <button key={o.id} type="button" className={`mz-chip ${attivitaContest.stato === o.id ? 'on' : ''}`} style={{ justifyContent: 'center' }} aria-pressed={attivitaContest.stato === o.id} onClick={() => impostaStatoAttivita(o.id)}>{o.label}</button>
              ))}
            </div>
          ) : <span className="mz-muted" style={{ fontSize: 13 }}>Attività non trovata: esegui la migrazione 20261012.</span>}
          {attivitaContest && attivitaContest.stato !== 'attiva' && <span className="mz-muted" style={{ fontSize: 12.5 }}>Finché non è «Attiva» gli studenti non votano da remoto. Il voto dal vivo funziona comunque.</span>}
          <a href="/contest" target="_blank" rel="noreferrer" className="mz-mono" style={{ color: 'var(--accento)' }}>Apri la pagina studenti ↗</a>
        </div>
      </aside>

      <div style={{ padding: 'clamp(20px, 4vw, 44px)', display: 'grid', alignContent: 'start', gap: 36, minWidth: 0 }}>
        {messaggio && (
          <div role="status" className="mz-in" style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 80, padding: '12px 16px', borderRadius: 12, background: messaggio.errore ? '#dc2626' : 'var(--ink)', color: messaggio.errore ? '#fff' : 'var(--bg)', fontSize: 14, maxWidth: 360 }}>{messaggio.testo}</div>
        )}
        {!sel ? (
          <div style={{ display: 'grid', gap: 16, justifyItems: 'start', paddingTop: 40 }}>
            <h1 className="mz-display" style={{ fontSize: 'clamp(40px, 6vw, 80px)' }}>Crea il primo <span className="mz-blue">contest</span>.</h1>
            <p className="mz-muted" style={{ margin: 0, maxWidth: 520 }}>Nasce in bozza: lo vedi solo tu. Carica le proposte, poi mettilo in anteprima o apri il voto.</p>
            <button type="button" className="mz-pill b lg" onClick={nuovo}>+ Nuovo contest</button>
          </div>
        ) : (
          <>
            <header style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
                  <span className="mz-mono" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <span className={`mz-live-dot ${sel.fase === 'voto' || liveAperto ? '' : 'off'}`} />
                    {ETICHETTA_FASE[sel.fase]}{liveAperto ? ' · voto dal vivo aperto' : ''} · {ETICHETTA_ISCRIZIONE[sel.iscrizione]}
                  </span>
                  <h1 className="mz-display mz-break" style={{ fontSize: 'clamp(38px, 5vw, 72px)' }}>{sel.titolo}<span className="mz-sup">({pad(visibili.length)})</span></h1>
                </div>
                <a href={`/teacher/contest/proiezione?id=${sel.id}`} target="_blank" rel="noreferrer" className="mz-pill lg">Proietta in aula ⤢</a>
              </div>
              <Segmentato etichetta="Sezioni" valore={sezione} onCambia={setSezione}
                opzioni={[{ id: 'gestione', label: 'Gestione' }, { id: 'proposte', label: `Proposte (${proposte.length})` }, { id: 'dati', label: 'Dati del voto' }, { id: 'iscritti', label: `Chi vota (${iscritti.length})` }]} />
            </header>

            {sezione === 'gestione' && (
              <>
                <Riquadro n="01" titolo="Fase del contest">
                  <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 10 }}>
                    {FASI.map((f, i) => {
                      const corrente = sel.fase === f;
                      return (
                        <li key={f}>
                          <button type="button" onClick={() => f !== 'voto' && impostaFase(f)} disabled={f === 'voto'}
                            style={{ all: 'unset', cursor: f === 'voto' ? 'default' : 'pointer', boxSizing: 'border-box', width: '100%', height: '100%', display: 'grid', gap: 6, padding: 16, borderRadius: 14, background: corrente ? 'var(--accento-tenue)' : 'var(--paper)', color: 'inherit', boxShadow: corrente ? 'inset 0 0 0 2px var(--accento-vivo)' : 'inset 0 0 0 1px var(--line)', transition: 'background .4s' }}>
                            <span className="mz-mono" style={{ color: 'inherit', opacity: .75 }}>{pad(i + 1)}{corrente ? ' · ora' : ''}</span>
                            <span style={{ fontFamily: 'var(--f-display)', fontSize: 22, letterSpacing: '-.02em' }}>{ETICHETTA_FASE[f]}</span>
                            <span style={{ fontSize: 13, opacity: .8 }}>{DESCR_FASE[f]}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  <div style={{ display: 'grid', gap: 12, padding: 18, borderRadius: 14, boxShadow: 'inset 0 0 0 1px var(--line)', background: 'var(--paper)' }}>
                    <span className="mz-mono" style={{ color: 'var(--ink)' }}>Voto da remoto · scadenza del countdown</span>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input type="datetime-local" className="mz-input" style={{ width: 'auto' }} value={scadenza} onChange={e => setScadenza(e.target.value)} aria-label="Scadenza del voto" />
                      {[{ l: '+1 ora', ms: 3600e3 }, { l: '+1 giorno', ms: 86400e3 }, { l: '+3 giorni', ms: 3 * 86400e3 }, { l: '+1 settimana', ms: 7 * 86400e3 }].map(x => (
                        <button key={x.l} type="button" className="mz-chip" onClick={() => setScadenza(inLocale(new Date(Date.now() + x.ms).toISOString()))}>{x.l}</button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button type="button" className="mz-pill b" onClick={() => impostaFase('voto')} disabled={!scadenza}>
                        {sel.fase === 'voto' ? 'Aggiorna la scadenza' : 'Apri il voto da remoto'}
                      </button>
                      {sel.fase === 'voto' && sel.voto_fine && <Countdown fine={sel.voto_fine} inizio={sel.voto_inizio} adesso={adesso} grande={false} />}
                    </div>
                  </div>
                </Riquadro>

                <Riquadro n="02" titolo="Voto dal vivo, dal pubblico">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 24, alignItems: 'start' }}>
                    <div style={{ display: 'grid', gap: 14 }}>
                      <p style={{ margin: 0, fontSize: 14.5 }}>Il pubblico vota dal telefono senza iscriversi (un voto per dispositivo), inquadrando il QR o scrivendo il codice proiettato. Si apre un voto dal vivo alla volta.</p>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {DURATE.map(d => <button key={d.s} type="button" className="mz-chip" aria-pressed={durata === d.s} onClick={() => setDurata(d.s)}>{d.l}</button>)}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="mz-pill b" onClick={() => live('apri')}>{liveAperto ? 'Riapri con nuovo codice' : 'Apri il voto dal vivo'}</button>
                        {liveAperto && <button type="button" className="mz-pill o" onClick={() => live('chiudi')}>Chiudi</button>}
                        {sel.vincitore_rivelato
                          ? <button type="button" className="mz-pill ghost" onClick={() => live('copri')}>Copri di nuovo il vincitore</button>
                          : <button type="button" className="mz-pill ghost" onClick={() => live('rivela')}>Svela il vincitore a tutti</button>}
                        {conferma === 'azzera-live'
                          ? <button type="button" className="mz-pill" style={{ background: '#dc2626', color: '#fff' }} onClick={() => { live('azzera'); setConferma(null); }}>Sicuro? Cancella i voti dal vivo</button>
                          : <button type="button" className="mz-pill ghost danger" onClick={() => setConferma('azzera-live')}>Azzera voto dal vivo</button>}
                      </div>
                      {liveAperto && sel.live_fine && <Countdown fine={sel.live_fine} adesso={adesso} grande={false} finito="Tempo scaduto" />}
                    </div>
                    {codiceLive && (
                      <div style={{ display: 'flex', gap: 18, alignItems: 'center', padding: 16, borderRadius: 14, background: 'var(--paper)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
                        <QR testo={linkLive} dimensione={120} />
                        <div style={{ display: 'grid', gap: 4 }}>
                          <span className="mz-mono">Codice</span>
                          <span className="mz-display mz-num" style={{ fontSize: 52, lineHeight: 1, color: liveAperto ? 'var(--accento)' : 'var(--muted)' }}>{codiceLive}</span>
                          <span className="mz-mono mz-break">{origine.replace(/^https?:\/\//, '')}/contest/live</span>
                        </div>
                      </div>
                    )}
                  </div>
                </Riquadro>

                <Riquadro n="03" titolo="Testi e regole" azioni={<button type="button" className="mz-pill sm" onClick={salvaImpostazioni}>Salva</button>}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 18 }}>
                    <label className="mz-field"><span className="mz-mono">Titolo</span><input className="mz-input" value={bozza.titolo} onChange={e => setBozza({ ...bozza, titolo: e.target.value })} maxLength={90} /></label>
                    <label className="mz-field"><span className="mz-mono">Sottotitolo</span><input className="mz-input" value={bozza.sottotitolo} onChange={e => setBozza({ ...bozza, sottotitolo: e.target.value })} maxLength={200} /></label>
                  </div>
                  <label className="mz-field"><span className="mz-mono">Descrizione e regole del voto</span><textarea className="mz-input" value={bozza.descrizione} onChange={e => setBozza({ ...bozza, descrizione: e.target.value })} maxLength={2000} /></label>
                  <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'end' }}>
                    <div className="mz-field">
                      <span className="mz-mono">Chi carica le proposte</span>
                      <Segmentato etichetta="Chi carica le proposte" valore={bozza.proposte_da} onCambia={v => setBozza({ ...bozza, proposte_da: v })}
                        opzioni={[{ id: 'docente', label: 'Docenti' }, { id: 'studenti', label: 'Anche gli studenti' }]} />
                    </div>
                    <div className="mz-field">
                      <span className="mz-mono">Chi candida e vota da remoto</span>
                      <Segmentato etichetta="Tipo di iscrizione" valore={bozza.iscrizione} onCambia={v => setBozza({ ...bozza, iscrizione: v })}
                        opzioni={[{ id: 'individuale', label: 'Individui' }, { id: 'gruppo', label: 'Gruppi' }, { id: 'entrambe', label: 'Entrambi' }]} />
                    </div>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
                      <input type="checkbox" checked={bozza.mostra_classifica} onChange={e => setBozza({ ...bozza, mostra_classifica: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--accento)' }} />
                      Mostra la classifica agli studenti durante il voto (di solito resta coperta fino alla scadenza)
                    </label>
                  </div>
                </Riquadro>

                <Riquadro n="04" titolo="Zona pericolosa">
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {conferma === 'azzera-remoto'
                      ? <button type="button" className="mz-pill" style={{ background: '#dc2626', color: '#fff' }} onClick={() => { rpc('docente_azzera_voti_remoti', { p_id: sel.id }, 'Voti da remoto azzerati'); setConferma(null); }}>Sicuro? Cancella i voti da remoto</button>
                      : <button type="button" className="mz-pill ghost danger" onClick={() => setConferma('azzera-remoto')}>Azzera i voti da remoto</button>}
                    {conferma === 'elimina-contest'
                      ? <button type="button" className="mz-pill" style={{ background: '#dc2626', color: '#fff' }} onClick={() => { rpc('docente_elimina_contest', { p_id: sel.id }, 'Contest eliminato'); setConferma(null); }}>Sicuro? Elimina contest, proposte e voti</button>
                      : <button type="button" className="mz-pill ghost danger" onClick={() => setConferma('elimina-contest')}>Elimina il contest</button>}
                  </div>
                </Riquadro>
              </>
            )}

            {sezione === 'proposte' && (
              <Riquadro n={pad(proposte.length)} titolo="Proposte" azioni={<button type="button" className="mz-pill sm b" onClick={() => setModifica({ id: null, dati: { ...PROPOSTA_VUOTA, autori: '' } })}>+ Aggiungi proposta</button>}>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid' }}>
                  {proposte.map((p, i) => {
                    const v = votiPer.get(p.id);
                    return (
                      <li key={p.id} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr) auto', gap: 16, alignItems: 'center', padding: '14px 0', borderTop: i ? '1px solid var(--line)' : undefined, opacity: p.nascosta ? .45 : 1 }}>
                        <Cornice src={p.immagine} alt="" style={{ width: 96, aspectRatio: '4 / 3', borderRadius: 12 }} etichettaVuota="—" />
                        <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                          <span className="mz-mono mz-break">({pad(i + 1)}) · {p.autori || 'Senza autori'}{p.nascosta ? ' · nascosta' : ''}{p.team_id ? ' · candidata dagli studenti' : ''}</span>
                          <span className="mz-break" style={{ fontFamily: 'var(--f-display)', fontSize: 22, letterSpacing: '-.02em' }}>{p.titolo}</span>
                          <span className="mz-muted mz-break" style={{ fontSize: 13.5 }}>{p.sintesi}</span>
                        </div>
                        <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
                          <span className="mz-mono mz-num" style={{ color: 'var(--ink)' }}>{v ? `${v.remoto} remoto · ${v.live} live` : '0 voti'}</span>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'end' }}>
                            <button type="button" className="mz-pill sm ghost" onClick={() => setModifica({ id: p.id, dati: { titolo: p.titolo, sintesi: p.sintesi, problema: p.problema, proposta: p.proposta, perche: p.perche, immagine: p.immagine, galleria: p.galleria, autori: p.autori } })}>Modifica</button>
                            <button type="button" className="mz-pill sm ghost" onClick={() => azioneProposta('docente_nascondi_proposta', { p_id: p.id, p_nascosta: !p.nascosta }, p.nascosta ? 'Proposta di nuovo visibile' : 'Proposta nascosta')}>{p.nascosta ? 'Mostra' : 'Nascondi'}</button>
                            {conferma === `p${p.id}`
                              ? <button type="button" className="mz-pill sm" style={{ background: '#dc2626', color: '#fff' }} onClick={() => azioneProposta('docente_elimina_proposta', { p_id: p.id }, 'Proposta eliminata')}>Conferma</button>
                              : <button type="button" className="mz-pill sm ghost danger" onClick={() => setConferma(`p${p.id}`)}>Elimina</button>}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                  {proposte.length === 0 && <li className="mz-muted">Nessuna proposta: aggiungi la prima con «+ Aggiungi proposta».</li>}
                </ul>
              </Riquadro>
            )}

            {sezione === 'dati' && (stat
              ? <DashboardVoto stat={stat} scarto={scarto} proposte={visibili} />
              : <p className="mz-muted">Carico i dati…</p>)}

            {sezione === 'iscritti' && (
              <Riquadro n={pad(iscritti.length)} titolo="Chi può votare da remoto" azioni={<a href="/teacher/team" className="mz-pill sm ghost">Gestisci i team →</a>}>
                <p className="mz-muted" style={{ margin: 0, fontSize: 14 }}>Gli iscritti del corso: team e accessi individuali. Ognuno ha un voto per contest ({ETICHETTA_ISCRIZIONE[sel.iscrizione].toLowerCase()}).</p>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {iscritti.map((s, i) => {
                    const puo = sel.iscrizione === 'entrambe' || sel.iscrizione === (s.tipo || 'gruppo');
                    return (
                      <li key={s.numero} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '12px 0', borderTop: i ? '1px solid var(--line)' : undefined, opacity: puo ? 1 : .45 }}>
                        <div style={{ minWidth: 0 }}>
                          <span className="mz-break" style={{ fontFamily: 'var(--f-display)', fontSize: 19 }}>{s.nome}</span>{' '}
                          <span className="mz-mono">{s.tipo === 'individuale' ? 'individuale' : `gruppo ${s.numero} · ${s.membri.length} membri`}</span>
                          {s.tipo !== 'individuale' && s.membri.length > 0 && <div className="mz-muted mz-break" style={{ fontSize: 13 }}>{s.membri.join(', ')}</div>}
                        </div>
                        <span className="mz-mono">{puo ? 'vota' : 'non vota in questo contest'}</span>
                      </li>
                    );
                  })}
                  {iscritti.length === 0 && <li className="mz-muted">Ancora nessun iscritto nel corso.</li>}
                </ul>
              </Riquadro>
            )}
          </>
        )}
      </div>

      <Sheet aperto={!!modifica} onChiudi={() => setModifica(null)} categoria={modifica?.id ? 'Modifica proposta' : 'Nuova proposta'}
        azioni={<button type="button" className="mz-pill sm b" onClick={salvaProposta} disabled={!modifica?.dati.titolo.trim()}>Salva</button>}>
        {modifica && (
          <div style={{ padding: 'clamp(20px, 4vw, 40px)' }}>
            <CampiProposta dati={modifica.dati} onCambia={d => setModifica({ ...modifica, dati: d })} conAutori />
          </div>
        )}
      </Sheet>
    </div>
  );
}
