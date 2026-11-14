'use client';
// Accesso alla piattaforma per un corso (o per uno spazio di ateneo):
// «Accedi» oppure «Iscriviti» in team o da solo/a, con domanda segreta
// per recuperare la password. Usato dalla home di ogni corso e dal
// Contest di ateneo.
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { TeamInfo, TipoTeam } from '@/lib/team-context';
import PillaScorrevole from '@/components/PillaScorrevole';
import Info from '@/components/Info';

export const messaggioErroreTeam = (codice: string) => {
  switch (codice) {
    case 'nome_troppo_corto': return 'Il nome deve avere almeno 2 caratteri.';
    case 'password_troppo_corta': return 'La password deve avere almeno 4 caratteri.';
    case 'domanda_mancante': return 'Scegliete una domanda segreta.';
    case 'risposta_mancante': return 'Scrivete la risposta alla domanda segreta.';
    case 'nome_gia_usato': return 'Questo nome è già usato da un altro team o studente del corso.';
    case 'corso_non_trovato': return 'Il corso non è più attivo. Sceglietene un altro.';
    case 'credenziali_errate': return 'Nome o password errati.';
    case 'team_non_trovato': return 'Nessun team trovato con questo nome.';
    case 'risposta_errata': return 'Risposta segreta errata.';
    case 'nome_cognome_mancanti': return 'Scrivi nome e cognome, entrambi per intero.';
    case 'matricola_gia_usata': return 'Questa matricola è già registrata. Entra con l’accesso che hai già (se l’hai creato in un corso, scegli «Con il mio corso»).';
    case 'matricola_non_valida': return 'La matricola ha da 4 a 12 lettere o cifre, senza spazi.';
    case 'matricola_gia_impostata': return 'La matricola di questo accesso è già impostata e non si può cambiare.';
    case 'matricola_solo_individuale': return 'La matricola si usa solo per gli accessi individuali.';
    case 'matricola_non_in_elenco': return 'Matricola non trovata nell’elenco del contest, oppure il cognome non corrisponde. Controlla e riprova.';
    default: return 'Qualcosa è andato storto. Riprova.';
  }
};

const DOMANDE_SUGGERITE = [
  'Il piatto che cucinereste per festeggiare la consegna?',
  'Il primo oggetto progettato da bambini?',
  'Il soprannome del gruppo alle superiori?',
];

