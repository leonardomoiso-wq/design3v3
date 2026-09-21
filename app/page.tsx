'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { moduloDi, type AttivitaRow } from '../lib/attivita';
import { useTeam, type TeamInfo } from '../lib/team-context';
import { TESTI_DEFAULT, unisciTestiPiattaforma } from '../lib/testi-piattaforma';

function useTestiPiattaforma() {
  const [testi, setTesti] = useState(TESTI_DEFAULT);
  useEffect(() => {
    const carica = async () => {
      const { data } = await supabase.from('contenuto_piattaforma').select('chiave, valore');
      if (data) setTesti(unisciTestiPiattaforma(data as { chiave: string; valore: string }[]));
    };
    carica();
  }, []);
  return testi;
}

const messaggioErroreTeam = (codice: string) => {
  switch (codice) {
    case 'nome_troppo_corto': return 'Il nome del team deve avere almeno 2 caratteri.';
    case 'password_troppo_corta': return 'La password deve avere almeno 4 caratteri.';
    case 'domanda_mancante': return 'Scegliete una domanda segreta.';
    case 'risposta_mancante': return 'Scrivete la risposta alla domanda segreta.';
    case 'nome_gia_usato': return 'Questo nome team è già stato scelto da un altro gruppo.';
    case 'credenziali_errate': return 'Nome team o password errati.';
    case 'team_non_trovato': return 'Nessun team trovato con questo nome.';
    case 'risposta_errata': return 'Risposta segreta errata.';
    default: return 'Qualcosa è andato storto. Riprova.';
  }
};

function ScorciatoieAccesso({ onSalta }: { onSalta: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href="/teacher"
        className="text-[11px] uppercase tracking-widest text-stone-400 hover:text-stone-900 font-medium px-3 py-1.5 rounded-full border border-stone-200 hover:border-stone-400 transition"
      >
        🔐 Accesso Docente
      </a>
      <button
        onClick={onSalta}
        className="text-[11px] uppercase tracking-widest text-stone-400 hover:text-stone-900 font-medium px-3 py-1.5 rounded-full border border-stone-200 hover:border-stone-400 transition"
      >
        Accesso Studente diretto
      </button>
    </div>
  );
}

function Incipit({ onAvanti, onSalta }: { onAvanti: () => void; onSalta: () => void }) {
  const testi = useTestiPiattaforma();
  return (
    <main className="min-h-screen px-8 py-12 max-w-5xl mx-auto flex flex-col">
      <nav className="flex flex-wrap justify-between items-center gap-y-3 border-b border-stone-200 pb-6">
        <span className="font-serif tracking-tight font-bold text-lg">Design 3</span>
        <ScorciatoieAccesso onSalta={onSalta} />
      </nav>

      <div className="flex-1 flex items-center justify-center py-12">
        <div className="max-w-lg w-full text-center space-y-6 animate-fade-in-up">
          <div className="inline-block text-xs uppercase tracking-widest bg-stone-200/60 px-3 py-1 rounded-full text-stone-600">
            {testi.incipit_badge}
          </div>
          <h1 className="text-4xl font-serif leading-tight">{testi.incipit_titolo}</h1>
          <p className="text-stone-600 text-base leading-relaxed whitespace-pre-line">
            {testi.incipit_testo}
          </p>
          <button
            onClick={onAvanti}
            className="bg-stone-900 text-white px-8 py-3 rounded-full font-medium text-sm shadow-sm hover:bg-stone-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
          >
            Formiamo il team →
          </button>
          <p className="text-[11px] text-stone-400 whitespace-pre-line">
            {testi.incipit_nota}
          </p>
        </div>
      </div>
    </main>
  );
}

const DOMANDE_SUGGERITE = [
  'Il piatto che cucinereste per festeggiare la consegna?',
  'Il primo oggetto progettato da bambini?',
  'Il soprannome del gruppo alle superiori?',
];

