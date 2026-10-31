'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Sep from '@/components/Sep';
import { Miniatura, scaricaDataUrl, type Sketch, type VisioneSottoAmbito } from './shared';

type Contesto = { visione: VisioneSottoAmbito | null; orizzonte: string };

// Configuratore del prompt per il miglioramento generativo degli sketch.
// Le scelte "a chip" danno struttura, ma da sole producono immagini che
// somigliano a quelle di tutti gli altri team: per questo la sezione
// "Rendetelo vostro" viene subito dopo l'obiettivo, ha un indicatore di
// personalizzazione ben visibile, e i bottoni verso i modelli si sbloccano
// solo quando nel prompt c'è almeno una frase scritta dal team.

type Opzione = { id: string; etichetta: string; testo: string; icona?: string; descrizione?: string };

// Gli obiettivi portano lo sketch nel contesto del suo sotto-ambito (come
// potrebbe essere tra qualche anno): l'immagine fa vedere l'idea come se
// esistesse già, non solo un render più pulito. Restano disponibili anche
// gli obiettivi di sola rifinitura dello sketch.
const OBIETTIVI: Opzione[] = [
  { id: 'reale', icona: '📷', etichetta: 'Come se esistesse', descrizione: 'Una foto realistica, nel suo contesto', testo: 'Trasforma lo sketch allegato in una fotografia realistica, come se l\'oggetto esistesse già e venisse usato con naturalezza nel contesto descritto' },
  { id: 'quotidiano', icona: '🏠', etichetta: 'Scena d\'uso', descrizione: 'Un momento quotidiano, con le persone', testo: 'Mostra una scena di vita quotidiana nel contesto descritto in cui l\'idea dello sketch allegato viene usata come una cosa normale' },
  { id: 'pubblicita', icona: '📰', etichetta: 'Pubblicità', descrizione: 'Un manifesto o una pagina di rivista', testo: 'Crea una pubblicità (manifesto o pagina di rivista) che presenta l\'idea dello sketch allegato, ambientata nel contesto descritto' },
  { id: 'manuale', icona: '📦', etichetta: 'Packaging / istruzioni', descrizione: 'Confezione, etichetta o manuale', testo: 'Crea il packaging o una pagina di istruzioni dell\'oggetto dello sketch allegato, pensato per il contesto descritto' },
  { id: 'migliora', icona: '✨', etichetta: 'Migliora lo sketch', descrizione: 'Linee pulite, proporzioni corrette, stessa idea', testo: 'Rielabora lo sketch allegato in un disegno di prodotto pulito e leggibile, correggendo proporzioni e prospettiva senza cambiare l\'idea' },
  { id: 'minimale', icona: '⬜', etichetta: 'Set minimale', descrizione: 'Still life da studio, sfondo neutro', testo: 'Presenta l\'oggetto dello sketch allegato su un set fotografico minimale da studio, con sfondo neutro e continuo' },
  { id: 'esploso', icona: '🧩', etichetta: 'Esploso / componenti', descrizione: 'Parti e funzionamento interno', testo: 'Crea una vista esplosa dell\'oggetto dello sketch allegato che mostri i componenti e come si assemblano' },
];

// obiettivi in cui il contesto del sotto-ambito entra nel prompt
const OBIETTIVI_NEL_MONDO = ['reale', 'quotidiano', 'pubblicita', 'manuale'];

