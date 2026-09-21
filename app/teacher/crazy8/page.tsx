'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useDocente } from '@/lib/docente-context';

const STATI = ['in_corso', 'consegnato', 'revisionato'];

type ImmagineLightbox = { url: string; label: string };

// Tutte le immagini di una consegna, in ordine di percorso (sketch, poi i
// suoi round; sketch successivo, poi i suoi round...): usata per popolare
// la lightbox navigabile a schermo intero, qualunque miniatura l'abbia aperta.
function immaginiFlat(submission: any): ImmagineLightbox[] {
  return (submission.immagini || []).flatMap((sketch: any) => [
    { url: sketch.url_file, label: 'Sketch' },
    ...(sketch.generazioni_crazy8 || []).map((g: any) => ({ url: g.url_immagine, label: `Round ${g.ordine}` })),
  ]);
}

function Lightbox({ immagini, indice, onCambiaIndice, onChiudi }: { immagini: ImmagineLightbox[]; indice: number; onCambiaIndice: (i: number) => void; onChiudi: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChiudi();
      if (e.key === 'ArrowRight') onCambiaIndice(indice === immagini.length - 1 ? 0 : indice + 1);
      if (e.key === 'ArrowLeft') onCambiaIndice(indice === 0 ? immagini.length - 1 : indice - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [indice, immagini.length, onCambiaIndice, onChiudi]);

  const corrente = immagini[indice];
  if (!corrente) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-8 animate-fade-in"
      role="dialog" aria-modal="true" aria-label="Immagine a grandezza intera"
      onClick={onChiudi}
    >
      <div className="flex items-center justify-between w-full max-w-5xl mb-3 text-stone-400 text-xs uppercase tracking-widest flex-shrink-0" onClick={e => e.stopPropagation()}>
        <span>{corrente.label} · {indice + 1} / {immagini.length}</span>
        <button onClick={onChiudi} className="text-stone-300 hover:text-white text-2xl leading-none" aria-label="Chiudi">✕</button>
      </div>
      <div className="relative flex-1 w-full min-h-0 flex items-center justify-center" onClick={e => e.stopPropagation()}>
        {immagini.length > 1 && (
          <button
            onClick={() => onCambiaIndice(indice === 0 ? immagini.length - 1 : indice - 1)}
            className="absolute left-1 sm:-left-3 z-10 h-11 w-11 rounded-full bg-stone-900/70 hover:bg-stone-900 text-white flex items-center justify-center text-xl transition"
            aria-label="Immagine precedente"
          >
            ‹
          </button>
        )}
        <img key={corrente.url} src={corrente.url} alt="" decoding="async" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-scale-in" />
        {immagini.length > 1 && (
          <button
            onClick={() => onCambiaIndice(indice === immagini.length - 1 ? 0 : indice + 1)}
            className="absolute right-1 sm:-right-3 z-10 h-11 w-11 rounded-full bg-stone-900/70 hover:bg-stone-900 text-white flex items-center justify-center text-xl transition"
            aria-label="Immagine successiva"
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}

// Panoramica a timeline evolutiva: ogni sketch è una "traccia" orizzontale
// (sketch di partenza -> round 1 -> round 2 -> ...), tutte visibili insieme
// in una sola pagina. Usata sia nella vista galleria sia come riepilogo
// finale in modalità presentazione.
function TimelineSottoambito({ submission, onImageClick, dark }: { submission: any; onImageClick: (immagini: ImmagineLightbox[], indice: number) => void; dark?: boolean }) {
  const cardBg = dark ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-200';
  const labelColor = dark ? 'text-stone-500' : 'text-stone-400';
  const flat = immaginiFlat(submission);
  return (
    <div className="space-y-6">
      {(submission.immagini || []).length === 0 && (
        <p className={`text-sm ${labelColor}`}>Nessuno sketch caricato ancora.</p>
      )}
      {(submission.immagini || []).map((sketch: any, idx: number) => (
        <div key={sketch.id} className={`rounded-2xl border ${cardBg} p-4`}>
          <p className={`text-[10px] font-bold uppercase tracking-widest ${labelColor} mb-3`}>Traccia {idx + 1}</p>
          <div className="flex items-stretch gap-3 overflow-x-auto pb-1">
            <button onClick={() => onImageClick(flat, flat.findIndex(f => f.url === sketch.url_file))} className="flex-shrink-0 text-center group">
              <div className={`w-40 h-40 rounded-xl border ${dark ? 'bg-stone-800 border-stone-700' : 'bg-stone-50 border-stone-200'} overflow-hidden flex items-center justify-center group-hover:opacity-80 transition`}>
                <img src={sketch.url_file} alt="Sketch" loading="lazy" decoding="async" className="max-w-full max-h-full object-contain" />
              </div>
              <p className={`text-[9px] uppercase tracking-widest ${labelColor} mt-1`}>Sketch</p>
            </button>
            {sketch.generazioni_crazy8.map((g: any) => (
              <div key={g.id} className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-lg ${labelColor}`}>→</span>
                <button onClick={() => onImageClick(flat, flat.findIndex(f => f.url === g.url_immagine))} className="text-center group">
                  <div className={`w-40 h-40 rounded-xl border ${dark ? 'bg-stone-800 border-stone-700' : 'bg-stone-50 border-stone-200'} overflow-hidden flex items-center justify-center group-hover:opacity-80 transition`}>
                    <img src={g.url_immagine} alt={`Round ${g.ordine}`} loading="lazy" decoding="async" className="max-w-full max-h-full object-contain" />
                  </div>
                  <p className={`text-[9px] uppercase tracking-widest ${labelColor} mt-1`}>Round {g.ordine}</p>
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function GestionePromptSuggeriti({ passcode, onChiudi }: { passcode: string; onChiudi: () => void }) {
  const [lista, setLista] = useState<any[]>([]);
  const [etichetta, setEtichetta] = useState('');
  const [testo, setTesto] = useState('');
  const [modificaId, setModificaId] = useState<string | null>(null);
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);

  const carica = async () => {
    const { data } = await supabase.from('prompt_suggeriti_crazy8').select('*').order('ordine', { ascending: true });
    if (data) setLista(data as any[]);
  };

  useEffect(() => { carica(); }, []);

  const resetForm = () => { setEtichetta(''); setTesto(''); setModificaId(null); setErrore(''); };

  const salva = async () => {
    setErrore('');
    if (!etichetta.trim() || !testo.trim()) { setErrore('Servono etichetta e testo del prompt.'); return; }
    setInCorso(true);
    const { error } = modificaId
      ? await supabase.rpc('docente_aggiorna_prompt_suggerito', { p_id: modificaId, p_etichetta: etichetta, p_testo_prompt: testo, p_passcode: passcode })
      : await supabase.rpc('docente_aggiungi_prompt_suggerito', { p_etichetta: etichetta, p_testo_prompt: testo, p_passcode: passcode });
    setInCorso(false);
    if (error) { setErrore('Errore durante il salvataggio.'); return; }
    resetForm();
    carica();
  };

  const modifica = (p: any) => { setModificaId(p.id); setEtichetta(p.etichetta); setTesto(p.testo_prompt); setErrore(''); };

  const elimina = async (id: string) => {
    setLista(prev => prev.filter(p => p.id !== id));
    const { error } = await supabase.rpc('docente_elimina_prompt_suggerito', { p_id: id, p_passcode: passcode });
    if (error) carica();
  };

  return (
    <div className="fixed inset-0 z-40 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-6" role="dialog" aria-modal="true" onClick={onChiudi}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h2 className="font-serif font-bold text-lg">Prompt suggeriti per Crazy 8</h2>
          <button onClick={onChiudi} className="text-stone-400 hover:text-stone-900 text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-stone-500">Direzioni di prompt che gli studenti vedono come ispirazione mentre scrivono un nuovo round (es. &ldquo;ambientazione&rdquo;, &ldquo;gamme cromatiche&rdquo;, &ldquo;close up&rdquo;, &ldquo;raggi X dei componenti interni&rdquo;).</p>

        <div className="space-y-2">
          {lista.map(p => (
            <div key={p.id} className="flex items-start justify-between gap-2 bg-stone-50 rounded-xl p-3 border border-stone-200">
              <div>
                <p className="text-xs font-bold text-stone-800">{p.etichetta}</p>
                <p className="text-[11px] text-stone-500">{p.testo_prompt}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => modifica(p)} className="text-[11px] text-stone-500 hover:text-stone-900">Modifica</button>
                <button onClick={() => elimina(p.id)} className="text-[11px] text-stone-300 hover:text-red-600">Elimina</button>
              </div>
            </div>
          ))}
          {lista.length === 0 && <p className="text-xs text-stone-400">Nessun prompt suggerito ancora.</p>}
        </div>

        <div className="border-t border-stone-100 pt-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{modificaId ? 'Modifica prompt' : '+ Nuovo prompt suggerito'}</p>
          <input value={etichetta} onChange={e => setEtichetta(e.target.value)} placeholder="Etichetta breve (es. 'Close up')" className="w-full border border-stone-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-stone-900" />
          <textarea rows={2} value={testo} onChange={e => setTesto(e.target.value)} placeholder="Testo del prompt suggerito..." className="w-full border border-stone-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-stone-900" />
          {errore && <p className="text-[11px] text-red-600 font-medium">{errore}</p>}
          <div className="flex gap-2">
            <button onClick={salva} disabled={inCorso} className="text-xs bg-stone-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-stone-800 transition disabled:opacity-50">
              {inCorso ? 'Salvataggio...' : modificaId ? 'Salva modifiche' : 'Aggiungi'}
            </button>
            {modificaId && <button onClick={resetForm} className="text-xs text-stone-400 hover:text-stone-900 px-2">Annulla modifica</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function FotoConCommenti({
  img, commenti, bozza, setBozza, onInvia, onElimina, invioInCorso,
}: {
  img: any; commenti: any[]; bozza: string; setBozza: (v: string) => void;
  onInvia: () => void; onElimina: (commentoId: string, immagineId: string) => void; invioInCorso: boolean;
}) {
  return (
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
          placeholder="Commenta questo sketch e il suo percorso..."
          className="flex-1 border border-stone-200 rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-stone-900"
          onKeyDown={e => { if (e.key === 'Enter') onInvia(); }}
        />
        <button onClick={onInvia} disabled={invioInCorso || !bozza.trim()} className="text-[11px] bg-stone-900 text-white px-3 rounded-lg disabled:opacity-40">
          Invia
        </button>
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
  const [lightbox, setLightbox] = useState<{ immagini: ImmagineLightbox[]; indice: number } | null>(null);
  const apriLightbox = (immagini: ImmagineLightbox[], indice: number) => {
    if (indice < 0) return;
    setLightbox({ immagini, indice });
  };
  const [vistaDettaglio, setVistaDettaglio] = useState<'galleria' | 'timeline'>('galleria');
  const [mostraPromptSuggeriti, setMostraPromptSuggeriti] = useState(false);

  const caricaSubmissions = async () => {
    const { data, error } = await supabase.from('submission_crazy8').select('*, immagini(*, generazioni_crazy8(*))').order('created_at', { ascending: false });
    if (!error && data) {
      const formattate = (data as any[]).map(s => ({
        ...s,
        immagini: (s.immagini || [])
          .slice()
          .sort((a: any, b: any) => a.ordine - b.ordine)
          .map((img: any) => ({ ...img, generazioni_crazy8: (img.generazioni_crazy8 || []).slice().sort((a: any, b: any) => a.ordine - b.ordine) })),
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'generazioni_crazy8' }, caricaSubmissions)
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

  // Sequenza narrativa per la modalità presentazione: sketch di partenza,
  // poi ogni round della sua catena in ordine, poi lo sketch successivo.
  // Prima di passare al gruppo successivo, un riepilogo a timeline di tutta
  // la sua evoluzione (tutti gli sketch e tutti i round in una schermata).
  const diapositive = submissions.flatMap(s => {
    const slide = (s.immagini || []).flatMap((sketch: any) => [
      { submission: s, sketch, round: null as any, riepilogo: false },
      ...sketch.generazioni_crazy8.map((r: any) => ({ submission: s, sketch, round: r, riepilogo: false })),
    ]);
    if ((s.immagini || []).length > 0) {
      slide.push({ submission: s, sketch: null, round: null, riepilogo: true });
    }
    return slide;
  });

  useEffect(() => {
    // Con la lightbox aperta sopra la presentazione, le frecce devono
    // scorrere le immagini della lightbox, non le diapositive sotto.
    if (!modalitaPresentazione || lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndicePresentazione(i => Math.min(diapositive.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndicePresentazione(i => Math.max(0, i - 1));
      if (e.key === 'Escape') setModalitaPresentazione(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalitaPresentazione, diapositive.length, lightbox]);

  if (modalitaPresentazione) {
    const corrente = diapositive[indicePresentazione];
    return (
      <div className="flex-1 bg-stone-950 flex flex-col overflow-hidden">
        <div className="flex justify-between items-center px-8 py-4 text-stone-400">
          <span className="text-xs uppercase tracking-widest">Scheda {diapositive.length === 0 ? 0 : indicePresentazione + 1} di {diapositive.length}</span>
          <button onClick={() => setModalitaPresentazione(false)} className="text-xs uppercase tracking-widest hover:text-white transition">✕ Esci (Esc)</button>
        </div>

        {!corrente ? (
          <div className="flex-1 flex items-center justify-center text-stone-500 text-sm">Nessuno sketch da presentare ancora.</div>
        ) : corrente.riepilogo ? (
          <div key={`riepilogo-${corrente.submission.id}`} className="flex-1 overflow-y-auto px-12 pb-10 animate-fade-in-up">
            <div className="text-center pt-2 pb-6 sticky top-0 bg-stone-950/95 backdrop-blur-sm">
              <span className="text-xs uppercase tracking-widest text-stone-500 mb-2 block">Gruppo {corrente.submission.gruppo_num} — {corrente.submission.gruppo_nome}</span>
              <h1 className="text-3xl font-serif font-bold text-white">Riepilogo dell&apos;evoluzione</h1>
              <p className="text-stone-500 text-xs uppercase tracking-widest mt-1">Da schizzo a immagine, tutte le tracce</p>
            </div>
            <div className="max-w-5xl mx-auto">
              <TimelineSottoambito submission={corrente.submission} onImageClick={apriLightbox} dark />
            </div>
          </div>
        ) : (
          <div key={`${corrente.sketch.id}-${corrente.round?.id ?? 'sketch'}`} className="flex-1 flex flex-col items-center justify-center px-12 pb-10 animate-fade-in-up">
            <span className="text-xs uppercase tracking-widest text-stone-500 mb-2">Gruppo {corrente.submission.gruppo_num} — {corrente.submission.gruppo_nome}</span>
            <h1 className="text-3xl font-serif font-bold text-white text-center max-w-3xl mb-2">{corrente.submission.hmw_o_tema || 'Senza sotto-ambito'}</h1>
            <p className="text-stone-500 text-xs uppercase tracking-widest mb-8">{corrente.round ? `Round ${corrente.round.ordine}` : 'Sketch di partenza'}</p>

            {!corrente.round ? (
              <button onClick={() => { const flat = immaginiFlat(corrente.submission); apriLightbox(flat, flat.findIndex(f => f.url === corrente.sketch.url_file)); }} className="h-80 w-80 bg-stone-900 rounded-2xl border border-stone-800 flex items-center justify-center overflow-hidden hover:opacity-80 transition">
                <img src={corrente.sketch.url_file} alt="Sketch" decoding="async" className="max-w-full max-h-full object-contain" />
              </button>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-8 w-full max-w-5xl">
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-widest text-stone-500 text-center">Sketch di partenza</p>
                    <button onClick={() => { const flat = immaginiFlat(corrente.submission); apriLightbox(flat, flat.findIndex(f => f.url === corrente.sketch.url_file)); }} className="h-64 w-full bg-stone-900 rounded-2xl border border-stone-800 flex items-center justify-center overflow-hidden hover:opacity-80 transition">
                      <img src={corrente.sketch.url_file} alt="Sketch" decoding="async" className="max-w-full max-h-full object-contain" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-widest text-stone-500 text-center">Generata (round {corrente.round.ordine})</p>
                    <button onClick={() => { const flat = immaginiFlat(corrente.submission); apriLightbox(flat, flat.findIndex(f => f.url === corrente.round.url_immagine)); }} className="h-64 w-full bg-stone-900 rounded-2xl border border-stone-800 flex items-center justify-center overflow-hidden hover:opacity-80 transition">
                      <img src={corrente.round.url_immagine} alt="" decoding="async" className="max-w-full max-h-full object-contain" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-8 w-full max-w-5xl mt-6 text-stone-400 text-xs">
                  <p><b className="text-stone-300">Prompt:</b> {corrente.round.prompt_usato}</p>
                  {corrente.round.deduzione && <p><b className="text-stone-300">Deduzione:</b> {corrente.round.deduzione}</p>}
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex justify-center gap-4 pb-8">
          <button onClick={() => setIndicePresentazione(i => Math.max(0, i - 1))} disabled={indicePresentazione === 0} className="bg-stone-800 text-white px-5 py-2.5 rounded-full text-xs font-medium disabled:opacity-30 hover:bg-stone-700 transition">← Precedente</button>
          <button onClick={() => setIndicePresentazione(i => Math.min(diapositive.length - 1, i + 1))} disabled={indicePresentazione >= diapositive.length - 1} className="bg-white text-stone-900 px-5 py-2.5 rounded-full text-xs font-medium disabled:opacity-30 hover:bg-stone-200 transition">Successiva →</button>
        </div>
        {lightbox && (
          <Lightbox
            immagini={lightbox.immagini}
            indice={lightbox.indice}
            onCambiaIndice={i => setLightbox(l => (l ? { ...l, indice: i } : l))}
            onChiudi={() => setLightbox(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="w-72 border-r border-stone-200 bg-[#FBF9F5] overflow-y-auto p-4 space-y-2 flex-shrink-0">
        <div className="flex items-center justify-between px-1 pb-1">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Consegne ({submissions.length})</h2>
          <div className="flex gap-1.5">
            <button
              onClick={() => setMostraPromptSuggeriti(true)}
              title="Prompt suggeriti"
              className="text-[10px] bg-white border border-stone-200 text-stone-600 px-2.5 py-1 rounded-full font-medium hover:border-stone-400 transition"
            >
              💡
            </button>
            <button
              onClick={() => { setIndicePresentazione(0); setModalitaPresentazione(true); }}
              disabled={diapositive.length === 0}
              title="Modalità Presentazione"
              className="text-[10px] bg-stone-900 text-white px-2.5 py-1 rounded-full font-medium hover:bg-stone-800 transition disabled:opacity-30"
            >
              🎬
            </button>
          </div>
        </div>
        {submissions.length === 0 && <p className="text-xs text-stone-400 px-1">Nessuna consegna ancora.</p>}
        {submissions.map(s => (
          <button
            key={s.id}
            onClick={() => setSelezionataId(s.id)}
            className={`w-full text-left p-3 rounded-xl border transition ${selezionataId === s.id ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-200 hover:border-stone-400'}`}
          >
            <div className="text-xs font-bold truncate">{s.hmw_o_tema || 'Senza sotto-ambito'}</div>
            <div className={`text-[10px] ${selezionataId === s.id ? 'text-stone-300' : 'text-stone-500'}`}>G.{s.gruppo_num} · {s.gruppo_nome}</div>
            <div className="text-[9px] uppercase tracking-widest mt-1 text-stone-400 capitalize">{s.stato.replace('_', ' ')} · {s.immagini.length} sketch</div>
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
                <h1 className="text-2xl font-serif font-bold mt-1">{selezionata.hmw_o_tema || 'Senza sotto-ambito'}</h1>
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

            <div className="flex gap-1.5">
              <button
                onClick={() => setVistaDettaglio('galleria')}
                className={`text-[11px] px-3 py-1.5 rounded-full font-medium border transition ${vistaDettaglio === 'galleria' ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-200 text-stone-600 hover:border-stone-400'}`}
              >
                Galleria dettagliata
              </button>
              <button
                onClick={() => setVistaDettaglio('timeline')}
                className={`text-[11px] px-3 py-1.5 rounded-full font-medium border transition ${vistaDettaglio === 'timeline' ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-200 text-stone-600 hover:border-stone-400'}`}
              >
                🗺️ Panoramica evolutiva
              </button>
            </div>

            {(selezionata.note_prompt || selezionata.riflessione) && (
              <div className="grid sm:grid-cols-2 gap-4">
                {selezionata.note_prompt && (
                  <div className="bg-white p-4 rounded-2xl border border-stone-200">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Log Prompt (riassuntivo)</h3>
                    <p className="text-xs text-stone-700 leading-relaxed">{selezionata.note_prompt}</p>
                  </div>
                )}
                {selezionata.riflessione && (
                  <div className="bg-white p-4 rounded-2xl border border-stone-200">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Riflessione Finale</h3>
                    <p className="text-xs text-stone-700 leading-relaxed">{selezionata.riflessione}</p>
                  </div>
                )}
              </div>
            )}

            {vistaDettaglio === 'timeline' ? (
              <TimelineSottoambito submission={selezionata} onImageClick={apriLightbox} />
            ) : (
              <div className="space-y-4">
                {selezionata.immagini.length === 0 && (
                  <div className="bg-white p-8 rounded-2xl border border-stone-200 text-center text-stone-400 text-sm">Nessuno sketch caricato ancora.</div>
                )}
                {selezionata.immagini.map((sketch: any) => (
                  <div key={sketch.id} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                    <div className="flex items-center gap-4 p-4 bg-stone-50 border-b border-stone-100">
                      <button onClick={() => { const flat = immaginiFlat(selezionata); apriLightbox(flat, flat.findIndex(f => f.url === sketch.url_file)); }} className="w-16 h-16 rounded-xl bg-white border border-stone-200 overflow-hidden flex items-center justify-center flex-shrink-0 hover:opacity-80 transition">
                        <img src={sketch.url_file} alt="Sketch" loading="lazy" decoding="async" className="max-w-full max-h-full object-contain" />
                      </button>
                      <p className="text-xs font-bold text-stone-600">Sketch — {sketch.generazioni_crazy8.length} round di generazione</p>
                    </div>

                    {sketch.generazioni_crazy8.length > 0 && (
                      <div className="p-4 space-y-3">
                        {sketch.generazioni_crazy8.map((g: any) => (
                          <div key={g.id} className="grid sm:grid-cols-[80px_1fr] gap-3 text-xs">
                            <button onClick={() => { const flat = immaginiFlat(selezionata); apriLightbox(flat, flat.findIndex(f => f.url === g.url_immagine)); }} className="w-20 h-20 rounded-lg bg-stone-50 border border-stone-200 overflow-hidden flex items-center justify-center hover:opacity-80 transition">
                              <img src={g.url_immagine} alt={`Round ${g.ordine}`} loading="lazy" decoding="async" className="max-w-full max-h-full object-contain" />
                            </button>
                            <div>
                              <p className="font-bold text-stone-700">Round {g.ordine}</p>
                              <p className="text-stone-600"><b>Prompt:</b> {g.prompt_usato}</p>
                              {g.deduzione && <p className="text-stone-500 italic">Deduzione: &ldquo;{g.deduzione}&rdquo;</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <FotoConCommenti
                      img={sketch}
                      commenti={commenti[sketch.id] || []}
                      bozza={nuovoCommento[sketch.id] || ''}
                      setBozza={v => setNuovoCommento(prev => ({ ...prev, [sketch.id]: v }))}
                      onInvia={() => inviaCommento(sketch.id)}
                      onElimina={eliminaCommento}
                      invioInCorso={invioInCorso === sketch.id}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {lightbox && (
        <Lightbox
          immagini={lightbox.immagini}
          indice={lightbox.indice}
          onCambiaIndice={i => setLightbox(l => (l ? { ...l, indice: i } : l))}
          onChiudi={() => setLightbox(null)}
        />
      )}
      {mostraPromptSuggeriti && <GestionePromptSuggeriti passcode={passcode} onChiudi={() => setMostraPromptSuggeriti(false)} />}
    </div>
  );
}
