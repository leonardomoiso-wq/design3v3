'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizzaDriver, estraiNote, MAX_DRIVER, type NoteDriver } from '@/lib/driver';
import { caricaCasiConCache, aggiornaCacheCaso, rimuoviCasoDallaCache } from '@/lib/cacheCasi';
import { useDocente } from '@/lib/docente-context';
import { ascoltaCorso } from '@/lib/realtime';
import { usePannelloRidimensionabile } from '@/lib/useRidimensionabile';
import StellaScelto from '@/components/StellaScelto';
import { MetaCaso, FonteCaso, metaDaRiga, testoMeta, type Provenienza } from '@/components/MetaCaso';
import { BottomSheet, ActionSheet, SlidingPanel, type StatoPannello } from '@/components/PannelliMobile';
import { useMobile } from '@/lib/useMobile';

type Caso = {
  id: number;
  gruppoNome: string;
  gruppoNum: number;
  titolo: string;
  descrizione: string;
  immagine: string;
  tags: string[];
  driver: { desiderabilita: number; fattibilita: number; responsabilita: number; vitalita: number };
  driverNote: NoteDriver;
  scelto: number;
  anno: number | null;
  provenienza: Provenienza | null;
  fonte: string;
};

// Numero di assi del radar: sempre 4 driver (le etichette vengono dal corso).
const NUMERO_ASSI = 4;

// Palette categorica validata (8 tonalità, ordine fisso, CVD-safe): vedi
// il capitolo colore della skill dataviz. La precedente era scelta a
// occhio e falliva la verifica (due viola quasi indistinguibili anche a
// vista normale) — questa passa lightness/chroma/CVD/contrasto.
const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const LIMITE_ATTIVI_DEFAULT = 6;
const LIMITE_ATTIVI_MIN = 2;
const LIMITE_ATTIVI_MAX = 10;

const RAGGIO = 200;
const LABEL_OFFSET = 32;
const MARGINE_ETICHETTA = 90; // spazio per testo come "RESPONSABILITÀ" senza tagli
const CENTRO = RAGGIO + LABEL_OFFSET + MARGINE_ETICHETTA;
const TAGLIA_SVG = CENTRO * 2;

function puntoAsse(indice: number, valore: number) {
  const angolo = (Math.PI * 2 * indice) / NUMERO_ASSI - Math.PI / 2;
  const distanza = (valore / MAX_DRIVER) * RAGGIO;
  return {
    x: CENTRO + distanza * Math.cos(angolo),
    y: CENTRO + distanza * Math.sin(angolo),
  };
}

function puntoEtichetta(indice: number) {
  const angolo = (Math.PI * 2 * indice) / NUMERO_ASSI - Math.PI / 2;
  const distanza = RAGGIO + LABEL_OFFSET;
  return {
    x: CENTRO + distanza * Math.cos(angolo),
    y: CENTRO + distanza * Math.sin(angolo),
  };
}

type Hover = { x: number; y: number; etichetta: string; valore: number; titolo: string; colore: string };

