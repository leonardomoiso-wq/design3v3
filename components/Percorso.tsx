'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { moduloDi, type AttivitaRow } from '../lib/attivita';
import { useTeam, etichettaTeam, type TeamInfo, type TipoTeam } from '../lib/team-context';
import { unisciTestiPiattaforma, accessoDirettoAbilitato } from '../lib/testi-piattaforma';
import { useCorso } from '../lib/corso-context';
import { caricaAtenei, caricaCorsiPubblici, caricaCorsoPerCodice, percorsoCorso, NOME_PIATTAFORMA, type Ateneo, type Corso } from '../lib/corsi';
import { ascoltaCorso } from '../lib/realtime';
import { ActionSheet, BottomSheet } from '../components/PannelliMobile';
import PillaScorrevole from '../components/PillaScorrevole';
import Info from '../components/Info';
import AccessoTeam from '../components/AccessoTeam';
import { RailVetrina, RigaIndice, due } from '../components/Vetrina';
import { Solidi } from '../components/moiso/Moiso';
import { caricaContestAteneo } from '../lib/contest';

// Testi di presentazione del corso in cui si trova lo studente.
function useTestiPiattaforma() {
  const { corso } = useCorso();
  const [testi, setTesti] = useState(() => unisciTestiPiattaforma([], corso?.nome));
  useEffect(() => {
    if (!corso) return;
    const carica = async () => {
      const { data } = await supabase.from('contenuto_piattaforma').select('chiave, valore').eq('corso_id', corso.id);
      setTesti(unisciTestiPiattaforma((data || []) as { chiave: string; valore: string }[], corso.nome));
    };
    carica();
  }, [corso]);
  return testi;
}

// Marchio della piattaforma + corso attuale: toccandolo si cambia corso.
function MarchioCorso() {
  const { corso, lasciaCorso } = useCorso();
  const router = useRouter();
  const cambiaCorso = () => {
    const destinazione = corso?.ateneo_codice ? `/${corso.ateneo_codice}` : '/';
    lasciaCorso();
    router.push(destinazione);
  };
  const [aperto, setAperto] = useState(false);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="font-serif tracking-tight font-bold text-lg flex-shrink-0 max-sm:hidden">{NOME_PIATTAFORMA}</span>
      {corso && (
        <>
          <button
            onClick={() => setAperto(true)}
            aria-haspopup="dialog"
            title="Cambia corso"
            className="flex items-center gap-1.5 min-w-0 pl-3 pr-2.5 py-1.5 rounded-full bg-amber-50 border border-amber-200 hover:border-amber-400 transition text-sm font-medium"
          >
            <span className="truncate max-w-[12rem]">{corso.nome}</span>
            <span aria-hidden="true" className="text-amber-700 text-xs">▾</span>
          </button>
          <ActionSheet
            aperto={aperto}
            onChiudi={() => setAperto(false)}
            titolo={`Corso: ${corso.nome}`}
            azioni={[
              { chiave: 'cambia', etichetta: '↺ Cambia corso', descrizione: corso.ateneo_nome ? `Gli altri corsi di ${corso.ateneo_nome}` : 'Torna all’elenco dei corsi', onSeleziona: cambiaCorso },
            ]}
          />
        </>
      )}
    </div>
  );
}