const GRUPPI: { id: string; titolo: string; multiplo?: boolean; opzioni: Opzione[]; soloPer?: string[] }[] = [
  {
    id: 'ambientazione', titolo: 'Ambientazione', soloPer: ['reale', 'quotidiano'],
    opzioni: [
      { id: 'casa', etichetta: 'Interno domestico', testo: 'in un interno domestico vissuto' },
      { id: 'urbano', etichetta: 'Spazio urbano', testo: 'in uno spazio pubblico urbano' },
      { id: 'natura', etichetta: 'Natura / paesaggio', testo: 'immerso in un paesaggio naturale' },
      { id: 'lavoro', etichetta: 'Luogo di lavoro', testo: 'in un ambiente di lavoro' },
      { id: 'lab', etichetta: 'Laboratorio', testo: 'in un laboratorio' },
    ],
  },
  {
    id: 'stile', titolo: 'Stile visivo',
    opzioni: [
      { id: 'foto', etichetta: 'Foto di prodotto', testo: 'stile fotografia di prodotto editoriale' },
      { id: '3d', etichetta: 'Rendering 3D', testo: 'stile rendering 3D' },
      { id: 'clay', etichetta: 'Clay render', testo: 'stile clay render monomaterico' },
      { id: 'marker', etichetta: 'Marker / schizzo', testo: 'stile disegno a marker da designer, ben rifinito' },
      { id: 'tecnico', etichetta: 'Disegno tecnico', testo: 'stile tavola di disegno tecnico' },
    ],
  },
  {
    id: 'materiali', titolo: 'Materiali', multiplo: true,
    opzioni: [
      { id: 'legno', etichetta: 'Legno', testo: 'legno' },
      { id: 'metallo', etichetta: 'Metallo', testo: 'metallo' },
      { id: 'ceramica', etichetta: 'Ceramica', testo: 'ceramica' },
      { id: 'vetro', etichetta: 'Vetro', testo: 'vetro' },
      { id: 'tessuto', etichetta: 'Tessuto', testo: 'tessuto' },
      { id: 'bio', etichetta: 'Bio-based', testo: 'materiali bio-based' },
      { id: 'plastica', etichetta: 'Plastica riciclata', testo: 'plastica riciclata' },
    ],
  },
  {
    id: 'luce', titolo: 'Luce',
    opzioni: [
      { id: 'naturale', etichetta: 'Naturale morbida', testo: 'luce naturale morbida' },
      { id: 'studio', etichetta: 'Studio high-key', testo: 'luce da studio uniforme high-key' },
      { id: 'drammatica', etichetta: 'Drammatica', testo: 'luce laterale drammatica con ombre marcate' },
      { id: 'tramonto', etichetta: 'Golden hour', testo: 'luce calda da golden hour' },
    ],
  },
  {
    id: 'inquadratura', titolo: 'Inquadratura',
    opzioni: [
      { id: 'tre_quarti', etichetta: 'Vista 3/4', testo: 'inquadratura di tre quarti' },
      { id: 'frontale', etichetta: 'Frontale', testo: 'vista frontale' },
      { id: 'dettaglio', etichetta: 'Close-up dettaglio', testo: 'close-up su un dettaglio' },
      { id: 'alto', etichetta: 'Dall\'alto', testo: 'vista dall\'alto' },
      { id: 'uso', etichetta: 'In uso (mani)', testo: 'il prodotto mentre viene usato, con mani visibili' },
    ],
  },
  {
    id: 'palette', titolo: 'Palette',
    opzioni: [
      { id: 'neutri', etichetta: 'Neutri', testo: 'palette di colori neutri' },
      { id: 'terrosi', etichetta: 'Terrosi', testo: 'palette di colori terrosi' },
      { id: 'mono', etichetta: 'Monocromo', testo: 'palette monocromatica' },
      { id: 'vivaci', etichetta: 'Vivaci', testo: 'palette di colori vivaci e saturi' },
    ],
  },
];

const VINCOLI: Opzione[] = [
  { id: 'fedele', etichetta: 'Fedele alla forma dello sketch', testo: 'Mantieni fedelmente la forma e le proporzioni principali dello sketch' },
  { id: 'notesto', etichetta: 'Nessun testo nell\'immagine', testo: 'Non inserire testi, loghi o scritte' },
  { id: 'singolo', etichetta: 'Un solo oggetto', testo: 'Un solo oggetto, al centro della scena' },
];

export const MOTORI = [
  { id: 'ChatGPT', nome: 'ChatGPT', nota: 'il prompt si apre già scritto', url: (p: string) => `https://chatgpt.com/?q=${encodeURIComponent(p)}`, classe: 'bg-emerald-700 hover:bg-emerald-800' },
  { id: 'Gemini', nome: 'Gemini', nota: 'incollate il prompt copiato', url: () => 'https://gemini.google.com/app', classe: 'bg-sky-700 hover:bg-sky-800' },
  { id: 'Copilot', nome: 'Copilot', nota: 'incollate il prompt copiato', url: () => 'https://copilot.microsoft.com/', classe: 'bg-indigo-700 hover:bg-indigo-800' },
  { id: 'Firefly', nome: 'Adobe Firefly', nota: 'incollate il prompt copiato', url: () => 'https://firefly.adobe.com/', classe: 'bg-rose-700 hover:bg-rose-800' },
];