export default function RadarPage() {
  const { corso } = useDocente();
  const ASSI = corso.configurazione.driver.map(d => ({ chiave: d.chiave, etichetta: d.etichetta }));
  const [casi, setCasi] = useState<Caso[]>([]);
  const [attivi, setAttivi] = useState<number[]>([]);
  const [filtroTag, setFiltroTag] = useState('');
  const [filtroDriver, setFiltroDriver] = useState<'nessuno' | 'desiderabilita' | 'fattibilita' | 'responsabilita' | 'vitalita'>('nessuno');
  const [hover, setHover] = useState<Hover | null>(null);
  const [casoHoverId, setCasoHoverId] = useState<number | null>(null);
  const [casoEspanso, setCasoEspanso] = useState<Caso | null>(null);
  const [ricerca, setRicerca] = useState('');
  const [limiteRaggiunto, setLimiteRaggiunto] = useState(false);
  const [limiteAttivi, setLimiteAttivi] = useState(LIMITE_ATTIVI_DEFAULT);
  const [erroreCasi, setErroreCasi] = useState('');
  const { larghezza: larghezzaElenco, iniziaTrascinamento: iniziaTrascinamentoElenco } =
    usePannelloRidimensionabile('design3-radar-elenco-larghezza', 256, 200, 480, 'destra');
  const { larghezza: larghezzaDettaglio, iniziaTrascinamento: iniziaTrascinamentoDettaglio } =
    usePannelloRidimensionabile('design3-radar-dettaglio-larghezza', 416, 280, 720, 'sinistra');
  const cardRefs = useRef<Record<number, HTMLElement | null>>({});

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [trascinando, setTrascinando] = useState(false);

  const ZOOM_MIN = 0.6;
  const ZOOM_MAX = 3;

  const applicaZoom = (delta: number) => {
    setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))));
  };

  const resetVista = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Spostamento e zoom del radar con mouse, dito o due dita (pizzico).
  // Pointer events invece dei soli eventi mouse, così funziona anche da
  // smartphone; un trascinamento non deve poi aprire la scheda del
  // progetto sotto il dito.
  const radarRef = useRef<HTMLDivElement>(null);
  const puntatori = useRef(new Map<number, { x: number; y: number }>());
  const gestoRadar = useRef<{ inizio: { x: number; y: number }; distanza: number | null; spostato: boolean } | null>(null);
  const eraSpostamento = useRef(false);

  useEffect(() => {
    const el = radarRef.current;
    if (!el) return;
    // Listener non passivo: con onWheel di React preventDefault non basta
    // a bloccare lo scroll della pagina.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      applicaZoom(e.deltaY > 0 ? -0.15 : 0.15);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = puntatori.current;
      const g = gestoRadar.current;
      if (!g || !p.has(e.pointerId)) return;
      const prima = p.get(e.pointerId)!;
      p.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (p.size === 1) {
        if (!g.spostato && Math.hypot(e.clientX - g.inizio.x, e.clientY - g.inizio.y) < 6) return;
        g.spostato = true;
        setPan(v => ({ x: v.x + e.clientX - prima.x, y: v.y + e.clientY - prima.y }));
        return;
      }
      const [a, b] = Array.from(p.values());
      const distanza = Math.hypot(a.x - b.x, a.y - b.y);
      g.spostato = true;
      if (g.distanza) {
        const fattore = distanza / g.distanza;
        setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * fattore)));
      }
      g.distanza = distanza;
    };
    const onUp = (e: PointerEvent) => {
      const p = puntatori.current;
      if (!p.has(e.pointerId)) return;
      p.delete(e.pointerId);
      const g = gestoRadar.current;
      if (p.size === 0) {
        if (g) eraSpostamento.current = g.spostato;
        gestoRadar.current = null;
        setTrascinando(false);
      } else if (g) {
        g.inizio = Array.from(p.values())[0];
        g.distanza = null;
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDownRadar = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    puntatori.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gestoRadar.current) {
      eraSpostamento.current = false;
      gestoRadar.current = { inizio: { x: e.clientX, y: e.clientY }, distanza: null, spostato: false };
      setTrascinando(true);
    } else {
      gestoRadar.current.distanza = null;
    }
  };

  const apriScheda = (c: Caso) => {
    if (eraSpostamento.current) return;
    setCasoEspanso(c);
  };

  // Da smartphone: elenco progetti, ordinamento e filtri si aprono dal
  // basso, il dettaglio dei progetti attivi è un pannello scorrevole.
  const mobile = useMobile();
  const [statoPannello, setStatoPannello] = useState<StatoPannello>('peek');
  const [elencoAperto, setElencoAperto] = useState(false);
  const [ordinaAperto, setOrdinaAperto] = useState(false);
  const [filtriAperti, setFiltriAperti] = useState(false);
  const ALTEZZA_PEEK = 84;

  useEffect(() => {
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
      scelto: Number(c.scelto) || 0,
      ...metaDaRiga(c),
    });

    const carica = async () => {
      // Usa la cache locale del browser: riscarica solo i casi studio nuovi
      // o modificati dall'ultima visita, e a piccoli blocchi (non tutti
      // insieme) così anche una connessione lenta vede i casi studio
      // comparire man mano invece di aspettare tutto o niente.
      const { righe, errore } = await caricaCasiConCache(corso.id, correnti => {
        setErroreCasi('');
        setCasi(correnti.map(formattaCaso));
      });
      if (errore) {
        setErroreCasi(`Errore nel caricamento dei casi studio: ${errore}`);
        return;
      }
      setErroreCasi('');
      setCasi(righe.map(formattaCaso));
    };
    carica();

    // Aggiorna solo la riga toccata invece di riscaricare l'intera tabella
    // (immagini comprese) a ogni modifica di un gruppo qualsiasi.
    const channel = ascoltaCorso(supabase.channel(`realtime-radar-${corso.id}`), 'casi_studio', corso.id, (payload: any) => {
        if (payload.eventType === 'DELETE') {
          const idEliminato = Number(payload.old?.id);
          setCasi(prev => prev.filter((c: any) => c.id !== idEliminato));
          rimuoviCasoDallaCache(idEliminato);
          return;
        }
        const aggiornato = formattaCaso(payload.new);
        setCasi(prev => {
          const esistente = prev.find((c: any) => c.id === aggiornato.id);
          // Un aggiornamento che non tocca l'immagine può arrivare via
          // realtime senza quel valore: si preserva quella già mostrata
          // invece di farla sparire.
          const finale = esistente && !aggiornato.immagine && esistente.immagine
            ? { ...aggiornato, immagine: esistente.immagine }
            : aggiornato;
          return esistente ? prev.map((c: any) => (c.id === finale.id ? finale : c)) : [...prev, finale];
        });
        aggiornaCacheCaso(payload.new);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tuttiITag = useMemo(() => Array.from(new Set(casi.flatMap(c => c.tags || []))).sort(), [casi]);

  const casiFiltrati = useMemo(() => {
    let lista = filtroTag ? casi.filter(c => (c.tags || []).includes(filtroTag)) : casi;
    if (ricerca.trim()) {
      const q = ricerca.trim().toLowerCase();
      // Una ricerca di soli numeri ("4") è chiaramente un numero di gruppo,
      // non un pezzo di titolo o nome: la si tratta come tale (uguaglianza
      // esatta, niente titolo/nome) invece che come sottostringa da cercare
      // ovunque, dove "4" comparirebbe anche dentro un titolo o un gruppo
      // 14/24/40.
      if (/^\d+$/.test(q)) {
        lista = lista.filter(c => String(c.gruppoNum) === q);
      } else {
        lista = lista.filter(c =>
          c.titolo.toLowerCase().includes(q) ||
          c.gruppoNome.toLowerCase().includes(q)
        );
      }
    }
    if (filtroDriver !== 'nessuno') {
      lista = [...lista]
        .sort((a, b) => (b.driver?.[filtroDriver] ?? 0) - (a.driver?.[filtroDriver] ?? 0))
        .slice(0, 5);
    }
    return lista;
  }, [casi, filtroTag, filtroDriver, ricerca]);

  useEffect(() => {
    setAttivi(casiFiltrati.slice(0, Math.min(5, limiteAttivi)).map(c => c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casiFiltrati]);

  const toggleAttivo = (id: number) => {
    setAttivi(prev => {
      if (prev.includes(id)) return prev.filter(a => a !== id);
      if (prev.length >= limiteAttivi) {
        setLimiteRaggiunto(true);
        setTimeout(() => setLimiteRaggiunto(false), 2500);
        return prev;
      }
      return [...prev, id];
    });
  };

  const cambiaLimiteAttivi = (nuovoLimite: number) => {
    setLimiteAttivi(nuovoLimite);
    // Se il nuovo limite è più basso di quanti progetti sono già attivi,
    // si tengono solo i primi (quelli aggiunti prima) invece di lasciare
    // uno stato incoerente (più attivi del limite appena scelto).
    setAttivi(prev => prev.slice(0, nuovoLimite));
  };

  const casiAttivi = casiFiltrati.filter(c => attivi.includes(c.id));
  // Il colore segue l'id del caso studio, mai la sua posizione nell'elenco
  // filtrato: altrimenti cambiare ricerca/filtro "ridipingerebbe" i
  // progetti già selezionati, confondendo chi li sta confrontando.
  const coloreDi = (id: number) => PALETTE[id % PALETTE.length];

  // Più si zooma, più le linee/punti in unità SVG vanno assottigliati: la
  // trasformazione CSS le scala comunque, e a zoom alto uno spessore fisso
  // diventerebbe un blob che nasconde i punti vicini impedendo di
  // selezionarli con precisione.
  const spessoreLinea = Math.max(0.6, Math.min(3, 2 / zoom));
  const raggioBase = Math.max(1.5, Math.min(5, 3.5 / zoom));
  const raggioHover = Math.max(2.5, Math.min(9, 6 / zoom));

  useEffect(() => {
    if (casoHoverId === null) return;
    cardRefs.current[casoHoverId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [casoHoverId]);

  const ordinamentoCorrente = filtroDriver === 'nessuno' ? 'Ordina' : `Top 5 · ${ASSI.find(a => a.chiave === filtroDriver)?.etichetta}`;

  const elencoProgetti = (
    <>
          <label htmlFor="radar-ricerca" className="sr-only">Cerca per titolo o gruppo</label>
          <input
            id="radar-ricerca"
            type="text"
            value={ricerca}
            onChange={e => setRicerca(e.target.value)}
            placeholder="Cerca titolo o gruppo..."
            className="w-full text-xs border border-stone-200 rounded-full px-3 py-2 bg-white mb-2 focus:outline-none focus:ring-2 focus:ring-stone-900"
          />
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 px-1 pb-1">Progetti ({casiFiltrati.length})</h2>
          <p className="text-[10px] text-stone-400 px-1 pb-1">{attivi.length}/{limiteAttivi} attivi sul radar</p>
          {limiteRaggiunto && (
            <p role="alert" className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 mb-1">
              Massimo {limiteAttivi} progetti insieme, oltre diventa illeggibile. Deselezionane uno per aggiungerne un altro (o alza il limite qui sopra).
            </p>
          )}
          {casiFiltrati.length === 0 && (
            <p className="text-xs text-stone-400 px-1">Nessun caso studio corrisponde alla ricerca.</p>
          )}
          {casiFiltrati.map(c => {
            const colore = coloreDi(c.id);
            const attivo = attivi.includes(c.id);
            const inEvidenza = casoHoverId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => toggleAttivo(c.id)}
                onMouseEnter={() => attivo && setCasoHoverId(c.id)}
                onMouseLeave={() => setCasoHoverId(null)}
                aria-pressed={attivo}
                className={`w-full flex items-center space-x-2.5 p-2.5 rounded-xl border text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 ${
                  inEvidenza
                    ? 'bg-amber-50 border-amber-300 shadow-sm'
                    : attivo
                      ? 'bg-white border-stone-300 shadow-sm'
                      : c.scelto > 0
                        ? 'bg-transparent border-amber-200 opacity-80 hover:opacity-100'
                        : 'bg-transparent border-transparent opacity-50 hover:opacity-80'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: attivo ? colore : '#d6d3d1' }}></span>
                <div className="overflow-hidden">
                  <div className="text-xs font-bold truncate text-stone-900 flex items-center gap-1">
                    <StellaScelto valore={c.scelto} />
                    <span className="truncate">{c.titolo}</span>
                  </div>
                  <div className="text-[10px] text-stone-500 truncate">G.{c.gruppoNum} &middot; {c.gruppoNome}{testoMeta(c.anno, c.provenienza) && <> &middot; {testoMeta(c.anno, c.provenienza)}</>}</div>
                </div>
              </button>
            );
          })}
    </>
  );

  const schedeAttive = (
    <>
          {casiAttivi.map(c => {
            const colore = coloreDi(c.id);
            const inEvidenza = casoHoverId === c.id;
            return (
              <button
                key={c.id}
                ref={el => { cardRefs.current[c.id] = el; }}
                onClick={() => setCasoEspanso(c)}
                onMouseEnter={() => setCasoHoverId(c.id)}
                onMouseLeave={() => setCasoHoverId(null)}
                className={`w-full text-left bg-white rounded-2xl border shadow-sm overflow-hidden transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 group ${inEvidenza ? 'border-amber-300 ring-2 ring-amber-200' : 'border-stone-200 hover:border-stone-400'}`}
              >
                <div className="h-28 bg-stone-100 flex items-center justify-center p-3 relative" style={{ borderBottom: `3px solid ${colore}` }}>
                  {c.immagine ? (
                    <img src={c.immagine} alt={c.titolo} loading="lazy" decoding="async" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <span className="text-[10px] text-stone-400">Nessuna immagine</span>
                  )}
                  <span className="absolute top-2 right-2 text-[10px] bg-white/90 backdrop-blur px-2 py-1 rounded-full font-medium opacity-0 group-hover:opacity-100 transition shadow-sm">
                    🔍 Ingrandisci
                  </span>
                  {c.scelto > 0 && (
                    <span className="absolute top-2 left-2 w-5 h-5 rounded-full bg-white border border-amber-300 flex items-center justify-center shadow-sm">
                      <StellaScelto valore={c.scelto} className="text-[10px]" />
                    </span>
                  )}
                </div>
                <div className="p-3.5 space-y-2">
                  <div className="flex justify-between items-start">
                    <h3 className="text-sm font-serif font-bold">{c.titolo}</h3>
                    <span className="text-[10px] bg-stone-100 px-2 py-0.5 rounded-full flex-shrink-0 ml-2">G.{c.gruppoNum}</span>
                  </div>
                  <MetaCaso anno={c.anno} provenienza={c.provenienza} />
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    {ASSI.map(asse => (
                      <div key={asse.chiave} className="bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 flex justify-between">
                        <span className="text-stone-500">{asse.etichetta}</span>
                        <b>{c.driver?.[asse.chiave] ?? 0}</b>
                      </div>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
    </>
  );

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="px-4 md:px-6 py-2.5 border-b border-stone-200 flex justify-between items-center gap-2 bg-[#FBF9F5]/90 backdrop-blur z-20 flex-shrink-0">
        <div className="flex items-center space-x-3 min-w-0 max-md:hidden">
          <h1 className="font-serif text-sm font-medium text-stone-500 flex-shrink-0">Analisi Radar Multicriterio</h1>
          {erroreCasi && (
            <p role="alert" className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl px-3 py-1.5 truncate">{erroreCasi}</p>
          )}
        </div>
        {mobile ? (
          <div className="flex items-center gap-2 w-full min-w-0">
            <button onClick={() => setElencoAperto(true)} aria-haspopup="dialog" className="px-3.5 py-2 rounded-full text-xs font-medium bg-stone-900 text-white flex-shrink-0">
              📋 Progetti <span className="opacity-70">{attivi.length}/{limiteAttivi}</span>
            </button>
            <button onClick={() => setOrdinaAperto(true)} aria-haspopup="dialog" className={`px-3.5 py-2 rounded-full text-xs font-medium border min-w-0 truncate ${filtroDriver !== 'nessuno' ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-white border-stone-200 text-stone-700'}`}>
              ↕ {ordinamentoCorrente}
            </button>
            <button onClick={() => setFiltriAperti(true)} aria-haspopup="dialog" aria-label="Filtri" className={`ml-auto px-3 py-2 rounded-full text-xs font-medium border flex-shrink-0 ${filtroTag ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-white border-stone-200 text-stone-700'}`}>
              ⚙️{filtroTag ? ' 1' : ''}
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
          <label className="sr-only" htmlFor="radar-filtro-tag">Filtra per tag tematico</label>
          <select
            id="radar-filtro-tag"
            value={filtroTag}
            onChange={e => setFiltroTag(e.target.value)}
            className="text-xs border border-stone-200 rounded-full px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-stone-900"
          >
            <option value="">Tutti i tag</option>
            {tuttiITag.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="radar-filtro-driver">Ordina per driver</label>
          <select
            id="radar-filtro-driver"
            value={filtroDriver}
            onChange={e => setFiltroDriver(e.target.value as any)}
            className="text-xs border border-stone-200 rounded-full px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-stone-900"
          >
            <option value="nessuno">Nessun ordinamento</option>
            {ASSI.map(a => (
              <option key={a.chiave} value={a.chiave}>Top 5 &middot; {a.etichetta}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="radar-limite-attivi">Numero massimo di casi studio da confrontare insieme</label>
          <select
            id="radar-limite-attivi"
            value={limiteAttivi}
            onChange={e => cambiaLimiteAttivi(Number(e.target.value))}
            className="text-xs border border-stone-200 rounded-full px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-stone-900"
          >
            {Array.from({ length: LIMITE_ATTIVI_MAX - LIMITE_ATTIVI_MIN + 1 }, (_, i) => LIMITE_ATTIVI_MIN + i).map(n => (
              <option key={n} value={n}>Confronta fino a {n}</option>
            ))}
          </select>
          </div>
        )}
      </div>
      {mobile && erroreCasi && (
        <p role="alert" className="mx-4 mt-2 text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl px-3 py-2">{erroreCasi}</p>
      )}

      <div className="flex-1 flex overflow-hidden">
        {!mobile && (
          <>
            <div style={{ width: larghezzaElenco }} className="border-r border-stone-200 bg-[#FBF9F5] overflow-y-auto p-4 space-y-2 flex-shrink-0">
              {elencoProgetti}
            </div>

            <div
              onMouseDown={iniziaTrascinamentoElenco}
              role="separator"
              aria-orientation="vertical"
              aria-label="Ridimensiona il pannello dell'elenco progetti"
              className="w-1.5 cursor-col-resize bg-stone-200/60 hover:bg-stone-400 active:bg-stone-500 transition-colors flex-shrink-0 z-20"
            />
          </>
        )}

        <div
          ref={radarRef}
          className="flex-1 flex items-center justify-center p-2 md:p-6 overflow-hidden relative select-none touch-none"
          onPointerDown={onPointerDownRadar}
          style={{ cursor: trascinando ? 'grabbing' : 'grab', marginBottom: mobile ? ALTEZZA_PEEK : undefined }}
        >
          <svg
            viewBox={`0 0 ${TAGLIA_SVG} ${TAGLIA_SVG}`}
            className="w-full h-full max-w-[860px] max-h-[860px]"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: trascinando ? 'none' : 'transform 0.1s ease-out',
            }}
            role="img"
            aria-label={`Radar con ${casiAttivi.length} progetti attivi sui quattro driver`}
          >
            {[0.25, 0.5, 0.75, 1].map(frazione => (
              <circle
                key={frazione}
                cx={CENTRO}
                cy={CENTRO}
                r={RAGGIO * frazione}
                fill="none"
                stroke="#e7e5e4"
                strokeWidth={1}
              />
            ))}

            {ASSI.map((asse, i) => {
              const p = puntoAsse(i, 100);
              return (
                <line key={asse.chiave} x1={CENTRO} y1={CENTRO} x2={p.x} y2={p.y} stroke="#e7e5e4" strokeWidth={1} />
              );
            })}

            {ASSI.map((asse, i) => {
              const p = puntoEtichetta(i);
              return (
                <text
                  key={asse.chiave}
                  x={p.x}
                  y={p.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-stone-500"
                  style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                >
                  {asse.etichetta}
                </text>
              );
            })}

            {casiAttivi.map(c => {
              const colore = coloreDi(c.id);
              const punti = ASSI.map((asse, i) => ({ ...puntoAsse(i, c.driver?.[asse.chiave] ?? 0), asse }));
              const path = punti.map(p => `${p.x},${p.y}`).join(' ');
              const inEvidenza = casoHoverId === c.id;
              return (
                <g key={c.id} className="transition-opacity duration-300">
                  <polygon
                    points={path}
                    fill={colore}
                    fillOpacity={inEvidenza ? 0.28 : 0.12}
                    stroke={colore}
                    strokeWidth={inEvidenza ? spessoreLinea * 1.8 : spessoreLinea}
                    style={{ transition: 'fill-opacity 0.15s ease, stroke-width 0.15s ease', cursor: 'pointer' }}
                    onMouseEnter={() => setCasoHoverId(c.id)}
                    onMouseLeave={() => setCasoHoverId(null)}
                    onClick={() => apriScheda(c)}
                  />
                  {punti.map((p, i) => {
                    const isHover = hover?.titolo === c.titolo && hover?.etichetta === p.asse.etichetta;
                    return (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={isHover ? raggioHover : raggioBase}
                        fill={colore}
                        stroke="white"
                        strokeWidth={isHover ? spessoreLinea * 0.8 : 0}
                        style={{ transition: 'r 0.15s ease', cursor: 'pointer' }}
                        onMouseEnter={() => {
                          setHover({ x: p.x, y: p.y, etichetta: p.asse.etichetta, valore: c.driver?.[p.asse.chiave] ?? 0, titolo: c.titolo, colore });
                          setCasoHoverId(c.id);
                        }}
                        onMouseLeave={() => {
                          setHover(null);
                          setCasoHoverId(null);
                        }}
                        onClick={() => apriScheda(c)}
                      >
                        <title>{`${c.titolo} — ${p.asse.etichetta}: ${c.driver?.[p.asse.chiave] ?? 0} (clicca per aprire la scheda)`}</title>
                      </circle>
                    );
                  })}
                </g>
              );
            })}

            {hover && (
              <g style={{ pointerEvents: 'none' }}>
                <rect
                  x={hover.x - 62}
                  y={hover.y - 40}
                  width={124}
                  height={30}
                  rx={8}
                  fill="#1c1917"
                  fillOpacity={0.92}
                />
                <text x={hover.x} y={hover.y - 29} textAnchor="middle" fill="white" style={{ fontSize: 10, fontWeight: 700 }}>
                  {hover.titolo.length > 18 ? hover.titolo.slice(0, 18) + '…' : hover.titolo}
                </text>
                <text x={hover.x} y={hover.y - 17} textAnchor="middle" fill="white" style={{ fontSize: 9 }}>
                  {hover.etichetta}: {hover.valore}
                </text>
              </g>
            )}
          </svg>

          <div className="absolute bottom-3 right-3 md:bottom-5 md:right-5 flex flex-col bg-white border border-stone-200 rounded-2xl shadow-lg overflow-hidden z-10">
            <button
              onClick={() => applicaZoom(0.2)}
              aria-label="Aumenta zoom"
              className="w-11 h-11 flex items-center justify-center text-lg font-bold text-stone-700 hover:bg-stone-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
            >
              +
            </button>
            <div className="text-[10px] text-center py-1.5 text-stone-500 border-t border-b border-stone-200 bg-stone-50">
              {Math.round(zoom * 100)}%
            </div>
            <button
              onClick={() => applicaZoom(-0.2)}
              aria-label="Riduci zoom"
              className="w-11 h-11 flex items-center justify-center text-lg font-bold text-stone-700 hover:bg-stone-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
            >
              −
            </button>
            <button
              onClick={resetVista}
              aria-label="Reimposta zoom e posizione"
              title="Reimposta vista"
              className="w-11 h-11 flex items-center justify-center text-sm text-stone-500 hover:bg-stone-100 transition border-t border-stone-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
            >
              ⟲
            </button>
          </div>

          <div className="absolute bottom-3 left-3 md:bottom-5 md:left-5 max-md:right-16 text-[10px] text-stone-400 bg-white/80 backdrop-blur px-3 py-1.5 rounded-full border border-stone-200 pointer-events-none">
            {mobile
              ? <>Trascina &middot; pizzica per lo zoom &middot; tocca un punto</>
              : <>Trascina per spostarti &middot; rotellina per zoomare &middot; clicca un punto per i dettagli</>}
          </div>
        </div>

        {mobile ? (
          <SlidingPanel
            stato={statoPannello}
            onCambiaStato={setStatoPannello}
            etichetta="Dettaglio dei progetti attivi"
            altezzaPeek={ALTEZZA_PEEK}
            intestazione={
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-serif font-bold">Progetti attivi ({casiAttivi.length})</h2>
                  <p className="text-[11px] text-stone-500 truncate">{casiAttivi.length ? casiAttivi.map(c => c.titolo).join(' · ') : 'Nessun progetto sul radar'}</p>
                </div>
                <div className="flex -space-x-1 flex-shrink-0" aria-hidden="true">
                  {casiAttivi.slice(0, 6).map(c => (
                    <span key={c.id} className="w-4 h-4 rounded-full border-2 border-[#FBF9F5]" style={{ backgroundColor: coloreDi(c.id) }} />
                  ))}
                </div>
              </div>
            }
          >
            <div className="space-y-3 pt-1">
              {casiAttivi.length === 0 && (
                <p className="text-xs text-stone-400 text-center py-4">Apri &ldquo;Progetti&rdquo; per sceglierne uno o più da confrontare.</p>
              )}
              {schedeAttive}
            </div>
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

            <div style={{ width: larghezzaDettaglio }} className="border-l border-stone-200 bg-[#FBF9F5] overflow-y-auto p-4 space-y-3 flex-shrink-0">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 px-1 pb-1">Dettaglio Progetti Attivi</h2>
              {casiAttivi.length === 0 && (
                <p className="text-xs text-stone-400 px-1">Seleziona uno o più progetti dall&apos;elenco per confrontarli.</p>
              )}
              {schedeAttive}
            </div>
          </>
        )}
      </div>

      {/* Mobile: elenco progetti (selezione multipla, resta aperto mentre si
          sceglie), ordinamento (scelta singola) e filtri. */}
      <BottomSheet aperto={mobile && elencoAperto} onChiudi={() => setElencoAperto(false)} etichetta="Progetti da confrontare sul radar" titolo="Progetti da confrontare" classePannello="px-5 pb-5 pt-1 space-y-2">
        {elencoProgetti}
        <button onClick={() => setElencoAperto(false)} className="sticky bottom-0 w-full bg-stone-900 text-white py-3 rounded-2xl text-sm font-medium mt-2 shadow-lg">
          Mostra sul radar ({attivi.length})
        </button>
      </BottomSheet>

      <ActionSheet
        aperto={mobile && ordinaAperto}
        onChiudi={() => setOrdinaAperto(false)}
        titolo="Ordina i progetti"
        azioni={[
          { chiave: 'nessuno', etichetta: 'Nessun ordinamento', attiva: filtroDriver === 'nessuno', onSeleziona: () => setFiltroDriver('nessuno') },
          ...ASSI.map(a => ({ chiave: a.chiave, etichetta: `Top 5 · ${a.etichetta}`, descrizione: `I cinque progetti con ${a.etichetta.toLowerCase()} più alta`, attiva: filtroDriver === a.chiave, onSeleziona: () => setFiltroDriver(a.chiave) })),
        ]}
      />

      <BottomSheet aperto={mobile && filtriAperti} onChiudi={() => setFiltriAperti(false)} etichetta="Filtri del radar" titolo="Filtri">
        <div className="space-y-3 [&_select]:w-full [&_select]:py-3 [&_select]:text-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Tag tematico</p>
          <label className="sr-only" htmlFor="radar-filtro-tag">Filtra per tag tematico</label>
          <select
            id="radar-filtro-tag"
            value={filtroTag}
            onChange={e => setFiltroTag(e.target.value)}
            className="text-xs border border-stone-200 rounded-full px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-stone-900"
          >
            <option value="">Tutti i tag</option>
            {tuttiITag.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 pt-1">Progetti confrontabili insieme</p>
          <label className="sr-only" htmlFor="radar-limite-attivi">Numero massimo di casi studio da confrontare insieme</label>
          <select
            id="radar-limite-attivi"
            value={limiteAttivi}
            onChange={e => cambiaLimiteAttivi(Number(e.target.value))}
            className="text-xs border border-stone-200 rounded-full px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-stone-900"
          >
            {Array.from({ length: LIMITE_ATTIVI_MAX - LIMITE_ATTIVI_MIN + 1 }, (_, i) => LIMITE_ATTIVI_MIN + i).map(n => (
              <option key={n} value={n}>Confronta fino a {n}</option>
            ))}
          </select>
        </div>
        <button onClick={() => setFiltriAperti(false)} className="w-full bg-stone-900 text-white py-3 rounded-2xl text-sm font-medium">Fatto</button>
      </BottomSheet>

      {casoEspanso && (
        <BottomSheet
          aperto
          onChiudi={() => setCasoEspanso(null)}
          etichetta={`Dettaglio esteso: ${casoEspanso.titolo}`}
          larghezzaDesktop="md:max-w-3xl md:rounded-3xl"
          classePannello=""
        >
            <div className="h-56 md:h-80 bg-stone-100 flex items-center justify-center p-4 md:p-6 md:rounded-t-3xl relative">
              {casoEspanso.immagine ? (
                <img src={casoEspanso.immagine} alt={casoEspanso.titolo} className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-sm text-stone-400">Nessuna immagine disponibile</span>
              )}
              <button
                onClick={() => setCasoEspanso(null)}
                aria-label="Chiudi dettaglio"
                className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center text-stone-600 hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
              >
                ✕
              </button>
            </div>

            <div className="p-5 md:p-8 space-y-5">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">Gruppo {casoEspanso.gruppoNum} &middot; {casoEspanso.gruppoNome}</span>
                  <h2 className="text-2xl md:text-3xl font-serif font-bold mt-1">{casoEspanso.titolo}</h2>
                  <MetaCaso anno={casoEspanso.anno} provenienza={casoEspanso.provenienza} className="mt-2" />
                </div>
              </div>

              {casoEspanso.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {casoEspanso.tags.map(tag => (
                    <span key={tag} className="text-[10px] bg-stone-100 border border-stone-200 px-2.5 py-1 rounded-full text-stone-600 font-medium">{tag}</span>
                  ))}
                </div>
              )}

              <p className="text-sm text-stone-700 leading-relaxed bg-stone-50 p-5 rounded-2xl border border-stone-200">
                {casoEspanso.descrizione || 'Nessuna descrizione inserita.'}
              </p>
              <FonteCaso fonte={casoEspanso.fonte} />

              <div className="space-y-3">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Driver {corso.configurazione.framework} (scala 0-{MAX_DRIVER})</h3>
                <div className="space-y-2.5">
                  {ASSI.map(asse => {
                    const valore = casoEspanso.driver?.[asse.chiave] ?? 0;
                    const nota = casoEspanso.driverNote?.[asse.chiave];
                    return (
                      <div key={asse.chiave}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-stone-600 font-medium">{asse.etichetta}</span>
                          <span className="font-bold">{valore}</span>
                        </div>
                        <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${(valore / MAX_DRIVER) * 100}%`, backgroundColor: coloreDi(casoEspanso.id) }}
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
    </div>
  );
}
