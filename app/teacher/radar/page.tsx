'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizzaDriver, estraiNote, type NoteDriver } from '@/lib/driver';

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
};

const ASSI = [
  { chiave: 'desiderabilita', etichetta: 'Desiderabilità' },
  { chiave: 'fattibilita', etichetta: 'Fattibilità' },
  { chiave: 'responsabilita', etichetta: 'Responsabilità' },
  { chiave: 'vitalita', etichetta: 'Vitalità' },
] as const;

const PALETTE = ['#0f766e', '#b45309', '#7c3aed', '#be123c', '#1d4ed8', '#15803d', '#a16207', '#9333ea'];

const RAGGIO = 200;
const LABEL_OFFSET = 32;
const MARGINE_ETICHETTA = 90; // spazio per testo come "RESPONSABILITÀ" senza tagli
const CENTRO = RAGGIO + LABEL_OFFSET + MARGINE_ETICHETTA;
const TAGLIA_SVG = CENTRO * 2;

function puntoAsse(indice: number, valore: number) {
  const angolo = (Math.PI * 2 * indice) / ASSI.length - Math.PI / 2;
  const distanza = (valore / 100) * RAGGIO;
  return {
    x: CENTRO + distanza * Math.cos(angolo),
    y: CENTRO + distanza * Math.sin(angolo),
  };
}

function puntoEtichetta(indice: number) {
  const angolo = (Math.PI * 2 * indice) / ASSI.length - Math.PI / 2;
  const distanza = RAGGIO + LABEL_OFFSET;
  return {
    x: CENTRO + distanza * Math.cos(angolo),
    y: CENTRO + distanza * Math.sin(angolo),
  };
}

type Hover = { x: number; y: number; etichetta: string; valore: number; titolo: string; colore: string };

