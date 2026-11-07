'use client';
import { useEffect, useRef, useState } from 'react';
import Info from '@/components/Info';
import { supabase } from '@/lib/supabase';
import { useDocente } from '@/lib/docente-context';
import { FASI, MIGRAZIONE_CRAZY8, NUMERO_FASI, faseEffettiva, useControlloDbCrazy8, nomeContesto, testoHmw, type Contesto, type Hmw, type Submission } from '@/components/crazy8/shared';
import { PannelloContesti, WallHmw, type TeamAttivitaElenco } from '@/components/crazy8/Docente';
import { BottomSheet } from '@/components/PannelliMobile';
import { PresentazioneRisultati, type Diapositiva } from '@/components/crazy8/Finale';
import { StrisceC8, useLightboxC8, type ImmagineC8, type RigaC8 } from '@/components/crazy8/Galleria';
import { Segmentato } from '@/components/moiso/Moiso';
import { miniaturaC8 } from '@/lib/storageCrazy8';
import { PannelloRegia, TimerProiezione, TimerStudente, type ConfigAula } from '@/components/crazy8/Aula';
import { useVotiCrazy8 } from '@/components/crazy8/Voti';
import { StampaCrazy8, type ConsegnaStampa } from '@/components/crazy8/Stampa';

// Pannello docente di Crazy 8. Due viste:
// - Consegne: elenco dei team a sinistra, a destra la consegna aperta con
//   domande (revisione e sblocco degli sketch), sketch e immagini
//   migliorate per ogni domanda, commenti.
// - Galleria: una striscia per team con sketch e immagini migliorate, che
//   scorre lenta; un clic apre l'immagine in grande.

const STATI: { id: string; etichetta: string }[] = [
  { id: 'in_corso', etichetta: 'In corso' },
  { id: 'consegnato', etichetta: 'Consegnato' },
  { id: 'revisionato', etichetta: 'Revisionato' },
];
const due = (n: number) => String(n).padStart(2, '0');

