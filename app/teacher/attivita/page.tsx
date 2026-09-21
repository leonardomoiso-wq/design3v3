'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { moduloDi, type AttivitaRow, type StatoAttivita } from '@/lib/attivita';
import { useDocente } from '@/lib/docente-context';

const STATI: { valore: StatoAttivita; etichetta: string; descrizione: string }[] = [
  { valore: 'bozza', etichetta: 'Bozza', descrizione: 'Nascosta agli studenti' },
  { valore: 'prossimamente', etichetta: 'In arrivo', descrizione: 'Visibile ma non avviabile' },
  { valore: 'attiva', etichetta: 'Attiva', descrizione: 'Visibile e avviabile' },
  { valore: 'archiviata', etichetta: 'Archiviata', descrizione: 'Non più mostrata in home' },
];

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
  const { passcode } = useDocente();
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
    const { data, error } = await supabase.from('attivita').select('*').order('ordine', { ascending: true });
    if (!error && data) setAttivita(data as AttivitaRow[]);
  };

  useEffect(() => {
    caricaAttivita();

    const channel = supabase
      .channel('realtime-attivita-pannello')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attivita' }, caricaAttivita)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
          <h1 className="text-2xl font-serif">Pannello Attività</h1>
          <p className="text-stone-500 text-xs mt-1">Attiva, disattiva e configura le attività visibili in home page.</p>
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