export default function AccessoTeam({ corsoId, onAccesso, tipoIniziale = 'gruppo', conTitolo = true, schedaIniziale = 'accedi', soloIndividuale = false, conMatricola = false, contestId }: { corsoId: string; onAccesso: (team: TeamInfo) => void; tipoIniziale?: TipoTeam; conTitolo?: boolean; schedaIniziale?: 'accedi' | 'crea'; soloIndividuale?: boolean; conMatricola?: boolean; contestId?: string }) {
  const [scheda, setScheda] = useState<'accedi' | 'crea'>(schedaIniziale);
  // Iscrizione di gruppo o individuale: per alcune attività (es. il
  // Contest) l'impegno è di una persona sola.
  const [tipo, setTipo] = useState<TipoTeam>(soloIndividuale ? 'individuale' : tipoIniziale);
  const individuale = scheda === 'crea' && tipo === 'individuale';
  const [nome, setNome] = useState('');
  // Iscrizione individuale: nome e cognome in due campi, entrambi obbligatori.
  const [cognome, setCognome] = useState('');
  // Matricola: richiesta dai contest che la vogliono (un voto a matricola).
  const [matricola, setMatricola] = useState('');
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
    const parolaValida = (x: string) => x.replace(/[^\p{L}]/gu, '').length >= 2;
    if (individuale && (!parolaValida(nome) || !parolaValida(cognome))) {
      setErrore('Scrivi nome e cognome, entrambi per intero.');
      return;
    }
    if (individuale && conMatricola && !/^[A-Za-z0-9]{4,12}$/.test(matricola.replace(/\s+/g, ''))) {
      setErrore('Scrivi la tua matricola: da 4 a 12 lettere o cifre.');
      return;
    }
    if (!nome.trim() || !password.trim()) {
      setErrore(individuale ? 'Compila nome e password.' : 'Compilate nome e password.');
      return;
    }
    setInCorso(true);
    if (scheda === 'accedi') {
      const { data, error } = await supabase.rpc('login_team', { p_corso_id: corsoId, p_nome: nome, p_password: password });
      setInCorso(false);
      if (error || !data?.[0]) { setErrore(messaggioErroreTeam(error?.message || 'credenziali_errate')); return; }
      const riga = data[0];
      // Alcune attività (il voto del Contest) accettano solo accessi individuali.
      if (soloIndividuale && riga.tipo !== 'individuale') {
        setErrore('Questo è l’accesso di un team. Per votare serve un accesso individuale: scegli «Iscriviti» e registrati con il tuo nome.');
        return;
      }
      onAccesso({ id: riga.id, numero: riga.numero, nome: riga.nome, password, membri: riga.membri || [], tipo: riga.tipo === 'individuale' ? 'individuale' : 'gruppo', matricola: riga.matricola ?? null });
    } else {
      if (!domandaSegreta.trim() || !rispostaSegreta.trim()) {
        setInCorso(false);
        setErrore('Scegliete anche una domanda segreta e la sua risposta: servirà per recuperare la password.');
        return;
      }
      // Contest con elenco delle matricole: si verifica prima di creare l'accesso
      // (la matricola poi non si cambia).
      if (individuale && conMatricola && contestId) {
        const { data: ok, error: errVerifica } = await supabase.rpc('contest_verifica_matricola', { p_contest_id: contestId, p_matricola: matricola, p_nome: `${nome.trim()} ${cognome.trim()}` });
        if (!errVerifica && ok === false) { setInCorso(false); setErrore(messaggioErroreTeam('matricola_non_in_elenco')); return; }
      }
      const { data, error } = await supabase.rpc('crea_team', {
        p_corso_id: corsoId, p_nome: individuale ? `${nome.trim()} ${cognome.trim()}` : nome, p_password: password, p_domanda_segreta: domandaSegreta, p_risposta_segreta: rispostaSegreta,
        p_membri: tipo === 'individuale' ? [] : membri.map(m => m.trim()).filter(Boolean),
        p_tipo: tipo,
        ...(individuale && conMatricola ? { p_matricola: matricola } : {}),
      });
      setInCorso(false);
      if (error || !data?.[0]) { setErrore(messaggioErroreTeam(error?.message || '')); return; }
      const riga = data[0];
      onAccesso({ id: riga.id, numero: riga.numero, nome: riga.nome, password, membri: riga.membri || [], tipo: riga.tipo === 'individuale' ? 'individuale' : tipo, matricola: riga.matricola ?? null });
    }
  };

  const chiediDomanda = async () => {
    setErroreRecupero('');
    setDomandaRecuperata(null);
    if (!nomeRecupero.trim()) { setErroreRecupero('Inserite il nome del vostro team.'); return; }
    setRecuperoInCorso(true);
    const { data, error } = await supabase.rpc('recupera_domanda_team', { p_corso_id: corsoId, p_nome: nomeRecupero });
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
      p_corso_id: corsoId, p_nome: nomeRecupero, p_risposta_segreta: rispostaRecupero, p_nuova_password: nuovaPassword,
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
    <>
      <div className="max-w-md w-full space-y-5 animate-fade-in-up">
        {conTitolo && (
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-serif">
            {individuale ? 'Il tuo accesso' : 'Il vostro team'}
            <Info>{individuale
              ? 'Per le attività individuali. Nome e password li scegli tu: tienili a mente.'
              : 'Nome e password li scegliete voi: servono per ritrovare il team da qualsiasi dispositivo.'}</Info>
          </h1>
        </div>
        )}

        <div className="relative flex bg-stone-100 rounded-full p-1">
          <PillaScorrevole selettore='[aria-pressed="true"]' classe="bg-white shadow-sm" dipendenze={[scheda]} />
          <button aria-pressed={scheda === 'accedi'} onClick={() => { setScheda('accedi'); setErrore(''); }} className={`relative z-10 flex-1 text-xs font-medium py-2 rounded-full transition-colors duration-300 ${scheda === 'accedi' ? 'text-stone-900' : 'text-stone-500'}`}>
            Accedi
          </button>
          <button aria-pressed={scheda === 'crea'} onClick={() => { setScheda('crea'); setErrore(''); }} className={`relative z-10 flex-1 text-xs font-medium py-2 rounded-full transition-colors duration-300 ${scheda === 'crea' ? 'text-stone-900' : 'text-stone-500'}`}>
            Iscriviti
          </button>
        </div>

        {scheda === 'crea' && !soloIndividuale && (
          <div role="radiogroup" aria-label="Come partecipi" className="grid grid-cols-2 gap-2">
            {([
              { v: 'gruppo', t: 'In team', d: 'Un accesso per tutto il gruppo' },
              { v: 'individuale', t: 'Da solo/a', d: 'Per le attività individuali' },
            ] as { v: TipoTeam; t: string; d: string }[]).map(o => (
              <button
                key={o.v}
                type="button"
                role="radio"
                aria-checked={tipo === o.v}
                onClick={() => { setTipo(o.v); setErrore(''); }}
                className={`text-left rounded-2xl border p-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 ${tipo === o.v ? 'border-stone-900 bg-white shadow-sm' : 'border-stone-200 bg-stone-50 hover:border-stone-400'}`}
              >
                <span className="block text-sm font-medium">{o.t}</span>
                <span className="block text-[11px] text-stone-500">{o.d}</span>
              </button>
            ))}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-3" aria-hidden={mostraRecupero || undefined}>
          {individuale ? (
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={nome} onChange={e => setNome(e.target.value)} disabled={mostraRecupero} placeholder="Nome" aria-label="Nome" autoComplete="given-name" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900 disabled:opacity-50" />
              <input type="text" value={cognome} onChange={e => setCognome(e.target.value)} disabled={mostraRecupero} placeholder="Cognome" aria-label="Cognome" autoComplete="family-name" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900 disabled:opacity-50" />
            </div>
          ) : (
            <input type="text" value={nome} onChange={e => setNome(e.target.value)} disabled={mostraRecupero} placeholder={scheda === 'accedi' ? (soloIndividuale ? 'Nome e cognome' : 'Nome del team (o nome e cognome)') : individuale ? 'Nome e cognome' : 'Nome del team'} aria-label="Nome" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900 disabled:opacity-50" />
          )}
          {individuale && conMatricola && (
            <input type="text" value={matricola} onChange={e => setMatricola(e.target.value)} disabled={mostraRecupero} placeholder="Matricola (es. 312345)" aria-label="Matricola" inputMode="text" autoCapitalize="characters" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 font-mono focus:outline-none focus:ring-2 focus:ring-stone-900 disabled:opacity-50" />
          )}
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} disabled={mostraRecupero} aria-label="Password" placeholder={individuale ? 'La tua password' : 'Password'} className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900 disabled:opacity-50" />

          {scheda === 'crea' && (
            <>
              <select value={domandaSegreta} onChange={e => setDomandaSegreta(e.target.value)} className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900">
                <option value="">Domanda segreta, per recuperare la password</option>
                {DOMANDE_SUGGERITE.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <input type="text" value={rispostaSegreta} onChange={e => setRispostaSegreta(e.target.value)} placeholder={individuale ? "La tua risposta" : "La vostra risposta"} aria-label="Risposta segreta" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />

              {!individuale && <div className="border-t border-stone-100 pt-3 space-y-2">
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
              </div>}
            </>
          )}

          {errore && <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl p-3">{errore}</p>}

          <button onClick={invia} disabled={inCorso || mostraRecupero} className="w-full bg-stone-900 text-white py-3 rounded-full text-sm font-medium hover:bg-stone-800 transition disabled:opacity-50">
            {inCorso ? 'Un attimo...' : scheda === 'accedi' ? 'Entra' : individuale ? 'Iscriviti ed entra' : 'Crea team ed entra'}
          </button>

          {scheda === 'accedi' && (
            <button onClick={() => setMostraRecupero(true)} disabled={mostraRecupero} className="w-full text-center text-xs text-stone-400 hover:text-stone-900 transition disabled:opacity-50">
              Password dimenticata?
            </button>
          )}
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
                <input type="text" value={nomeRecupero} onChange={e => setNomeRecupero(e.target.value)} placeholder="Nome del team (o nome e cognome)" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
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
    </>
  );
}

// Per chi ha già un accesso individuale senza matricola: la aggiunge una
// volta sola (poi non si cambia). Serve nei contest che la richiedono.
export function CompletaMatricola({ team, onFatto, compatto = false, contestId }: { team: TeamInfo; onFatto: (team: TeamInfo) => void; compatto?: boolean; contestId?: string }) {
  const [valore, setValore] = useState('');
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const salva = async () => {
    setErrore('');
    if (!/^[A-Za-z0-9]{4,12}$/.test(valore.replace(/\s+/g, ''))) { setErrore('Scrivi la tua matricola: da 4 a 12 lettere o cifre.'); return; }
    setInCorso(true);
    const { data, error } = await supabase.rpc('team_imposta_matricola', { p_team_id: team.id, p_password: team.password, p_matricola: valore, ...(contestId ? { p_contest_id: contestId } : {}) });
    setInCorso(false);
    if (error) { setErrore(messaggioErroreTeam(error.message)); return; }
    onFatto({ ...team, matricola: (data as string) || valore });
  };
  return (
    <form onSubmit={e => { e.preventDefault(); salva(); }} style={{ display: 'grid', gap: 10, width: '100%', maxWidth: compatto ? undefined : 440 }}>
      {!compatto && <p style={{ margin: 0, fontSize: 15 }}>Per votare serve la tua <strong>matricola</strong>: una matricola, un voto. Una volta inserita non si cambia.</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={valore} onChange={e => setValore(e.target.value)} placeholder="Matricola (es. 312345)" aria-label="Matricola" autoCapitalize="characters" className="mz-input" style={{ flex: '1 1 180px', fontFamily: 'var(--f-label, monospace)' }} />
        <button type="submit" className="mz-pill b" disabled={inCorso}>{inCorso ? 'Salvo…' : 'Aggiungi la matricola'}</button>
      </div>
      {errore && <p role="alert" style={{ margin: 0, color: '#dc2626', fontSize: 14 }}>{errore}</p>}
    </form>
  );
}