export default function RadarPage() {
  const [casi, setCasi] = useState<Caso[]>([]);
  const [attivi, setAttivi] = useState<number[]>([]);
  const [filtroTag, setFiltroTag] = useState('');
  const [filtroDriver, setFiltroDriver] = useState<'nessuno' | 'desiderabilita' | 'fattibilita' | 'responsabilita' | 'vitalita'>('nessuno');
  const [hover, setHover] = useState<Hover | null>(null);
  const [casoHoverId, setCasoHoverId] = useState<number | null>(null);
  const [casoEspanso, setCasoEspanso] = useState<Caso | null>(null);
  const [ricerca, setRicerca] = useState('');
  const cardRefs = useRef<Record<number, HTMLElement | null>>({});

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [trascinando, setTrascinando] = useState(false);
  const puntoIniziale = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const ZOOM_MIN = 0.6;
  const ZOOM_MAX = 3;

  const applicaZoom = (delta: number) => {
    setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))));
  };

  const resetVista = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const onWheelRadar = (e: React.WheelEvent) => {
    e.preventDefault();
    applicaZoom(e.deltaY > 0 ? -0.15 : 0.15);
  };

  const onMouseDownRadar = (e: React.MouseEvent) => {
    setTrascinando(true);
    puntoIniziale.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const onMouseMoveRadar = (e: React.MouseEvent) => {
    if (!trascinando) return;
    const dx = e.clientX - puntoIniziale.current.x;
    const dy = e.clientY - puntoIniziale.current.y;
    setPan({ x: puntoIniziale.current.panX + dx, y: puntoIniziale.current.panY + dy });
  };

  const onMouseUpRadar = () => setTrascinando(false);

  useEffect(() => {
    const carica = async () => {
      const { data, error } = await supabase.from('casi_studio').select('*');
      if (!error && data) {
        const formattati = data.map((c: any) => ({
          id: Number(c.id),
          gruppoNome: c.gruppo_nome,
          gruppoNum: c.gruppo_num,
          titolo: c.titolo,
          descrizione: c.descrizione,
          immagine: c.immagine,
          tags: c.tags || [],
          driver: normalizzaDriver(c.driver),
          driverNote: estraiNote(c.driver),
        }));
        setCasi(formattati);
      }
    };
    carica();

    const channel = supabase
      .channel('realtime-radar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casi_studio' }, carica)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCasoEspanso(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tuttiITag = useMemo(() => Array.from(new Set(casi.flatMap(c => c.tags || []))).sort(), [casi]);

  const casiFiltrati = useMemo(() => {
    let lista = filtroTag ? casi.filter(c => (c.tags || []).includes(filtroTag)) : casi;
    if (ricerca.trim()) {
      const q = ricerca.trim().toLowerCase();
      lista = lista.filter(c =>
        c.titolo.toLowerCase().includes(q) ||
        c.gruppoNome.toLowerCase().includes(q) ||
        String(c.gruppoNum).includes(q)
      );
    }
    if (filtroDriver !== 'nessuno') {
      lista = [...lista]
        .sort((a, b) => (b.driver?.[filtroDriver] ?? 0) - (a.driver?.[filtroDriver] ?? 0))
        .slice(0, 5);
    }
    return lista;
  }, [casi, filtroTag, filtroDriver, ricerca]);

  useEffect(() => {
    setAttivi(casiFiltrati.slice(0, 5).map(c => c.id));
  }, [casiFiltrati]);

  const toggleAttivo = (id: number) => {
    setAttivi(prev => (prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]));
  };

  const casiAttivi = casiFiltrati.filter(c => attivi.includes(c.id));
  const coloreDi = (id: number) => PALETTE[casiFiltrati.findIndex(x => x.id === id) % PALETTE.length];

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

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="px-6 py-2.5 border-b border-stone-200 flex justify-between items-center bg-[#FBF9F5]/90 backdrop-blur z-20 flex-shrink-0">
        <h1 className="font-serif text-sm font-medium text-stone-500">Analisi Radar Multicriterio</h1>
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
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 border-r border-stone-200 bg-[#FBF9F5] overflow-y-auto p-4 space-y-2 flex-shrink-0">
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
                  inEvidenza ? 'bg-amber-50 border-amber-300 shadow-sm' : attivo ? 'bg-white border-stone-300 shadow-sm' : 'bg-transparent border-transparent opacity-50 hover:opacity-80'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: attivo ? colore : '#d6d3d1' }}></span>
                <div className="overflow-hidden">
                  <div className="text-xs font-bold truncate text-stone-900">{c.titolo}</div>
                  <div className="text-[10px] text-stone-500 truncate">G.{c.gruppoNum} &middot; {c.gruppoNome}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div
          className="flex-1 flex items-center justify-center p-6 overflow-hidden relative select-none"
          onWheel={onWheelRadar}
          onMouseDown={onMouseDownRadar}
          onMouseMove={onMouseMoveRadar}
          onMouseUp={onMouseUpRadar}
          onMouseLeave={onMouseUpRadar}
          style={{ cursor: trascinando ? 'grabbing' : 'grab' }}
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
                    onClick={() => setCasoEspanso(c)}
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
                        onClick={() => setCasoEspanso(c)}
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

          <div className="absolute bottom-5 right-5 flex flex-col bg-white border border-stone-200 rounded-2xl shadow-lg overflow-hidden z-10">
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

          <div className="absolute bottom-5 left-5 text-[10px] text-stone-400 bg-white/80 backdrop-blur px-3 py-1.5 rounded-full border border-stone-200 pointer-events-none">
            Trascina per spostarti &middot; rotellina per zoomare &middot; clicca un punto per i dettagli
          </div>
        </div>

        <div className="w-80 border-l border-stone-200 bg-[#FBF9F5] overflow-y-auto p-4 space-y-3 flex-shrink-0">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 px-1 pb-1">Dettaglio Progetti Attivi</h2>
          {casiAttivi.length === 0 && (
            <p className="text-xs text-stone-400 px-1">Seleziona uno o più progetti dall&apos;elenco per confrontarli.</p>
          )}
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
                    <img src={c.immagine} alt={c.titolo} className="max-w-full max-h-full object-contain" />
                  ) : (
                    <span className="text-[10px] text-stone-400">Nessuna immagine</span>
                  )}
                  <span className="absolute top-2 right-2 text-[10px] bg-white/90 backdrop-blur px-2 py-1 rounded-full font-medium opacity-0 group-hover:opacity-100 transition shadow-sm">
                    🔍 Ingrandisci
                  </span>
                </div>
                <div className="p-3.5 space-y-2">
                  <div className="flex justify-between items-start">
                    <h3 className="text-sm font-serif font-bold">{c.titolo}</h3>
                    <span className="text-[10px] bg-stone-100 px-2 py-0.5 rounded-full flex-shrink-0 ml-2">G.{c.gruppoNum}</span>
                  </div>
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
        </div>
      </div>

      {casoEspanso && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Dettaglio esteso: ${casoEspanso.titolo}`}
          onClick={() => setCasoEspanso(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="h-80 bg-stone-100 flex items-center justify-center p-6 rounded-t-3xl relative">
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

            <div className="p-8 space-y-5">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">Gruppo {casoEspanso.gruppoNum} &middot; {casoEspanso.gruppoNome}</span>
                  <h2 className="text-3xl font-serif font-bold mt-1">{casoEspanso.titolo}</h2>
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

              <div className="space-y-3">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Ponderazione Driver IDEO</h3>
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
                            style={{ width: `${valore}%`, backgroundColor: coloreDi(casoEspanso.id) }}
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
          </div>
        </div>
      )}
    </div>
  );
}