function SchermataAccesso({ onAccesso, onSalta, onIndietro }: { onAccesso: (team: TeamInfo) => void; onSalta: () => void; onIndietro: () => void }) {
  const [scheda, setScheda] = useState<'accedi' | 'crea'>('accedi');
  const [nome, setNome] = useState('');
  const [password, setPassword] = useState('');
  const [domandaSegreta, setDomandaSegreta] = useState('');
  const [rispostaSegreta, setRispostaSegreta] = useState('');
  const [membri, setMembri] = useState<string[]>(['', '']);
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);

  const modificaMembro = (i: number, valore: string) => setMembri(prev => prev.map((m, idx) => (idx === i ? valore : m)));
  const aggiungiCampoMembro = () => setMembri(prev => [...prev, '']);
  const rimuoviCampoMembro = (i: number) => setMembri(prev => prev.filter((_, idx) => idx !== i));

  const [mostraRecupero, setMostraRecupero] = useState(false);
  const [nomeRecupero, setNomeRecupero] = useState('');
  const [domandaRecuperata, setDomandaRecuperata] = useState<string | null>(null);
  const [rispostaRecupero, setRispostaRecupero] = useState('');
  const [nuovaPassword, setNuovaPassword] = useState('');
  const [erroreRecupero, setErroreRecupero] = useState('');
  const [recuperoInCorso, setRecuperoInCorso] = useState(false);
  const [passwordReimpostata, setPasswordReimpostata] = useState(false);

  const invia = async () => {
    setErrore('');
    if (!nome.trim() || !password.trim()) {
      setErrore('Compilate nome team e password.');
      return;
    }
    setInCorso(true);
    if (scheda === 'accedi') {
      const { data, error } = await supabase.rpc('login_team', { p_nome: nome, p_password: password });
      setInCorso(false);
      if (error || !data?.[0]) { setErrore(messaggioErroreTeam(error?.message || 'credenziali_errate')); return; }
      const riga = data[0];
      onAccesso({ id: riga.id, numero: riga.numero, nome: riga.nome, password, membri: riga.membri || [] });
    } else {
      if (!domandaSegreta.trim() || !rispostaSegreta.trim()) {
        setInCorso(false);
        setErrore('Scegliete anche una domanda segreta e la sua risposta: servirà per recuperare la password.');
        return;
      }
      const { data, error } = await supabase.rpc('crea_team', {
        p_nome: nome, p_password: password, p_domanda_segreta: domandaSegreta, p_risposta_segreta: rispostaSegreta,
        p_membri: membri.map(m => m.trim()).filter(Boolean),
      });
      setInCorso(false);
      if (error || !data?.[0]) { setErrore(messaggioErroreTeam(error?.message || '')); return; }
      const riga = data[0];
      onAccesso({ id: riga.id, numero: riga.numero, nome: riga.nome, password, membri: riga.membri || [] });
    }
  };

  const chiediDomanda = async () => {
    setErroreRecupero('');
    setDomandaRecuperata(null);
    if (!nomeRecupero.trim()) { setErroreRecupero('Inserite il nome del vostro team.'); return; }
    setRecuperoInCorso(true);
    const { data, error } = await supabase.rpc('recupera_domanda_team', { p_nome: nomeRecupero });
    setRecuperoInCorso(false);
    if (error || !data) { setErroreRecupero(messaggioErroreTeam(error?.message || 'team_non_trovato')); return; }
    setDomandaRecuperata(data as string);
  };

  const confermaRecupero = async () => {
    setErroreRecupero('');
    if (!rispostaRecupero.trim() || !nuovaPassword.trim()) {
      setErroreRecupero('Rispondete alla domanda e scegliete una nuova password.');
      return;
    }
    setRecuperoInCorso(true);
    const { error } = await supabase.rpc('reimposta_password_team', {
      p_nome: nomeRecupero, p_risposta_segreta: rispostaRecupero, p_nuova_password: nuovaPassword,
    });
    setRecuperoInCorso(false);
    if (error) { setErroreRecupero(messaggioErroreTeam(error.message)); return; }
    setPasswordReimpostata(true);
  };

  const chiudiRecupero = () => {
    setMostraRecupero(false);
    setNomeRecupero(''); setDomandaRecuperata(null); setRispostaRecupero(''); setNuovaPassword('');
    setErroreRecupero(''); setPasswordReimpostata(false);
  };

  return (
    <main className="min-h-screen px-8 py-12 max-w-5xl mx-auto flex flex-col">
      <nav className="flex flex-wrap justify-between items-center gap-y-3 border-b border-stone-200 pb-6">
        <div className="flex items-center gap-3">
          <button onClick={onIndietro} className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 rounded">&larr; Indietro</button>
          <span className="font-serif tracking-tight font-bold text-lg">Design 3</span>
        </div>
        <ScorciatoieAccesso onSalta={onSalta} />
      </nav>

      <div className="flex-1 flex items-center justify-center py-12">
      <div className="max-w-md w-full space-y-5 animate-fade-in-up">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-serif">Il vostro team</h1>
          <p className="text-sm text-stone-500">Nome e password sono a vostra scelta: teneteli a mente, vi serviranno per ritrovare il team.</p>
        </div>

        <div className="flex bg-stone-100 rounded-full p-1">
          <button onClick={() => { setScheda('accedi'); setErrore(''); }} className={`flex-1 text-xs font-medium py-2 rounded-full transition ${scheda === 'accedi' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500'}`}>
            Accedi
          </button>
          <button onClick={() => { setScheda('crea'); setErrore(''); }} className={`flex-1 text-xs font-medium py-2 rounded-full transition ${scheda === 'crea' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500'}`}>
            Crea il tuo team
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-3" aria-hidden={mostraRecupero || undefined}>
          <input type="text" value={nome} onChange={e => setNome(e.target.value)} disabled={mostraRecupero} placeholder="Nome del team" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900 disabled:opacity-50" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} disabled={mostraRecupero} placeholder="Password del team" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900 disabled:opacity-50" />

          {scheda === 'crea' && (
            <>
              <select value={domandaSegreta} onChange={e => setDomandaSegreta(e.target.value)} className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900">
                <option value="">Scegliete una domanda segreta...</option>
                {DOMANDE_SUGGERITE.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <input type="text" value={rispostaSegreta} onChange={e => setRispostaSegreta(e.target.value)} placeholder="La vostra risposta" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
              <p className="text-[11px] text-stone-400">Vi servirà solo se dimenticate la password.</p>

              <div className="border-t border-stone-100 pt-3 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Chi c&apos;è nel team?</p>
                {membri.map((m, i) => (
                  <div key={i} className="flex gap-1.5">
                    <input type="text" value={m} onChange={e => modificaMembro(i, e.target.value)} placeholder={`Studente ${i + 1}`} className="flex-1 border border-stone-200 rounded-xl p-2.5 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
                    {membri.length > 1 && (
                      <button type="button" onClick={() => rimuoviCampoMembro(i)} className="text-stone-300 hover:text-red-600 px-2" aria-label="Rimuovi">✕</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={aggiungiCampoMembro} className="text-xs text-stone-500 hover:text-stone-900 transition">+ Aggiungi studente</button>
              </div>
            </>
          )}

          {errore && <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl p-3">{errore}</p>}

          <button onClick={invia} disabled={inCorso || mostraRecupero} className="w-full bg-stone-900 text-white py-3 rounded-full text-sm font-medium hover:bg-stone-800 transition disabled:opacity-50">
            {inCorso ? 'Un attimo...' : scheda === 'accedi' ? 'Entra' : 'Crea team ed entra'}
          </button>

          {scheda === 'accedi' && (
            <button onClick={() => setMostraRecupero(true)} disabled={mostraRecupero} className="w-full text-center text-xs text-stone-400 hover:text-stone-900 transition disabled:opacity-50">
              Password dimenticata?
            </button>
          )}
        </div>
      </div>
      </div>

      {mostraRecupero && (
        <div className="fixed inset-0 z-40 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-6" role="dialog" aria-modal="true" onClick={chiudiRecupero}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h2 className="font-serif font-bold text-lg">Recupera la password</h2>

            {passwordReimpostata ? (
              <>
                <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">Password aggiornata. Ora potete accedere con quella nuova.</p>
                <button onClick={chiudiRecupero} className="w-full bg-stone-900 text-white py-2.5 rounded-xl text-xs font-medium hover:bg-stone-800 transition">Torna all&apos;accesso</button>
              </>
            ) : (
              <>
                <input type="text" value={nomeRecupero} onChange={e => setNomeRecupero(e.target.value)} placeholder="Nome del team" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
                {domandaRecuperata === null ? (
                  <button onClick={chiediDomanda} disabled={recuperoInCorso} className="w-full bg-stone-100 hover:bg-stone-200 transition text-xs font-medium py-2.5 rounded-xl disabled:opacity-50">
                    {recuperoInCorso ? 'Verifica...' : 'Avanti'}
                  </button>
                ) : (
                  <>
                    <p className="text-xs text-stone-500 italic">&ldquo;{domandaRecuperata}&rdquo;</p>
                    <input type="text" value={rispostaRecupero} onChange={e => setRispostaRecupero(e.target.value)} placeholder="La vostra risposta" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
                    <input type="password" value={nuovaPassword} onChange={e => setNuovaPassword(e.target.value)} placeholder="Nuova password" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
                    <button onClick={confermaRecupero} disabled={recuperoInCorso} className="w-full bg-stone-900 text-white py-2.5 rounded-xl text-xs font-medium hover:bg-stone-800 transition disabled:opacity-50">
                      {recuperoInCorso ? 'Salvataggio...' : 'Reimposta password'}
                    </button>
                  </>
                )}
                {erroreRecupero && <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl p-2.5">{erroreRecupero}</p>}
                <button onClick={chiudiRecupero} className="w-full text-center text-xs text-stone-400 hover:text-stone-900 transition pt-1">Annulla</button>
              </>
            )}
          </div>
        </div>
      )}
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
  const [attivita, setAttivita] = useState<AttivitaRow[]>([]);
  const [mostraMembri, setMostraMembri] = useState(false);
  const testi = useTestiPiattaforma();

  useEffect(() => {
    const carica = async () => {
      const { data, error } = await supabase
        .from('attivita')
        .select('*')
        .in('stato', ['attiva', 'prossimamente'])
        .order('ordine', { ascending: true });
      if (!error && data) setAttivita(data as AttivitaRow[]);
    };

    carica();

    const channel = supabase
      .channel('realtime-attivita-home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attivita' }, carica)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <main className="min-h-screen px-8 py-12 max-w-5xl mx-auto flex flex-col">
      <nav className="flex justify-between items-center border-b border-stone-200 pb-6">
        <span className="font-serif tracking-tight font-bold text-lg">Design 3</span>
        <div className="flex items-center gap-3">
          {team ? (
            <>
              <span className="text-xs uppercase tracking-widest bg-stone-100 border border-stone-200 px-3 py-1.5 rounded-full text-stone-600 font-medium">
                Gruppo {team.numero} — {team.nome}
              </span>
              <button onClick={() => setMostraMembri(true)} className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium transition">
                👥 Membri
              </button>
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
        <div className="inline-block text-xs uppercase tracking-widest bg-stone-200/60 px-3 py-1 rounded-full text-stone-600">
          {testi.home_badge}
        </div>
        <h1 className="text-5xl md:text-6xl font-serif max-w-3xl mx-auto leading-tight">
          {testi.home_titolo}
        </h1>
        <p className="text-stone-600 max-w-xl mx-auto text-base leading-relaxed">
          {testi.home_sottotitolo}
        </p>
      </div>

      <div className="flex-1 grid sm:grid-cols-2 gap-6 pb-16">
        {attivita.map(a => {
          const modulo = moduloDi(a.tipo);
          const avviabile = a.stato === 'attiva';
          return (
            <div
              key={a.id}
              className={`rounded-3xl border p-8 flex flex-col justify-between transition ${
                avviabile
                  ? 'bg-white border-stone-200 shadow-sm hover:border-stone-300'
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
              ) : (
                <div className="mt-6 text-xs text-stone-400 font-medium">In arrivo</div>
              )}
            </div>
          );
        })}
      </div>

      <footer className="text-center text-xs text-stone-400 border-t border-stone-200 pt-6">
        Design 3
      </footer>
    </main>
  );
}

export default function LandingPage() {
  const { team, pronto, accedi, logout } = useTeam();
  const [fase, setFase] = useState<'incipit' | 'accesso'>('incipit');
  const [saltato, setSaltato] = useState(false);

  if (!pronto) {
    return <main className="min-h-screen bg-[#FBF9F5]" />;
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