type Config = {
  obiettivo: string;
  scelte: Record<string, string[]>;
  vincoli: string[];
  suggerimenti: string[];
  cosa: string;
  dettaglio: string;
  frizione: string;
  atmosfera: string;
  aggiunte: string;
  manuale: string | null;
};

const CONFIG_VUOTA: Config = { obiettivo: 'reale', scelte: {}, vincoli: ['fedele'], suggerimenti: [], cosa: '', dettaglio: '', frizione: '', atmosfera: '', aggiunte: '', manuale: null };
const chiaveConfig = (sketchId: string) => `crazy8_config_${sketchId}`;

function leggiConfig(sketchId: string): Config {
  try {
    const salvata = localStorage.getItem(chiaveConfig(sketchId));
    if (salvata) {
      const c = { ...CONFIG_VUOTA, ...JSON.parse(salvata) };
      // obiettivi della versione precedente non più presenti
      if (!OBIETTIVI.some(o => o.id === c.obiettivo)) c.obiettivo = c.obiettivo === 'ambientato' ? 'quotidiano' : ['render', 'reperto', 'diegetico'].includes(c.obiettivo) ? 'reale' : 'migliora';
      return c;
    }
  } catch { /* storage non disponibile */ }
  return CONFIG_VUOTA;
}

const contaParole = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

type Segmento = { testo: string; tipo: 'base' | 'scelta' | 'vostro' };

function componi(c: Config, sottoAmbito: string | null, interpretazione: string | null, suggerimentiDocente: { id: string; testo_prompt: string }[], contesto: Contesto): Segmento[] {
  const seg: Segmento[] = [];
  const obiettivo = OBIETTIVI.find(o => o.id === c.obiettivo) || OBIETTIVI[0];
  seg.push({ testo: obiettivo.testo + '.', tipo: 'scelta' });
  if (sottoAmbito) seg.push({ testo: ` Ambito di progetto: ${sottoAmbito}.`, tipo: 'base' });
  if (OBIETTIVI_NEL_MONDO.includes(c.obiettivo) && contesto.visione) {
    const pulisci = (t: string) => t.trim().replace(/[.?]$/, '');
    const parti: string[] = [];
    if (contesto.visione.segnale) parti.push(`oggi ${pulisci(contesto.visione.segnale)}`);
    if (contesto.visione.visione) parti.push(`${contesto.orizzonte ? `nel ${contesto.orizzonte}` : 'tra qualche anno'} ${pulisci(contesto.visione.visione)}`);
    if (parti.length) seg.push({ testo: ` Contesto: ${parti.join('; ')}.`, tipo: 'vostro' });
  }
  if (c.cosa.trim()) seg.push({ testo: ` Il progetto: ${c.cosa.trim().replace(/\.$/, '')}.`, tipo: 'vostro' });
  else if (interpretazione?.trim()) seg.push({ testo: ` Il progetto: ${interpretazione.trim().replace(/\.$/, '')}.`, tipo: 'base' });
  if (c.dettaglio.trim()) seg.push({ testo: ` L'elemento che non deve perdersi: ${c.dettaglio.trim().replace(/\.$/, '')}.`, tipo: 'vostro' });
  if (c.frizione.trim()) seg.push({ testo: ` Aggiungi un dettaglio realistico e imperfetto: ${c.frizione.trim().replace(/\.$/, '')}.`, tipo: 'vostro' });

  const parti: string[] = [];
  for (const g of GRUPPI) {
    if (g.soloPer && !g.soloPer.includes(c.obiettivo)) continue;
    const scelte = (c.scelte[g.id] || []).map(id => g.opzioni.find(o => o.id === id)?.testo).filter(Boolean) as string[];
    if (scelte.length === 0) continue;
    parti.push(g.id === 'materiali' ? `materiali: ${scelte.join(', ')}` : scelte.join(', '));
  }
  if (parti.length) seg.push({ testo: ` ${parti.join('; ').replace(/^./, m => m.toUpperCase())}.`, tipo: 'scelta' });
  if (c.atmosfera.trim()) seg.push({ testo: ` Atmosfera: ${c.atmosfera.trim().replace(/\.$/, '')}.`, tipo: 'vostro' });
  for (const id of c.suggerimenti) {
    const s = suggerimentiDocente.find(x => x.id === id);
    if (s) seg.push({ testo: ` ${s.testo_prompt.trim().replace(/\.$/, '')}.`, tipo: 'scelta' });
  }
  if (c.aggiunte.trim()) seg.push({ testo: ` ${c.aggiunte.trim().replace(/\.$/, '')}.`, tipo: 'vostro' });
  const vincoli = VINCOLI.filter(v => c.vincoli.includes(v.id)).map(v => v.testo);
  if (vincoli.length) seg.push({ testo: ` ${vincoli.join('. ')}.`, tipo: 'scelta' });
  return seg;
}

