'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ChiaveDriver } from '@/lib/driver';

// Tipi e piccoli componenti condivisi dalle fasi di Crazy 8 (pagina
// studente app/crazy8/page.tsx e componenti in components/crazy8/).

export type Generazione = {
  id: string;
  sketch_immagine_id: string;
  ordine: number;
  prompt_usato: string;
  url_immagine: string;
  deduzione: string | null;
  motore: string | null;
  positivo: string | null;
  negativo: string | null;
};

export type Sketch = {
  id: string;
  submission_id: string;
  ordine: number;
  url_file: string;
  selezionato: boolean;
  interpretazione: string | null;
  sotto_ambito: string | null;
  domanda: number | null; // 0 o 1: a quale delle due HMW risponde
  generazioni_crazy8: Generazione[];
};

// Valutazione di un driver: stessa forma usata dai casi studio
// ({ valore, nota }), così radar e lib/driver.ts la leggono senza adattatori.
export type ValutazioneDriver = Partial<Record<ChiaveDriver, { valore: number; nota: string }>>;

export type VoceMoodboard = {
  tipo: 'sketch' | 'generata';
  id: string;
  didascalia: string;
  // fase 8 (Valutazione): nome, tag e driver dell'immagine finale
  titolo?: string;
  tags?: string[];
  driver?: ValutazioneDriver;
};

// Una domanda "How Might We" composta a spazi vuoti: Come potremmo
// [azione] per [utente] così che [risultato]? Il contesto è l'id di un
// contesto della bacheca oppure "proprio:<sotto-ambito>".
export type Hmw = { contesto: string; azione: string; utente: string; risultato: string };

export const HMW_VUOTA: Hmw = { contesto: '', azione: '', utente: '', risultato: '' };

export const hmwCompleta = (h: Hmw | undefined) => !!h && !!h.azione.trim() && !!h.utente.trim() && !!h.risultato.trim();

export function testoHmw(h: Hmw | undefined): string {
  if (!h) return '';
  const p = (t: string, segnaposto: string) => t.trim().replace(/[.?]+$/, '') || segnaposto;
  return `Come potremmo ${p(h.azione, '…')} per ${p(h.utente, '…')} così che ${p(h.risultato, '…')}?`;
}

export type Contesto = { id: string; titolo: string; descrizione: string | null; ordine: number };

// Etichetta del contesto di una HMW (bacheca del docente o sotto-ambito del team)
export function nomeContesto(id: string, contesti: Contesto[]): string {
  if (id.startsWith('proprio:')) return id.slice('proprio:'.length);
  return contesti.find(c => c.id === id)?.titolo || '';
}

// Fase 1: per ogni sotto-ambito, cosa sta cambiando oggi e come
// potrebbe essere tra qualche anno. Le chiavi segnale/what_if/tipo_futuro/
// abitanti a livello radice vengono dalla versione precedente (uno
// scenario unico per team) e si leggono ancora per compatibilità.
export type VisioneSottoAmbito = { segnale?: string; visione?: string };

export type Scenario = {
  orizzonte?: string;
  sotto_ambiti?: Record<string, VisioneSottoAmbito>;
  segnale?: string;
  what_if?: string;
  tipo_futuro?: string;
  abitanti?: string;
};

export type Submission = {
  id: string;
  gruppo_nome: string;
  gruppo_num: number;
  hmw_o_tema: string | null;
  stato: string;
  fase_raggiunta: number;
  moodboard: VoceMoodboard[] | null;
  scenario: Scenario | null;
  team_attivita_id: string | null;
  contesti: string[];
  hmw: Hmw[];
  hmw_inviate: boolean;
  hmw_revisione: (('ok' | 'rivedere') | null)[];
  sketch_sbloccato: boolean;
  concept_titolo: string | null;
  concept_descrizione: string | null;
  concept_motivazioni: string | null;
  riflessione: string | null;
  note_prompt: string | null;
  motore_usato: string | null;
  immagini: Sketch[];
};

export const FASI = [
  { n: 1, icona: '📌', breve: 'Contesti', titolo: 'Su cosa lavorate', sottotitolo: 'Scegliete dalla bacheca i contesti preparati dal/dalla docente.' },
  { n: 2, icona: '❓', breve: 'Domande HMW', titolo: 'Le vostre due domande', sottotitolo: 'Componete due domande "Come potremmo…": il/la docente le rivede e, quando sono pronte, sblocca gli sketch.' },
  { n: 3, icona: '✏️', breve: 'Sketch', titolo: 'Gli sketch', sottotitolo: 'Per ognuna delle due domande, 8 idee di prodotto su carta. Poi una foto per sketch, dal telefono.' },
  { n: 4, icona: '🔍', breve: 'Selezione', titolo: 'I due migliori', sottotitolo: 'Per ogni domanda scegliete lo sketch che risponde meglio e scrivete cosa ci vedete.' },
  { n: 5, icona: '🪄', breve: 'Prompt', titolo: 'Il prompt', sottotitolo: 'Componete il prompt per migliorare lo sketch con l\'AI image-to-image e apritelo nel modello che preferite.' },
  { n: 6, icona: '🖼️', breve: 'Immagini', titolo: 'Le immagini generate', sottotitolo: 'Caricate le immagini migliori ottenute dal modello.' },
] as const;

