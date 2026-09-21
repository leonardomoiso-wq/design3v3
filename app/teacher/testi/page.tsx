'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useDocente } from '@/lib/docente-context';
import { CAMPI_TESTI, unisciTestiPiattaforma, type ChiaveTestoPiattaforma } from '@/lib/testi-piattaforma';

export default function TestiPiattaformaPage() {
  const { passcode } = useDocente();
  const [testi, setTesti] = useState<Record<ChiaveTestoPiattaforma, string> | null>(null);
  const [salvandoChiave, setSalvandoChiave] = useState<ChiaveTestoPiattaforma | null>(null);
  const [salvatoChiave, setSalvatoChiave] = useState<ChiaveTestoPiattaforma | null>(null);
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