// Primo passo: l'ateneo. Ogni ateneo ha la sua pagina (/polito, /unipr)
// con i corsi e i contest aperti a tutto l'ateneo; i corsi non ancora
// assegnati a un ateneo restano raggiungibili da qui.
function SceltaAteneo() {
  const { scegliCorso } = useCorso();
  const router = useRouter();
  const [atenei, setAtenei] = useState<Ateneo[] | null>(null);
  const [corsi, setCorsi] = useState<Corso[]>([]);
  const [contestAperti, setContestAperti] = useState<Record<string, number>>({});
  const [codiceAperto, setCodiceAperto] = useState(false);
  const [codice, setCodice] = useState('');
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);

  useEffect(() => {
    caricaAtenei().then(async lista => {
      setAtenei(lista);
      const conti = await Promise.all(lista.map(async a => [a.id, (await caricaContestAteneo(a.id)).filter(c => c.stato_attivita === 'attiva').length] as const));
      setContestAperti(Object.fromEntries(conti));
    });
    caricaCorsiPubblici().then(setCorsi);
  }, []);
  const senzaAteneo = corsi.filter(x => !x.ateneo_id);

  const entraConCodice = async () => {
    setErrore('');
    if (!codice.trim()) return;
    setInCorso(true);
    const trovato = await caricaCorsoPerCodice(codice);
    setInCorso(false);
    if (!trovato || trovato.archiviato || trovato.spazio_ateneo) { setErrore('Nessun corso attivo con questo codice. Controllatelo con il/la docente.'); return; }
    if (trovato.ateneo_codice) router.push(percorsoCorso(trovato));
    else scegliCorso(trovato);
  };

  const n = (atenei?.length || 0) + senzaAteneo.length;
  return (
    <main className="mz mz-vetrina">
      <RailVetrina
        sinistra={<span className="mz-mono max-sm:hidden">Laboratori di design</span>}
      />

      <section className="mz-eroe">
        <h1 className="mz-display mz-eroe-titolo mz-in">
          Scegli il tuo ateneo<span className="mz-sup">({due(n)})</span>
        </h1>
        <div className="mz-eroe-lato mz-in" style={{ animationDelay: '120ms' }}>
          <Solidi cadono />
          <button type="button" className="mz-pill o" onClick={() => { setErrore(''); setCodiceAperto(true); }}>Ho un codice corso</button>
        </div>
      </section>

      <div className="mz-barra">
        <span className="mz-mono" style={{ color: 'var(--ink)' }}>Atenei</span>
        <span className="mz-mono">{due(corsi.length)} corsi</span>
      </div>
      <ul className="mz-indice riempi">
        {atenei === null && <li className="mz-riga" style={{ cursor: 'default' }}><span /><span className="mz-muted">Caricamento…</span></li>}
        {atenei?.map((a, i) => {
          const nCorsi = corsi.filter(c => c.ateneo_id === a.id).length;
          const vivi = contestAperti[a.id] || 0;
          return (
            <RigaIndice
              key={a.id}
              indice={i + 1}
              ritardo={160 + i * 70}
              href={`/${a.codice}`}
              titolo={a.nome}
              meta={<>
                {vivi > 0 && <span className="mz-mono" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', color: 'var(--ink)' }}><span className="mz-live-dot" style={{ width: 7, height: 7 }} />Contest aperto</span>}
                <span className="mz-mono">{nCorsi === 1 ? '1 corso' : `${nCorsi} corsi`}</span>
                <span className="mz-mono" style={{ textTransform: 'none' }}>/{a.codice}</span>
              </>}
            />
          );
        })}
        {senzaAteneo.map((c, i) => (
          <RigaIndice
            key={c.id}
            indice={(atenei?.length || 0) + i + 1}
            ritardo={160 + ((atenei?.length || 0) + i) * 70}
            onClick={() => scegliCorso(c)}
            titolo={c.nome}
            meta={<span className="mz-mono" style={{ textTransform: 'none' }}>{c.codice}</span>}
          />
        ))}
      </ul>

      <BottomSheet aperto={codiceAperto} onChiudi={() => setCodiceAperto(false)} etichetta="Entra con il codice del corso" titolo="Entra con il codice" larghezzaDesktop="md:max-w-sm">
        <form onSubmit={e => { e.preventDefault(); entraConCodice(); }} className="space-y-3">
          <input value={codice} onChange={e => setCodice(e.target.value)} placeholder="es. design-3" autoFocus aria-label="Codice del corso" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 font-mono focus:outline-none focus:ring-2 focus:ring-stone-900" />
          {errore && <p role="alert" className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl p-2.5">{errore}</p>}
          <button type="submit" disabled={inCorso || !codice.trim()} className="w-full bg-stone-900 text-white py-3 rounded-full text-sm font-medium hover:bg-stone-800 transition disabled:opacity-50">
            {inCorso ? 'Cerco...' : 'Entra'}
          </button>
        </form>
      </BottomSheet>
    </main>
  );
}

function ScorciatoieAccesso({ onSalta, mostraAccessoDiretto }: { onSalta: () => void; mostraAccessoDiretto: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href="/teacher"
        className="text-[11px] uppercase tracking-widest text-stone-400 hover:text-stone-900 font-medium px-3 py-1.5 rounded-full border border-stone-200 hover:border-stone-400 transition"
      >
        🔐 Accesso Docente
      </a>
      {mostraAccessoDiretto && (
        <button
          onClick={onSalta}
          className="text-[11px] uppercase tracking-widest text-stone-400 hover:text-stone-900 font-medium px-3 py-1.5 rounded-full border border-stone-200 hover:border-stone-400 transition"
        >
          Accesso Studente diretto
        </button>
      )}
    </div>
  );
}

function Incipit({ onAvanti, onSalta }: { onAvanti: () => void; onSalta: () => void }) {
  const testi = useTestiPiattaforma();
  const accessoDirettoOn = accessoDirettoAbilitato(testi);
  return (
    <main className="min-h-screen px-5 sm:px-8 py-8 sm:py-12 max-w-5xl mx-auto flex flex-col">
      <nav className="flex flex-wrap justify-between items-center gap-y-3 border-b border-stone-200 pb-6">
        <MarchioCorso />
        <ScorciatoieAccesso onSalta={onSalta} mostraAccessoDiretto={accessoDirettoOn} />
      </nav>

      <div className="flex-1 flex items-center justify-center py-12">
        <div className="max-w-lg w-full text-center space-y-6 animate-fade-in-up">
          <h1 className="text-4xl font-serif leading-tight">
            {testi.incipit_titolo}
            {testi.incipit_badge && <span className="apice">({testi.incipit_badge})</span>}
          </h1>
          <p className="text-stone-600 text-base leading-relaxed whitespace-pre-line">
            {testi.incipit_testo}
          </p>
          <button
            onClick={onAvanti}
            className="bg-stone-900 text-white px-8 py-3 rounded-full font-medium text-sm shadow-sm hover:bg-stone-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
          >
            Entra: in team o da soli →
          </button>
          {accessoDirettoOn && testi.incipit_nota && <Info><span className="whitespace-pre-line">{testi.incipit_nota}</span></Info>}
        </div>
      </div>
    </main>
  );
}

function SchermataAccesso({ onAccesso, onSalta, onIndietro }: { onAccesso: (team: TeamInfo) => void; onSalta: () => void; onIndietro: () => void }) {
  const { corso } = useCorso();
  const testi = useTestiPiattaforma();
  const accessoDirettoOn = accessoDirettoAbilitato(testi);
  return (
    <main className="min-h-screen px-5 sm:px-8 py-8 sm:py-12 max-w-5xl mx-auto flex flex-col">
      <nav className="flex flex-wrap justify-between items-center gap-y-3 border-b border-stone-200 pb-6">
        <div className="flex items-center gap-3">
          <button onClick={onIndietro} className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 rounded">&larr; Indietro</button>
          <MarchioCorso />
        </div>
        <ScorciatoieAccesso onSalta={onSalta} mostraAccessoDiretto={accessoDirettoOn} />
      </nav>
      <div className="flex-1 flex items-center justify-center py-12">
        {corso && <AccessoTeam corsoId={corso.id} onAccesso={onAccesso} />}
      </div>
    </main>
  );
}

function PannelloMembri({ team, onChiudi, onAggiornati }: { team: TeamInfo; onChiudi: () => void; onAggiornati: (membri: string[]) => void }) {
  const [membri, setMembri] = useState<string[]>(team.membri.length > 0 ? team.membri : ['']);
  const [errore, setErrore] = useState('');
  const [salvataggioInCorso, setSalvataggioInCorso] = useState(false);

  const modifica = (i: number, valore: string) => setMembri(prev => prev.map((m, idx) => (idx === i ? valore : m)));
  const aggiungi = () => setMembri(prev => [...prev, '']);
  const rimuovi = (i: number) => setMembri(prev => prev.filter((_, idx) => idx !== i));

  const salva = async () => {
    setErrore('');
    setSalvataggioInCorso(true);
    const puliti = membri.map(m => m.trim()).filter(Boolean);
    const { data, error } = await supabase.rpc('aggiorna_membri_team', { p_id: team.id, p_password: team.password, p_membri: puliti });
    setSalvataggioInCorso(false);
    if (error) { setErrore('Errore durante il salvataggio. Riprova.'); return; }
    onAggiornati((data as string[]) || puliti);
    onChiudi();
  };

  return (
    <div className="fixed inset-0 z-40 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-6" role="dialog" aria-modal="true" onClick={onChiudi}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-3" onClick={e => e.stopPropagation()}>
        <h2 className="font-serif font-bold text-lg">Chi c&apos;è nel team?</h2>
        <p className="text-xs text-stone-500">Gruppo {team.numero} — {team.nome}</p>
        <div className="space-y-2">
          {membri.map((m, i) => (
            <div key={i} className="flex gap-1.5">
              <input type="text" value={m} onChange={e => modifica(i, e.target.value)} placeholder={`Studente ${i + 1}`} className="flex-1 border border-stone-200 rounded-xl p-2.5 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
              {membri.length > 1 && (
                <button type="button" onClick={() => rimuovi(i)} className="text-stone-300 hover:text-red-600 px-2" aria-label="Rimuovi">✕</button>
              )}
            </div>
          ))}
          <button type="button" onClick={aggiungi} className="text-xs text-stone-500 hover:text-stone-900 transition">+ Aggiungi studente</button>
        </div>
        {errore && <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl p-2.5">{errore}</p>}
        <div className="flex gap-2 pt-2">
          <button onClick={onChiudi} className="flex-1 bg-stone-100 hover:bg-stone-200 transition text-xs font-medium py-2.5 rounded-xl">Annulla</button>
          <button onClick={salva} disabled={salvataggioInCorso} className="flex-1 bg-stone-900 text-white hover:bg-stone-800 transition text-xs font-medium py-2.5 rounded-xl disabled:opacity-50">
            {salvataggioInCorso ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ElencoAttivita({ team, onLogout, onTeamAggiornato }: { team: TeamInfo | null; onLogout: () => void; onTeamAggiornato: (team: TeamInfo) => void }) {
  const { corso } = useCorso();
  const corsoId = corso!.id;
  const [attivita, setAttivita] = useState<AttivitaRow[]>([]);
  const [mostraMembri, setMostraMembri] = useState(false);
  const testi = useTestiPiattaforma();

  useEffect(() => {
    const carica = async () => {
      const { data, error } = await supabase
        .from('attivita')
        .select('*')
        .eq('corso_id', corsoId)
        .in('stato', ['attiva', 'prossimamente'])
        .order('ordine', { ascending: true });
      if (!error && data) setAttivita(data as AttivitaRow[]);
    };

    carica();

    const channel = ascoltaCorso(supabase.channel(`realtime-attivita-home-${corsoId}`), 'attivita', corsoId, carica).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [corsoId]);

  return (
    <main className="min-h-screen px-5 sm:px-8 py-8 sm:py-12 max-w-5xl mx-auto flex flex-col">
      <nav className="flex flex-wrap justify-between items-center gap-3 border-b border-stone-200 pb-6">
        <MarchioCorso />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {team ? (
            <>
              <span className="text-xs uppercase tracking-widest bg-stone-100 border border-stone-200 px-3 py-1.5 rounded-full text-stone-600 font-medium">
                {etichettaTeam(team)}
              </span>
              {team.tipo !== 'individuale' && (
                <button onClick={() => setMostraMembri(true)} className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium transition">
                  👥 Membri
                </button>
              )}
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-xs uppercase tracking-widest bg-stone-100 border border-stone-200 pl-3 pr-1.5 py-1.5 rounded-full text-stone-500 font-medium">
              Accesso diretto (nessun team)
              <button
                onClick={onLogout}
                aria-label="Deseleziona accesso diretto e torna al login"
                title="Deseleziona accesso diretto"
                className="w-4 h-4 flex items-center justify-center rounded-full text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
              >
                ✕
              </button>
            </span>
          )}
          <a href="/manuali" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 rounded">
            📚 Manuali &amp; Tutorial
          </a>
          <button onClick={onLogout} className="text-xs uppercase tracking-widest text-stone-400 hover:text-red-600 font-medium transition">
            {team ? 'Esci' : '← Torna al login'}
          </button>
        </div>
      </nav>

      {mostraMembri && team && (
        <PannelloMembri
          team={team}
          onChiudi={() => setMostraMembri(false)}
          onAggiornati={nuoviMembri => onTeamAggiornato({ ...team, membri: nuoviMembri })}
        />
      )}

      <div className="pt-16 pb-10 text-center space-y-5">
        <h1 className="text-5xl md:text-6xl font-serif max-w-3xl mx-auto leading-tight">
          {testi.home_titolo}
          {testi.home_badge && <span className="apice">({testi.home_badge})</span>}
          {testi.home_sottotitolo && <Info>{testi.home_sottotitolo}</Info>}
        </h1>
      </div>

      <div className="flex-1 grid sm:grid-cols-2 gap-6 pb-16 content-start entra-cascata">
        {attivita.map(a => {
          const modulo = moduloDi(a.tipo);
          const avviabile = a.stato === 'attiva';
          return (
            <div
              key={a.id}
              className={`rounded-3xl border p-8 flex flex-col justify-between ${
                avviabile
                  ? 'card-viva bg-white border-stone-200 shadow-sm hover:border-stone-300'
                  : 'bg-stone-100/60 border-dashed border-stone-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-3xl" aria-hidden="true">{modulo.icona}</span>
                  {!avviabile && (
                    <span className="text-[10px] uppercase tracking-widest bg-stone-200 text-stone-500 px-2.5 py-1 rounded-full font-bold">
                      Prossimamente
                    </span>
                  )}
                </div>
                <h2 className={`text-xl font-serif font-bold ${avviabile ? 'text-stone-900' : 'text-stone-400'}`}>
                  {a.titolo}
                </h2>
                <p className={`text-sm mt-2 leading-relaxed ${avviabile ? 'text-stone-600' : 'text-stone-400'}`}>
                  {a.descrizione}
                </p>
              </div>

              {avviabile ? (
                <div className="flex space-x-3 mt-6">
                  {modulo.hrefStudente && (
                    <a
                      href={modulo.hrefStudente}
                      className="flex-1 text-center bg-stone-900 text-white px-5 py-3 rounded-full font-medium text-sm shadow-sm hover:bg-stone-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
                    >
                      Area Studenti
                    </a>
                  )}
                  {modulo.hrefDocente && (
                    <a
                      href={modulo.hrefDocente}
                      className="flex-1 text-center bg-white border border-stone-300 text-stone-900 px-5 py-3 rounded-full font-medium text-sm hover:border-stone-400 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
                    >
                      Area Docente
                    </a>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

    </main>
  );
}

// Il percorso dello studente in un corso: presentazione, accesso,
// attività. Dalla home ("/") senza corso si sceglie l'ateneo; con un
// corso già scelto si passa al suo indirizzo (/ateneo/corso), così il
// link nella barra è sempre quello da condividere.
export default function PercorsoStudente({ daIndirizzo = false }: { daIndirizzo?: boolean }) {
  const { corso, pronto: corsoPronto } = useCorso();
  const router = useRouter();
  const daReindirizzare = !daIndirizzo && !!corso?.ateneo_codice;
  useEffect(() => { if (daReindirizzare && corso) router.replace(percorsoCorso(corso)); }, [daReindirizzare, corso, router]);
  const { team, pronto, accedi, logout } = useTeam();
  const [fase, setFase] = useState<'incipit' | 'accesso'>('incipit');
  const [saltato, setSaltato] = useState(false);

  // Cambiando corso si riparte dall'inizio del percorso di accesso.
  useEffect(() => { setFase('incipit'); setSaltato(false); }, [corso?.id]);

  if (!corsoPronto || !pronto || daReindirizzare) {
    return <main className="min-h-screen bg-[#FBF9F5]" />;
  }

  if (!corso) {
    return <SceltaAteneo />;
  }

  if (!team && !saltato) {
    return fase === 'incipit'
      ? <Incipit onAvanti={() => setFase('accesso')} onSalta={() => setSaltato(true)} />
      : <SchermataAccesso onAccesso={accedi} onSalta={() => setSaltato(true)} onIndietro={() => setFase('incipit')} />;
  }

  return (
    <ElencoAttivita
      team={team}
      onLogout={() => { if (team) logout(); else setSaltato(false); }}
      onTeamAggiornato={accedi}
    />
  );
}