// 0 = generico (bottoni bloccati), 1-3 = sempre più "vostro"
function livelloPersonalizzazione(c: Config): { livello: number; parole: number } {
  const campi = [c.cosa, c.dettaglio, c.frizione, c.atmosfera, c.aggiunte];
  const parole = campi.reduce((n, t) => n + contaParole(t), 0);
  const campiPieni = campi.filter(t => contaParole(t) >= 2).length;
  let livello = 0;
  if (campiPieni >= 1 && parole >= 3) livello = 1;
  if (campiPieni >= 2 && parole >= 10) livello = 2;
  if (campiPieni >= 3 && parole >= 20) livello = 3;
  return { livello, parole };
}

const LIVELLI = [
  { etichetta: 'Generico', testo: 'Il prompt è fatto solo di scelte standard: l\'immagine somiglierà a quella di tutti gli altri team.', colore: 'bg-stone-300', testoColore: 'text-stone-500' },
  { etichetta: 'Si inizia a vedere il vostro concept', testo: 'Bene! Aggiungete un altro dettaglio vostro per rendere il risultato riconoscibile.', colore: 'bg-amber-400', testoColore: 'text-amber-700' },
  { etichetta: 'Personale', testo: 'Il modello ha abbastanza indizi sul vostro progetto. Un\'atmosfera o un dettaglio in più?', colore: 'bg-amber-500', testoColore: 'text-amber-700' },
  { etichetta: 'Prompt d\'autore', testo: 'Ottimo: questo prompt parla del vostro concept, non di un oggetto qualunque.', colore: 'bg-emerald-600', testoColore: 'text-emerald-700' },
];

async function copiaNegliAppunti(testo: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(testo);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = testo;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function Chip({ attivo, onClick, children }: { attivo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attivo}
      className={`text-xs px-3 py-1.5 rounded-full border transition ${attivo ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-500'}`}
    >
      {children}
    </button>
  );
}

