'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { moduloDi, type AttivitaRow } from '../lib/attivita';
import { useTeam, etichettaTeam, type TeamInfo } from '../lib/team-context';
import { unisciTestiPiattaforma, accessoDirettoAbilitato } from '../lib/testi-piattaforma';
import { useCorso } from '../lib/corso-context';
import { caricaAtenei, caricaCorsiPubblici, caricaCorsoPerCodice, percorsoCorso, type Ateneo, type Corso } from '../lib/corsi';
import { ascoltaCorso } from '../lib/realtime';
import { BottomSheet } from '../components/PannelliMobile';
import Info from '../components/Info';
import AccessoTeam from '../components/AccessoTeam';
import { RailVetrina, RigaIndice, due, scalaTitolo } from '../components/Vetrina';
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

// Torna ai corsi dell'ateneo (o alla scelta dell'ateneo): lascia il corso.
function TornaAteneo() {
  const { corso, lasciaCorso } = useCorso();
  const router = useRouter();
  if (!corso) return null;
  const vai = () => {
    const destinazione = corso.ateneo_codice ? `/${corso.ateneo_codice}` : '/';
    lasciaCorso();
    router.push(destinazione);
  };
  return (
    <button type="button" onClick={vai} className="mz-mono" style={{ all: 'unset', cursor: 'pointer', fontFamily: 'var(--f-label)', fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
      ← <span className="max-sm:hidden"><span title={corso.ateneo_nome || undefined} style={{ display: 'inline-block', maxWidth: '28vw', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom' }}>{corso.ateneo_nome || 'Altri corsi'}</span></span><span className="sm:hidden">Corsi</span>
    </button>
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

// Ingresso del corso (/polito/design-3): il nome del corso e subito
// l'accesso, in team o da soli.
function IngressoCorsoVetrina({ onAccesso, onSalta }: { onAccesso: (team: TeamInfo) => void; onSalta: () => void }) {
  const { corso } = useCorso();
  const testi = useTestiPiattaforma();
  const accessoDirettoOn = accessoDirettoAbilitato(testi);
  if (!corso) return null;
  return (
    <main className="mz mz-vetrina">
      <RailVetrina
        sinistra={<TornaAteneo />}
        destra={accessoDirettoOn ? <span className="max-sm:hidden"><button type="button" className="mz-pill sm ghost" onClick={onSalta}>Entra senza accesso</button></span> : undefined}
      />
      <section className="mz-ingresso">
        <div className="mz-ingresso-testo">
          {corso.ateneo_nome && <span className="mz-mono mz-in">{corso.ateneo_nome}</span>}
          <h1 className="mz-display mz-eroe-titolo mz-in" style={{ animationDelay: '60ms', fontSize: scalaTitolo(corso.nome, { min: 52, vw: 8.6, max: 150, larghezza: 0.58 }) }}>
            {corso.nome}{testi.incipit_badge && testi.incipit_badge.trim().toLowerCase() !== corso.nome.trim().toLowerCase() && <span className="mz-sup">({testi.incipit_badge})</span>}
          </h1>
          {testi.incipit_testo && <p className="mz-ingresso-lead mz-in" style={{ animationDelay: '120ms' }}>{testi.incipit_testo}</p>}
          <div className="mz-in max-md:hidden" style={{ animationDelay: '180ms', justifySelf: 'start' }}><Solidi cadono piccoli /></div>
        </div>
        <div className="mz-ingresso-accesso mz-in" style={{ animationDelay: '160ms' }}>
          <span className="mz-mono" style={{ color: 'var(--ink)' }}>
            Entra nel corso
            <Info lato="destra">Con «Accedi» entri con un accesso che hai già, di team o individuale. Con «Iscriviti» ne crei uno nuovo: in team, oppure da solo/a per le attività individuali come il voto del Contest.</Info>
          </span>
          <AccessoTeam corsoId={corso.id} onAccesso={onAccesso} conTitolo={false} />
          {accessoDirettoOn && <div className="sm:hidden" style={{ justifySelf: 'center' }}><button type="button" className="mz-pill sm ghost" onClick={onSalta}>Entra senza accesso</button></div>}
        </div>
      </section>
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

  const aperte = attivita.filter(a => a.stato === 'attiva').length;
  return (
    <main className="mz mz-vetrina">
      <RailVetrina sinistra={<TornaAteneo />} />

      {mostraMembri && team && (
        <PannelloMembri
          team={team}
          onChiudi={() => setMostraMembri(false)}
          onAggiornati={nuoviMembri => onTeamAggiornato({ ...team, membri: nuoviMembri })}
        />
      )}

      <section className="mz-eroe">
        <div style={{ display: 'grid', gap: 14 }}>
          {corso!.ateneo_nome && <span className="mz-mono mz-in">{corso!.ateneo_nome}</span>}
          <h1 className="mz-display mz-eroe-titolo mz-in" style={{ animationDelay: '60ms', fontSize: scalaTitolo(corso!.nome, { min: 52, vw: 8.6, max: 150, larghezza: 0.58 }) }}>
            {corso!.nome}{testi.home_badge && testi.home_badge.trim().toLowerCase() !== corso!.nome.trim().toLowerCase() && <span className="mz-sup">({testi.home_badge})</span>}
            {testi.home_sottotitolo && <span style={{ fontSize: 16, verticalAlign: 'middle' }}><Info>{testi.home_sottotitolo}</Info></span>}
          </h1>
        </div>
        <div className="mz-eroe-lato mz-in" style={{ animationDelay: '120ms' }}>
          <span className="mz-mono" style={{ color: 'var(--ink)', textTransform: 'none', letterSpacing: '.02em', fontSize: 13 }}>
            {team ? etichettaTeam(team) : 'Senza accesso'}
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'inherit' }}>
            {team && team.tipo !== 'individuale' && <button type="button" className="mz-pill sm o" onClick={() => setMostraMembri(true)}>Membri</button>}
            <a href="/manuali" className="mz-pill sm o">Manuali</a>
            <button type="button" className="mz-pill sm ghost" onClick={onLogout}>{team ? 'Esci' : 'Accedi'}</button>
          </div>
        </div>
      </section>

      <div className="mz-barra">
        <span className="mz-mono" style={{ color: 'var(--ink)' }}>Attività</span>
        <span className="mz-mono">{due(aperte)} aperte</span>
      </div>
      <ul className="mz-indice riempi">
        {attivita.length === 0 && <li className="mz-riga spenta"><span /><span className="mz-muted">Nessuna attività aperta per ora.</span></li>}
        {attivita.map((a, i) => {
          const modulo = moduloDi(a.tipo);
          const avviabile = a.stato === 'attiva' && !!modulo.hrefStudente;
          return (
            <RigaIndice
              key={a.id}
              indice={i + 1}
              ritardo={160 + i * 70}
              href={avviabile ? modulo.hrefStudente : undefined}
              spenta={!avviabile}
              titolo={a.titolo}
              sotto={a.descrizione || undefined}
              meta={avviabile
                ? <span className="mz-mono" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', color: 'var(--ink)' }}><span className="mz-live-dot" style={{ width: 7, height: 7 }} />Aperta</span>
                : <span className="mz-mono">In arrivo</span>}
            />
          );
        })}
      </ul>
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
  const [saltato, setSaltato] = useState(false);

  // Cambiando corso si riparte dall'accesso.
  useEffect(() => { setSaltato(false); }, [corso?.id]);

  if (!corsoPronto || !pronto || daReindirizzare) {
    return <main className="min-h-screen bg-[#FBF9F5]" />;
  }

  if (!corso) {
    return <SceltaAteneo />;
  }

  if (!team && !saltato) {
    return <IngressoCorsoVetrina onAccesso={accedi} onSalta={() => setSaltato(true)} />;
  }

  return (
    <ElencoAttivita
      team={team}
      onLogout={() => { if (team) logout(); else setSaltato(false); }}
      onTeamAggiornato={accedi}
    />
  );
}
