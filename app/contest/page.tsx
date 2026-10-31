'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Sep from '@/components/Sep';
import { supabase } from '@/lib/supabase';
import { useTeam, etichettaTeam } from '@/lib/team-context';
import Info from '@/components/Info';
import RichiedeCorso from '@/components/RichiedeCorso';
import type { Corso } from '@/lib/corsi';
import { ascoltaCorso } from '@/lib/realtime';
import {
  COLONNE_PROPOSTA, ETICHETTA_FASE, messaggioErroreContest, rilevaDispositivo, ottieniPosizione, type Posizione,
  useAdesso, useStatistiche, type Contest, type Proposta,
} from '@/lib/contest';
import { Segmentato, Sheet, Solidi, Ticker, useTendina, Cornice } from '@/components/moiso/Moiso';
import { GalleriaProposte, DettaglioProposta, StackProposte } from '@/components/moiso/Proposte';
import { DashboardVoto } from '@/components/moiso/DashboardVoto';
import { Countdown } from '@/components/moiso/Countdown';
import { Celebrazione } from '@/components/moiso/Celebrazione';
import { FormProposta } from '@/components/moiso/FormProposta';

type Scheda = 'proposte' | 'dati' | 'mia';

export default function ContestStudentePage() {
  return <RichiedeCorso>{corso => <ContestCorso corso={corso} />}</RichiedeCorso>;
}