export default function PromptConfiguratore({
  sketchSelezionati, sketchIniziale, spuntoIniziale, suggerimentiDocente, onPromptInviato, visioneDi, orizzonte = '',
}: {
  visioneDi: (sottoAmbito: string | null) => VisioneSottoAmbito | null;
  orizzonte?: string;
  sketchSelezionati: Sketch[];
  sketchIniziale?: string | null;
  spuntoIniziale?: string | null;
  suggerimentiDocente: { id: string; etichetta: string; testo_prompt: string }[];
  onPromptInviato: (sketchId: string, prompt: string, motore: string) => void;
}) {
  const [sketchId, setSketchId] = useState<string | null>(sketchIniziale || sketchSelezionati[0]?.id || null);
  const [config, setConfig] = useState<Config>(CONFIG_VUOTA);
  const [copiato, setCopiato] = useState<string | null>(null);
  const [mostraDettagli, setMostraDettagli] = useState(false);
  const campoCosa = useRef<HTMLTextAreaElement>(null);
  const spuntoApplicato = useRef<string | null>(null);

  useEffect(() => {
    if (sketchIniziale) setSketchId(sketchIniziale);
  }, [sketchIniziale]);

  useEffect(() => {
    if (!sketchId && sketchSelezionati[0]) setSketchId(sketchSelezionati[0].id);
  }, [sketchId, sketchSelezionati]);

  // ogni sketch ha la sua configurazione, conservata nel browser
  useEffect(() => {
    if (!sketchId) return;
    let c = leggiConfig(sketchId);
    // spunto arrivato dalla riflessione ("Reitera"): finisce nelle aggiunte
    if (spuntoIniziale && spuntoApplicato.current !== spuntoIniziale && sketchId === sketchIniziale) {
      spuntoApplicato.current = spuntoIniziale;
      c = { ...c, manuale: null, aggiunte: c.aggiunte.trim() ? `${c.aggiunte.trim()}. ${spuntoIniziale}` : spuntoIniziale };
    }
    setConfig(c);
  }, [sketchId, spuntoIniziale, sketchIniziale]);

  const aggiorna = (patch: Partial<Config>) => {
    setConfig(prev => {
      const nuova = { ...prev, ...patch };
      if (sketchId) {
        try { localStorage.setItem(chiaveConfig(sketchId), JSON.stringify(nuova)); } catch { /* non bloccante */ }
      }
      return nuova;
    });
  };

  const sketch = sketchSelezionati.find(s => s.id === sketchId) || null;
  const segmenti = useMemo(
    () => componi(config, sketch?.sotto_ambito || null, sketch?.interpretazione || null, suggerimentiDocente, { visione: visioneDi(sketch?.sotto_ambito || null), orizzonte }),
    [config, sketch, suggerimentiDocente, visioneDi, orizzonte],
  );
  const promptComposto = segmenti.map(s => s.testo).join('').trim();
  const promptFinale = (config.manuale ?? promptComposto).trim();
  const { livello, parole } = livelloPersonalizzazione(config);
  const sbloccato = livello >= 1;
  const infoLivello = LIVELLI[livello];

  const toggleScelta = (gruppo: string, id: string, multiplo?: boolean) => {
    const attuali = config.scelte[gruppo] || [];
    const nuove = attuali.includes(id) ? attuali.filter(x => x !== id) : multiplo ? [...attuali, id] : [id];
    aggiorna({ scelte: { ...config.scelte, [gruppo]: nuove }, manuale: null });
  };

  const apriMotore = async (motore: (typeof MOTORI)[number] | null) => {
    if (!sketch || !sbloccato) return;
    // la finestra va aperta subito, dentro il clic, o il browser la blocca
    if (motore) window.open(motore.url(promptFinale), '_blank', 'noopener');
    const ok = await copiaNegliAppunti(promptFinale);
    setCopiato(ok ? (motore?.id || 'copia') : 'errore');
    onPromptInviato(sketch.id, promptFinale, motore?.id || '');
    setTimeout(() => setCopiato(null), 4000);
  };

  if (sketchSelezionati.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-stone-200 p-10 text-center text-sm text-stone-500">
        Nessuno sketch selezionato: tornate alla fase 3 e scegliete gli sketch da migliorare.
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[1fr_400px] gap-6 items-start">
      <div className="space-y-5 min-w-0">
        {/* Sketch su cui si lavora */}
        <section className="bg-white rounded-3xl border border-stone-200 p-5 space-y-3">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Sketch da migliorare</h3>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {sketchSelezionati.map(s => (
              <div key={s.id} className="flex-shrink-0 text-center">
                <Miniatura url={s.url_file} onClick={() => setSketchId(s.id)} attiva={s.id === sketchId} className="w-24 h-24" />
                <p className="text-[10px] text-stone-500 mt-1 max-w-[6rem] truncate">{s.sotto_ambito || `Sketch ${s.ordine + 1}`}</p>
              </div>
            ))}
          </div>
          {sketch?.interpretazione && (
            <p className="text-xs text-stone-500 bg-stone-50 rounded-xl p-3 border border-stone-100">
              <b className="text-stone-700">La vostra interpretazione:</b> {sketch.interpretazione}
            </p>
          )}
        </section>

        {/* 1. Obiettivo */}
        <section className="bg-white rounded-3xl border border-stone-200 p-5 space-y-3">
          <h3 className="text-sm font-bold text-stone-900"><span className="text-stone-400 mr-1">1</span> Cosa volete ottenere?</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {OBIETTIVI.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => aggiorna({ obiettivo: o.id, manuale: null })}
                aria-pressed={config.obiettivo === o.id}
                className={`text-left rounded-2xl border p-3 transition ${config.obiettivo === o.id ? 'bg-stone-900 border-stone-900 text-white' : 'bg-white border-stone-200 hover:border-stone-500'}`}
              >
                <span className="text-xl" aria-hidden="true">{o.icona}</span>
                <p className="text-xs font-bold mt-1">{o.etichetta}</p>
                <p className={`text-[11px] leading-snug mt-0.5 ${config.obiettivo === o.id ? 'text-stone-300' : 'text-stone-500'}`}>{o.descrizione}</p>
              </button>
            ))}
          </div>
        </section>

        {/* 2. Personalizzazione: messa in evidenza di proposito */}
        <section className="rounded-3xl border-2 border-amber-300 bg-amber-50/60 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-stone-900"><span className="text-amber-600 mr-1">2</span> Rendetelo vostro</h3>
              <p className="text-xs text-stone-600 mt-0.5">Le parole che scrivete qui sono ciò che distingue il vostro risultato da quello degli altri team.</p>
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-widest whitespace-nowrap ${infoLivello.testoColore}`}>{parole} parole vostre</span>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-stone-800">Cosa fa la vostra idea, e per chi?</span>
            <textarea ref={campoCosa} rows={2} value={config.cosa} onChange={e => aggiorna({ cosa: e.target.value, manuale: null })} placeholder={sketch?.interpretazione ? `es. ${sketch.interpretazione.slice(0, 80)}` : 'es. un dispenser che rilascia semi per gli impollinatori sui balconi di città'} className="mt-1 w-full border border-amber-200 rounded-xl p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-stone-800">Qual è il dettaglio dello sketch che non deve perdersi?</span>
            <textarea rows={2} value={config.dettaglio} onChange={e => aggiorna({ dettaglio: e.target.value, manuale: null })} placeholder="es. la forma a goccia e il foro di uscita sul fondo" className="mt-1 w-full border border-amber-200 rounded-xl p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-stone-800">Un dettaglio imperfetto <span className="text-stone-400 font-normal">(facoltativo)</span></span>
            <span className="block text-[11px] text-stone-500">Un segno d&apos;uso, un limite, qualcosa che non torna: rende l&apos;immagine più credibile.</span>
            <textarea rows={2} value={config.frizione} onChange={e => aggiorna({ frizione: e.target.value, manuale: null })} placeholder="es. il vaso un po' sporco di terra, un'etichetta scolorita" className="mt-1 w-full border border-amber-200 rounded-xl p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-stone-800">L&apos;atmosfera in 3 parole</span>
            <input type="text" value={config.atmosfera} onChange={e => aggiorna({ atmosfera: e.target.value, manuale: null })} placeholder="es. quieta, artigianale, viva" className="mt-1 w-full border border-amber-200 rounded-xl p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-stone-800">Altro da chiedere al modello <span className="text-stone-400 font-normal">(facoltativo)</span></span>
            <textarea rows={2} value={config.aggiunte} onChange={e => aggiorna({ aggiunte: e.target.value, manuale: null })} placeholder="es. mostra anche una persona anziana che lo usa" className="mt-1 w-full border border-amber-200 rounded-xl p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </label>
        </section>

        {/* 3. Dettagli */}
        <section className="bg-white rounded-3xl border border-stone-200 p-5 space-y-4">
          <button type="button" onClick={() => setMostraDettagli(v => !v)} className="w-full flex items-center justify-between text-left" aria-expanded={mostraDettagli}>
            <h3 className="text-sm font-bold text-stone-900"><span className="text-stone-400 mr-1">3</span> Regolate i dettagli <span className="text-xs font-normal text-stone-400">stile, materiali, luce, inquadratura…</span></h3>
            <span className="text-stone-400 text-sm">{mostraDettagli ? '−' : '+'}</span>
          </button>
          {mostraDettagli && (
            <div className="space-y-4 animate-fade-in">
              {GRUPPI.filter(g => !g.soloPer || g.soloPer.includes(config.obiettivo)).map(g => (
                <div key={g.id} className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">{g.titolo}{g.multiplo && <span className="font-normal normal-case tracking-normal"> (anche più di uno)</span>}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.opzioni.map(o => (
                      <Chip key={o.id} attivo={(config.scelte[g.id] || []).includes(o.id)} onClick={() => toggleScelta(g.id, o.id, g.multiplo)}>{o.etichetta}</Chip>
                    ))}
                  </div>
                </div>
              ))}
              {suggerimentiDocente.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">💡 Suggeriti dal/dalla docente</p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggerimentiDocente.map(s => (
                      <Chip
                        key={s.id}
                        attivo={config.suggerimenti.includes(s.id)}
                        onClick={() => aggiorna({ manuale: null, suggerimenti: config.suggerimenti.includes(s.id) ? config.suggerimenti.filter(x => x !== s.id) : [...config.suggerimenti, s.id] })}
                      >
                        {s.etichetta}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Vincoli</p>
                <div className="flex flex-wrap gap-1.5">
                  {VINCOLI.map(v => (
                    <Chip key={v.id} attivo={config.vincoli.includes(v.id)} onClick={() => aggiorna({ manuale: null, vincoli: config.vincoli.includes(v.id) ? config.vincoli.filter(x => x !== v.id) : [...config.vincoli, v.id] })}>
                      {config.vincoli.includes(v.id) ? '✓ ' : ''}{v.etichetta}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Anteprima e invio ai modelli */}
      <aside className="lg:sticky lg:top-4 space-y-4">
        <section className="bg-stone-900 text-stone-100 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Il vostro prompt</h3>
            <button
              type="button"
              onClick={() => aggiorna({ manuale: config.manuale === null ? promptComposto : null })}
              className="text-[11px] text-stone-400 hover:text-white transition"
            >
              {config.manuale === null ? '✎ Modifica a mano' : '↺ Torna al configuratore'}
            </button>
          </div>

          {config.manuale === null ? (
            <p className="text-sm leading-relaxed">
              {segmenti.map((s, i) => (
                <span key={i} className={s.tipo === 'vostro' ? 'bg-amber-400/25 text-amber-200 rounded px-0.5' : s.tipo === 'scelta' ? 'text-white' : 'text-stone-400'}>{s.testo}</span>
              ))}
            </p>
          ) : (
            <textarea rows={8} value={config.manuale} onChange={e => aggiorna({ manuale: e.target.value })} className="w-full rounded-xl bg-stone-800 border border-stone-700 p-3 text-sm text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400" />
          )}
          <p className="text-[10px] text-stone-500">
            <span className="bg-amber-400/25 text-amber-200 rounded px-1">evidenziato</span> = parole vostre<Sep /><span className="text-white">bianco</span> = scelte del configuratore
          </p>

          {/* indicatore di personalizzazione */}
          <div className="space-y-1.5">
            <div className="flex gap-1" aria-hidden="true">
              {[1, 2, 3].map(n => (
                <span key={n} className={`h-1.5 flex-1 rounded-full transition-colors ${livello >= n ? LIVELLI[livello].colore : 'bg-stone-700'}`} />
              ))}
            </div>
            <p className="text-xs font-bold text-white">{infoLivello.etichetta}</p>
            <p className="text-[11px] text-stone-400 leading-snug">{infoLivello.testo}</p>
            {!sbloccato && (
              <button type="button" onClick={() => campoCosa.current?.focus()} className="text-[11px] text-amber-300 hover:text-amber-200 underline underline-offset-2">
                Scrivete almeno una frase vostra per sbloccare l&apos;invio →
              </button>
            )}
          </div>
        </section>

        <section className="bg-white rounded-3xl border border-stone-200 p-5 space-y-3">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Generate con…</h3>
          <ol className="text-[11px] text-stone-500 space-y-0.5 list-decimal list-inside">
            <li>Il prompt viene copiato e si apre il modello scelto</li>
            <li>Allegate lo sketch (📎) e incollate il prompt</li>
            <li>Salvate le immagini migliori e passate alla fase 5</li>
          </ol>
          {sketch && (
            <button type="button" onClick={() => scaricaDataUrl(sketch.url_file, `sketch-${sketch.ordine + 1}.jpg`)} className="w-full text-xs border border-stone-200 rounded-xl py-2 hover:border-stone-500 transition">
              ⬇ Scarica lo sketch da allegare
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            {MOTORI.map(m => (
              <button
                key={m.id}
                type="button"
                disabled={!sbloccato}
                onClick={() => apriMotore(m)}
                className={`rounded-2xl px-3 py-3 text-left text-white transition disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed ${m.classe}`}
              >
                <span className="block text-sm font-bold">{m.nome} ↗</span>
                <span className="block text-[10px] opacity-80 leading-tight mt-0.5">{m.nota}</span>
              </button>
            ))}
          </div>
          <button type="button" disabled={!sbloccato} onClick={() => apriMotore(null)} className="w-full text-xs bg-stone-100 rounded-xl py-2 hover:bg-stone-200 transition disabled:opacity-50 disabled:cursor-not-allowed">
            📋 Solo copia il prompt (altro strumento)
          </button>
          {copiato && (
            <p role="status" className={`text-xs rounded-xl p-2.5 ${copiato === 'errore' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {copiato === 'errore' ? 'Non sono riuscito a copiare: usate "Modifica a mano" e copiate il testo.' : 'Prompt copiato negli appunti ✓ — lo ritroverete già compilato nella fase 5.'}
            </p>
          )}
        </section>
      </aside>
    </div>
  );
}
