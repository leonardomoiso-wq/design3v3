'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizzaDriver, estraiNote, driverDaCoordinate, MAX_DRIVER } from '@/lib/driver';
import { useDocente } from '@/lib/docente-context';
import { ascoltaCorso } from '@/lib/realtime';
import { CONFIGURAZIONE_PREDEFINITA, etichettaDriver } from '@/lib/corsi';
import { caricaCasiConCache, aggiornaCacheCaso, rimuoviCasoDallaCache, svuotaCacheCasi } from '@/lib/cacheCasi';
import { usePannelloRidimensionabile } from '@/lib/useRidimensionabile';
import StellaScelto from '@/components/StellaScelto';
import { MetaCaso, FonteCaso, metaDaRiga, testoMeta } from '@/components/MetaCaso';
import { BottomSheet, ActionSheet, SlidingPanel, type StatoPannello } from '@/components/PannelliMobile';
import { useMobile } from '@/lib/useMobile';
import { useMappaZoom, ZOOM_MIN, ZOOM_MAX } from '@/lib/useMappaZoom';

function GestioneTagDefault({ passcode, corsoId, onChiudi }: { passcode: string; corsoId: string; onChiudi: () => void }) {
  const [lista, setLista] = useState<any[]>([]);
  const [nuovoTag, setNuovoTag] = useState('');
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);

  const carica = async () => {
    const { data } = await supabase.from('tag_default_caso_studio').select('*').eq('corso_id', corsoId).order('ordine', { ascending: true });
    if (data) setLista(data as any[]);
  };

  useEffect(() => { carica(); }, []);

  const aggiungi = async () => {
    setErrore('');
    if (!nuovoTag.trim()) { setErrore('Scrivi il testo del tag.'); return; }
    setInCorso(true);
    const { error } = await supabase.rpc('docente_aggiungi_tag_default', { p_corso_id: corsoId, p_testo: nuovoTag, p_passcode: passcode });
    setInCorso(false);
    if (error) { setErrore('Errore durante il salvataggio.'); return; }
    setNuovoTag('');
    carica();
  };

  const elimina = async (id: string) => {
    setLista(prev => prev.filter(t => t.id !== id));
    const { error } = await supabase.rpc('docente_elimina_tag_default', { p_id: id, p_passcode: passcode });
    if (error) carica();
  };

  return (
    <BottomSheet aperto onChiudi={onChiudi} etichetta="Tag di default per i Casi Studio" titolo="Tag di default per i Casi Studio">
      <p className="text-xs text-stone-500">I temi che gli studenti possono scegliere nel passo &quot;Temi&quot; della consegna.</p>

      <div className="flex flex-wrap gap-1.5">
        {lista.map(t => (
          <span key={t.id} className="inline-flex items-center gap-1.5 text-[11px] bg-stone-50 border border-stone-200 rounded-full pl-3 pr-1.5 py-1">
            {t.testo}
            <button onClick={() => elimina(t.id)} aria-label={`Elimina ${t.testo}`} className="text-stone-300 hover:text-red-600">✕</button>
          </span>
        ))}
        {lista.length === 0 && <p className="text-xs text-stone-400">Nessun tag ancora.</p>}
      </div>

      <div className="border-t border-stone-100 pt-3 flex gap-2">
        <input value={nuovoTag} onChange={e => setNuovoTag(e.target.value)} placeholder="Nuovo tag..." onKeyDown={e => { if (e.key === 'Enter') aggiungi(); }} className="flex-1 border border-stone-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-stone-900" />
        <button onClick={aggiungi} disabled={inCorso} className="text-xs bg-stone-900 text-white px-4 rounded-xl font-medium hover:bg-stone-800 transition disabled:opacity-50">
          {inCorso ? '...' : 'Aggiungi'}
        </button>
      </div>
      {errore && <p className="text-[11px] text-red-600 font-medium">{errore}</p>}
    </BottomSheet>
  );
}

