'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useDocente } from '@/lib/docente-context';
import { CAMPI_TESTI, unisciTestiPiattaforma, accessoDirettoAbilitato, CHIAVE_ACCESSO_DIRETTO, type ChiaveTestoPiattaforma } from '@/lib/testi-piattaforma';

export default function TestiPiattaformaPage() {
  const { passcode } = useDocente();
  const [testi, setTesti] = useState<Record<ChiaveTestoPiattaforma, string> | null>(null);
  const [salvandoChiave, setSalvandoChiave] = useState<ChiaveTestoPiattaforma | null>(null);
  const [salvatoChiave, setSalvatoChiave] = useState<ChiaveTestoPiattaforma | null>(null);
  const [salvandoToggle, setSalvandoToggle] = useState(false);
  const [errore, setErrore] = useState('');

  const carica = async () => {
    setErrore('');
    const { data, error } = await supabase.from('contenuto_piattaforma').select('chiave, valore');
    if (error) { setErrore('Errore nel caricamento dei testi.'); return; }
    setTesti(unisciTestiPiattaforma(data as { chiave: string; valore: string }[]));
  };

  useEffect(() => { carica(); }, []);

  const modifica = (chiave: ChiaveTestoPiattaforma, valore: string) => {
    setTesti(prev => prev && { ...prev, [chiave]: valore });
    setSalvatoChiave(null);
  };

  const salva = async (chiave: ChiaveTestoPiattaforma) => {
    if (!testi) return;
    setErrore('');
    setSalvandoChiave(chiave);
    const { error } = await supabase.rpc('docente_aggiorna_testo_piattaforma', {
      p_chiave: chiave, p_valore: testi[chiave], p_passcode: passcode,
    });
    setSalvandoChiave(null);
    if (error) { setErrore('Errore durante il salvataggio. Riprova.'); return; }
    setSalvatoChiave(chiave);
  };

  const toggleAccessoDiretto = async () => {
    if (!testi) return;
    const valorePrecedente = testi[CHIAVE_ACCESSO_DIRETTO];
    const nuovoValore = accessoDirettoAbilitato(testi) ? 'false' : 'true';
    setErrore('');
    setSalvandoToggle(true);
    setTesti(prev => prev && { ...prev, [CHIAVE_ACCESSO_DIRETTO]: nuovoValore });
    const { error } = await supabase.rpc('docente_aggiorna_testo_piattaforma', {
      p_chiave: CHIAVE_ACCESSO_DIRETTO, p_valore: nuovoValore, p_passcode: passcode,
    });
    setSalvandoToggle(false);
    if (error) {
      setErrore('Errore durante il salvataggio. Riprova.');
      setTesti(prev => prev && { ...prev, [CHIAVE_ACCESSO_DIRETTO]: valorePrecedente });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <span className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">Storytelling</span>
          <h1 className="text-2xl font-serif font-bold mt-1">Testi della piattaforma</h1>
          <p className="text-sm text-stone-500 mt-1">
            I testi di presentazione mostrati nella schermata iniziale e nella home, prima che le persone scelgano un&apos;attività.
          </p>
        </div>

        {errore && <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl p-3">{errore}</p>}

        {testi === null ? (
          <p className="text-sm text-stone-400">Caricamento...</p>
        ) : (
          <div className="space-y-4">
            {CAMPI_TESTI.map(campo => (
              <div key={campo.chiave} className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 space-y-3">
                <label htmlFor={`testo-${campo.chiave}`} className="block text-xs font-bold uppercase tracking-widest text-stone-500">
                  {campo.etichetta}
                </label>
                <textarea
                  id={`testo-${campo.chiave}`}
                  rows={campo.righe}
                  value={testi[campo.chiave]}
                  onChange={e => modifica(campo.chiave, e.target.value)}
                  className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900"
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => salva(campo.chiave)}
                    disabled={salvandoChiave === campo.chiave}
                    className="bg-stone-900 text-white px-5 py-2 rounded-full text-xs font-medium hover:bg-stone-800 transition disabled:opacity-50"
                  >
                    {salvandoChiave === campo.chiave ? 'Salvataggio...' : 'Salva'}
                  </button>
                  {salvatoChiave === campo.chiave && (
                    <span className="text-xs text-emerald-700 font-medium">Salvato ✓</span>
                  )}
                </div>

                {campo.chiave === 'incipit_nota' && (
                  <div className="border-t border-stone-100 pt-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-stone-500">Accesso Studente diretto</p>
                      <p className="text-xs text-stone-400 mt-0.5">
                        Se disattivato, la scorciatoia e questa nota non vengono mostrate: le persone dovranno sempre accedere con un team.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={accessoDirettoAbilitato(testi)}
                      aria-label="Abilita o disabilita l'Accesso Studente diretto"
                      onClick={toggleAccessoDiretto}
                      disabled={salvandoToggle}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 ${accessoDirettoAbilitato(testi) ? 'bg-stone-900' : 'bg-stone-200'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${accessoDirettoAbilitato(testi) ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
