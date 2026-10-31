// Posizione approssimata di chi vota, ricavata dall'indirizzo IP lato
// server. L'IP non viene mai salvato né restituito: al browser tornano
// solo città, paese e coordinate arrotondate a 0,1° (circa 10 km), che
// finiscono nella mappa aggregata del voto.
//
// 1. Su Vercel la geolocalizzazione arriva già negli header della
//    richiesta (x-vercel-ip-*), senza chiamare servizi esterni.
// 2. Altrove (o se gli header mancano) si chiede a un servizio pubblico
//    di geolocalizzazione IP (ipwho.is), con un timeout breve.
// Se nessuna delle due funziona si risponde vuoto: il voto vale lo stesso.
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type Posizione = { citta: string; paese: string; lat: number | null; lon: number | null; fonte: string };

const arrotonda = (v: unknown) => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
};

const decodifica = (v: string | null) => {
  if (!v) return '';
  try { return decodeURIComponent(v); } catch { return v; }
};

function ipPrivato(ip: string) {
  return !ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80');
}

export async function GET(req: NextRequest) {
  const h = req.headers;
  const nessuna: Posizione = { citta: '', paese: '', lat: null, lon: null, fonte: 'nessuna' };
  const risposta = (p: Posizione) => NextResponse.json(p, { headers: { 'Cache-Control': 'no-store' } });

  const cittaVercel = decodifica(h.get('x-vercel-ip-city'));
  const paeseVercel = h.get('x-vercel-ip-country') || '';
  if (cittaVercel || paeseVercel) {
    return risposta({
      citta: cittaVercel, paese: paeseVercel,
      lat: arrotonda(h.get('x-vercel-ip-latitude')), lon: arrotonda(h.get('x-vercel-ip-longitude')),
      fonte: 'rete',
    });
  }

  const ip = (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || '';
  if (ipPrivato(ip)) return risposta(nessuna);

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,country_code,latitude,longitude`, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    const d = await r.json();
    if (!d?.success) return risposta(nessuna);
    return risposta({ citta: d.city || '', paese: d.country_code || '', lat: arrotonda(d.latitude), lon: arrotonda(d.longitude), fonte: 'rete' });
  } catch {
    return risposta(nessuna);
  }
}
