'use client';
// Mappa del voto: dove si trovano (in modo approssimato, ~10 km) le
// persone che votano. Paesi disegnati in vettoriale (world-atlas), punti
// ambra con area proporzionale ai voti; un punto che ha appena ricevuto
// un voto pulsa. L'inquadratura si adatta da sola ai punti: una classe in
// una sola città mostra la regione intorno, voti da più paesi allargano
// la vista.
import { useEffect, useMemo, useRef, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Statistiche } from '@/lib/contest';
import { riduciMovimento } from '@/lib/contest';

type Punto = NonNullable<Statistiche['punti']>[number];

const L = 800, H = 460, MARGINE = 46;

let mondoCache: any = null;
async function caricaMondo() {
  if (mondoCache) return mondoCache;
  const topo: any = (await import('world-atlas/countries-50m.json')).default;
  mondoCache = feature(topo, topo.objects.countries);
  return mondoCache;
}

export function MappaVoti({ punti, adesso }: { punti: Punto[]; adesso: number }) {
  const [mondo, setMondo] = useState<any>(mondoCache);
  const [tip, setTip] = useState<{ x: number; y: number; testo: string } | null>(null);
  const precedenti = useRef<Map<string, number>>(new Map());
  const [onde, setOnde] = useState<{ chiave: string; id: number }[]>([]);

  useEffect(() => { if (!mondo) caricaMondo().then(setMondo).catch(() => {}); }, [mondo]);

  // Inquadratura: rettangolo dei punti, con un'ampiezza minima (una città
  // sola → la sua regione) e un po' di aria intorno.
  const proiezione = useMemo(() => {
    const lats = punti.map(p => p.lat), lons = punti.map(p => p.lon);
    let [s, n] = lats.length ? [Math.min(...lats), Math.max(...lats)] : [36, 47.5];
    let [o, e] = lons.length ? [Math.min(...lons), Math.max(...lons)] : [6, 19];
    const minLat = 3.2, minLon = 5;
    if (n - s < minLat) { const c = (n + s) / 2; s = c - minLat / 2; n = c + minLat / 2; }
    if (e - o < minLon) { const c = (e + o) / 2; o = c - minLon / 2; e = c + minLon / 2; }
    return geoMercator().fitExtent([[MARGINE, MARGINE], [L - MARGINE, H - MARGINE]], {
      type: 'MultiPoint', coordinates: [[o, s], [e, n], [o, n], [e, s]],
    } as any);
  }, [punti]);

  const percorso = useMemo(() => geoPath(proiezione), [proiezione]);
  const disegnoPaesi = useMemo(() => (mondo ? percorso(mondo) || '' : ''), [mondo, percorso]);

  // Onde sui punti che hanno appena ricevuto voti.
  useEffect(() => {
    const nuove: { chiave: string; id: number }[] = [];
    for (const p of punti) {
      const chiave = `${p.lat},${p.lon}`;
      const prima = precedenti.current.get(chiave);
      if (prima !== undefined && p.n > prima) nuove.push({ chiave, id: Date.now() + Math.random() });
      precedenti.current.set(chiave, p.n);
    }
    if (nuove.length && !riduciMovimento()) {
      setOnde(o => [...o, ...nuove]);
      setTimeout(() => setOnde(o => o.filter(x => !nuove.includes(x))), 1800);
    }
  }, [punti]);

  const massimo = Math.max(1, ...punti.map(p => p.n));
  const raggio = (n: number) => 5 + Math.sqrt(n / massimo) * 22;

  // Etichette senza sovrapposizioni: per i luoghi con più voti si prova a
  // destra, a sinistra, sopra e sotto il punto; se non c'è spazio libero
  // l'etichetta si omette (resta il tooltip e l'elenco accanto).
  const etichette = useMemo(() => {
    type R = { x: number; y: number; w: number; h: number };
    const tocca = (a: R, b: R) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const ordinati = [...punti].sort((a, b) => b.n - a.n);
    const cerchi: R[] = [];
    for (const p of ordinati) {
      const xy = proiezione([p.lon, p.lat]); if (!xy) continue;
      const r = raggio(p.n);
      cerchi.push({ x: xy[0] - r, y: xy[1] - r, w: 2 * r, h: 2 * r });
    }
    const occupate: R[] = [];
    const scelte = new Map<string, { dx: number; dy: number; ancora: 'start' | 'end' | 'middle' }>();
    for (const p of ordinati.slice(0, 10)) {
      const xy = proiezione([p.lon, p.lat]); if (!xy) continue;
      const r = raggio(p.n);
      const w = (p.zona.length + String(p.n).length + 1) * 7.6 + 4, h = 16;
      const opzioni = [
        { dx: r + 6, dy: 4, ancora: 'start' as const, box: { x: xy[0] + r + 4, y: xy[1] - h / 2, w, h } },
        { dx: -r - 6, dy: 4, ancora: 'end' as const, box: { x: xy[0] - r - 4 - w, y: xy[1] - h / 2, w, h } },
        { dx: 0, dy: -r - 7, ancora: 'middle' as const, box: { x: xy[0] - w / 2, y: xy[1] - r - 6 - h, w, h } },
        { dx: 0, dy: r + 16, ancora: 'middle' as const, box: { x: xy[0] - w / 2, y: xy[1] + r + 4, w, h } },
      ];
      const libera = opzioni.find(o => o.box.x >= 0 && o.box.x + o.box.w <= L && o.box.y >= 0 && o.box.y + o.box.h <= H
        && !occupate.some(b => tocca(b, o.box))
        && !cerchi.some(c => tocca(c, o.box)));
      if (libera) { occupate.push(libera.box); scelte.set(`${p.lat},${p.lon}`, { dx: libera.dx, dy: libera.dy, ancora: libera.ancora }); }
    }
    return scelte;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [punti, proiezione]);
  const totale = punti.reduce((s, p) => s + p.n, 0);

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${L} ${H}`} width="100%" role="img" aria-label={`Mappa del voto: ${punti.length} luoghi, ${totale} voti localizzati`}
        style={{ display: 'block', borderRadius: 20, background: 'color-mix(in srgb, var(--card) 55%, var(--surface))', overflow: 'hidden' }}
        onMouseLeave={() => setTip(null)}>
        <path d={disegnoPaesi} fill="var(--card)" stroke="var(--surface)" strokeWidth={0.8} className={mondo ? 'mz-fade' : ''} />
        {[...punti].sort((a, b) => b.n - a.n).map(p => {
          const xy = proiezione([p.lon, p.lat]);
          if (!xy) return null;
          const chiave = `${p.lat},${p.lon}`;
          const r = raggio(p.n);
          const recente = adesso - new Date(p.ultimo).getTime() < 90_000;
          return (
            <g key={chiave} transform={`translate(${xy[0]},${xy[1]})`}
              onMouseEnter={() => setTip({ x: xy[0], y: xy[1] - r, testo: `${p.zona}: ${p.n} ${p.n === 1 ? 'voto' : 'voti'}` })}
              style={{ cursor: 'default' }}>
              {recente && <circle r={r} fill="none" stroke="var(--accento-vivo)" strokeWidth={2} className="mz-mappa-pulsa" />}
              {onde.filter(o => o.chiave === chiave).map(o => (
                <circle key={o.id} r={r} fill="none" stroke="var(--accento-vivo)" strokeWidth={2.5} className="mz-mappa-onda" />
              ))}
              <circle r={r} fill="var(--accento-vivo)" fillOpacity={0.88} stroke="var(--surface)" strokeWidth={2}
                style={{ transition: 'r 1s cubic-bezier(.16,1,.3,1)' }} />
              {etichette.has(chiave) && (
                <text x={etichette.get(chiave)!.dx} y={etichette.get(chiave)!.dy} textAnchor={etichette.get(chiave)!.ancora} style={{ font: '600 13px var(--f-text)', fill: 'var(--ink)', paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 4, strokeLinejoin: 'round' }}>
                  {p.zona} <tspan style={{ fontWeight: 400, fill: 'var(--muted)' }}>{p.n}</tspan>
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {tip && (
        <span className="mz-tip" style={{ left: `${(tip.x / L) * 100}%`, top: `${(tip.y / H) * 100}%` }}>{tip.testo}</span>
      )}
      {punti.length === 0 && (
        <span className="mz-muted" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 14 }}>
          La mappa si accende con il primo voto.
        </span>
      )}
    </div>
  );
}