// Pulsanti di zoom e minimappa della matrice, sovrapposti alla vista.
function ControlliMappa({ mappa, casi, selezionato, mobile }: {
  mappa: ReturnType<typeof useMappaZoom>;
  casi: any[];
  selezionato: any | null;
  mobile: boolean;
}) {
  const { vista } = mappa;
  const minimappaRef = useRef<HTMLDivElement>(null);
  const trascinaMinimappa = useRef(false);
  const fraz = (c: any) => ({ fx: (c.x + 100) / 200, fy: (-c.y + 100) / 200 });

  const centraDaMinimappa = (e: React.PointerEvent, conAnimazione: boolean) => {
    const r = minimappaRef.current?.getBoundingClientRect();
    if (!r) return;
    mappa.centraSu((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, undefined, conAnimazione);
  };

  const pulsante = 'w-9 h-9 flex items-center justify-center text-base text-stone-700 hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-900';

  return (
    <>
      <div data-no-pan className={`absolute right-3 md:right-8 z-20 flex flex-col bg-white/95 backdrop-blur border border-stone-200 rounded-2xl shadow-sm overflow-hidden divide-y divide-stone-100 ${mobile ? 'top-[4.5rem]' : 'top-16'}`}>
        <button onClick={() => mappa.zoomDi(1.5, undefined, true)} disabled={vista.zoom >= ZOOM_MAX} aria-label="Ingrandisci" className={pulsante}>+</button>
        <span className="text-[9px] font-bold text-stone-500 text-center py-1 tabular-nums" aria-live="polite">×{vista.zoom.toLocaleString('it-IT', { maximumFractionDigits: 1 })}</span>
        <button onClick={() => mappa.zoomDi(1 / 1.5, undefined, true)} disabled={vista.zoom <= ZOOM_MIN} aria-label="Riduci" className={pulsante}>−</button>
        <button onClick={mappa.reimposta} disabled={vista.zoom <= ZOOM_MIN} aria-label="Mostra tutta la matrice" title="Mostra tutta la matrice" className={`${pulsante} text-sm`}>⤢</button>
        <button
          onClick={() => { if (selezionato) { const { fx, fy } = fraz(selezionato); mappa.centraSu(fx, fy, Math.max(vista.zoom, 3)); } }}
          disabled={!selezionato}
          aria-label="Centra sul caso studio selezionato"
          title="Centra sul caso studio selezionato"
          className={`${pulsante} text-sm`}
        >
          ◎
        </button>
      </div>

      {/* Minimappa: compare quando si è ingranditi, mostra dove si trova la
          porzione visibile e si può toccare/trascinare per spostarsi. */}
      {vista.zoom > 1.01 && (
        <div
          ref={minimappaRef}
          data-no-pan
          role="presentation"
          onPointerDown={e => { trascinaMinimappa.current = true; e.currentTarget.setPointerCapture(e.pointerId); centraDaMinimappa(e, true); }}
          onPointerMove={e => { if (trascinaMinimappa.current) centraDaMinimappa(e, false); }}
          onPointerUp={() => { trascinaMinimappa.current = false; }}
          onPointerCancel={() => { trascinaMinimappa.current = false; }}
          className="absolute right-3 md:right-8 bottom-10 md:bottom-12 z-20 w-24 h-24 md:w-32 md:h-32 bg-white/95 backdrop-blur border border-stone-300 rounded-xl shadow-md overflow-hidden touch-none cursor-pointer animate-fade-in"
        >
          <div className="absolute inset-x-0 top-1/2 border-b border-stone-200" />
          <div className="absolute inset-y-0 left-1/2 border-r border-stone-200" />
          {casi.map(c => {
            const { fx, fy } = fraz(c);
            return (
              <span
                key={c.id}
                className={`absolute rounded-full -translate-x-1/2 -translate-y-1/2 ${selezionato?.id === c.id ? 'w-2 h-2 bg-stone-900' : c.scelto > 0 ? 'w-1.5 h-1.5 bg-amber-400' : 'w-1.5 h-1.5 bg-stone-400'}`}
                style={{ left: `${fx * 100}%`, top: `${fy * 100}%` }}
              />
            );
          })}
          <div
            className="absolute border-2 border-stone-900 rounded-sm bg-stone-900/5 pointer-events-none"
            style={{
              left: `${(-vista.x / vista.zoom) * 100}%`,
              top: `${(-vista.y / vista.zoom) * 100}%`,
              width: `${100 / vista.zoom}%`,
              height: `${100 / vista.zoom}%`,
            }}
          />
        </div>
      )}
    </>
  );
}

const SCHEDE = [
  ['matrice', 'Matrice Globale'],
  ['analitica', '📊 Cluster Analitici'],
  ['slides', '🖥️ Modalità Slide PDF'],
  ['controllo', '⚙️ Controllo & Reset'],
] as const;

export default function TeacherPage() {
  const { passcode: passcodeAttivo, corso } = useDocente();
  const config = corso.configurazione;
  // I 4 driver con le etichette scelte per questo corso (pannello Corso & Form).
  const DRIVER = config.driver.map(d => [d.chiave, d.etichetta] as const);
  const et = (chiave: Parameters<typeof etichettaDriver>[1]) => etichettaDriver(config, chiave);

  const [casi, setCasi] = useState<any[]>([]);
  const [selezionato, setSelezionato] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'matrice' | 'analitica' | 'controllo' | 'slides'>('matrice');
  const [mostraTagDefault, setMostraTagDefault] = useState(false);

  const [personaSelezionata, setPersonaSelezionata] = useState('artigiano');
  const [aiCritica, setAiCritica] = useState('');
  const [loadingAi, setLoadingAi] = useState(false);

  const [passwordReset, setPasswordReset] = useState('');
  const [erroreReset, setErroreReset] = useState(false);
  const [successoReset, setSuccessoReset] = useState(false);

  const [casoDaReimpostare, setCasoDaReimpostare] = useState<any | null>(null);
  const [nuovoCodice, setNuovoCodice] = useState('');
  const [erroreReimposta, setErroreReimposta] = useState('');
  const [reimpostaInCorso, setReimpostaInCorso] = useState(false);
  const [successoReimposta, setSuccessoReimposta] = useState<{ titolo: string; codice: string } | null>(null);

  const matrixRef = useRef<HTMLDivElement>(null);
  const [filtroTag, setFiltroTag] = useState('');
  const [ricercaMatrice, setRicercaMatrice] = useState('');
  const [casoHoverId, setCasoHoverId] = useState<number | null>(null);
  const [erroreCasi, setErroreCasi] = useState('');
  const [tempoCaricamentoMs, setTempoCaricamentoMs] = useState<number | null>(null);
  const [casoEspansoCluster, setCasoEspansoCluster] = useState<any | null>(null);
  const { larghezza: larghezzaPannelloDettaglio, iniziaTrascinamento: iniziaTrascinamentoDettaglio } =
    usePannelloRidimensionabile('design3-matrice-dettaglio-larghezza', 440, 320, 720, 'sinistra');

  // Da smartphone il pannello laterale di dettaglio diventa un pannello
  // scorrevole dal basso (peek / medio / pieno) e le schede della pagina
  // si scelgono da un action sheet invece che da una fila di pulsanti.
  const mobile = useMobile();
  const [statoPannello, setStatoPannello] = useState<StatoPannello>('peek');
  const [menuSchedeAperto, setMenuSchedeAperto] = useState(false);
  const ALTEZZA_PEEK = 84;
  const mappa = useMappaZoom(activeTab === 'matrice');
  const { vista } = mappa;

  // Mappa i campi dal formato snake_case del db al formato camelCase dell'app.
  const formattaCaso = (c: any) => ({
    id: Number(c.id),
    gruppoNome: c.gruppo_nome,
    gruppoNum: c.gruppo_num,
    titolo: c.titolo,
    descrizione: c.descrizione,
    immagine: c.immagine,
    tags: c.tags || [],
    driver: normalizzaDriver(c.driver),
    driverNote: estraiNote(c.driver),
    x: Number(c.x),
    y: Number(c.y),
    scelto: Number(c.scelto) || 0,
    ...metaDaRiga(c),
  });

  useEffect(() => {

    // 1. Carica i dati iniziali
    const fetchCasiIniziali = async () => {
      const inizioCaricamento = performance.now();

      // Usa la cache locale del browser: riscarica solo i casi studio nuovi
      // o modificati dall'ultima visita, e a piccoli blocchi (non tutti
      // insieme) così anche una connessione lenta vede i casi studio
      // comparire man mano invece di aspettare tutto o niente.
      const aggiornaVista = (correnti: any[]) => {
        setErroreCasi('');
        const formattati = correnti.map(formattaCaso);
        setCasi(formattati);
        setSelezionato((prev: any) => {
          if (prev) {
            const aggiornato = formattati.find(f => f.id === prev.id);
            if (aggiornato) return aggiornato;
          }
          return formattati.length > 0 ? formattati[0] : null;
        });
      };

      const { righe, errore } = await caricaCasiConCache(corso.id, aggiornaVista);
      setTempoCaricamentoMs(performance.now() - inizioCaricamento);
      if (errore) {
        // Con molte consegne (immagini comprese) la risposta può diventare
        // pesante: se la query fallisce (timeout, limite di dimensione...)
        // meglio dirlo chiaramente che mostrare "nessun caso studio".
        setErroreCasi(`Errore nel caricamento dei casi studio: ${errore}`);
        return;
      }
      aggiornaVista(righe);
    };

    fetchCasiIniziali();

    // 2. Ascolta i cambiamenti in tempo reale (Realtime subscription): aggiorna
    // solo la riga toccata invece di riscaricare l'intera tabella (immagini
    // comprese) a ogni singola modifica di uno qualsiasi dei tanti gruppi.
    const channel = ascoltaCorso(supabase.channel(`realtime-casi-studio-${corso.id}`), 'casi_studio', corso.id, (payload) => {
        if (payload.eventType === 'DELETE') {
          const idEliminato = Number((payload.old as any)?.id);
          setCasi(prev => prev.filter(c => c.id !== idEliminato));
          setSelezionato((prev: any) => (prev && prev.id === idEliminato ? null : prev));
          rimuoviCasoDallaCache(idEliminato);
          return;
        }
        const aggiornato = formattaCaso(payload.new);
        setCasi(prev => {
          const esistente = prev.find(c => c.id === aggiornato.id);
          // Un aggiornamento che non tocca l'immagine (es. "scelto", una
          // posizione in matrice) può arrivare via realtime senza quel
          // valore: si preserva quella già mostrata invece di farla sparire.
          const finale = esistente && !aggiornato.immagine && esistente.immagine
            ? { ...aggiornato, immagine: esistente.immagine }
            : aggiornato;
          return esistente ? prev.map(c => (c.id === finale.id ? finale : c)) : [...prev, finale];
        });
        setSelezionato((prev: any) => {
          if (!prev || prev.id !== aggiornato.id) return prev;
          return !aggiornato.immagine && prev.immagine ? { ...aggiornato, immagine: prev.immagine } : aggiornato;
        });
        aggiornaCacheCaso(payload.new);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resettaTuttoConPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.rpc('docente_resetta_tutto', { p_corso_id: corso.id, p_passcode: passwordReset });
    if (error) {
      console.error('Errore nel reset:', error);
      setErroreReset(true);
      setSuccessoReset(false);
      return;
    }
    svuotaCacheCasi(corso.id);
    setCasi([]);
    setSelezionato(null);
    setAiCritica('');
    setPasswordReset('');
    setErroreReset(false);
    setSuccessoReset(true);
    setTimeout(() => setSuccessoReset(false), 4000);
  };

  const confermaReimpostaCodice = async () => {
    if (!casoDaReimpostare) return;
    if (nuovoCodice.trim().length < 4) {
      setErroreReimposta('Il codice deve avere almeno 4 caratteri.');
      return;
    }

    setReimpostaInCorso(true);
    setErroreReimposta('');

    const { error } = await supabase.rpc('docente_reimposta_codice', {
      p_caso_id: casoDaReimpostare.id,
      p_nuovo_codice: nuovoCodice.trim(),
      p_passcode: passcodeAttivo,
    });

    setReimpostaInCorso(false);

    if (error) {
      console.error('Errore nel reimpostare il codice:', error);
      setErroreReimposta('Errore durante il salvataggio. Riprova.');
      return;
    }

    setSuccessoReimposta({ titolo: casoDaReimpostare.titolo, codice: nuovoCodice.trim() });
    setCasoDaReimpostare(null);
    setNuovoCodice('');
  };

  const generaCriticaAi = async (caso: any, persona: string) => {
    setLoadingAi(true);
    setAiCritica("");
    const meta = Math.round(MAX_DRIVER / 2);
    const d = caso.driver || { desiderabilita: meta, fattibilita: meta, responsabilita: meta, vitalita: meta };
    
    let promptPersona = "";
    if (persona === 'artigiano') {
      promptPersona = `Agisci come un Artigiano Tradizionale critico. Analizza l'immagine e i parametri (scala 0-${MAX_DRIVER}) di questo caso studio (${caso.titolo}): ${et('desiderabilita')} ${d.desiderabilita}, ${et('fattibilita')} ${d.fattibilita}, ${et('responsabilita')} ${d.responsabilita}, ${et('vitalita')} ${d.vitalita}. Descrizione: ${caso.descrizione}. Fai considerazioni sulla materia e la costruzione.`;
    } else if (persona === 'ingegnere') {
      promptPersona = `Agisci come un Ingegnere di Sistema rigoroso. Analizza il caso studio (${caso.titolo}) con driver (scala 0-${MAX_DRIVER}) ${et('desiderabilita')} ${d.desiderabilita}, ${et('fattibilita')} ${d.fattibilita}, ${et('responsabilita')} ${d.responsabilita}, ${et('vitalita')} ${d.vitalita}. Focalizzati su scalabilità e flussi.`;
    } else if (persona === 'designer80') {
      promptPersona = `Agisci come un Designer radicale anni '80 (Memphis). Analizza il caso studio (${caso.titolo}) focalizzandoti sul valore provocatorio e formale.`;
    } else if (persona === 'prodotto2000') {
      promptPersona = `Agisci come un Product Manager anni 2000 orientato ai KPI. Analizza il caso studio (${caso.titolo}) focalizzandoti su UX e sostenibilità commerciale.`;
    }

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: caso.immagine || null, promptText: promptPersona })
      });
      const data = await res.json();
      setAiCritica(data.text || "Impossibile generare l'analisi.");
    } catch (err) {
      setAiCritica("Errore di connessione al server AI.");
    } finally {
      setLoadingAi(false);
    }
  };

  const applicaPosizione = async (id: number, xClamped: number, yClamped: number) => {
    const caso = casi.find(c => c.id === id);
    const noteEsistenti = caso?.driverNote || { desiderabilita: '', fattibilita: '', responsabilita: '', vitalita: '' };

    const valoriDriver = driverDaCoordinate(xClamped, yClamped);

    // Il driver salvato può contenere anche la motivazione testuale dello
    // studente: la preserviamo, aggiornando solo il valore numerico.
    const nuovoDriverConNote = {
      desiderabilita: { valore: valoriDriver.desiderabilita, nota: noteEsistenti.desiderabilita },
      fattibilita: { valore: valoriDriver.fattibilita, nota: noteEsistenti.fattibilita },
      responsabilita: { valore: valoriDriver.responsabilita, nota: noteEsistenti.responsabilita },
      vitalita: { valore: valoriDriver.vitalita, nota: noteEsistenti.vitalita },
    };

    const aggiornati = casi.map(c => {
      if (c.id === id) {
        const casoAggiornato = { ...c, x: xClamped, y: yClamped, driver: valoriDriver };
        if (selezionato?.id === id) setSelezionato(casoAggiornato);
        return casoAggiornato;
      }
      return c;
    });
    setCasi(aggiornati);

    const { error } = await supabase.rpc('docente_aggiorna_posizione', {
      p_id: id,
      p_x: xClamped,
      p_y: yClamped,
      p_driver: nuovoDriverConNote,
      p_passcode: passcodeAttivo,
    });

    if (error) {
      console.error('Errore nel salvataggio della posizione:', error);
    }
  };

  const impostaScelto = async (caso: any, nuovoValore: number) => {
    const precedente = caso.scelto;
    setCasi(prev => prev.map(c => (c.id === caso.id ? { ...c, scelto: nuovoValore } : c)));
    setSelezionato((prev: any) => (prev?.id === caso.id ? { ...prev, scelto: nuovoValore } : prev));
    const { error } = await supabase.rpc('docente_imposta_scelto', {
      p_caso_id: caso.id,
      p_valore: nuovoValore,
      p_passcode: passcodeAttivo,
    });
    if (error) {
      console.error('Errore nel salvataggio del contrassegno:', error);
      setCasi(prev => prev.map(c => (c.id === caso.id ? { ...c, scelto: precedente } : c)));
      setSelezionato((prev: any) => (prev?.id === caso.id ? { ...prev, scelto: precedente } : prev));
    }
  };

  const aggiornaPosizioneDaDrop = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    if (!matrixRef.current) return;
    const rect = matrixRef.current.getBoundingClientRect();

    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;

    const x = Math.round(((xPx / rect.width) * 200) - 100);
    const y = Math.round((((rect.height - yPx) / rect.height) * 200) - 100);

    applicaPosizione(id, Math.max(-100, Math.min(100, x)), Math.max(-100, Math.min(100, y)));
  };

  const spostaConTastiera = (id: number, dx: number, dy: number) => {
    const caso = casi.find(c => c.id === id);
    if (!caso) return;
    const xClamped = Math.max(-100, Math.min(100, caso.x + dx));
    const yClamped = Math.max(-100, Math.min(100, caso.y + dy));
    applicaPosizione(id, xClamped, yClamped);
  };

  const tuttiITag = Array.from(new Set(casi.flatMap(c => c.tags || []))).sort();

  const ricercaNormalizzata = ricercaMatrice.trim().toLowerCase();

  // Una ricerca di soli numeri ("4") è chiaramente un numero di gruppo, non
  // un pezzo di titolo o nome: la si tratta come tale (uguaglianza esatta,
  // niente titolo/nome) invece di trattarla come sottostringa da cercare
  // ovunque, dove "4" comparirebbe anche dentro un titolo come "Sedia n.4"
  // o un gruppo 14/24/40.
  const ricercaSoloNumero = /^\d+$/.test(ricercaNormalizzata);

  const casiFiltrati = casi
    .filter(c => (filtroTag ? (c.tags || []).includes(filtroTag) : true))
    .filter(c => {
      if (!ricercaNormalizzata) return true;
      if (ricercaSoloNumero) return String(c.gruppoNum) === ricercaNormalizzata;
      return (
        c.titolo?.toLowerCase().includes(ricercaNormalizzata) ||
        c.gruppoNome?.toLowerCase().includes(ricercaNormalizzata)
      );
    });

  // I punteggi driver vanno da 0 a 5, quindi la posizione derivata può
  // assumere solo poche decine di valori distinti: è frequente che più casi
  // studio cadano esattamente nello stesso punto e si nascondano del tutto
  // l'uno sotto l'altro. Qui si individuano i gruppi di casi troppo vicini
  // e si calcola per ciascuno un piccolo scarto (in pixel, non in punteggio)
  // che li dispone a corona attorno al punto condiviso, senza toccare la
  // posizione reale salvata sul database. La soglia si riduce con lo zoom,
  // come i raggruppamenti di una mappa: ingrandendo, i casi vicini ma non
  // identici si separano da soli.
  const offsetSparso = useMemo(() => {
    const SOGLIA = 10 / vista.zoom; // unità driver (scala -100..100)
    const visitati = new Set<number>();
    const risultato: Record<number, { dx: number; dy: number }> = {};
    casiFiltrati.forEach((c, i) => {
      if (visitati.has(c.id)) return;
      const gruppo = [c];
      visitati.add(c.id);
      for (let j = i + 1; j < casiFiltrati.length; j++) {
        const altro = casiFiltrati[j];
        if (visitati.has(altro.id)) continue;
        const dx = c.x - altro.x;
        const dy = c.y - altro.y;
        if (Math.sqrt(dx * dx + dy * dy) <= SOGLIA) {
          gruppo.push(altro);
          visitati.add(altro.id);
        }
      }
      if (gruppo.length === 1) {
        risultato[c.id] = { dx: 0, dy: 0 };
      } else {
        const raggio = 24 + Math.min(gruppo.length, 8) * 4;
        gruppo.forEach((membro, indice) => {
          const angolo = (Math.PI * 2 * indice) / gruppo.length - Math.PI / 2;
          risultato[membro.id] = { dx: Math.cos(angolo) * raggio, dy: Math.sin(angolo) * raggio };
        });
      }
    });
    return risultato;
  }, [casiFiltrati, vista.zoom]);

  const getClusterAnalitici = () => {
    const innovatori = casi.filter(c => c.x >= 0 && c.y >= 0);
    const sociali = casi.filter(c => c.x < 0 && c.y < 0);
    const strategici = casi.filter(c => c.x >= 0 && c.y < 0);
    const esplorativi = casi.filter(c => c.x < 0 && c.y >= 0);
    return { innovatori, sociali, strategici, esplorativi };
  };

  const clusters = getClusterAnalitici();

  // Con i driver IDEO restano i nomi storici dei cluster; con driver
  // personalizzati il cluster prende il nome dei due driver che prevalgono
  // in quel quadrante (x: slot 2 contro 1, y: slot 4 contro 3).
  const driverStandard = config.driver.every((d, i) => d.etichetta === CONFIGURAZIONE_PREDEFINITA.driver[i].etichetta);
  const titoliCluster = driverStandard
    ? {
        innovatori: 'Cluster Innovazione & Fattibilità',
        sociali: 'Cluster Impatto Sociale & Desiderabilità',
        strategici: 'Cluster Strategici & di Sistema',
        esplorativi: 'Cluster Esplorativi & Vitali',
      }
    : {
        innovatori: `Cluster ${et('fattibilita')} & ${et('vitalita')}`,
        sociali: `Cluster ${et('desiderabilita')} & ${et('responsabilita')}`,
        strategici: `Cluster ${et('fattibilita')} & ${et('responsabilita')}`,
        esplorativi: `Cluster ${et('desiderabilita')} & ${et('vitalita')}`,
      };

  // Intestazione e corpo della scheda di dettaglio: gli stessi contenuti
  // finiscono nel pannello laterale (desktop) o nello sliding panel
  // (mobile), dove l'intestazione resta visibile anche a pannello chiuso.
  const intestazioneDettaglio = selezionato ? (
    <div>
      <div className="flex justify-between items-center max-md:hidden">
        <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Scheda di Visualizzazione &amp; Commento</span>
        <span className="text-[10px] bg-stone-200 px-2.5 py-0.5 rounded-full font-medium">Gruppo {selezionato.gruppoNum}</span>
      </div>
      <div className="flex justify-between items-start md:mt-1">
        <div className="min-w-0">
          <h2 className="text-lg md:text-2xl font-serif font-medium truncate md:whitespace-normal">{selezionato.titolo}</h2>
          <p className="text-xs text-stone-500 truncate"><span className="md:hidden">Gruppo {selezionato.gruppoNum} &middot; </span>{selezionato.gruppoNome}</p>
          <MetaCaso anno={selezionato.anno} provenienza={selezionato.provenienza} className="mt-1.5" />
        </div>
        <StellaScelto
          valore={selezionato.scelto}
          onCambia={v => impostaScelto(selezionato, v)}
          className="flex-shrink-0 ml-2 text-lg"
        />
      </div>
    </div>
  ) : (
    <p className="text-xs text-stone-500 md:hidden">Nessun caso studio selezionato</p>
  );

  const corpoDettaglio = selezionato && (
    <div className="space-y-5">
      <div className="w-full h-52 rounded-2xl bg-stone-100 border border-stone-200 overflow-hidden shadow-inner flex items-center justify-center p-3">
        {selezionato.immagine ? (
          <img src={selezionato.immagine} alt={selezionato.titolo} className="max-w-full max-h-full object-contain rounded-lg shadow-sm" />
        ) : (
          <span className="text-xs text-stone-400">Nessuna immagine disponibile</span>
        )}
      </div>

      <div className="space-y-1.5">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Descrizione del Caso Studio</h3>
        <p className="text-xs text-stone-700 leading-relaxed bg-white p-4 rounded-xl border border-stone-200 max-h-36 overflow-y-auto">
          {selezionato.descrizione || "Nessuna descrizione inserita."}
        </p>
        <FonteCaso fonte={selezionato.fonte} />
      </div>

      {selezionato.tags && selezionato.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selezionato.tags.map((tag: string) => (
            <span key={tag} className="text-[10px] bg-white border border-stone-200 px-2.5 py-1 rounded-full text-stone-600 font-medium">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-2 border-t border-stone-200 pt-3">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Driver {config.framework} (scala 0-{MAX_DRIVER})</h3>
        <div className="space-y-1.5">
          {DRIVER.map(([chiave, etichetta]) => {
            const nota = selezionato.driverNote?.[chiave];
            return (
              <div key={chiave} className="bg-white p-2.5 rounded-xl border border-stone-200 text-xs">
                <div className="flex justify-between">
                  <span>{etichetta}</span>
                  <b>{selezionato.driver?.[chiave] ?? Math.round(MAX_DRIVER / 2)}</b>
                </div>
                {nota && (
                  <p className="text-[11px] text-stone-500 italic mt-1 border-t border-stone-100 pt-1">&ldquo;{nota}&rdquo;</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 border-t border-stone-200 pt-3">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Sposta sulla Matrice<span className="max-md:hidden"> (da tastiera)</span></h3>
        <div className="grid grid-cols-3 gap-1.5 w-32 max-md:w-40 mx-auto">
          <span></span>
          <button onClick={() => spostaConTastiera(selezionato.id, 0, 10)} aria-label={`Sposta verso l'alto (più ${et('vitalita')})`} className="bg-white border border-stone-200 rounded-lg py-1.5 hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900">↑</button>
          <span></span>
          <button onClick={() => spostaConTastiera(selezionato.id, -10, 0)} aria-label={`Sposta a sinistra (più ${et('desiderabilita')})`} className="bg-white border border-stone-200 rounded-lg py-1.5 hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900">←</button>
          <button onClick={() => spostaConTastiera(selezionato.id, 0, -10)} aria-label={`Sposta verso il basso (più ${et('responsabilita')})`} className="bg-white border border-stone-200 rounded-lg py-1.5 hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900">↓</button>
          <button onClick={() => spostaConTastiera(selezionato.id, 10, 0)} aria-label={`Sposta a destra (più ${et('fattibilita')})`} className="bg-white border border-stone-200 rounded-lg py-1.5 hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900">→</button>
        </div>
        <p className="text-[10px] text-stone-400 text-center">{mobile ? 'Da touch il trascinamento non è disponibile: usa le frecce.' : 'Alternativa al trascinamento per chi usa la tastiera.'}</p>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm space-y-3">
        <h3 className="text-xs font-serif font-bold text-stone-900">🤖 Analisi Critica / Punti di Vista AI</h3>
        <select 
          value={personaSelezionata} 
          onChange={e => setPersonaSelezionata(e.target.value)}
          className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-stone-50 focus:outline-none focus:border-stone-900"
        >
          <option value="artigiano">L&apos;Artigiano Tradizionale</option>
          <option value="ingegnere">L&apos;Ingegnere di Sistema</option>
          <option value="designer80">Il Designer Anni &apos;80 (Memphis)</option>
          <option value="prodotto2000">Il Product Manager Anni 2000</option>
        </select>

        <button 
          onClick={() => generaCriticaAi(selezionato, personaSelezionata)}
          disabled={loadingAi}
          className="w-full bg-stone-900 text-white py-2.5 rounded-xl text-xs font-medium hover:bg-stone-800 transition"
        >
          {loadingAi ? 'Elaborazione punto di vista...' : 'Genera Analisi Critica ✨'}
        </button>

        {aiCritica && (
          <div className="text-[11px] text-stone-700 bg-stone-50 p-3.5 rounded-xl border border-stone-200 leading-relaxed italic">
            &quot;{aiCritica}&quot;
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="app-shell-body flex-1 overflow-hidden flex flex-col select-none">

      <div className="px-4 md:px-6 py-2.5 border-b border-stone-200 flex justify-end items-center bg-[#FBF9F5]/90 backdrop-blur z-20 flex-shrink-0">
        <div className="hidden md:flex items-center space-x-2">
          {SCHEDE.map(([chiave, etichetta]) => (
            <button key={chiave} onClick={() => setActiveTab(chiave)} className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${activeTab === chiave ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-700'}`}>
              {etichetta}
            </button>
          ))}
          <button onClick={() => setMostraTagDefault(true)} className="px-4 py-1.5 rounded-full text-xs font-medium transition bg-white border border-stone-200 text-stone-700 hover:border-stone-400">
            🏷️ Tag
          </button>
        </div>

        <div className="md:hidden flex items-center justify-between gap-2 w-full">
          <button
            onClick={() => setMenuSchedeAperto(true)}
            aria-haspopup="dialog"
            className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium bg-white border border-stone-200 text-stone-800 min-w-0"
          >
            <span className="truncate">{SCHEDE.find(([chiave]) => chiave === activeTab)?.[1]}</span>
            <span aria-hidden="true" className="text-stone-400">▾</span>
          </button>
          <button onClick={() => setMostraTagDefault(true)} className="px-3.5 py-2 rounded-full text-xs font-medium bg-white border border-stone-200 text-stone-700 flex-shrink-0">
            🏷️ Tag
          </button>
        </div>
      </div>

      <ActionSheet
        aperto={menuSchedeAperto}
        onChiudi={() => setMenuSchedeAperto(false)}
        titolo="Vista della dashboard"
        azioni={SCHEDE.map(([chiave, etichetta]) => ({ chiave, etichetta, attiva: activeTab === chiave, onSeleziona: () => setActiveTab(chiave) }))}
      />

      {mostraTagDefault && <GestioneTagDefault passcode={passcodeAttivo} corsoId={corso.id} onChiudi={() => setMostraTagDefault(false)} />}

      {erroreCasi && (
        <p role="alert" className="mx-6 mt-3 text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl p-3 flex-shrink-0">
          {erroreCasi}
        </p>
      )}

      {activeTab === 'matrice' && (
        <div className="flex-1 flex relative overflow-hidden">
          <div
            ref={mappa.viewportRef}
            {...mappa.gestori}
            tabIndex={0}
            role="application"
            aria-roledescription="mappa"
            aria-label="Matrice dei casi studio: trascina per spostarti, rotella o pizzico per lo zoom, tasti + − 0 e frecce"
            onDragOver={e => e.preventDefault()}
            style={mobile ? { marginBottom: ALTEZZA_PEEK } : undefined}
            className="flex-1 relative bg-stone-100 md:border-r border-stone-200 overflow-hidden touch-none cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-900"
          >
            {/* Il "mondo" della matrice: si allarga con lo zoom e si sposta
                con la vista, mentre le schede restano della stessa
                dimensione sullo schermo (come i segnaposto di una mappa). */}
            <div
              ref={matrixRef}
              className="absolute bg-[#FCFBF9]"
              style={{
                left: `${vista.x * 100}%`,
                top: `${vista.y * 100}%`,
                width: `${vista.zoom * 100}%`,
                height: `${vista.zoom * 100}%`,
                backgroundImage: 'linear-gradient(to right, rgba(120,113,108,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(120,113,108,0.08) 1px, transparent 1px)',
                backgroundSize: '12.5% 12.5%',
                transition: mappa.animata ? 'left 0.3s ease, top 0.3s ease, width 0.3s ease, height 0.3s ease' : 'none',
              }}
            >
            <div className="absolute inset-x-0 top-1/2 border-b border-stone-300/60 z-0"></div>
            <div className="absolute inset-y-0 left-1/2 border-r border-stone-300/60 z-0"></div>

            <span className="absolute top-3 left-3 md:top-6 md:left-8 text-[9px] md:text-[11px] font-bold uppercase tracking-widest text-stone-400 z-0 pointer-events-none">1. {et('desiderabilita')}</span>
            <span className="absolute top-3 right-3 md:top-6 md:right-8 text-[9px] md:text-[11px] font-bold uppercase tracking-widest text-stone-400 z-0 pointer-events-none">2. {et('fattibilita')}</span>
            <span className="absolute bottom-10 left-3 md:bottom-6 md:left-8 text-[9px] md:text-[11px] font-bold uppercase tracking-widest text-stone-400 z-0 pointer-events-none">3. {et('responsabilita')}</span>
            <span className="absolute bottom-10 right-3 md:bottom-6 md:right-8 text-[9px] md:text-[11px] font-bold uppercase tracking-widest text-stone-400 z-0 pointer-events-none">4. {et('vitalita')}</span>

            {casiFiltrati.map(c => {
              const left = `${((c.x + 100) / 200) * 100}%`;
              const top = `${((-c.y + 100) / 200) * 100}%`;
              const isSelected = selezionato?.id === c.id;
              const inEvidenza = casoHoverId === c.id;
              const off = offsetSparso[c.id] || { dx: 0, dy: 0 };
              const scala = isSelected || inEvidenza ? 1.05 : 1;

              return (
                <div
                  key={c.id}
                  data-caso={c.id}
                  draggable={!mobile}
                  onDragEnd={(e) => aggiornaPosizioneDaDrop(e, c.id)}
                  onClick={() => {
                    if (mappa.eraSpostamento()) return;
                    setSelezionato(c); setAiCritica(''); if (mobile) setStatoPannello('medio');
                  }}
                  onMouseEnter={() => setCasoHoverId(c.id)}
                  onMouseLeave={() => setCasoHoverId(null)}
                  style={{ left, top, transform: `translate(calc(-50% + ${off.dx}px), calc(-50% + ${off.dy}px)) scale(${scala})` }}
                  className={`absolute cursor-grab active:cursor-grabbing transition-all duration-150 p-2.5 rounded-2xl bg-white border flex items-center space-x-2.5 max-w-[200px] max-md:p-1.5 max-md:space-x-0 ${
                    isSelected
                      ? 'border-stone-900 shadow-2xl z-30'
                      : inEvidenza
                        ? 'border-amber-300 ring-2 ring-amber-200 shadow-lg z-20'
                        : c.scelto > 0
                          ? 'border-amber-300 shadow-md z-10'
                          : 'border-stone-200 shadow-md hover:border-stone-400 z-10'
                  }`}
                >
                  {c.scelto > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border border-amber-300 flex items-center justify-center shadow-sm">
                      <StellaScelto valore={c.scelto} className="text-[9px]" />
                    </span>
                  )}
                  {c.immagine ? (
                    <div className="w-9 h-9 max-md:w-8 max-md:h-8 rounded-xl bg-stone-100 border border-stone-200 overflow-hidden flex items-center justify-center flex-shrink-0 p-0.5">
                      <img src={c.immagine} alt={c.titolo} title={mobile ? `${c.titolo} · G.${c.gruppoNum}` : undefined} loading="lazy" decoding="async" className="max-w-full max-h-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-9 h-9 max-md:w-8 max-md:h-8 rounded-xl bg-stone-100 flex items-center justify-center text-[10px] font-bold text-stone-400 flex-shrink-0">IMG</div>
                  )}
                  {/* Da smartphone la scheda in matrice si riduce alla sola
                      miniatura: titolo e gruppo sono nel pannello dal basso. */}
                  <div className="overflow-hidden max-md:hidden">
                    <div className="text-xs font-bold truncate text-stone-900">{c.titolo}</div>
                    <div className="text-[9px] text-stone-500 truncate">G.{c.gruppoNum} &middot; {c.gruppoNome}</div>
                    {testoMeta(c.anno, c.provenienza) && (
                      <div className="text-[9px] text-stone-400 truncate tabular-nums">{testoMeta(c.anno, c.provenienza)}</div>
                    )}
                  </div>
                </div>
              );
            })}

            </div>

            <div className="absolute top-9 inset-x-3 md:inset-x-auto md:top-16 md:left-8 z-20 flex items-center gap-2">
              <select
                value={filtroTag}
                onChange={e => setFiltroTag(e.target.value)}
                className="text-[11px] border border-stone-300 rounded-full px-3 py-1.5 bg-white/90 backdrop-blur shadow-sm focus:outline-none focus:border-stone-900 max-md:max-w-[45%]"
              >
                <option value="">Tutti i tag ({casi.length})</option>
                {tuttiITag.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
              <label htmlFor="ricerca-matrice" className="sr-only">Cerca per titolo o gruppo</label>
              <input
                id="ricerca-matrice"
                type="search"
                value={ricercaMatrice}
                onChange={e => setRicercaMatrice(e.target.value)}
                placeholder="🔍 Cerca titolo o gruppo..."
                className="text-[11px] border border-stone-300 rounded-full px-3 py-1.5 bg-white/90 backdrop-blur shadow-sm focus:outline-none focus:border-stone-900 w-44 max-md:flex-1 max-md:min-w-0"
              />
            </div>

            {casiFiltrati.length === 0 && !erroreCasi && (
              <div className="absolute z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-stone-400 text-xs bg-white/80 backdrop-blur px-6 py-3 rounded-2xl border border-stone-200 shadow-sm">
                {casi.length === 0
                  ? <>Nessun caso studio registrato. Vai su &quot;Area Studenti&quot; per inserire le consegne.</>
                  : <>Nessun caso studio corrisponde ai filtri applicati.</>}
              </div>
            )}

            <ControlliMappa
              mappa={mappa}
              casi={casiFiltrati}
              selezionato={selezionato}
              mobile={mobile}
            />

            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 text-[10px] text-stone-500 bg-white/90 backdrop-blur px-3.5 py-1.5 rounded-full border border-stone-200 shadow-sm whitespace-nowrap max-md:max-w-[calc(100%-1.5rem)] max-md:truncate">
              {casi.length.toLocaleString('it-IT')} {casi.length === 1 ? 'caso studio trovato' : 'casi studio trovati'}
              {' '}&middot;{' '}
              {tuttiITag.length.toLocaleString('it-IT')} {tuttiITag.length === 1 ? 'tema diverso' : 'temi diversi'}
              {tempoCaricamentoMs !== null && (
                <>
                  {' '}&middot;{' '}
                  caricati in {(tempoCaricamentoMs / 1000).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}s
                </>
              )}
            </div>
          </div>

          {mobile ? (
            <SlidingPanel
              stato={statoPannello}
              onCambiaStato={setStatoPannello}
              etichetta="Scheda del caso studio selezionato"
              altezzaPeek={ALTEZZA_PEEK}
              intestazione={intestazioneDettaglio}
            >
              {selezionato ? corpoDettaglio : (
                <p className="text-xs text-stone-400 text-center py-6">Tocca un caso studio sulla matrice per aprire la scheda di commento.</p>
              )}
            </SlidingPanel>
          ) : (
            <>
              <div
                onMouseDown={iniziaTrascinamentoDettaglio}
                role="separator"
                aria-orientation="vertical"
                aria-label="Ridimensiona il pannello di dettaglio"
                className="w-1.5 cursor-col-resize bg-stone-200/60 hover:bg-stone-400 active:bg-stone-500 transition-colors flex-shrink-0 z-20"
              />

              <div style={{ width: larghezzaPannelloDettaglio }} className="bg-[#FBF9F5] border-l border-stone-200 p-6 flex flex-col justify-between overflow-y-auto z-20 flex-shrink-0">
                {selezionato ? (
                  <div className="space-y-5">
                    {intestazioneDettaglio}
                    {corpoDettaglio}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs text-stone-400 text-center px-4">
                    Seleziona o trascina un caso studio sulla matrice per aprire la scheda di commento.
                  </div>
                )}

                <div className="border-t border-stone-200 pt-3 mt-4 text-[10px] text-stone-400 text-center">
                  Trascina le schede per riposizionarle, lo sfondo per spostarti; rotella o doppio clic per lo zoom.
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'slides' && (
        <div className="printable-area flex-1 p-4 md:p-12 overflow-y-auto bg-stone-200 space-y-6 md:space-y-12">
          <div className="print:hidden max-w-4xl mx-auto flex flex-col md:flex-row gap-4 md:justify-between md:items-center bg-white p-5 md:p-6 rounded-2xl shadow-sm">
            <div>
              <h2 className="text-xl font-serif font-bold">Anteprima Pacchetto Slide (PDF)</h2>
              <p className="text-xs text-stone-500 mt-0.5">Ogni caso studio è impaginato come slide orizzontale indipendente. Clicca sotto per stampare o salvare in PDF.</p>
            </div>
            <button 
              onClick={() => window.print()}
              className="bg-stone-900 text-white px-6 py-2.5 rounded-xl text-xs font-medium hover:bg-stone-800 transition shadow-sm"
            >
              🖨️ Stampa / Salva PDF delle Slide
            </button>
          </div>

          <div className="space-y-6 md:space-y-12 max-w-4xl mx-auto">
            {casi.length === 0 ? (
              <div className="bg-white p-12 rounded-2xl text-center text-stone-400 text-sm">Nessun caso studio disponibile per le slide.</div>
            ) : (
              casi.map((c, index) => (
                <div key={c.id} className="bg-white md:min-h-[28rem] print:min-h-[28rem] p-5 md:p-10 print:p-10 rounded-2xl shadow-lg border border-stone-300 flex flex-col page-break">
                  <div className="flex flex-wrap gap-2 justify-between items-center border-b border-stone-200 pb-3">
                    <span className="text-xs uppercase tracking-widest text-stone-400 font-bold">{corso.nome} &middot; Scheda {index + 1} di {casi.length}</span>
                    <div className="flex items-center gap-2">
                      <StellaScelto valore={c.scelto} onCambia={v => impostaScelto(c, v)} className="text-lg" />
                      <span className="text-xs bg-stone-900 text-white px-3 py-1 rounded-full font-medium flex items-center gap-1">
                        <StellaScelto valore={c.scelto} />
                        Gruppo {c.gruppoNum} &mdash; {c.gruppoNome}
                      </span>
                    </div>
                  </div>

                  {/* Il testo va visto per intero anche a costo di allungare la
                      scheda oltre un formato 16:9: niente più troncamenti né
                      altezze massime qui. */}
                  <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-5 md:gap-8 my-6">
                    <div className="space-y-2.5 min-w-0">
                      <h2 className="text-2xl font-serif font-bold text-stone-900">{c.titolo}</h2>
                      <MetaCaso anno={c.anno} provenienza={c.provenienza} />
                      <p className="text-xs text-stone-600 leading-relaxed bg-stone-50 p-3 rounded-xl border border-stone-200 whitespace-pre-wrap">
                        {c.descrizione || "Nessuna descrizione fornita."}
                      </p>
                      <FonteCaso fonte={c.fonte} />
                      <div className="grid grid-cols-2 gap-1.5">
                        {DRIVER.map(([chiave, etichetta]) => {
                          const nota = c.driverNote?.[chiave];
                          return (
                            <div key={chiave} className="bg-stone-50 p-2 rounded-lg border border-stone-200 text-[11px]">
                              <div className="flex justify-between">
                                <span className="font-medium text-stone-600">{etichetta}</span>
                                <b>{c.driver?.[chiave]}/{MAX_DRIVER}</b>
                              </div>
                              {nota && (
                                <p className="text-[10px] text-stone-500 italic mt-0.5 border-t border-stone-200 pt-0.5">&ldquo;{nota}&rdquo;</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="min-h-[12rem] md:min-h-[15rem] bg-stone-100 rounded-2xl max-md:order-first print:order-none border border-stone-200 flex items-center justify-center p-4 overflow-hidden">
                      {c.immagine ? (
                        <img src={c.immagine} alt={c.titolo} loading="lazy" decoding="async" className="max-w-full max-h-full object-contain rounded-lg" />
                      ) : (
                        <span className="text-xs text-stone-400">Nessuna immagine</span>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-stone-200 pt-3 flex flex-wrap gap-1 justify-between items-center text-[10px] text-stone-400">
                    <span>Framework {config.framework}</span>
                    <span>Coordinate Matrice &mdash; X: {c.x}, Y: {c.y}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'analitica' && (
        <div className="flex-1 p-4 md:p-8 overflow-y-auto max-w-6xl mx-auto w-full space-y-6">
          <div>
            <h2 className="text-2xl font-serif">Analitica e Cluster dei Casi Studio</h2>
            <p className="text-stone-500 text-xs mt-1">Raggruppamento automatico dei progetti in base alle affinità di posizionamento strategico.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-4 md:p-6 rounded-2xl border border-stone-200 shadow-sm space-y-3">
              <h3 className="font-serif font-bold text-sm text-emerald-800">🚀 {titoliCluster.innovatori} ({clusters.innovatori.length})</h3>
              <div className="space-y-2 pt-2">
                {clusters.innovatori.map(c => (
                  <button key={c.id} onClick={() => setCasoEspansoCluster(c)} className="w-full p-3 bg-stone-50 hover:bg-stone-100 hover:border-stone-300 rounded-xl border border-stone-200 text-xs flex justify-between items-center text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900">
                    <span><b>{c.titolo}</b> (Gruppo {c.gruppoNum}){testoMeta(c.anno, c.provenienza) && <span className="text-stone-400"> &middot; {testoMeta(c.anno, c.provenienza)}</span>}</span>
                    <span className="text-[10px] bg-stone-200 px-2 py-0.5 rounded flex-shrink-0 ml-2">X: {c.x}, Y: {c.y}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white p-4 md:p-6 rounded-2xl border border-stone-200 shadow-sm space-y-3">
              <h3 className="font-serif font-bold text-sm text-blue-800">🌍 {titoliCluster.sociali} ({clusters.sociali.length})</h3>
              <div className="space-y-2 pt-2">
                {clusters.sociali.map(c => (
                  <button key={c.id} onClick={() => setCasoEspansoCluster(c)} className="w-full p-3 bg-stone-50 hover:bg-stone-100 hover:border-stone-300 rounded-xl border border-stone-200 text-xs flex justify-between items-center text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900">
                    <span><b>{c.titolo}</b> (Gruppo {c.gruppoNum}){testoMeta(c.anno, c.provenienza) && <span className="text-stone-400"> &middot; {testoMeta(c.anno, c.provenienza)}</span>}</span>
                    <span className="text-[10px] bg-stone-200 px-2 py-0.5 rounded flex-shrink-0 ml-2">X: {c.x}, Y: {c.y}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white p-4 md:p-6 rounded-2xl border border-stone-200 shadow-sm space-y-3">
              <h3 className="font-serif font-bold text-sm text-amber-800">⚙️ {titoliCluster.strategici} ({clusters.strategici.length})</h3>
              <div className="space-y-2 pt-2">
                {clusters.strategici.map(c => (
                  <button key={c.id} onClick={() => setCasoEspansoCluster(c)} className="w-full p-3 bg-stone-50 hover:bg-stone-100 hover:border-stone-300 rounded-xl border border-stone-200 text-xs flex justify-between items-center text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900">
                    <span><b>{c.titolo}</b> (Gruppo {c.gruppoNum}){testoMeta(c.anno, c.provenienza) && <span className="text-stone-400"> &middot; {testoMeta(c.anno, c.provenienza)}</span>}</span>
                    <span className="text-[10px] bg-stone-200 px-2 py-0.5 rounded flex-shrink-0 ml-2">X: {c.x}, Y: {c.y}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white p-4 md:p-6 rounded-2xl border border-stone-200 shadow-sm space-y-3">
              <h3 className="font-serif font-bold text-sm text-purple-800">💡 {titoliCluster.esplorativi} ({clusters.esplorativi.length})</h3>
              <div className="space-y-2 pt-2">
                {clusters.esplorativi.map(c => (
                  <button key={c.id} onClick={() => setCasoEspansoCluster(c)} className="w-full p-3 bg-stone-50 hover:bg-stone-100 hover:border-stone-300 rounded-xl border border-stone-200 text-xs flex justify-between items-center text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900">
                    <span><b>{c.titolo}</b> (Gruppo {c.gruppoNum}){testoMeta(c.anno, c.provenienza) && <span className="text-stone-400"> &middot; {testoMeta(c.anno, c.provenienza)}</span>}</span>
                    <span className="text-[10px] bg-stone-200 px-2 py-0.5 rounded flex-shrink-0 ml-2">X: {c.x}, Y: {c.y}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {casoEspansoCluster && (
        <BottomSheet
          aperto
          onChiudi={() => setCasoEspansoCluster(null)}
          etichetta={`Dettaglio esteso: ${casoEspansoCluster.titolo}`}
          larghezzaDesktop="md:max-w-3xl md:rounded-3xl"
          classePannello=""
        >
            <div className="h-56 md:h-80 bg-stone-100 flex items-center justify-center p-4 md:p-6 md:rounded-t-3xl relative">
              {casoEspansoCluster.immagine ? (
                <img src={casoEspansoCluster.immagine} alt={casoEspansoCluster.titolo} className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-sm text-stone-400">Nessuna immagine disponibile</span>
              )}
              <button
                onClick={() => setCasoEspansoCluster(null)}
                aria-label="Chiudi dettaglio"
                className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center text-stone-600 hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
              >
                ✕
              </button>
            </div>

            <div className="p-5 md:p-8 space-y-5">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">Gruppo {casoEspansoCluster.gruppoNum} &middot; {casoEspansoCluster.gruppoNome}</span>
                  <h2 className="text-2xl md:text-3xl font-serif font-bold mt-1">{casoEspansoCluster.titolo}</h2>
                  <MetaCaso anno={casoEspansoCluster.anno} provenienza={casoEspansoCluster.provenienza} className="mt-2" />
                </div>
              </div>

              {casoEspansoCluster.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {casoEspansoCluster.tags.map((tag: string) => (
                    <span key={tag} className="text-[10px] bg-stone-100 border border-stone-200 px-2.5 py-1 rounded-full text-stone-600 font-medium">{tag}</span>
                  ))}
                </div>
              )}

              <p className="text-sm text-stone-700 leading-relaxed bg-stone-50 p-5 rounded-2xl border border-stone-200">
                {casoEspansoCluster.descrizione || 'Nessuna descrizione inserita.'}
              </p>
              <FonteCaso fonte={casoEspansoCluster.fonte} />

              <div className="space-y-3">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Driver {config.framework} (scala 0-{MAX_DRIVER})</h3>
                <div className="space-y-2.5">
                  {DRIVER.map(([chiave, etichetta]) => {
                    const valore = casoEspansoCluster.driver?.[chiave] ?? 0;
                    const nota = casoEspansoCluster.driverNote?.[chiave];
                    return (
                      <div key={chiave}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-stone-600 font-medium">{etichetta}</span>
                          <span className="font-bold">{valore}</span>
                        </div>
                        <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-stone-900 transition-all duration-500"
                            style={{ width: `${(valore / MAX_DRIVER) * 100}%` }}
                          />
                        </div>
                        {nota && (
                          <p className="text-[11px] text-stone-500 italic mt-1.5">&ldquo;{nota}&rdquo;</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
        </BottomSheet>
      )}

      {activeTab === 'controllo' && (
        <div className="flex-1 p-4 md:p-8 overflow-y-auto max-w-xl mx-auto w-full space-y-6">
          {successoReimposta && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm flex items-start justify-between space-x-3">
              <div>
                <p className="font-medium text-emerald-800">Nuovo codice per &ldquo;{successoReimposta.titolo}&rdquo;</p>
                <p className="text-emerald-700 mt-1">Comunica questo codice al gruppo: <b className="font-mono bg-white px-2 py-0.5 rounded border border-emerald-200">{successoReimposta.codice}</b></p>
              </div>
              <button onClick={() => setSuccessoReimposta(null)} aria-label="Chiudi" className="text-emerald-600 hover:text-emerald-900 text-xs flex-shrink-0">✕</button>
            </div>
          )}

          <div className="bg-white p-5 md:p-8 rounded-2xl border border-stone-200 shadow-sm space-y-6">
            <div>
              <h2 className="text-2xl font-serif text-center">Pannello di Controllo &amp; Sicurezza</h2>
              <p className="text-stone-500 text-xs mt-1 text-center">Gestisci il reset protetto del database locale.</p>
            </div>

            <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-600 text-center">
              Casi studio attivi memorizzati: <b>{casi.length}</b>
            </div>

            <form onSubmit={resettaTuttoConPassword} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Password per Reset Totale</label>
                <input
                  type="password"
                  value={passwordReset}
                  onChange={e => setPasswordReset(e.target.value)}
                  placeholder="Inserisci password..."
                  className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50 focus:outline-none focus:border-stone-900"
                  required
                />
              </div>

              {erroreReset && (
                <p className="text-xs text-red-600 font-medium text-center">Password errata. Impossibile procedere al reset.</p>
              )}

              {successoReset && (
                <p className="text-xs text-emerald-600 font-medium text-center">Piattaforma resettata con successo!</p>
              )}

              <button
                type="submit"
                className="w-full bg-red-600 text-white py-3 rounded-xl font-medium hover:bg-red-700 transition shadow-sm text-xs"
              >
                Conferma e Svuota Database Piattaforma
              </button>
            </form>
          </div>

          <div className="bg-white p-5 md:p-8 rounded-2xl border border-stone-200 shadow-sm space-y-4">
            <div>
              <h2 className="text-lg font-serif font-bold">Gestione Codici di Gruppo</h2>
              <p className="text-stone-500 text-xs mt-1">I codici non sono mai leggibili (nemmeno da qui): se un gruppo lo dimentica, imposta qui uno nuovo e comunicaglielo.</p>
            </div>

            {casi.length === 0 ? (
              <p className="text-xs text-stone-400 text-center py-4">Nessun caso studio registrato.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {casi.map(c => (
                  <div key={c.id} className="flex items-center justify-between bg-stone-50 border border-stone-200 rounded-xl p-3">
                    <div className="overflow-hidden">
                      <p className="text-sm font-medium truncate">{c.titolo}</p>
                      <p className="text-xs text-stone-500">Gruppo {c.gruppoNum} — {c.gruppoNome}</p>
                    </div>
                    <button
                      onClick={() => { setCasoDaReimpostare(c); setNuovoCodice(''); setErroreReimposta(''); }}
                      className="text-xs bg-white border border-stone-300 hover:border-stone-500 px-3 py-2 rounded-xl font-medium transition flex-shrink-0 ml-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
                    >
                      Reimposta codice
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {casoDaReimpostare && (
        <BottomSheet
          aperto
          onChiudi={() => setCasoDaReimpostare(null)}
          etichetta={`Reimposta codice: ${casoDaReimpostare.titolo}`}
          larghezzaDesktop="md:max-w-sm"
        >
            <div>
              <h2 className="font-serif font-bold text-lg">Nuovo codice di gruppo</h2>
              <p className="text-xs text-stone-500 mt-1">
                Stai per sostituire il codice di &ldquo;{casoDaReimpostare.titolo}&rdquo; (Gruppo {casoDaReimpostare.gruppoNum}). Il vecchio codice smetterà di funzionare.
              </p>
            </div>

            <form onSubmit={e => { e.preventDefault(); confermaReimpostaCodice(); }}>
              <label htmlFor="nuovo-codice" className="sr-only">Nuovo codice</label>
              <input
                id="nuovo-codice"
                type="text"
                autoFocus
                minLength={4}
                value={nuovoCodice}
                onChange={e => setNuovoCodice(e.target.value)}
                placeholder="Nuovo codice (min. 4 caratteri)..."
                className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900"
              />

              {erroreReimposta && (
                <p role="alert" className="text-xs text-red-600 font-medium mt-2 bg-red-50 border border-red-200 rounded-xl p-2.5">{erroreReimposta}</p>
              )}

              <div className="flex space-x-2 mt-4">
                <button
                  type="button"
                  onClick={() => setCasoDaReimpostare(null)}
                  className="flex-1 bg-stone-100 hover:bg-stone-200 transition text-xs font-medium py-2.5 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={reimpostaInCorso}
                  className="flex-1 bg-stone-900 text-white hover:bg-stone-800 transition text-xs font-medium py-2.5 rounded-xl disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
                >
                  {reimpostaInCorso ? 'Salvataggio...' : 'Reimposta'}
                </button>
              </div>
            </form>
        </BottomSheet>
      )}

    </div>
  );
}