function ContestCorso({ corso }: { corso: Corso }) {
  const { team: io, pronto: teamPronto } = useTeam();
  // Stato dell'attività nel pannello Attività: il contest si apre agli
  // studenti solo quando è "attiva".
  const [statoAttivita, setStatoAttivita] = useState<string | null | undefined>(undefined);
  const [contestLista, setContestLista] = useState<Contest[]>([]);
  const [caricati, setCaricati] = useState(false);
  const [contestId, setContestId] = useState<string | null>(null);
  const [proposte, setProposte] = useState<Proposta[]>([]);
  const [scheda, setScheda] = useState<Scheda>('proposte');
  const [vista, setVista] = useState<'galleria' | 'presenta'>('galleria');
  const [aperta, setAperta] = useState<Proposta | null>(null);
  const [mioVoto, setMioVoto] = useState<number | null>(null);
  const [conferma, setConferma] = useState(false);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [festa, setFesta] = useState<{ origine: { x: number; y: number } | null; numero: number | null; titolo: string } | null>(null);
  const tendina = useTendina();
  // Posizione approssimata (città) chiesta subito, così il voto non aspetta.
  const [posizione, setPosizione] = useState<Posizione | null>(null);
  useEffect(() => { ottieniPosizione().then(setPosizione); }, []);

  const contest = contestLista.find(c => c.id === contestId) || null;
  const { stat, scarto } = useStatistiche(contest && (contest.fase === 'voto' || contest.fase === 'chiuso' || contest.live_stato !== 'chiuso') ? contest.id : null, 3000);
  const adesso = useAdesso(scarto, 1000);

  // --- Contest visibili (le bozze non arrivano al client) ---
  const caricaContest = useCallback(async () => {
    const { data } = await supabase.from('contest').select('*').eq('corso_id', corso.id).order('creato_il', { ascending: false });
    const lista = (data || []) as Contest[];
    setContestLista(lista);
    setCaricati(true);
    setContestId(prev => {
      if (prev && lista.some(c => c.id === prev)) return prev;
      const daUrl = new URLSearchParams(window.location.search).get('c');
      if (daUrl && lista.some(c => c.id === daUrl)) return daUrl;
      const vivo = lista.find(c => c.fase === 'voto') || lista.find(c => c.fase === 'anteprima') || lista[0];
      return vivo ? vivo.id : null;
    });
  }, [corso.id]);

  const caricaAttivita = useCallback(async () => {
    const { data } = await supabase.from('attivita').select('stato').eq('corso_id', corso.id).eq('tipo', 'contest_voto').maybeSingle();
    setStatoAttivita(data ? (data as any).stato : null);
  }, [corso.id]);

  useEffect(() => {
    caricaContest();
    caricaAttivita();
    const ch = ascoltaCorso(supabase.channel(`contest-studenti-${corso.id}`), 'contest', corso.id, caricaContest);
    ascoltaCorso(ch, 'attivita', corso.id, caricaAttivita).subscribe();
    const t = setInterval(caricaContest, 20000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [caricaContest, caricaAttivita, corso.id]);

  const caricaProposte = useCallback(async () => {
    if (!contestId) { setProposte([]); return; }
    const { data } = await supabase.from('contest_proposte').select(COLONNE_PROPOSTA).eq('contest_id', contestId).order('creato_il');
    setProposte(prev => {
      // Le immagini possono arrivare vuote da un aggiornamento: conserva quelle già mostrate.
      const vecchie = new Map(prev.map(p => [p.id, p]));
      return ((data || []) as any[]).map(p => ({ ...p, id: Number(p.id), galleria: p.galleria || [], immagine: p.immagine || vecchie.get(Number(p.id))?.immagine || '' }));
    });
  }, [contestId]);

  useEffect(() => {
    caricaProposte();
    if (!contestId) return;
    const ch = supabase.channel(`proposte-${contestId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contest_proposte', filter: `contest_id=eq.${contestId}` }, caricaProposte)
      .subscribe();
    const t = setInterval(caricaProposte, 30000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [contestId, caricaProposte]);

  const caricaMioVoto = useCallback(async () => {
    if (!io || !contestId) { setMioVoto(null); return; }
    const { data } = await supabase.rpc('mio_voto_remoto', { p_team_id: io.id, p_password: io.password, p_contest_id: contestId });
    setMioVoto(data ? Number(data) : null);
  }, [io, contestId]);
  useEffect(() => { caricaMioVoto(); }, [caricaMioVoto]);

  // --- Stato del voto ---
  const tFine = contest?.voto_fine ? new Date(contest.voto_fine).getTime() : 0;
  const votoAperto = contest?.fase === 'voto' && tFine > adesso;
  const votoFinito = contest?.fase === 'chiuso' || (contest?.fase === 'voto' && tFine <= adesso);
  const mia = proposte.find(p => io && p.team_id === io.id) || null;
  const candidatureAperte = contest?.proposte_da === 'studenti' && contest.fase === 'anteprima';
  const tipoAmmesso = !contest || !io || contest.iscrizione === 'entrambe' || contest.iscrizione === (io.tipo || 'gruppo');

  // Vincitore: visibile quando la classifica è svelata.
  const vincitore = useMemo(() => {
    if (!stat?.per_proposta || !(stat.remoto_finito || stat.vincitore_rivelato)) return null;
    const conti = stat.per_proposta.map(r => ({ id: r.id, n: r.remoto + r.live })).sort((a, b) => b.n - a.n);
    if (!conti.length || conti[0].n === 0) return null;
    const p = proposte.find(x => x.id === conti[0].id);
    return p ? { p, n: conti[0].n, pari: conti.length > 1 && conti[1].n === conti[0].n } : null;
  }, [stat, proposte]);

  const cambiaScheda = (s: Scheda) => {
    if (s === scheda) return;
    const nomi: Record<Scheda, string> = { proposte: 'Le proposte', dati: 'Il voto, dal vivo' , mia: 'La mia proposta' };
    tendina.mostra(nomi[s], () => setScheda(s));
  };

  const apri = (p: Proposta) => { setAperta(p); setConferma(false); setErrore(''); };

  const vota = async (e: React.MouseEvent) => {
    if (!aperta || !io) return;
    const origine = { x: e.clientX, y: e.clientY };
    setInvio(true);
    setErrore('');
    const cambio = mioVoto !== null;
    const { error } = await supabase.rpc('vota_remoto', {
      p_team_id: io.id, p_password: io.password, p_proposta_id: aperta.id, p_dispositivo: rilevaDispositivo(), p_zona: (posizione ?? await ottieniPosizione()).zona,
      p_lat: posizione?.lat ?? null, p_lon: posizione?.lon ?? null,
    });
    setInvio(false);
    if (error) {
      setErrore(messaggioErroreContest(error.message));
      return;
    }
    setMioVoto(aperta.id);
    const numero = stat ? stat.totale.remoto + (cambio ? 0 : 1) : null;
    setFesta({ origine, numero: cambio ? null : numero, titolo: cambio ? 'Voto cambiato' : 'Voto registrato' });
    setAperta(null);
  };

  const fineFesta = () => {
    setFesta(null);
    setScheda('dati');
    window.scrollTo({ top: 0 });
  };

  // --- Schermate di attesa ---
  if (!teamPronto || !caricati || statoAttivita === undefined) {
    return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><Solidi /></main>;
  }

  const rail = (
    <header className="mz-rail">
      <a href="/" style={{ display: 'flex', gap: 10, alignItems: 'baseline', color: 'inherit', textDecoration: 'none', minWidth: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }} className="mz-break">{corso.nome}</span>
        <span className="mz-mono hidden sm:inline">Contest</span>
      </a>
      {io && contest && statoAttivita === 'attiva' && (
        <Segmentato
          etichetta="Sezioni del contest"
          valore={scheda}
          onCambia={cambiaScheda}
          opzioni={[
            { id: 'proposte', label: 'Proposte' },
            { id: 'dati', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{votoAperto && <span className="mz-live-dot" style={{ width: 6, height: 6 }} />}Dati</span> },
            ...((candidatureAperte && tipoAmmesso) || mia ? [{ id: 'mia' as Scheda, label: 'La mia' }] : []),
          ]}
        />
      )}
      {io ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
          <span className="mz-mono hidden md:inline mz-break" style={{ color: 'var(--ink)' }}>{etichettaTeam(io)}</span>
          <a href="/" className="mz-pill sm ghost">← Attività</a>
        </div>
      ) : <a href="/" className="mz-pill sm ghost">← Home</a>}
    </header>
  );

  if (statoAttivita !== 'attiva') {
    return (
      <main>
        {rail}
        <section style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
          <div style={{ display: 'grid', gap: 18, justifyItems: 'center', maxWidth: 640 }}>
            <Solidi />
            <h1 className="mz-display" style={{ fontSize: 'clamp(40px, 6vw, 80px)' }}>Il contest <span className="mz-blue">non è ancora aperto</span>.</h1>
            <a href="/" className="mz-pill o">← Torna alle attività</a>
          </div>
        </section>
      </main>
    );
  }

  if (!contest) {
    return (
      <main>
        {rail}
        <section style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
          <div style={{ display: 'grid', gap: 18, justifyItems: 'center' }}>
            <Solidi />
            <h1 className="mz-display" style={{ fontSize: 'clamp(40px, 6vw, 80px)' }}>Il contest sta per <span className="mz-blue">aprire</span>.</h1>
          </div>
        </section>
      </main>
    );
  }

  if (!io) {
    return (
      <main>
        {rail}
        <section style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
          <div className="mz-in" style={{ display: 'grid', gap: 18, justifyItems: 'center', maxWidth: 680 }}>
            <Solidi cadono />
            <h1 className="mz-display" style={{ fontSize: 'clamp(40px, 6vw, 84px)' }}>
              Per votare serve <span className="mz-blue">il tuo accesso</span>.
            </h1>
            <p style={{ margin: 0, fontSize: 17, maxWidth: 520 }}>
              {contest.iscrizione === 'individuale' ? <>Dalla home: «Iscriviti», poi «Da solo/a».</> : contest.iscrizione === 'gruppo' ? <>Entrate con l’accesso del vostro team.</> : <>Con l’accesso del tuo team, oppure da solo/a.</>}
            </p>
            <a href="/" className="mz-pill b lg">Vai all’accesso →</a>
          </div>
        </section>
      </main>
    );
  }

  const indiceAperta = aperta ? proposte.findIndex(p => p.id === aperta.id) : -1;
  const propria = !!aperta && aperta.team_id === io.id;

  return (
    <main>
      {rail}
      {tendina.nodo}

      {/* Eroe */}
      <section style={{ padding: 'clamp(36px, 7vw, 96px) max(20px, env(safe-area-inset-left)) clamp(28px, 4vw, 48px)', maxWidth: 1440, margin: '0 auto', display: 'grid', gap: 26 }}>
        {contestLista.length > 1 && (
          <div className="mz-in">
            <select aria-label="Scegli il contest" value={contest.id} onChange={e => { setContestId(e.target.value); setScheda('proposte'); }} className="mz-chip" style={{ appearance: 'none', background: 'transparent', color: 'inherit', font: 'inherit', fontSize: 12 }}>
              {contestLista.map(c => <option key={c.id} value={c.id}>{c.titolo}</option>)}
            </select>
          </div>
        )}
        <h1 className="mz-display mz-in mz-break" style={{ fontSize: scheda === 'proposte' ? 'clamp(44px, 7.5vw, 112px)' : 'clamp(40px, 6vw, 84px)', animationDelay: '60ms', maxWidth: 1200 }}>
          {contest.titolo}<span className="mz-sup">({String(proposte.length).padStart(2, '0')})</span>
          {contest.descrizione && <span style={{ fontSize: 16, verticalAlign: 'middle' }}><Info><span style={{ whiteSpace: 'pre-line' }}>{contest.descrizione}</span></Info></span>}
        </h1>
        {scheda === 'proposte' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 28, alignItems: 'end' }}>
          <div className="mz-in" style={{ display: 'grid', gap: 16, animationDelay: '120ms' }}>
            {contest.sottotitolo && <p className="mz-break" style={{ margin: 0, fontSize: 'clamp(19px, 2vw, 24px)', lineHeight: 1.3, maxWidth: 620 }}>{contest.sottotitolo}</p>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {candidatureAperte && tipoAmmesso && <button type="button" className="mz-pill b" onClick={() => cambiaScheda('mia')}>{mia ? 'Modifica la mia proposta' : 'Candida la tua proposta'}</button>}
            </div>
          </div>
          <div className="mz-in" style={{ animationDelay: '180ms', display: 'grid', gap: 10 }}>
            {contest.fase === 'voto' && contest.voto_fine && (
              <>
                {votoAperto && <span className="mz-mono" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}><span className="mz-live-dot" />Il voto si chiude tra</span>}
                <Countdown fine={contest.voto_fine} inizio={contest.voto_inizio} adesso={adesso} />
              </>
            )}
            {contest.fase === 'anteprima' && <p style={{ margin: 0, fontSize: 15 }} className="mz-muted">{candidatureAperte ? 'Candidature aperte' : 'Il voto si apre più avanti'}</p>}
            {votoFinito && <p style={{ margin: 0, fontSize: 15 }} className="mz-muted">Votazione conclusa</p>}
            {votoAperto && tipoAmmesso && (
              <p style={{ margin: 0, fontSize: 14 }}>
                {mioVoto ? <>Hai votato. Puoi cambiarlo fino alla scadenza.</> : <>Hai <strong>un voto</strong>. Apri una proposta per votarla.</>}
              </p>
            )}
          </div>
        </div>}
      </section>

      {proposte.length > 1 && scheda === 'proposte' && <Ticker voci={proposte.map(p => p.titolo)} />}

      {!tipoAmmesso && (
        <p role="note" style={{ maxWidth: 1440, margin: '18px auto 0', padding: '0 max(20px, env(safe-area-inset-left))', fontSize: 14 }} className="mz-muted">
          Qui votano solo {contest.iscrizione === 'gruppo' ? 'i team' : 'gli iscritti individuali'}.
        </p>
      )}

      <div style={{ maxWidth: 1440, margin: '0 auto', padding: 'clamp(32px, 5vw, 64px) max(20px, env(safe-area-inset-left)) 120px' }}>
        {scheda === 'proposte' && (
          <div style={{ display: 'grid', gap: 36 }}>
            {vincitore && (
              <section className="mz-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 'clamp(20px, 3vw, 40px)', alignItems: 'end', background: 'var(--scena)', color: 'var(--scena-testo)', borderRadius: 6, padding: 'clamp(18px, 3vw, 32px)' }}>
                <Cornice src={vincitore.p.immagine} alt="" style={{ aspectRatio: '16 / 10' }} />
                <div style={{ display: 'grid', gap: 10 }}>
                  <span className="mz-mono" style={{ color: 'var(--scena-tenue)' }}>{vincitore.pari ? 'In testa, a pari merito' : 'La proposta vincitrice'}<Sep />{vincitore.n} voti</span>
                  <h2 className="mz-display mz-break" style={{ fontSize: 'clamp(40px, 6vw, 88px)' }}>{vincitore.p.titolo}</h2>
                  <span className="mz-break" style={{ fontSize: 15 }}>{vincitore.p.autori}</span>
                  <button type="button" className="mz-pill" style={{ background: 'var(--scena-testo)', color: 'var(--scena-su-testo)', justifySelf: 'start' }} onClick={() => apri(vincitore.p)}>Apri la proposta →</button>
                </div>
              </section>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', borderTop: '1px solid var(--ink)', paddingTop: 14 }}>
              <span className="mz-mono" style={{ color: 'var(--ink)' }}>Le proposte in gara</span>
              {proposte.length > 1 && (
                <Segmentato etichetta="Vista" valore={vista} onCambia={setVista} opzioni={[{ id: 'galleria', label: 'Galleria' }, { id: 'presenta', label: 'Presenta' }]} />
              )}
            </div>
            {vista === 'presenta' && proposte.length > 1
              ? <StackProposte proposte={proposte} onApri={apri} mioVoto={mioVoto} />
              : <GalleriaProposte proposte={proposte} onApri={apri} mioVoto={mioVoto} mioId={io.id} />}
          </div>
        )}

        {scheda === 'dati' && (
          stat ? (
            <DashboardVoto stat={stat} scarto={scarto} proposte={proposte} mioVoto={mioVoto} onApri={apri} />
          ) : (
            <div style={{ display: 'grid', gap: 18, justifyItems: 'start' }}>
              <Solidi piccoli />
              <p style={{ fontSize: 18, margin: 0 }}>I dati compaiono quando si apre il voto.</p>
            </div>
          )
        )}

        {scheda === 'mia' && (
          <FormProposta contest={contest} team={io} esistente={mia} ammesso={tipoAmmesso} onSalvata={async () => { await caricaProposte(); cambiaScheda('proposte'); }} />
        )}
      </div>

      <Sheet
        aperto={!!aperta}
        onChiudi={() => setAperta(null)}
        categoria={aperta ? `Proposta ${String(indiceAperta + 1).padStart(2, '0')} di ${String(proposte.length).padStart(2, '0')}` : ''}
      >
        {aperta && (
          <>
            <DettaglioProposta p={aperta} indice={indiceAperta} />
            <div style={{ position: 'sticky', bottom: 0, padding: '16px clamp(20px, 4vw, 44px) calc(16px + env(safe-area-inset-bottom))', background: 'color-mix(in srgb, var(--surface) 88%, transparent)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: '1px solid var(--line)', display: 'grid', gap: 10 }}>
              {errore && <p role="alert" style={{ margin: 0, color: '#dc2626', fontSize: 14 }}>{errore}</p>}
              {!tipoAmmesso ? (
                <p style={{ margin: 0, fontSize: 14 }} className="mz-muted">In questo contest votano solo {contest.iscrizione === 'gruppo' ? 'i team' : 'gli iscritti individuali'}.</p>
              ) : propria ? (
                <p style={{ margin: 0, fontSize: 14 }} className="mz-muted">È la tua proposta: non puoi votarla.</p>
              ) : !votoAperto ? (
                <p style={{ margin: 0, fontSize: 14 }} className="mz-muted">
                  {votoFinito ? 'Votazione conclusa.' : 'Il voto non è ancora aperto.'}
                  {mioVoto === aperta.id && ' Hai votato questa proposta.'}
                </p>
              ) : mioVoto === aperta.id ? (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <span className="mz-chip on" style={{ cursor: 'default' }}>● Hai votato questa proposta</span>
                </div>
              ) : !conferma ? (
                <button type="button" className="mz-pill b lg" onClick={() => setConferma(true)}>
                  {mioVoto ? 'Sposta il mio voto qui' : 'Vota questa proposta'}
                </button>
              ) : (
                <div className="mz-in" style={{ display: 'grid', gap: 10 }}>
                  <p style={{ margin: 0, fontSize: 14.5 }}>
                    Confermi il voto a <strong>«{aperta.titolo}»</strong>? È anonimo.
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" className="mz-pill b lg" disabled={invio} onClick={vota}>{invio ? 'Invio…' : 'Sì, confermo il voto'}</button>
                    <button type="button" className="mz-pill o lg" onClick={() => setConferma(false)}>Ci ripenso</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </Sheet>

      {festa && (
        <Celebrazione
          origine={festa.origine}
          titolo={festa.titolo}
          numero={festa.numero}
          sottotitolo={`${posizione?.zona ? `Da ${posizione.zona}. ` : ''}Il tuo voto è nel conteggio, anonimo.`}
          onFine={fineFesta}
        />
      )}
    </main>
  );
}
