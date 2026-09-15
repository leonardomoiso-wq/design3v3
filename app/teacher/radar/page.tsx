'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizzaDriver } from '@/lib/driver';

type Caso = {
  id: number;
  gruppoNome: string;
  gruppoNum: number;
  titolo: string;
  descrizione: string;
  immagine: string;
  tags: string[];
  driver: { desiderabilita: number; fattibilita: number; responsabilita: number; vitalita: number };
};

const ASSI = [
  { chiave: 'desiderabilita', etichetta: 'Desiderabilità' },
  { chiave: 'fattibilita', etichetta: 'Fattibilità' },
  { chiave: 'responsabilita', etichetta: 'Responsabilità' },
  { chiave: 'vitalita', etichetta: 'Vitalità' },
] as const;

const PALETTE = ['#0f766e', '#b45309', '#7c3aed', '#be123c', '#1d4ed8', '#15803d', '#a16207', '#9333ea'];

const RAGGIO = 180;
const CENTRO = 220;

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
  const distanza = RAGGIO + 28;
  return {
    x: CENTRO + distanza * Math.cos(angolo),
    y: CENTRO + distanza * Math.sin(angolo),
  };
}

export default function RadarPage() {
  const [casi, setCasi] = useState<Caso[]>([]);
  const [attivi, setAttivi] = useState<number[]>([]);
  const [filtroTag, setFiltroTag] = useState('');
  const [filtroDriver, setFiltroDriver] = useState<'nessuno' | 'desiderabilita' | 'fattibilita' | 'responsabilita' | 'vitalita'>('nessuno');

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

  const tuttiITag = useMemo(() => Array.from(new Set(casi.flatMap(c => c.tags || []))).sort(), [casi]);

  const casiFiltrati = useMemo(() => {
    let lista = filtroTag ? casi.filter(c => (c.tags || []).includes(filtroTag)) : casi;
    if (filtroDriver !== 'nessuno') {
      lista = [...lista]
        .sort((a, b) => (b.driver?.[filtroDriver] ?? 0) - (a.driver?.[filtroDriver] ?? 0))
        .slice(0, 5);
    }
    return lista;
  }, [casi, filtroTag, filtroDriver]);

  useEffect(() => {
    setAttivi(casiFiltrati.slice(0, 5).map(c => c.id));
  }, [casiFiltrati]);

  const toggleAttivo = (id: number) => {
    setAttivi(prev => (prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]));
  };

  const casiAttivi = casiFiltrati.filter(c => attivi.includes(c.id));

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="px-6 py-2.5 border-b border-stone-200 flex justify-between items-center bg-[#FBF9F5]/90 backdrop-blur z-20 flex-shrink-0">
        <h1 className="font-serif text-sm font-medium text-stone-500">Analisi Radar Multicriterio</h1>
        <div className="flex items-center space-x-2">
          <select
            value={filtroTag}
            onChange={e => setFiltroTag(e.target.value)}
            className="text-xs border border-stone-200 rounded-full px-3 py-1.5 bg-white focus:outline-none focus:border-stone-900"
          >
            <option value="">Tutti i tag</option>
            {tuttiITag.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
          <select
            value={filtroDriver}
            onChange={e => setFiltroDriver(e.target.value as any)}
            className="text-xs border border-stone-200 rounded-full px-3 py-1.5 bg-white focus:outline-none focus:border-stone-900"
          >
            <option value="nessuno">Nessun ordinamento</option>
            {ASSI.map(a => (
              <option key={a.chiave} value={a.chiave}>Top 5 &middot; {a.etichetta}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-72 border-r border-stone-200 bg-[#FBF9F5] overflow-y-auto p-4 space-y-2 flex-shrink-0">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 px-1 pb-1">Progetti ({casiFiltrati.length})</h2>
          {casiFiltrati.length === 0 && (
            <p className="text-xs text-stone-400 px-1">Nessun caso studio disponibile.</p>
          )}
          {casiFiltrati.map((c, i) => {
            const colore = PALETTE[i % PALETTE.length];
            const attivo = attivi.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggleAttivo(c.id)}
                className={`w-full flex items-center space-x-2.5 p-2.5 rounded-xl border text-left transition ${attivo ? 'bg-white border-stone-300 shadow-sm' : 'bg-transparent border-transparent opacity-50 hover:opacity-80'}`}
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

        <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
          <svg width={CENTRO * 2} height={CENTRO * 2} viewBox={`0 0 ${CENTRO * 2} ${CENTRO * 2}`}>
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
                  style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                >
                  {asse.etichetta}
                </text>
              );
            })}

            {casiAttivi.map((c, idx) => {
              const colore = PALETTE[casiFiltrati.findIndex(x => x.id === c.id) % PALETTE.length];
              const punti = ASSI.map((asse, i) => puntoAsse(i, c.driver?.[asse.chiave] ?? 0));
              const path = punti.map(p => `${p.x},${p.y}`).join(' ');
              return (
                <g key={c.id}>
                  <polygon points={path} fill={colore} fillOpacity={0.12} stroke={colore} strokeWidth={2} />
                  {punti.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={3} fill={colore} />
                  ))}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="w-96 border-l border-stone-200 bg-[#FBF9F5] overflow-y-auto p-4 space-y-3 flex-shrink-0">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 px-1 pb-1">Dettaglio Progetti Attivi</h2>
          {casiAttivi.length === 0 && (
            <p className="text-xs text-stone-400 px-1">Seleziona uno o più progetti dall&apos;elenco per confrontarli.</p>
          )}
          {casiAttivi.map(c => {
            const colore = PALETTE[casiFiltrati.findIndex(x => x.id === c.id) % PALETTE.length];
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                <div className="h-32 bg-stone-100 flex items-center justify-center p-3" style={{ borderBottom: `3px solid ${colore}` }}>
                  {c.immagine ? (
                    <img src={c.immagine} alt="" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <span className="text-[10px] text-stone-400">Nessuna immagine</span>
                  )}
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