export const NUMERO_FASI = FASI.length;

export const ORIZZONTI = ['2030', '2035', '2040', '2050'];

// Segnale e visione di ogni sotto-ambito, nell'ordine dei sotto-ambiti.
// Una consegna con il vecchio scenario unico lo mostra come prima voce.
export function visioniDi(s: Pick<Submission, 'hmw_o_tema' | 'scenario'>): { sottoAmbito: string; segnale: string; visione: string }[] {
  const sc = s.scenario || {};
  const mappa = sc.sotto_ambiti || {};
  const voci = sottoAmbitiDi(s).map(sa => ({ sottoAmbito: sa, segnale: (mappa[sa]?.segnale || '').trim(), visione: (mappa[sa]?.visione || '').trim() }));
  if (!sc.sotto_ambiti && (sc.what_if || sc.segnale)) {
    return [{ sottoAmbito: voci[0]?.sottoAmbito || '', segnale: (sc.segnale || '').trim(), visione: (sc.what_if || '').trim() }];
  }
  return voci.filter(v => v.segnale || v.visione);
}

// Visione del sotto-ambito di uno sketch (o dell'unico sotto-ambito del team)
export function visioneDi(s: Pick<Submission, 'hmw_o_tema' | 'scenario'>, sottoAmbito: string | null) {
  const voci = visioniDi(s);
  return voci.find(v => v.sottoAmbito === sottoAmbito) || (voci.length === 1 ? voci[0] : null);
}

// Una voce della moodboard è "valutata" quando ha almeno un tag e tutti
// e 4 i driver con un valore.
export const CHIAVI_DRIVER_C8: ChiaveDriver[] = ['desiderabilita', 'fattibilita', 'responsabilita', 'vitalita'];
export const voceValutata = (v: VoceMoodboard) =>
  (v.tags || []).length > 0 && CHIAVI_DRIVER_C8.every(k => typeof v.driver?.[k]?.valore === 'number');


export const MIN_MOODBOARD = 4;
export const MAX_MOODBOARD = 5;

// I sotto-ambiti sono salvati uniti da "; " nella colonna hmw_o_tema
// (scelta già presente prima della riorganizzazione a fasi).
export const sottoAmbitiDi = (s: Pick<Submission, 'hmw_o_tema'> | null) =>
  (s?.hmw_o_tema || '').split(';').map(x => x.trim()).filter(Boolean);

// Per le consegne create prima delle fasi (fase_raggiunta = 1 di default)
// deduciamo il punto raggiunto da ciò che contengono già.
export function faseEffettiva(s: Submission): number {
  let fase = Math.max(1, s.fase_raggiunta || 1);
  const sketch = s.immagini || [];
  if ((s.contesti || []).length > 0) fase = Math.max(fase, 2);
  if (s.sketch_sbloccato && s.hmw_inviate) fase = Math.max(fase, 3);
  if (sketch.length > 0) fase = Math.max(fase, 4);
  if (sketch.some(x => x.selezionato)) fase = Math.max(fase, 5);
  if (sketch.some(x => x.generazioni_crazy8.length > 0)) fase = Math.max(fase, 6);
  // gli sketch si aprono solo quando il/la docente li sblocca
  if (!s.sketch_sbloccato) fase = Math.min(fase, 2);
  return Math.min(NUMERO_FASI, fase);
}

export function risolviVoceMoodboard(s: Submission, voce: VoceMoodboard): { url: string; etichetta: string; sottoAmbito: string | null } | null {
  for (const sketch of s.immagini || []) {
    if (voce.tipo === 'sketch' && sketch.id === voce.id) {
      return { url: sketch.url_file, etichetta: `Sketch ${sketch.ordine + 1}`, sottoAmbito: sketch.sotto_ambito };
    }
    if (voce.tipo === 'generata') {
      const g = sketch.generazioni_crazy8.find(x => x.id === voce.id);
      if (g) return { url: g.url_immagine, etichetta: `Sketch ${sketch.ordine + 1}, round ${g.ordine}`, sottoAmbito: sketch.sotto_ambito };
    }
  }
  return null;
}

