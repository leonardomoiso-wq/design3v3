'use client';
import { useEffect, useRef, useState } from 'react';
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
  concept_titolo: string | null;
  concept_descrizione: string | null;
  concept_motivazioni: string | null;
  riflessione: string | null;
  note_prompt: string | null;
  motore_usato: string | null;
  immagini: Sketch[];
};

export const FASI = [
  { n: 1, icona: '🧭', breve: 'Sotto-ambiti', titolo: 'Definite i sotto-ambiti', sottotitolo: 'Per ognuno: cosa sta cambiando oggi e come potrebbe essere tra qualche anno. Tutto il lavoro partirà da qui.' },
  { n: 2, icona: '✏️', breve: 'Sketch', titolo: 'Crazy 8: scattate e caricate gli sketch', sottotitolo: '8 idee in 8 minuti sui vostri sotto-ambiti, su carta. Poi una foto per ogni sketch, dal telefono.' },
  { n: 3, icona: '🔍', breve: 'Selezione', titolo: 'Rivedete, selezionate, interpretate', sottotitolo: 'Scegliete gli sketch più promettenti per ogni sotto-ambito e scrivete cosa ci vedete.' },
  { n: 4, icona: '🪄', breve: 'Prompt', titolo: 'Configurate il prompt', sottotitolo: 'Fate vedere l\'idea nel suo contesto: componete il prompt, rendetelo vostro e apritelo nel modello che preferite.' },
  { n: 5, icona: '🖼️', breve: 'Risultati', titolo: 'Caricate le migliori immagini generate', sottotitolo: 'Solo quelle che vale la pena discutere: ognuna resta legata al suo sketch e al prompt usato.' },
  { n: 6, icona: '💭', breve: 'Riflessione', titolo: 'Riflettete e reiterate', sottotitolo: 'Cosa funziona, cosa no, e cosa chiederete al prossimo giro.' },
  { n: 7, icona: '🧩', breve: 'Moodboard', titolo: 'Componete la moodboard del concept', sottotitolo: '4-5 immagini che raccontano il concept dei vostri sotto-ambiti, con una didascalia ciascuna.' },
  { n: 8, icona: '🎯', breve: 'Valutazione', titolo: 'Valutate le immagini finali', sottotitolo: 'Per ogni immagine: un nome, i tag del corso e i 4 driver, come per i casi studio.' },
  { n: 9, icona: '📣', breve: 'Share', titolo: 'Share: presentate il concept', sottotitolo: 'Raccontate il concept sotto-ambito per sotto-ambito e motivate le vostre scelte.' },
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
  if (sketch.length > 0) fase = Math.max(fase, 2);
  if (sketch.some(x => x.selezionato)) fase = Math.max(fase, 4);
  if (sketch.some(x => x.generazioni_crazy8.length > 0)) fase = Math.max(fase, 6);
  const voci = s.moodboard || [];
  if (voci.length > 0) fase = Math.max(fase, 7);
  if (voci.some(v => v.driver && Object.keys(v.driver).length > 0)) fase = Math.max(fase, 8);
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
