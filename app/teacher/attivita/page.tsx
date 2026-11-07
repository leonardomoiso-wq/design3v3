'use client';
import { useEffect, useState } from 'react';
import Info from '@/components/Info';
import { supabase } from '@/lib/supabase';
import { moduloDi, type AttivitaRow, type StatoAttivita } from '@/lib/attivita';
import { useDocente } from '@/lib/docente-context';
import { ascoltaCorso } from '@/lib/realtime';

const STATI: { valore: StatoAttivita; etichetta: string; descrizione: string }[] = [
  { valore: 'bozza', etichetta: 'Bozza', descrizione: 'Nascosta agli studenti' },
  { valore: 'prossimamente', etichetta: 'In arrivo', descrizione: 'Visibile ma non avviabile' },
  { valore: 'attiva', etichetta: 'Attiva', descrizione: 'Visibile e avviabile' },
  { valore: 'archiviata', etichetta: 'Archiviata', descrizione: 'Non più mostrata in home' },
];

// Ogni attività ha la sua composizione dei team (tabella team_attivita):
// qui si vede chi c'è, con nomi e membri, e si può eliminare un team
// (con la sua consegna) o svuotare tutto per ripartire.
function TeamDellAttivita({ attivitaId, passcode }: { attivitaId: string; passcode: string }) {
  const [teams, setTeams] = useState<{ id: string; numero: number; nome: string; membri: string[] }[] | null>(null);
  const [aperto, setAperto] = useState(false);
  const [errore, setErrore] = useState('');

  const carica = async () => {
    const { data, error } = await supabase.rpc('elenco_team_attivita', { p_attivita_id: attivitaId });
    setTeams(error ? [] : ((data || []) as any[]));
  };
  useEffect(() => { carica(); }, [attivitaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const elimina = async (id: string, nome: string) => {
    if (!window.confirm(`Eliminare il team "${nome}"? Si cancella anche la sua consegna in questa attività.`)) return;
    const { error } = await supabase.rpc('docente_elimina_team_attivita', { p_id: id, p_passcode: passcode });
    if (error) setErrore('Eliminazione non riuscita.'); else carica();
  };

  const svuota = async () => {
    if (!window.confirm('Eliminare tutti i team di questa attività (e le loro consegne)? Gli studenti dovranno ricomporli.')) return;
    const { error } = await supabase.rpc('docente_svuota_team_attivita', { p_attivita_id: attivitaId, p_passcode: passcode });
    if (error) setErrore('Operazione non riuscita.'); else carica();
  };

  if (teams === null) return null;
  return (
    <div className="pt-3 border-t border-stone-100 space-y-2">
      <button type="button" onClick={() => setAperto(v => !v)} className="w-full flex items-center justify-between text-left" aria-expanded={aperto}>
        <span className="text-xs font-bold uppercase tracking-widest text-stone-500">Team dell&apos;attività ({teams.length})</span>
        <span className="text-stone-400 text-sm">{aperto ? '−' : '+'}</span>
      </button>
      {aperto && (
        <div className="space-y-1.5">
          {teams.length === 0 && <p className="text-xs text-stone-400">Nessun team ancora: si compongono quando gli studenti entrano nell&apos;attività.</p>}
          {teams.map(t => (
            <div key={t.id} className="flex items-start justify-between gap-3 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900">{String(t.numero).padStart(2, '0')} {t.nome}</p>
                <p className="text-xs text-stone-500">{t.membri.join(', ')}</p>
              </div>
              <button type="button" onClick={() => elimina(t.id, t.nome)} className="text-[11px] text-stone-400 hover:text-red-600 flex-shrink-0">Elimina</button>
            </div>
          ))}
          {teams.length > 0 && <button type="button" onClick={svuota} className="text-[11px] text-stone-400 hover:text-red-600">Elimina tutti i team di questa attività</button>}
          {errore && <p className="text-xs text-red-600">{errore}</p>}
        </div>
      )}
    </div>
  );
}

// Impostazioni di Crazy 8 (attivita.config): quanti contesti sceglie ogni
// team e quanti sketch per ognuna delle due domande.
function ImpostazioniCrazy8({ attivitaId, passcode }: { attivitaId: string; passcode: string }) {
  const [config, setConfig] = useState<{ contesti_per_team?: number; sketch_per_domanda?: number } | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    supabase.from('attivita').select('config').eq('id', attivitaId).maybeSingle().then(({ data }) => setConfig((data?.config as any) || {}));
  }, [attivitaId]);
  const salva = async (patch: Record<string, number>) => {
    setConfig(c => ({ ...(c || {}), ...patch }));
    const { error } = await supabase.rpc('docente_imposta_config_attivita', { p_id: attivitaId, p_config: patch, p_passcode: passcode });
    setMsg(error ? 'Non salvato: database da aggiornare o password non valida.' : 'Salvato');
    setTimeout(() => setMsg(''), 2000);
  };
  if (!config) return null;
  const contesti = Number(config.contesti_per_team ?? 2);
  const sketch = Number(config.sketch_per_domanda ?? 1);
  const scelta = (valore: number, attuale: number, onClick: () => void, etichetta?: string) => (
    <button type="button" onClick={onClick} className={`text-xs px-3 py-1.5 rounded-full font-medium border transition ${valore === attuale ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-200 text-stone-600 hover:border-stone-400'}`}>
      {etichetta || valore}
    </button>
  );
  return (
    <div className="pt-3 border-t border-stone-100 grid sm:grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <p className="text-xs font-bold uppercase tracking-widest text-stone-500">Sketch da scegliere per domanda</p>
        <div className="flex flex-wrap gap-1.5">{[1, 2, 3, 4].map(n => <span key={n}>{scelta(n, sketch, () => salva({ sketch_per_domanda: n }))}</span>)}</div>
        <p className="text-[11px] text-stone-400">Ogni team ha 2 domande e 8 sketch per domanda.</p>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-bold uppercase tracking-widest text-stone-500">Contesti per team</p>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3].map(n => <span key={n}>{scelta(n, contesti, () => salva({ contesti_per_team: n }))}</span>)}
          {scelta(0, contesti, () => salva({ contesti_per_team: 0 }), 'Tutti')}
        </div>
        <p className="text-[11px] text-stone-400" aria-live="polite">{msg || 'I contesti si inseriscono dal pannello Crazy 8.'}</p>
      </div>
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 ${
        checked ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
      }`}
    >
      <span className={`w-8 h-4 rounded-full relative transition ${checked ? 'bg-emerald-400' : 'bg-stone-300'}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${checked ? 'left-4' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  );
}

export default function AttivitaPannelloPage() {
  const { passcode, corso } = useDocente();
  const [attivita, setAttivita] = useState<AttivitaRow[]>([]);
  const [nuovoAperto, setNuovoAperto] = useState(false);
  const [modificaId, setModificaId] = useState<string | null>(null);
  const [errore, setErrore] = useState('');

  const [formTitolo, setFormTitolo] = useState('');
  const [formDescrizione, setFormDescrizione] = useState('');
  const [formTipo, setFormTipo] = useState('');
  const [formOrdine, setFormOrdine] = useState('0');
  const [formLogPrompt, setFormLogPrompt] = useState(true);
  const [formRiflessione, setFormRiflessione] = useState(true);
  const [salvataggioInCorso, setSalvataggioInCorso] = useState(false);

  const [attivitaDaEliminare, setAttivitaDaEliminare] = useState<AttivitaRow | null>(null);
  const [erroreLista, setErroreLista] = useState('');

  const messaggioErroreAttivita = (msg: string | undefined, azione: string) => {
    if (msg === 'passcode_errato') {
      return 'Password docente non riconosciuta: esci e rientra nell\'area docente, poi riprova.';
    }
    return `Errore durante ${azione}${msg ? `: ${msg}` : '.'}`;
  };

  const caricaAttivita = async () => {
    const { data, error } = await supabase.from('attivita').select('*').eq('corso_id', corso.id).order('ordine', { ascending: true });
    if (!error && data) setAttivita(data as AttivitaRow[]);
  };

  useEffect(() => {
    caricaAttivita();

    const channel = ascoltaCorso(supabase.channel(`realtime-attivita-pannello-${corso.id}`), 'attivita', corso.id, caricaAttivita).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setFormTitolo('');
    setFormDescrizione('');
    setFormTipo('');
    setFormOrdine('0');
    setFormLogPrompt(true);
    setFormRiflessione(true);
    setErrore('');
  };

  const apriNuovo = () => {
    resetForm();
    setNuovoAperto(true);
  };

  const apriModifica = (a: AttivitaRow) => {
    setFormTitolo(a.titolo);
    setFormDescrizione(a.descrizione || '');
    setFormTipo(a.tipo);
    setFormOrdine(String(a.ordine));
    setErrore('');
    setModificaId(a.id);
  };

  const confermaNuovo = async () => {
    if (!formTitolo.trim() || !formTipo.trim()) {
      setErrore('Titolo e tipo sono obbligatori.');
      return;
    }
    setSalvataggioInCorso(true);
    setErrore('');
    const { error } = await supabase.rpc('docente_crea_attivita', {
      p_corso_id: corso.id,
      p_titolo: formTitolo.trim(),
      p_descrizione: formDescrizione.trim() || null,
      p_tipo: formTipo.trim(),
      p_ordine: Number(formOrdine) || 0,
      p_richiedi_log_prompt: formLogPrompt,
      p_richiedi_riflessione: formRiflessione,
      p_passcode: passcode,
    });
    setSalvataggioInCorso(false);
    if (error) {
      setErrore(messaggioErroreAttivita(error.message, 'il salvataggio'));
      return;
    }
    setNuovoAperto(false);
    resetForm();
  };

  const confermaModifica = async () => {
    if (!modificaId) return;
    if (!formTitolo.trim() || !formTipo.trim()) {
      setErrore('Titolo e tipo sono obbligatori.');
      return;
    }
    setSalvataggioInCorso(true);
    setErrore('');
    const { error } = await supabase.rpc('docente_aggiorna_attivita', {
      p_id: modificaId,
      p_titolo: formTitolo.trim(),
      p_descrizione: formDescrizione.trim() || null,
      p_tipo: formTipo.trim(),
      p_ordine: Number(formOrdine) || 0,
      p_data_inizio: null,
      p_data_fine: null,
      p_passcode: passcode,
    });
    setSalvataggioInCorso(false);
    if (error) {
      setErrore(messaggioErroreAttivita(error.message, 'il salvataggio'));
      return;
    }
    setModificaId(null);
    resetForm();
  };

  const impostaStato = async (a: AttivitaRow, stato: StatoAttivita) => {
    setErroreLista('');
    setAttivita(prev => prev.map(x => (x.id === a.id ? { ...x, stato } : x)));
    const { error } = await supabase.rpc('docente_imposta_stato_attivita', { p_id: a.id, p_stato: stato, p_passcode: passcode });
    if (error) {
      setErroreLista(messaggioErroreAttivita(error.message, 'il cambio di stato'));
      caricaAttivita();
    }
  };

  const impostaFlag = async (a: AttivitaRow, campo: 'richiedi_log_prompt' | 'richiedi_riflessione', valore: boolean) => {
    setErroreLista('');
    const aggiornata = { ...a, [campo]: valore };
    setAttivita(prev => prev.map(x => (x.id === a.id ? aggiornata : x)));
    const { error } = await supabase.rpc('docente_imposta_flag_attivita', {
      p_id: a.id,
      p_richiedi_log_prompt: campo === 'richiedi_log_prompt' ? valore : a.richiedi_log_prompt,
      p_richiedi_riflessione: campo === 'richiedi_riflessione' ? valore : a.richiedi_riflessione,
      p_passcode: passcode,
    });
    if (error) {
      setErroreLista(messaggioErroreAttivita(error.message, 'il salvataggio'));
      caricaAttivita();
    }
  };

  const confermaElimina = async () => {
    if (!attivitaDaEliminare) return;
    setErroreLista('');
    const { error } = await supabase.rpc('docente_elimina_attivita', { p_id: attivitaDaEliminare.id, p_passcode: passcode });
    if (error) {
      setErroreLista(messaggioErroreAttivita(error.message, "l'eliminazione"));
      caricaAttivita();
    }
    setAttivitaDaEliminare(null);
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-serif">Pannello Attività<Info>Attiva, disattiva e configura le attività visibili in home page.</Info></h1>
        </div>
        <button
          onClick={apriNuovo}
          className="bg-stone-900 text-white px-5 py-2.5 rounded-xl text-xs font-medium hover:bg-stone-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
        >
          + Nuova Attività
        </button>
      </div>

      {erroreLista && (
        <p role="alert" className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl p-3">{erroreLista}</p>
      )}

      {attivita.length === 0 && (
        <div className="bg-white p-12 rounded-2xl border border-stone-200 text-center text-stone-400 text-sm">
          Nessuna attività registrata.
        </div>
      )}

      <div className="space-y-4">
        {attivita.map(a => {
          const modulo = moduloDi(a.tipo);
          const moduloEsiste = Boolean(modulo.hrefStudente || modulo.hrefDocente);
          return (
            <div key={a.id} className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start space-x-3">
                  <span className="text-2xl flex-shrink-0" aria-hidden="true">{modulo.icona}</span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-serif font-bold text-base">{a.titolo}</h2>
                      <span className="text-[10px] font-mono bg-stone-100 text-stone-500 px-2 py-0.5 rounded">{a.tipo}</span>
                      {!moduloEsiste && (
                        <span className="text-[10px] uppercase tracking-widest bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                          Nessun modulo di pagine ancora scritto
                        </span>
                      )}
                    </div>
                    {a.descrizione && <p className="text-xs text-stone-500 mt-1 max-w-md">{a.descrizione}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => apriModifica(a)}
                    className="text-xs bg-stone-100 hover:bg-stone-200 px-3 py-2 rounded-xl font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
                  >
                    Modifica
                  </button>
                  <button
                    onClick={() => setAttivitaDaEliminare(a)}
                    className="text-xs bg-stone-100 hover:bg-red-600 hover:text-white px-3 py-2 rounded-xl font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
                  >
                    Elimina
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {STATI.map(s => (
                  <button
                    key={s.valore}
                    onClick={() => impostaStato(a, s.valore)}
                    title={s.descrizione}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 ${
                      a.stato === s.valore ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-200 text-stone-600 hover:border-stone-400'
                    }`}
                  >
                    {s.etichetta}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-stone-100">
                <Switch
                  checked={a.richiedi_log_prompt}
                  onChange={v => impostaFlag(a, 'richiedi_log_prompt', v)}
                  label="Log prompt obbligatorio"
                />
                <Switch
                  checked={a.richiedi_riflessione}
                  onChange={v => impostaFlag(a, 'richiedi_riflessione', v)}
                  label="Riflessione obbligatoria"
                />
              </div>
              {a.tipo === 'crazy8_ai' && <ImpostazioniCrazy8 attivitaId={a.id} passcode={passcode} />}
              <TeamDellAttivita attivitaId={a.id} passcode={passcode} />
            </div>
          );
        })}
      </div>

      {(nuovoAperto || modificaId !== null) && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-label={nuovoAperto ? 'Nuova attività' : 'Modifica attività'}
          onClick={() => { setNuovoAperto(false); setModificaId(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="font-serif font-bold text-lg">{nuovoAperto ? 'Nuova Attività' : 'Modifica Attività'}</h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Titolo</label>
                <input
                  type="text"
                  value={formTitolo}
                  onChange={e => setFormTitolo(e.target.value)}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Descrizione</label>
                <textarea
                  rows={2}
                  value={formDescrizione}
                  onChange={e => setFormDescrizione(e.target.value)}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Tipo</label>
                  <input
                    type="text"
                    value={formTipo}
                    onChange={e => setFormTipo(e.target.value)}
                    placeholder="es. crazy8_ai"
                    className="w-full border border-stone-200 rounded-xl p-2.5 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Ordine</label>
                  <input
                    type="number"
                    value={formOrdine}
                    onChange={e => setFormOrdine(e.target.value)}
                    className="w-full border border-stone-200 rounded-xl p-2.5 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900"
                  />
                </div>
              </div>
              {nuovoAperto && (
                <div className="flex flex-wrap gap-2">
                  <Switch checked={formLogPrompt} onChange={setFormLogPrompt} label="Log prompt obbligatorio" />
                  <Switch checked={formRiflessione} onChange={setFormRiflessione} label="Riflessione obbligatoria" />
                </div>
              )}
            </div>

            {errore && (
              <p role="alert" className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl p-2.5">{errore}</p>
            )}

            <div className="flex space-x-2">
              <button
                onClick={() => { setNuovoAperto(false); setModificaId(null); }}
                className="flex-1 bg-stone-100 hover:bg-stone-200 transition text-xs font-medium py-2.5 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
              >
                Annulla
              </button>
              <button
                onClick={nuovoAperto ? confermaNuovo : confermaModifica}
                disabled={salvataggioInCorso}
                className="flex-1 bg-stone-900 text-white hover:bg-stone-800 transition text-xs font-medium py-2.5 rounded-xl disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
              >
                {salvataggioInCorso ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}

      {attivitaDaEliminare && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Elimina attività: ${attivitaDaEliminare.titolo}`}
          onClick={() => setAttivitaDaEliminare(null)}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="font-serif font-bold text-lg text-red-700">Eliminare questa attività?</h2>
            <p className="text-xs text-stone-500">
              &ldquo;{attivitaDaEliminare.titolo}&rdquo; verrà rimossa definitivamente. Se ha già dati collegati (consegne, ecc.) valuta di archiviarla invece.
            </p>
            <div className="flex space-x-2">
              <button
                onClick={() => setAttivitaDaEliminare(null)}
                className="flex-1 bg-stone-100 hover:bg-stone-200 transition text-xs font-medium py-2.5 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
              >
                Annulla
              </button>
              <button
                onClick={confermaElimina}
                className="flex-1 bg-red-600 text-white hover:bg-red-700 transition text-xs font-medium py-2.5 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