function GestionePromptSuggeriti({ passcode, corsoId, onChiudi }: { passcode: string; corsoId: string; onChiudi: () => void }) {
  const [lista, setLista] = useState<any[]>([]);
  const [etichetta, setEtichetta] = useState('');
  const [testo, setTesto] = useState('');
  const [modificaId, setModificaId] = useState<string | null>(null);
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);

  const carica = async () => {
    const { data } = await supabase.from('prompt_suggeriti_crazy8').select('*').eq('corso_id', corsoId).order('ordine', { ascending: true });
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
      : await supabase.rpc('docente_aggiungi_prompt_suggerito', { p_corso_id: corsoId, p_etichetta: etichetta, p_testo_prompt: testo, p_passcode: passcode });
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
          <h2 className="font-serif font-bold text-lg">Prompt suggeriti per Crazy 8<Info>Direzioni di prompt che gli studenti vedono come ispirazione mentre scrivono un nuovo round (es. &ldquo;ambientazione&rdquo;, &ldquo;gamme cromatiche&rdquo;, &ldquo;close up&rdquo;, &ldquo;raggi X dei componenti interni&rdquo;).</Info></h2>
          <button onClick={onChiudi} className="text-stone-400 hover:text-stone-900 text-xl leading-none">✕</button>
        </div>

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
  const { passcode, corso } = useDocente();
  const problemiDb = useControlloDbCrazy8();
  const lightbox = useLightboxC8();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selezionataId, setSelezionataId] = useState<string | null>(null);
  const [commenti, setCommenti] = useState<Record<string, any[]>>({});
  const [nuovoCommento, setNuovoCommento] = useState<Record<string, string>>({});
  const [invioInCorso, setInvioInCorso] = useState<string | null>(null);
  const [vista, setVista] = useState<'consegne' | 'galleria'>('consegne');
  const [filtroGalleria, setFiltroGalleria] = useState<'tutto' | 'sketch' | 'migliorate'>('tutto');
  const [mostraPromptSuggeriti, setMostraPromptSuggeriti] = useState(false);
  const [attivitaC8, setAttivitaC8] = useState<{ id: string; config: { contesti_per_team?: number; sketch_per_domanda?: number } & ConfigAula } | null>(null);
  const [mostraRegia, setMostraRegia] = useState(false);
  const [mostraTimer, setMostraTimer] = useState(false);
  const [stampa, setStampa] = useState(false);
  const [mostraPrecedenti, setMostraPrecedenti] = useState(false);
  const [contesti, setContesti] = useState<Contesto[]>([]);
  const [teamsAtt, setTeamsAtt] = useState<TeamAttivitaElenco[]>([]);
  const [mostraContesti, setMostraContesti] = useState(false);
  const [mostraWall, setMostraWall] = useState(false);
  const [mostraRisultati, setMostraRisultati] = useState(false);

  // attività Crazy 8 del corso, con la sua bacheca e i suoi team
  const caricaAttivitaC8 = async () => {
    const { data } = await supabase.from('attivita').select('id, config').eq('corso_id', corso.id).eq('tipo', 'crazy8_ai').maybeSingle();
    if (!data) return;
    setAttivitaC8({ id: data.id, config: data.config || {} });
    const [{ data: c }, { data: t }] = await Promise.all([
      supabase.from('contesti_crazy8').select('id, titolo, descrizione, ordine').eq('attivita_id', data.id).order('ordine'),
      supabase.rpc('elenco_team_attivita', { p_attivita_id: data.id }),
    ]);
    setContesti((c || []) as Contesto[]);
    setTeamsAtt((t || []) as TeamAttivitaElenco[]);
  };

  const caricaSubmissions = async () => {
    const { data, error } = await supabase.from('submission_crazy8').select('*, immagini(*, generazioni_crazy8(*))').eq('corso_id', corso.id).order('created_at', { ascending: false });
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

  const submissionsRef = useRef<any[]>([]);
  submissionsRef.current = submissions;
  const ordina = (s: any) => ({
    ...s,
    immagini: (s.immagini || []).slice().sort((a: any, b: any) => a.ordine - b.ordine)
      .map((img: any) => ({ ...img, generazioni_crazy8: (img.generazioni_crazy8 || []).slice().sort((a: any, b: any) => a.ordine - b.ordine) })),
  });
  // una sola consegna, al posto dell'elenco intero con tutte le immagini
  const caricaUna = async (id: string) => {
    const { data } = await supabase.from('submission_crazy8').select('*, immagini(*, generazioni_crazy8(*))').eq('id', id).maybeSingle();
    if (!data) { setSubmissions(prev => prev.filter(x => x.id !== id)); return; }
    const una = ordina(data);
    setSubmissions(prev => (prev.some(x => x.id === id) ? prev.map(x => (x.id === id ? una : x)) : [una, ...prev]));
  };

  const caricaCommenti = async () => {
    const { data, error } = await supabase
      .from('commenti')
      .select('*, immagini!inner(submission_crazy8!inner(corso_id))')
      .eq('immagini.submission_crazy8.corso_id', corso.id)
      .order('created_at', { ascending: true });
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
    caricaAttivitaC8();
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Si ricarica solo la consegna toccata dall'evento; se non si sa quale
    // (es. una cancellazione) si ricarica l'elenco, raggruppando gli eventi.
    const daRicaricare = new Set<string>();
    let tutto = false;
    const presto = (id?: string | null) => {
      if (id) daRicaricare.add(id); else tutto = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (tutto) caricaSubmissions();
        else daRicaricare.forEach(x => caricaUna(x));
        daRicaricare.clear();
        tutto = false;
      }, 500);
    };
    const consegnaDiSketch = (sketchId?: string) => submissionsRef.current.find(s => (s.immagini || []).some((i: any) => i.id === sketchId))?.id || null;
    const channel = supabase
      .channel(`realtime-crazy8-docente-${corso.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submission_crazy8' }, (p: any) => presto(p.eventType === 'DELETE' ? null : p.new?.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'immagini' }, (p: any) => presto(p.new?.submission_id || p.old?.submission_id || null))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'generazioni_crazy8' }, (p: any) => presto(consegnaDiSketch(p.new?.sketch_immagine_id || p.old?.sketch_immagine_id)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commenti' }, caricaCommenti)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contesti_crazy8' }, caricaAttivitaC8)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'attivita' }, caricaAttivitaC8)
      .subscribe();
    return () => { supabase.removeChannel(channel); if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { conta: stelle } = useVotiCrazy8(attivitaC8?.id || null);
  // le consegne create prima dei team per attività restano nascoste, a richiesta
  const precedenti = submissions.filter(s => !s.team_attivita_id);
  const visibili = mostraPrecedenti ? submissions : submissions.filter(s => s.team_attivita_id);
  const selezionata = visibili.find(s => s.id === selezionataId) || visibili[0] || null;
  const teamDi = (s: any) => teamsAtt.find(t => t.id === s.team_attivita_id);
  const nomeDi = (s: any) => teamDi(s)?.nome || s.gruppo_nome;

  // === azioni ===
  const eliminaConsegna = async (s: any) => {
    if (!window.confirm(`Eliminare la consegna di "${nomeDi(s)}"? Sketch, domande e immagini generate verranno cancellati. Non si può annullare.`)) return;
    const { error } = await supabase.rpc('docente_elimina_submission_crazy8', { p_id: s.id, p_passcode: passcode });
    if (error) { window.alert('Eliminazione non riuscita: password docente non valida o database da aggiornare.'); return; }
    setSubmissions(prev => prev.filter(x => x.id !== s.id));
    setSelezionataId(null);
  };
  const revisionaHmw = async (s: any, indice: number, stato: 'ok' | 'rivedere' | null) => {
    const { error } = await supabase.rpc('docente_revisione_hmw_crazy8', { p_id: s.id, p_indice: indice, p_stato: stato, p_passcode: passcode });
    if (!error) caricaSubmissions();
  };
  const sbloccaSketch = async (s: any, valore: boolean) => {
    const { error } = await supabase.rpc('docente_sblocca_sketch_crazy8', { p_id: s.id, p_valore: valore, p_passcode: passcode });
    if (!error) caricaSubmissions();
  };
  const impostaStato = async (s: any, stato: string) => {
    setSubmissions(prev => prev.map(x => (x.id === s.id ? { ...x, stato } : x)));
    const { error } = await supabase.rpc('docente_imposta_stato_submission_crazy8', { p_id: s.id, p_stato: stato, p_passcode: passcode });
    if (error) caricaSubmissions();
  };
  const inviaCommento = async (immagineId: string) => {
    const testo = (nuovoCommento[immagineId] || '').trim();
    if (!testo) return;
    setInvioInCorso(immagineId);
    const { data, error } = await supabase.rpc('docente_aggiungi_commento', { p_immagine_id: immagineId, p_testo: testo, p_passcode: passcode });
    setInvioInCorso(null);
    if (error) return;
    setCommenti(prev => ({ ...prev, [immagineId]: [...(prev[immagineId] || []), { id: data, immagine_id: immagineId, ruolo_autore: 'docente', testo }] }));
    setNuovoCommento(prev => ({ ...prev, [immagineId]: '' }));
  };
  const eliminaCommento = async (commentoId: string, immagineId: string) => {
    setCommenti(prev => ({ ...prev, [immagineId]: (prev[immagineId] || []).filter(c => c.id !== commentoId) }));
    const { error } = await supabase.rpc('docente_elimina_commento', { p_commento_id: commentoId, p_passcode: passcode });
    if (error) caricaCommenti();
  };

  // === immagini di una consegna ===
  const sketchDi = (s: any, d: number) => (s.immagini || []).filter((x: any) => (x.domanda ?? 0) === d);
  const domandeDi = (s: any) => (s.team_attivita_id ? [0, 1] : [0]);
  const immaginiDomanda = (s: any, d: number): ImmagineC8[] => {
    const h = (s.hmw || [])[d] as Hmw | undefined;
    return sketchDi(s, d).flatMap((sk: any, k: number) => [
      { src: sk.url_file, mini: miniaturaC8(sk.url_file), titolo: `${nomeDi(s)}: sketch ${k + 1}${sk.selezionato ? ' ★' : ''}`, meta: h ? testoHmw(h) : undefined, tipo: sk.selezionato ? 'scelto' as const : 'sketch' as const },
      ...sk.generazioni_crazy8.map((g: any) => ({ src: g.url_immagine, mini: miniaturaC8(g.url_immagine), titolo: `${nomeDi(s)}: dallo sketch ${k + 1}${g.motore ? `, ${g.motore}` : ''}`, meta: g.prompt_usato, tipo: 'generata' as const })),
    ]);
  };

  const righeGalleria: RigaC8[] = visibili.map(s => {
    const tutte = domandeDi(s).flatMap(d => immaginiDomanda(s, d));
    const immagini = tutte.filter(im => filtroGalleria === 'tutto' || (filtroGalleria === 'sketch' ? im.tipo !== 'generata' : im.tipo === 'generata'));
    const membri = teamDi(s)?.membri?.join(', ');
    return { chiave: s.id, titolo: nomeDi(s), sotto: membri || s.hmw_o_tema || undefined, immagini };
  });

  const diapositiveRisultati: Diapositiva[] = submissions.filter(sub => sub.team_attivita_id).flatMap(sub =>
    (sub.immagini || []).filter((sk: any) => sk.selezionato && (sk.generazioni_crazy8 || []).length > 0).map((sk: any) => {
      const h = (sub.hmw || [])[sk.domanda ?? 0] as Hmw | undefined;
      return {
        chiave: sk.id,
        sopra: nomeDi(sub),
        domanda: h ? testoHmw(h) : '',
        contesto: h ? nomeContesto(h.contesto, contesti) : '',
        sketch: sk.url_file,
        immagini: sk.generazioni_crazy8.map((g: any) => g.url_immagine),
      };
    }));

  const sketchPerDomanda = Number(attivitaC8?.config.sketch_per_domanda ?? 1);
  const contestiPerTeam = Number(attivitaC8?.config.contesti_per_team ?? 2);

  return (
    <div className="mz flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
      {lightbox.nodo}

      {/* testata con le funzioni del pannello, tutte con il loro nome */}
      <div className="c8-doc-testata">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className="mz-display" style={{ fontSize: 'clamp(40px, 5vw, 72px)', margin: 0 }}>Crazy 8<span className="mz-sup">({due(submissions.length)})</span></h1>
            <p className="text-sm m-0" style={{ color: 'var(--muted)' }}>
              <TimerStudente timer={attivitaC8?.config.timer} />{' '}
              {contestiPerTeam === 0 ? 'Contesti liberi' : `${contestiPerTeam} contest${contestiPerTeam === 1 ? 'o' : 'i'} per team`}, {sketchPerDomanda} sketch da scegliere per domanda.{' '}
              <a href="/teacher/attivita" className="underline underline-offset-2">Cambia nel pannello attività</a>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="mz-pill o" disabled={!attivitaC8} onClick={() => setMostraRegia(true)}>Regia dell&apos;aula</button>
            <button type="button" className="mz-pill o" disabled={!attivitaC8} onClick={() => setMostraTimer(true)}>Timer ⤢</button>
            <button type="button" className="mz-pill o" disabled={!attivitaC8} onClick={() => setMostraContesti(true)}>Bacheca contesti</button>
            <button type="button" className="mz-pill o" onClick={() => setMostraPromptSuggeriti(true)}>Prompt suggeriti</button>
            <button type="button" className="mz-pill b" disabled={!attivitaC8} onClick={() => { caricaAttivitaC8(); setMostraWall(true); }}>Wall HMW ⤢</button>
            <button type="button" className="mz-pill" disabled={diapositiveRisultati.length === 0} onClick={() => setMostraRisultati(true)}>Proietta risultati ⤢</button>
            <button type="button" className="mz-pill o" disabled={visibili.length === 0} onClick={() => setStampa(true)}>Esporta PDF</button>
          </div>
        </div>
        <Segmentato etichetta="Vista" valore={vista} onCambia={setVista} opzioni={[{ id: 'consegne', label: 'Consegne' }, { id: 'galleria', label: 'Galleria' }]} />
      </div>

      {problemiDb.length > 0 && (
        <div role="alert" className="mx-[max(20px,2vw)] mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 space-y-1">
          <p className="font-bold m-0">Il database di Crazy 8 non è aggiornato: gli studenti non riescono a salvare.</p>
          <p className="m-0">Esegui nell&apos;SQL Editor di Supabase <code className="text-xs">{MIGRAZIONE_CRAZY8}</code>, poi ricarica.</p>
          <p className="text-xs m-0">{problemiDb.join(' — ')}</p>
        </div>
      )}

      {vista === 'galleria' ? (
        <div className="py-6 space-y-4">
          <div className="px-[max(20px,2vw)] flex flex-wrap items-center gap-2">
            {(['tutto', 'sketch', 'migliorate'] as const).map(f => (
              <button key={f} type="button" className={`mz-chip ${filtroGalleria === f ? 'on' : ''}`} onClick={() => setFiltroGalleria(f)}>
                {f === 'tutto' ? 'Sketch e migliorate' : f === 'sketch' ? 'Solo sketch' : 'Solo migliorate con l’AI'}
              </button>
            ))}
          </div>
          {righeGalleria.length === 0
            ? <p className="px-[max(20px,2vw)] text-sm" style={{ color: 'var(--muted)' }}>Nessuna consegna ancora.</p>
            : <StrisceC8 righe={righeGalleria} onApri={(r, i, el) => lightbox.apri(r.immagini, i, el)} />}
        </div>
      ) : (
        <div className="c8-doc-corpo">
          {/* elenco delle consegne */}
          <nav className="c8-doc-elenco" aria-label="Consegne">
            {visibili.length === 0 && <p className="text-sm p-4" style={{ color: 'var(--muted)' }}>Nessuna consegna ancora.</p>}
            {visibili.map((s, i) => {
              const f = faseEffettiva(s as Submission);
              const n = (s.immagini || []).length;
              const ai = (s.immagini || []).reduce((t: number, x: any) => t + (x.generazioni_crazy8 || []).length, 0);
              return (
                <button key={s.id} type="button" onClick={() => setSelezionataId(s.id)} aria-current={selezionata?.id === s.id ? "true" : undefined} className="c8-doc-voce">
                  <span className="mz-mono">({due(i + 1)})</span>
                  <span className="c8-doc-voce-nome">{nomeDi(s)}</span>
                  <span className="c8-doc-voce-meta">{(teamDi(s)?.membri || []).join(', ') || s.hmw_o_tema || ''}</span>
                  <span className="flex flex-wrap gap-1">
                    <span className="c8-badge" title={FASI[f - 1]?.breve}>Fase {due(f)}/{due(NUMERO_FASI)}</span>
                    {s.team_attivita_id && <span className={`c8-badge ${s.hmw_inviate ? 'ambra' : ''}`}>{s.hmw_inviate ? 'HMW inviate' : 'HMW in corso'}</span>}
                    {s.sketch_sbloccato && s.team_attivita_id && <span className="c8-badge verde">Sketch aperti</span>}
                    {n > 0 && <span className="c8-badge">{n} sketch</span>}
                    {ai > 0 && <span className="c8-badge ambra">{ai} AI</span>}
                    {s.stato !== 'in_corso' && <span className="c8-badge verde">{s.stato === 'revisionato' ? 'Revisionato' : 'Consegnato'}</span>}
                  </span>
                </button>
              );
            })}
            {precedenti.length > 0 && (
              <button type="button" className="mz-pill sm ghost" style={{ margin: '12px max(20px, 2vw)' }} onClick={() => setMostraPrecedenti(v => !v)}>
                {mostraPrecedenti ? 'Nascondi le consegne precedenti' : `Mostra le consegne precedenti (${precedenti.length})`}
              </button>
            )}
          </nav>

          {/* consegna aperta */}
          <section className="c8-doc-dettaglio">
            {!selezionata ? (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Scegli una consegna dall&apos;elenco.</p>
            ) : (
              <div key={selezionata.id} className="space-y-8 entra-sezione">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="space-y-2 min-w-0">
                    <h2 className="mz-display" style={{ fontSize: 'clamp(32px, 3.6vw, 56px)', margin: 0 }}>{nomeDi(selezionata)}</h2>
                    {teamDi(selezionata) && <p className="text-sm m-0" style={{ color: 'var(--muted)' }}>{teamDi(selezionata)!.membri.join(', ')}</p>}
                    {Array.isArray(selezionata.contesti) && selezionata.contesti.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selezionata.contesti.map((id: string) => <span key={id} className="mz-chip on" style={{ cursor: 'default' }}>{nomeContesto(id, contesti) || 'Contesto rimosso'}</span>)}
                      </div>
                    )}
                  </div>
                  <div className="grid gap-2 justify-items-end">
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {STATI.map(st => (
                        <button key={st.id} type="button" className={`mz-chip ${selezionata.stato === st.id ? 'on' : ''}`} onClick={() => impostaStato(selezionata, st.id)}>{st.etichetta}</button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {selezionata.team_attivita_id && (selezionata.sketch_sbloccato
                        ? <button type="button" className="mz-pill sm ghost" onClick={() => sbloccaSketch(selezionata, false)}>Richiudi gli sketch</button>
                        : <button type="button" className="mz-pill sm b" onClick={() => sbloccaSketch(selezionata, true)}>Sblocca gli sketch</button>)}
                      <button type="button" className="mz-pill sm ghost danger" onClick={() => eliminaConsegna(selezionata)}>Elimina consegna</button>
                    </div>
                  </div>
                </div>

                {domandeDi(selezionata).map(d => {
                  const h = (selezionata.hmw || [])[d] as Hmw | undefined;
                  const rev = (selezionata.hmw_revisione || [])[d] || null;
                  const sketch = sketchDi(selezionata, d);
                  const scelti = sketch.filter((x: any) => x.selezionato);
                  const tutte = immaginiDomanda(selezionata, d);
                  const apri = (src: string, el: Element) => lightbox.apri(tutte, Math.max(0, tutte.findIndex(t => t.src === src)), el);
                  return (
                    <section key={d} className="c8-doc-domanda">
                      {selezionata.team_attivita_id && (
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <span className="mz-mono" style={{ color: 'var(--accento)' }}>Domanda ({due(d + 1)}){h ? ` — ${nomeContesto(h.contesto, contesti)}` : ''}</span>
                            <p className="mz-display" style={{ fontSize: 'clamp(22px, 2.2vw, 32px)', margin: '6px 0 0', lineHeight: 1.1 }}>{h ? testoHmw(h) : 'Non ancora scritta'}</p>
                          </div>
                          {h && (
                            <div className="flex gap-1.5">
                              <button type="button" className={`mz-pill sm ${rev === 'ok' ? 'b' : 'o'}`} onClick={() => revisionaHmw(selezionata, d, rev === 'ok' ? null : 'ok')}>✓ Pertinente</button>
                              <button type="button" className={`mz-pill sm ${rev === 'rivedere' ? 'danger-pieno' : 'o'}`} onClick={() => revisionaHmw(selezionata, d, rev === 'rivedere' ? null : 'rivedere')}>Da rivedere</button>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="space-y-2">
                        <span className="mz-mono">Sketch ({sketch.length}) — scelti {scelti.length}</span>
                        {sketch.length === 0 ? <p className="text-sm m-0" style={{ color: 'var(--muted)' }}>Nessuno sketch ancora.</p> : (
                          <div className="c8-doc-miniature">
                            {sketch.map((sk: any, k: number) => (
                              <button key={sk.id} type="button" className={`c8-doc-mini ${sk.selezionato ? 'scelto' : ''}`} onClick={e => apri(sk.url_file, e.currentTarget)} aria-label={`Sketch ${k + 1}${sk.selezionato ? ', scelto' : ''}`}>
                                <img src={miniaturaC8(sk.url_file)} alt="" loading="lazy" />
                                <span className="c8-sketch-numero">{k + 1}</span>
                                {sk.selezionato && <span className="c8-sketch-stella">★</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {scelti.map((sk: any) => (
                        <div key={sk.id} className="c8-doc-evoluzione">
                          <span className="mz-mono">Migliorate con l&apos;AI ({sk.generazioni_crazy8.length})</span>
                          <div className="c8-doc-catena">
                            <button type="button" className="c8-doc-mini grande scelto" onClick={e => apri(sk.url_file, e.currentTarget)} aria-label="Sketch scelto">
                              <img src={miniaturaC8(sk.url_file)} alt="" loading="lazy" />
                              <span className="c8-striscia-tag">Sketch</span>
                            </button>
                            <span className="c8-freccia" aria-hidden="true">→</span>
                            {sk.generazioni_crazy8.length === 0 && <span className="text-sm" style={{ color: 'var(--muted)' }}>Ancora nessuna immagine generata.</span>}
                            {sk.generazioni_crazy8.map((g: any) => (
                              <button key={g.id} type="button" className="c8-doc-mini grande" onClick={e => apri(g.url_immagine, e.currentTarget)} aria-label="Immagine generata">
                                <img src={miniaturaC8(g.url_immagine)} alt="" loading="lazy" />
                                <span className="c8-striscia-tag ai">{g.motore || 'AI'}</span>
                              </button>
                            ))}
                          </div>
                          {sk.interpretazione && <p className="text-sm m-0" style={{ color: 'var(--ink-2)' }}>«{sk.interpretazione}»</p>}
                          <FotoConCommenti
                            img={sk}
                            commenti={commenti[sk.id] || []}
                            bozza={nuovoCommento[sk.id] || ''}
                            setBozza={v => setNuovoCommento(prev => ({ ...prev, [sk.id]: v }))}
                            onInvia={() => inviaCommento(sk.id)}
                            onElimina={eliminaCommento}
                            invioInCorso={invioInCorso === sk.id}
                          />
                        </div>
                      ))}
                    </section>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {attivitaC8 && (
        <BottomSheet aperto={mostraContesti} onChiudi={() => setMostraContesti(false)} etichetta="Bacheca dei contesti" titolo="Bacheca dei contesti" larghezzaDesktop="md:max-w-xl">
          <PannelloContesti attivitaId={attivitaC8.id} passcode={passcode} contesti={contesti} contestiPerTeam={contestiPerTeam} onCambiato={caricaAttivitaC8} />
        </BottomSheet>
      )}
      {mostraWall && attivitaC8 && (
        <WallHmw stelle={stelle} attivitaId={attivitaC8.id} submissions={visibili} contesti={contesti} teams={teamsAtt} passcode={passcode} onChiudi={() => setMostraWall(false)} onCambiato={caricaSubmissions} />
      )}
      {attivitaC8 && (
        <BottomSheet aperto={mostraRegia} onChiudi={() => setMostraRegia(false)} etichetta="Regia dell'aula" titolo="Regia dell'aula" larghezzaDesktop="md:max-w-xl">
          <PannelloRegia attivitaId={attivitaC8.id} passcode={passcode} config={attivitaC8.config} onCambiato={caricaAttivitaC8} onProietta={() => { setMostraRegia(false); setMostraTimer(true); }} />
        </BottomSheet>
      )}
      {mostraTimer && attivitaC8 && (
        <TimerProiezione
          timer={attivitaC8.config.timer}
          onChiudi={() => setMostraTimer(false)}
          comandi={<button type="button" className="mz-pill sm ghost" style={{ color: 'inherit' }} onClick={() => { setMostraTimer(false); setMostraRegia(true); }}>Comandi</button>}
        />
      )}
      {stampa && (
        <StampaCrazy8
          titolo={`Crazy 8 — ${corso.nome}`}
          onFine={() => setStampa(false)}
          consegne={visibili.map((s): ConsegnaStampa => ({
            team: nomeDi(s),
            membri: teamDi(s)?.membri || [],
            contesti: (s.contesti || []).map((id: string) => nomeContesto(id, contesti)).filter(Boolean),
            domande: domandeDi(s).map(d => ({
              testo: (s.hmw || [])[d] ? testoHmw((s.hmw || [])[d]) : '',
              scelti: sketchDi(s, d).filter((x: any) => x.selezionato).map((x: any) => ({ sketch: x.url_file, generate: (x.generazioni_crazy8 || []).map((g: any) => g.url_immagine), nota: x.interpretazione })),
            })),
          }))}
        />
      )}
      {mostraRisultati && <PresentazioneRisultati titolo="Risultati dei team" onChiudi={() => setMostraRisultati(false)} diapositive={diapositiveRisultati} />}
      {mostraPromptSuggeriti && <GestionePromptSuggeriti passcode={passcode} corsoId={corso.id} onChiudi={() => setMostraPromptSuggeriti(false)} />}
    </div>
  );
}
