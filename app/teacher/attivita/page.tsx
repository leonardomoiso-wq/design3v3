'use client';
// Stato di ogni attività in home: attiva, in arrivo (visibile ma non
// ancora apribile) o nascosta. Vale per tutte le attività del registro.
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ATTIVITA, ETICHETTA_STATO, useStatiAttivita, type StatoAttivita } from '@/lib/attivita';
import { useDocente } from '@/lib/docente-context';

const STATI: StatoAttivita[] = ['attiva', 'prossimamente', 'nascosta'];

export default function AttivitaDocentePage() {
  const { passcode } = useDocente();
  const { statoDi, ricarica } = useStatiAttivita();
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState<string | null>(null);

  const imposta = async (id: string, stato: StatoAttivita) => {
    setErrore('');
    setInCorso(id);
    const { error } = await supabase.rpc('docente_imposta_stato_attivita', { p_id: id, p_stato: stato, p_passcode: passcode });
    setInCorso(null);
    if (error) setErrore(error.message === 'passcode_errato' ? 'Password docente non valida: esci e rientra.' : 'Non sono riuscito a salvare. Hai eseguito la migrazione 20260925_contest_votazione.sql?');
    await ricarica();
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <div className="space-y-2">
          <h2 className="text-3xl font-serif">Attività del laboratorio</h2>
          <p className="text-sm text-stone-500 max-w-xl">Decidi cosa vedono gli studenti in home. <strong>Attiva</strong>: si può aprire. <strong>In arrivo</strong>: compare come anteprima, non si apre. <strong>Nascosta</strong>: non compare.</p>
        </div>
        {errore && <p role="alert" className="text-sm text-red-600">{errore}</p>}
        <ul className="space-y-4">
          {ATTIVITA.map(a => {
            const stato = statoDi(a);
            return (
              <li key={a.id} className="bg-white border border-stone-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center gap-4 justify-between">
                <div className="flex items-start gap-4 min-w-0">
                  <span className="text-3xl" aria-hidden="true">{a.icona}</span>
                  <div className="min-w-0">
                    <h3 className="font-serif text-lg font-bold">{a.titolo}</h3>
                    <p className="text-xs text-stone-500 mt-1">{a.descrizione}</p>
                    {a.accesso && <p className="text-[10px] uppercase tracking-widest text-stone-400 mt-2 font-bold">Accesso {a.accesso.toLowerCase()}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div role="group" aria-label={`Stato di ${a.titolo}`} className="inline-flex bg-stone-100 rounded-full p-1">
                    {STATI.map(s => (
                      <button key={s} type="button" disabled={inCorso === a.id} onClick={() => imposta(a.id, s)}
                        aria-pressed={stato === s}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${stato === s ? (s === 'attiva' ? 'bg-emerald-600 text-white' : s === 'prossimamente' ? 'bg-stone-900 text-white' : 'bg-stone-400 text-white') : 'text-stone-600 hover:text-stone-900'}`}>
                        {ETICHETTA_STATO[s]}
                      </button>
                    ))}
                  </div>
                  {a.hrefDocente && a.hrefDocente !== '/teacher' && <a href={a.hrefDocente} className="text-xs underline text-stone-500 hover:text-stone-900">Gestisci</a>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
