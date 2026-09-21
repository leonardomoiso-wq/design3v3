'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useDocente } from '@/lib/docente-context';

type RigaTeam = { numero: number; nome: string; membri: string[]; creato_il: string };

function scaricaCsv(righe: RigaTeam[]) {
  const intestazione = ['Numero', 'Nome team', 'Membri', 'Creato il'];
  const escapeCsv = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const righeCsv = righe.map(r => [
    String(r.numero),
    escapeCsv(r.nome),
    escapeCsv(r.membri.join('; ')),
    new Date(r.creato_il).toLocaleString('it-IT'),
  ].join(','));
  const csv = [intestazione.join(','), ...righeCsv].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `team-design3-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Mostra il messaggio reale del database invece di un generico "errore":
// il codice 'passcode_errato' arriva dalla funzione RPC quando il
// passcode docente non corrisponde più a quello salvato in
// docente_config (es. cambiato da un altro pannello); qualsiasi altro
// messaggio viene mostrato così com'è, per poter capire subito la causa
// reale invece di dover indovinarla.
const messaggioErroreTeam = (msg: string | undefined, azione: string) => {
  if (msg === 'passcode_errato') {
    return 'Password docente non riconosciuta: esci e rientra nell\'area docente, poi riprova.';
  }
  return `Errore durante ${azione}${msg ? `: ${msg}` : '.'}`;
};

export default function TeamPannelloPage() {
  const { passcode } = useDocente();
  const [righe, setRighe] = useState<RigaTeam[] | null>(null);
  const [errore, setErrore] = useState('');
  const [mostraConferma, setMostraConferma] = useState(false);
  const [confermaTesto, setConfermaTesto] = useState('');
  const [eliminazioneInCorso, setEliminazioneInCorso] = useState(false);

  const carica = async () => {
    setErrore('');
    const { data, error } = await supabase.rpc('docente_lista_team', { p_passcode: passcode });
    if (error) { setErrore(messaggioErroreTeam(error.message, 'il caricamento dei team')); return; }
    setRighe((data as RigaTeam[]) || []);
  };

  useEffect(() => { carica(); }, []);

  const eliminaTutti = async () => {
    setErrore('');
    setEliminazioneInCorso(true);
    const { error } = await supabase.rpc('docente_elimina_tutti_team', { p_passcode: passcode });
    setEliminazioneInCorso(false);
    if (error) { setErrore(messaggioErroreTeam(error.message, 'la cancellazione')); return; }
    setMostraConferma(false);
    setConfermaTesto('');
    await carica();
  };

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">Teambuilding</span>
            <h1 className="text-2xl font-serif font-bold mt-1">Team formati</h1>
            <p className="text-sm text-stone-500 mt-1">
              L&apos;accesso condiviso che gli studenti usano per entrare nell&apos;app, prima di scegliere un&apos;attività.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => righe && scaricaCsv(righe)}
              disabled={!righe || righe.length === 0}
              className="text-xs bg-white border border-stone-200 text-stone-700 px-4 py-2.5 rounded-full font-medium hover:border-stone-400 transition disabled:opacity-40"
            >
              ⬇️ Scarica CSV
            </button>
            <button
              onClick={() => { setErrore(''); setMostraConferma(true); }}
              disabled={!righe || righe.length === 0}
              className="text-xs bg-white border border-red-200 text-red-600 px-4 py-2.5 rounded-full font-medium hover:bg-red-50 transition disabled:opacity-40"
            >
              🗑️ Cancella tutti i team
            </button>
          </div>
        </div>

        {errore && <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl p-3">{errore}</p>}

        {righe === null ? (
          <p className="text-sm text-stone-400">Caricamento...</p>
        ) : righe.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-stone-200 text-center text-stone-400 text-sm">Nessun team ancora formato.</div>
        ) : (
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100 text-left text-[10px] uppercase tracking-widest text-stone-400 font-bold">
                  <th className="p-3">Gruppo</th>
                  <th className="p-3">Team</th>
                  <th className="p-3">Membri</th>
                  <th className="p-3">Creato il</th>
                </tr>
              </thead>
              <tbody>
                {righe.map(r => (
                  <tr key={r.numero} className="border-b border-stone-50 last:border-0">
                    <td className="p-3 font-bold text-stone-700">{r.numero}</td>
                    <td className="p-3">{r.nome}</td>
                    <td className="p-3 text-stone-500">{r.membri.length > 0 ? r.membri.join(', ') : '—'}</td>
                    <td className="p-3 text-stone-400 text-xs">{new Date(r.creato_il).toLocaleDateString('it-IT')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {mostraConferma && (
        <div className="fixed inset-0 z-40 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-6" role="dialog" aria-modal="true" onClick={() => setMostraConferma(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <h2 className="font-serif font-bold text-lg text-red-700">Cancellare tutti i team?</h2>
            <p className="text-xs text-stone-500">
              Azione irreversibile: tutti i {righe?.length ?? 0} team perderanno l&apos;accesso e dovranno formarsi di nuovo.
              Le consegne già fatte nelle attività non vengono toccate. Scrivi <b>CANCELLA</b> per confermare.
            </p>
            {errore && <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl p-2.5">{errore}</p>}
            <input
              type="text"
              value={confermaTesto}
              onChange={e => setConfermaTesto(e.target.value)}
              placeholder="CANCELLA"
              className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="flex gap-2 pt-1">
              <button onClick={() => setMostraConferma(false)} className="flex-1 bg-stone-100 hover:bg-stone-200 transition text-xs font-medium py-2.5 rounded-xl">Annulla</button>
              <button
                onClick={eliminaTutti}
                disabled={confermaTesto !== 'CANCELLA' || eliminazioneInCorso}
                className="flex-1 bg-red-600 text-white hover:bg-red-700 transition text-xs font-medium py-2.5 rounded-xl disabled:opacity-40"
              >
                {eliminazioneInCorso ? 'Cancellazione...' : 'Cancella tutti'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