// Campo di testo che si salva da solo quando si esce dal campo (o dopo una
// breve pausa di scrittura): in revisione e riflessione ci sono molti
// commenti brevi, un bottone "salva" per ognuno sarebbe solo rumore.
export function TestoAutosalvato({
  valore, onSalva, placeholder, righe = 3, className = '', etichetta, tono = 'neutro',
}: {
  valore: string | null;
  onSalva: (testo: string) => Promise<boolean>;
  placeholder?: string;
  righe?: number;
  className?: string;
  etichetta?: string;
  tono?: 'neutro' | 'positivo' | 'negativo' | 'avanti';
}) {
  const [testo, setTesto] = useState(valore || '');
  const [stato, setStato] = useState<'idle' | 'salvando' | 'salvato' | 'errore'>('idle');
  const ultimoSalvato = useRef(valore || '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inModifica = useRef(false);

  // aggiornamenti arrivati da un altro dispositivo del team (realtime):
  // li accettiamo solo se qui non si sta scrivendo.
  useEffect(() => {
    if (!inModifica.current) {
      setTesto(valore || '');
      ultimoSalvato.current = valore || '';
    }
  }, [valore]);

  const salva = async (t: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (t === ultimoSalvato.current) return;
    setStato('salvando');
    const ok = await onSalva(t);
    if (ok) {
      ultimoSalvato.current = t;
      setStato('salvato');
    } else {
      setStato('errore');
    }
  };

  const bordo = {
    neutro: 'focus:ring-stone-900',
    positivo: 'focus:ring-emerald-600',
    negativo: 'focus:ring-rose-600',
    avanti: 'focus:ring-amber-600',
  }[tono];

  return (
    <div className={className}>
      {etichetta && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">{etichetta}</span>
          <span className="text-[10px] text-stone-400" aria-live="polite">
            {stato === 'salvando' ? 'Salvo…' : stato === 'salvato' ? '✓ Salvato' : stato === 'errore' ? <span className="text-red-600">Non salvato, riprova</span> : ''}
          </span>
        </div>
      )}
      <textarea
        rows={righe}
        value={testo}
        placeholder={placeholder}
        onFocus={() => { inModifica.current = true; }}
        onChange={e => {
          const t = e.target.value;
          setTesto(t);
          setStato('idle');
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => salva(t), 1500);
        }}
        onBlur={() => { inModifica.current = false; salva(testo); }}
        className={`w-full border border-stone-200 rounded-xl p-2.5 text-sm bg-white focus:outline-none focus:ring-2 ${bordo}`}
      />
      {!etichetta && stato !== 'idle' && (
        <p className="text-[10px] text-stone-400 mt-0.5 text-right" aria-live="polite">
          {stato === 'salvando' ? 'Salvo…' : stato === 'salvato' ? '✓ Salvato' : <span className="text-red-600">Non salvato, riprova</span>}
        </p>
      )}
    </div>
  );
}

export function Miniatura({ url, alt = '', className = '', onClick, attiva }: { url: string; alt?: string; className?: string; onClick?: () => void; attiva?: boolean }) {
  const contenuto = <img src={url} alt={alt} loading="lazy" decoding="async" className="max-w-full max-h-full object-contain" />;
  const base = `rounded-xl bg-stone-50 border overflow-hidden flex items-center justify-center ${attiva ? 'border-stone-900 ring-2 ring-stone-900' : 'border-stone-200'} ${className}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${base} hover:opacity-90 transition`}>{contenuto}</button>
  ) : (
    <div className={base}>{contenuto}</div>
  );
}

export function scaricaDataUrl(url: string, nomeFile: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
}


// Il database di Crazy 8 è allineato al codice? Se mancano colonne o
// funzioni (migrazione non eseguita, o una vecchia rieseguita) i
// salvataggi fallirebbero con errori generici: qui si scopre prima.
export const MIGRAZIONE_CRAZY8 = 'supabase/migrations/20261021_crazy8_riallinea.sql e poi 20261022_crazy8_team_contesti_hmw.sql';

export function useControlloDbCrazy8(): string[] {
  const [problemi, setProblemi] = useState<string[]>([]);
  useEffect(() => {
    supabase.rpc('crazy8_controlla_database').then(({ data, error }) => {
      if (error) {
        setProblemi(/could not find the function|schema cache|PGRST20|does not exist/i.test(`${error.code} ${error.message}`) ? ['controllo non presente'] : []);
        return;
      }
      setProblemi(((data || []) as any[]).map(r => (typeof r === 'string' ? r : r?.problema)).filter(Boolean));
    });
  }, []);
  return problemi;
}
