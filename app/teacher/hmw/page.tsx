'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useDocente } from '@/lib/docente-context';

export default function HmwDocentePage() {
  const { passcode } = useDocente();
  const [activeTab, setActiveTab] = useState<'ruoli' | 'iterazioni'>('ruoli');
  const [ruoli, setRuoli] = useState<any[]>([]);
  const [iterazioni, setIterazioni] = useState<any[]>([]);
  const [stressTest, setStressTest] = useState<any[]>([]);

  const [nomeRuolo, setNomeRuolo] = useState('');
  const [descrizioneRuolo, setDescrizioneRuolo] = useState('');
  const [visibilitaRuolo, setVisibilitaRuolo] = useState<'condiviso_classe' | 'privato_team'>('condiviso_classe');
  const [creazioneInCorso, setCreazioneInCorso] = useState(false);
  const [erroreCreazione, setErroreCreazione] = useState('');

  const caricaTutto = async () => {
    const [{ data: r }, { data: iter }, { data: st }] = await Promise.all([
      supabase.from('ruoli_prompt').select('*').order('created_at', { ascending: false }),
      supabase.from('hmw_iterazioni').select('*').order('gruppo_num', { ascending: true }).order('versione', { ascending: true }),
      supabase.from('hmw_stress_test').select('*'),
    ]);
    if (r) setRuoli(r);
    if (iter) setIterazioni(iter);
    if (st) setStressTest(st);
  };

  useEffect(() => {
    caricaTutto();

    const channel = supabase
      .channel('realtime-hmw-docente')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ruoli_prompt' }, caricaTutto)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hmw_iterazioni' }, caricaTutto)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hmw_stress_test' }, caricaTutto)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moderaRuolo = async (id: string, stato: string) => {
    setRuoli(prev => prev.map(r => (r.id === id ? { ...r, stato } : r)));
    const { error } = await supabase.rpc('docente_modera_ruolo', { p_id: id, p_stato: stato, p_passcode: passcode });
    if (error) caricaTutto();
  };

  const eliminaRuolo = async (id: string) => {
    setRuoli(prev => prev.filter(r => r.id !== id));
    const { error } = await supabase.rpc('docente_elimina_ruolo', { p_id: id, p_passcode: passcode });
    if (error) caricaTutto();
  };

  const creaRuolo = async () => {
    setErroreCreazione('');
    if (!nomeRuolo.trim() || !descrizioneRuolo.trim()) {
      setErroreCreazione('Nome e descrizione sono obbligatori.');
      return;
    }
    setCreazioneInCorso(true);
    const { error } = await supabase.rpc('docente_crea_ruolo', {
      p_nome: nomeRuolo, p_descrizione: descrizioneRuolo, p_visibilita: visibilitaRuolo, p_passcode: passcode,
    });
    setCreazioneInCorso(false);
    if (error) {
      setErroreCreazione('Errore durante il salvataggio. Riprova.');
      return;
    }
    setNomeRuolo('');
    setDescrizioneRuolo('');
    await caricaTutto();
  };

  const gruppiIterazioni = Array.from(new Set(iterazioni.map(i => i.gruppo_num))).sort((a, b) => a - b);

  const SEZIONI: { valore: 'proposto' | 'approvato' | 'rifiutato'; etichetta: string; colore: string }[] = [
    { valore: 'proposto', etichetta: 'In attesa di approvazione', colore: 'amber' },
    { valore: 'approvato', etichetta: 'Approvati', colore: 'emerald' },
    { valore: 'rifiutato', etichetta: 'Rifiutati', colore: 'stone' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-serif">🎭 HMW + Role-Prompting</h1>
          <p className="text-stone-500 text-xs mt-1">Libreria ruoli e cronologia HMW dei team.</p>
        </div>
        <div className="space-x-2">
          <button onClick={() => setActiveTab('ruoli')} className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${activeTab === 'ruoli' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200'}`}>Libreria Ruoli</button>
          <button onClick={() => setActiveTab('iterazioni')} className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${activeTab === 'iterazioni' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200'}`}>Iterazioni HMW</button>
        </div>
      </div>

      {activeTab === 'ruoli' ? (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">Crea un Ruolo (approvato subito)</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <input type="text" value={nomeRuolo} onChange={e => setNomeRuolo(e.target.value)} placeholder="Nome ruolo..." className="border border-stone-200 rounded-xl p-2.5 text-xs bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
              <select value={visibilitaRuolo} onChange={e => setVisibilitaRuolo(e.target.value as any)} className="border border-stone-200 rounded-xl p-2.5 text-xs bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900">
                <option value="condiviso_classe">Condiviso con la classe</option>
                <option value="privato_team">Privato (visibile solo se assegni un team)</option>
              </select>
            </div>
            <textarea rows={2} value={descrizioneRuolo} onChange={e => setDescrizioneRuolo(e.target.value)} placeholder="Descrizione del ruolo..." className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
            {erroreCreazione && <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl p-2.5">{erroreCreazione}</p>}
            <button onClick={creaRuolo} disabled={creazioneInCorso} className="bg-stone-900 text-white px-5 py-2.5 rounded-xl text-xs font-medium hover:bg-stone-800 transition disabled:opacity-50">
              {creazioneInCorso ? 'Salvataggio...' : '+ Crea Ruolo'}
            </button>
          </div>

          {SEZIONI.map(sez => {
            const ruoliSezione = ruoli.filter(r => r.stato === sez.valore);
            if (ruoliSezione.length === 0) return null;
            return (
              <div key={sez.valore} className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">{sez.etichetta} ({ruoliSezione.length})</h2>
                {ruoliSezione.map(r => (
                  <div key={r.id} className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">{r.nome}</span>
                        <span className="text-[10px] uppercase tracking-widest bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full">{r.tipo_creatore}</span>
                        <span className="text-[10px] uppercase tracking-widest bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full">{r.visibilita.replace('_', ' ')}</span>
                      </div>
                      <p className="text-xs text-stone-600 mt-1">{r.descrizione}</p>
                      {r.gruppo_proponente_num && <p className="text-[11px] text-stone-400 mt-1">Proposto da G.{r.gruppo_proponente_num} — {r.gruppo_proponente_nome}</p>}
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      {sez.valore !== 'approvato' && (
                        <button onClick={() => moderaRuolo(r.id, 'approvato')} className="text-xs bg-emerald-100 hover:bg-emerald-600 hover:text-white text-emerald-800 px-3 py-1.5 rounded-lg font-medium transition">Approva</button>
                      )}
                      {sez.valore !== 'rifiutato' && (
                        <button onClick={() => moderaRuolo(r.id, 'rifiutato')} className="text-xs bg-stone-100 hover:bg-red-600 hover:text-white px-3 py-1.5 rounded-lg font-medium transition">Rifiuta</button>
                      )}
                      <button onClick={() => eliminaRuolo(r.id)} className="text-xs bg-stone-100 hover:bg-stone-900 hover:text-white px-3 py-1.5 rounded-lg font-medium transition">Elimina</button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

          {ruoli.length === 0 && (
            <div className="bg-white p-12 rounded-2xl border border-stone-200 text-center text-stone-400 text-sm">Nessun ruolo ancora.</div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {gruppiIterazioni.length === 0 && (
            <div className="bg-white p-12 rounded-2xl border border-stone-200 text-center text-stone-400 text-sm">Nessuna iterazione HMW ancora.</div>
          )}
          {gruppiIterazioni.map(num => {
            const versioni = iterazioni.filter(i => i.gruppo_num === num);
            return (
              <div key={num} className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-3">
                <h2 className="text-sm font-bold">Gruppo {num} — {versioni[0]?.gruppo_nome}</h2>
                {versioni.map(v => (
                  <div key={v.id} className="bg-stone-50 p-3 rounded-xl border border-stone-200 text-xs space-y-1">
                    <span className="font-bold">Versione {v.versione}</span>
                    <p className="text-stone-700">{v.testo}</p>
                    {v.note_prompt && <p className="text-stone-500 italic">Log prompt: &ldquo;{v.note_prompt}&rdquo;</p>}
                    {v.riflessione && <p className="text-stone-500 italic">Riflessione: &ldquo;{v.riflessione}&rdquo;</p>}
                    {stressTest.filter(st => st.hmw_iterazione_id === v.id).map(st => {
                      const ruolo = ruoli.find(r => r.id === st.ruolo_id);
                      return (
                        <div key={st.id} className="bg-white p-2 rounded-lg border border-stone-200 mt-1">
                          <span className="font-bold">{ruolo?.nome || 'Ruolo'}:</span> {st.risposta_llm}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
