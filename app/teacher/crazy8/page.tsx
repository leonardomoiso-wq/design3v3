'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useDocente } from '@/lib/docente-context';

const STATI = ['in_corso', 'consegnato', 'revisionato'];

function FotoConCommenti({
  img, commenti, bozza, setBozza, onInvia, onElimina, invioInCorso,
}: {
  img: any; commenti: any[]; bozza: string; setBozza: (v: string) => void;
  onInvia: () => void; onElimina: (commentoId: string, immagineId: string) => void; invioInCorso: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
      <img src={img.url_file} alt="" className="w-full h-48 object-contain bg-stone-50" />
      <div className="p-3 space-y-2 border-t border-stone-100">
        {commenti.map(c => (
          <div key={c.id} className="text-[11px] bg-stone-50 rounded-lg p-2 flex justify-between items-start gap-2">
            <span>{c.testo}</span>
            <button onClick={() => onElimina(c.id, img.id)} aria-label="Elimina commento" className="text-stone-300 hover:text-red-600 flex-shrink-0">✕</button>
          </div>
        ))}
        <div className="flex gap-1.5">
          <input
            value={bozza}
            onChange={e => setBozza(e.target.value)}
            placeholder="Aggiungi un commento..."
            className="flex-1 border border-stone-200 rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-stone-900"
            onKeyDown={e => { if (e.key === 'Enter') onInvia(); }}
          />
          <button onClick={onInvia} disabled={invioInCorso || !bozza.trim()} className="text-[11px] bg-stone-900 text-white px-3 rounded-lg disabled:opacity-40">
            Invia
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Crazy8DocentePage() {
  const { passcode } = useDocente();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selezionataId, setSelezionataId] = useState<string | null>(null);
  const [commenti, setCommenti] = useState<Record<string, any[]>>({});
  const [nuovoCommento, setNuovoCommento] = useState<Record<string, string>>({});
  const [invioInCorso, setInvioInCorso] = useState<string | null>(null);
  const [modalitaPresentazione, setModalitaPresentazione] = useState(false);
  const [indicePresentazione, setIndicePresentazione] = useState(0);

  const caricaSubmissions = async () => {
    const { data, error } = await supabase.from('submission_crazy8').select('*, immagini(*)').order('created_at', { ascending: false });
    if (!error && data) {
      const formattate = (data as any[]).map(s => ({
        ...s,
        immagini: (s.immagini || []).slice().sort((a: any, b: any) => a.ordine - b.ordine),
      }));
      setSubmissions(formattate);
      setSelezionataId(prev => (prev && formattate.some(f => f.id === prev)) ? prev : (formattate[0]?.id ?? null));
    }
  };

  const caricaCommenti = async () => {
    const { data, error } = await supabase.from('commenti').select('*').order('created_at', { ascending: true });
    if (!error && data) {
      const raggruppati: Record<string, any[]> = {};
      for (const c of data as any[]) {
        if (!raggruppati[c.immagine_id]) raggruppati[c.immagine_id] = [];
        raggruppati[c.immagine_id].push(c);
      }
      setCommenti(raggruppati);
    }
  };

  useEffect(() => {
    caricaSubmissions();
    caricaCommenti();

    const channel = supabase
      .channel('realtime-crazy8-docente')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submission_crazy8' }, caricaSubmissions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'immagini' }, caricaSubmissions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commenti' }, caricaCommenti)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selezionata = submissions.find(s => s.id === selezionataId) || null;

  const inviaCommento = async (immagineId: string) => {
    const testo = (nuovoCommento[immagineId] || '').trim();
    if (!testo) return;
    setInvioInCorso(immagineId);
    const { data, error } = await supabase.rpc('docente_aggiungi_commento', { p_immagine_id: immagineId, p_testo: testo, p_passcode: passcode });
    setInvioInCorso(null);
    if (error) return;

    setCommenti(prev => ({
      ...prev,
      [immagineId]: [...(prev[immagineId] || []), { id: data, immagine_id: immagineId, ruolo_autore: 'docente', testo }],
    }));
    setNuovoCommento(prev => ({ ...prev, [immagineId]: '' }));
  };

  const eliminaCommento = async (commentoId: string, immagineId: string) => {
    setCommenti(prev => ({
      ...prev,
      [immagineId]: (prev[immagineId] || []).filter(c => c.id !== commentoId),
    }));
    const { error } = await supabase.rpc('docente_elimina_commento', { p_commento_id: commentoId, p_passcode: passcode });
    if (error) caricaCommenti();
  };

  const impostaStato = async (s: any, stato: string) => {
    setSubmissions(prev => prev.map(x => (x.id === s.id ? { ...x, stato } : x)));
    const { error } = await supabase.rpc('docente_imposta_stato_submission_crazy8', { p_id: s.id, p_stato: stato, p_passcode: passcode });
    if (error) caricaSubmissions();
  };

  useEffect(() => {
    if (!modalitaPresentazione) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndicePresentazione(i => Math.min(submissions.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndicePresentazione(i => Math.max(0, i - 1));
      if (e.key === 'Escape') setModalitaPresentazione(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalitaPresentazione, submissions.length]);

  if (modalitaPresentazione) {
    const corrente = submissions[indicePresentazione];
    return (
      <div className="flex-1 bg-stone-950 flex flex-col overflow-hidden">
        <div className="flex justify-between items-center px-8 py-4 text-stone-400">
          <span className="text-xs uppercase tracking-widest">Scheda {submissions.length === 0 ? 0 : indicePresentazione + 1} di {submissions.length}</span>
          <button onClick={() => setModalitaPresentazione(false)} className="text-xs uppercase tracking-widest hover:text-white transition">✕ Esci (Esc)</button>
        </div>

        {!corrente ? (
          <div className="flex-1 flex items-center justify-center text-stone-500 text-sm">Nessuna consegna da presentare.</div>
        ) : (
          <div key={corrente.id} className="flex-1 flex flex-col items-center justify-center px-12 pb-10 animate-fade-in-up">
            <span className="text-xs uppercase tracking-widest text-stone-500 mb-2">Gruppo {corrente.gruppo_num} — {corrente.gruppo_nome}</span>
            <h1 className="text-4xl font-serif font-bold text-white text-center max-w-3xl mb-8">{corrente.hmw_o_tema || 'Senza tema'}</h1>

            <div className="grid grid-cols-2 gap-8 w-full max-w-5xl">
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-widest text-stone-500 text-center">Sketch Originale</p>
                <div className="h-72 bg-stone-900 rounded-2xl border border-stone-800 flex items-center justify-center overflow-hidden">
                  {corrente.immagini.find((i: any) => i.tipo === 'sketch_originale') ? (
                    <img src={corrente.immagini.find((i: any) => i.tipo === 'sketch_originale').url_file} alt="" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <span className="text-stone-600 text-xs">Nessuno sketch</span>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-widest text-stone-500 text-center">Generata</p>
                <div className="h-72 bg-stone-900 rounded-2xl border border-stone-800 flex items-center justify-center overflow-hidden">
                  {corrente.immagini.find((i: any) => i.tipo === 'generata') ? (
                    <img src={corrente.immagini.find((i: any) => i.tipo === 'generata').url_file} alt="" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <span className="text-stone-600 text-xs">Nessuna generata</span>
                  )}
                </div>
              </div>
            </div>

            {(corrente.note_prompt || corrente.riflessione) && (
              <div className="grid grid-cols-2 gap-8 w-full max-w-5xl mt-6 text-stone-400 text-xs">
                {corrente.note_prompt && <p><b className="text-stone-300">Log prompt:</b> {corrente.note_prompt}</p>}
                {corrente.riflessione && <p><b className="text-stone-300">Riflessione:</b> {corrente.riflessione}</p>}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-center gap-4 pb-8">
          <button onClick={() => setIndicePresentazione(i => Math.max(0, i - 1))} disabled={indicePresentazione === 0} className="bg-stone-800 text-white px-5 py-2.5 rounded-full text-xs font-medium disabled:opacity-30 hover:bg-stone-700 transition">← Precedente</button>
          <button onClick={() => setIndicePresentazione(i => Math.min(submissions.length - 1, i + 1))} disabled={indicePresentazione >= submissions.length - 1} className="bg-white text-stone-900 px-5 py-2.5 rounded-full text-xs font-medium disabled:opacity-30 hover:bg-stone-200 transition">Successiva →</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="w-72 border-r border-stone-200 bg-[#FBF9F5] overflow-y-auto p-4 space-y-2 flex-shrink-0">
        <div className="flex items-center justify-between px-1 pb-1">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Consegne ({submissions.length})</h2>
          <button
            onClick={() => { setIndicePresentazione(0); setModalitaPresentazione(true); }}
            disabled={submissions.length === 0}
            title="Modalità Presentazione"
            className="text-[10px] bg-stone-900 text-white px-2.5 py-1 rounded-full font-medium hover:bg-stone-800 transition disabled:opacity-30"
          >
            🎬
          </button>
        </div>
        {submissions.length === 0 && <p className="text-xs text-stone-400 px-1">Nessuna consegna ancora.</p>}
        {submissions.map(s => (
          <button
            key={s.id}
            onClick={() => setSelezionataId(s.id)}
            className={`w-full text-left p-3 rounded-xl border transition ${selezionataId === s.id ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-200 hover:border-stone-400'}`}
          >
            <div className="text-xs font-bold truncate">{s.hmw_o_tema || 'Senza tema'}</div>
            <div className={`text-[10px] ${selezionataId === s.id ? 'text-stone-300' : 'text-stone-500'}`}>G.{s.gruppo_num} · {s.gruppo_nome}</div>
            <div className="text-[9px] uppercase tracking-widest mt-1 text-stone-400 capitalize">{s.stato.replace('_', ' ')}</div>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {!selezionata ? (
          <div className="text-center text-stone-400 text-sm mt-20">Seleziona una consegna dalla lista.</div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div>
                <span className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">Gruppo {selezionata.gruppo_num} — {selezionata.gruppo_nome}</span>
                <h1 className="text-2xl font-serif font-bold mt-1">{selezionata.hmw_o_tema || 'Senza tema'}</h1>
                {selezionata.motore_usato && <p className="text-xs text-stone-500 mt-1">Motore usato: <b>{selezionata.motore_usato}</b></p>}
              </div>
              <div className="flex gap-1.5">
                {STATI.map(st => (
                  <button
                    key={st}
                    onClick={() => impostaStato(selezionata, st)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium border capitalize transition ${selezionata.stato === st ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-200 text-stone-600 hover:border-stone-400'}`}
                  >
                    {st.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {(selezionata.note_prompt || selezionata.riflessione) && (
              <div className="grid sm:grid-cols-2 gap-4">
                {selezionata.note_prompt && (
                  <div className="bg-white p-4 rounded-2xl border border-stone-200">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Log Prompt</h3>
                    <p className="text-xs text-stone-700 leading-relaxed">{selezionata.note_prompt}</p>
                  </div>
                )}
                {selezionata.riflessione && (
                  <div className="bg-white p-4 rounded-2xl border border-stone-200">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Riflessione</h3>
                    <p className="text-xs text-stone-700 leading-relaxed">{selezionata.riflessione}</p>
                  </div>
                )}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">Sketch Originali</h3>
                {selezionata.immagini.filter((i: any) => i.tipo === 'sketch_originale').map((img: any) => (
                  <FotoConCommenti
                    key={img.id}
                    img={img}
                    commenti={commenti[img.id] || []}
                    bozza={nuovoCommento[img.id] || ''}
                    setBozza={v => setNuovoCommento(prev => ({ ...prev, [img.id]: v }))}
                    onInvia={() => inviaCommento(img.id)}
                    onElimina={eliminaCommento}
                    invioInCorso={invioInCorso === img.id}
                  />
                ))}
              </div>
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">Immagini Generate</h3>
                {selezionata.immagini.filter((i: any) => i.tipo === 'generata').map((img: any) => (
                  <FotoConCommenti
                    key={img.id}
                    img={img}
                    commenti={commenti[img.id] || []}
                    bozza={nuovoCommento[img.id] || ''}
                    setBozza={v => setNuovoCommento(prev => ({ ...prev, [img.id]: v }))}
                    onInvia={() => inviaCommento(img.id)}
                    onElimina={eliminaCommento}
                    invioInCorso={invioInCorso === img.id}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
