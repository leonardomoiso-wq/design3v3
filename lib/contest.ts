'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

export type FaseContest = 'bozza' | 'anteprima' | 'voto' | 'chiuso';
export type Iscrizione = 'individuale' | 'gruppo' | 'entrambe';

export type Contest = {
  id: string;
  corso_id: string;
  titolo: string;
  sottotitolo: string;
  descrizione: string;
  iscrizione: Iscrizione;
  proposte_da: 'docente' | 'studenti';
  fase: FaseContest;
  voto_inizio: string | null;
  voto_fine: string | null;
  mostra_classifica: boolean;
  live_stato: 'chiuso' | 'aperto' | 'concluso';
  live_inizio: string | null;
  live_fine: string | null;
  vincitore_rivelato: boolean;
  creato_il: string;
};

export type Proposta = {
  id: number;
  contest_id: string;
  team_id: string | null;
  autori: string;
  titolo: string;
  sintesi: string;
  problema: string;
  proposta: string;
  perche: string;
  immagine: string;
  galleria: string[];
  nascosta?: boolean;
  creato_il: string;
};

export type Statistiche = {
  ora: string;
  fase: FaseContest;
  voto_inizio: string | null;
  voto_fine: string | null;
  live_stato: Contest['live_stato'];
  live_inizio: string | null;
  live_fine: string | null;
  vincitore_rivelato: boolean;
  classifica_visibile: boolean;
  remoto_finito: boolean;
  iscritti: number;
  proposte: number;
  totale: { remoto: number; live: number };
  dispositivi: Record<string, number>;
  zone: { zona: string; n: number }[];
  punti?: { lat: number; lon: number; zona: string; n: number; ultimo: string }[];
  andamento: { t: string; remoto: number; live: number }[];
  ultimi: { id: number; t: string; fase: 'remoto' | 'live'; dispositivo: string; zona: string }[];
  per_proposta: { id: number; remoto: number; live: number }[] | null;
};

export const ETICHETTA_FASE: Record<FaseContest, string> = {
  bozza: 'Bozza',
  anteprima: 'Anteprima',
  voto: 'Voto da remoto',
  chiuso: 'Concluso',
};

export const ETICHETTA_ISCRIZIONE: Record<Iscrizione, string> = {
  individuale: 'Solo individui',
  gruppo: 'Solo team',
  entrambe: 'Individui e team',
};

export const COLONNE_PROPOSTA = 'id, contest_id, team_id, autori, titolo, sintesi, problema, proposta, perche, immagine, galleria, creato_il';

export function messaggioErroreContest(codice: string): string {
  switch (codice) {
    case 'votazione_non_attiva': return 'La votazione non è aperta in questo momento.';
    case 'propria_proposta': return 'Non puoi votare la tua proposta: scegline un\'altra.';
    case 'credenziali_errate': return 'Il vostro accesso non è più valido: uscite e rientrate dalla home.';
    case 'attivita_non_attiva': return 'Il contest non è ancora attivo: il/la docente lo aprirà a breve.';
    case 'contest_non_trovato': return 'Questo contest non è più disponibile.';
    case 'tipo_non_ammesso': return 'Questo contest accetta voti solo da un altro tipo di accesso (individuale o di gruppo).';
    case 'candidature_chiuse': return 'Le candidature sono chiuse.';
    case 'titolo_mancante': return 'Serve un titolo.';
    case 'sintesi_troppo_lunga': return 'La sintesi deve stare in 220 caratteri.';
    case 'codice_errato': return 'Codice non corretto: guarda quello proiettato in aula.';
    case 'proposta_non_trovata': return 'Questa proposta non è più disponibile.';
    case 'scadenza_non_valida': return 'Scegli una scadenza nel futuro.';
    case 'passcode_errato': return 'Password docente non valida: esci e rientra.';
    default: return 'Errore di connessione. Riprova.';
  }
}

// Dati del voto che il browser può fornire senza chiedere permessi:
// tipo di dispositivo e città del fuso orario (es. Europe/Rome → Rome).
export function rilevaDispositivo(): string {
  if (typeof navigator === 'undefined') return 'altro';
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'tablet';
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|Android/i.test(ua)) return 'smartphone';
  return 'computer';
}

const CITTA_IT: Record<string, string> = { Rome: 'Roma', Turin: 'Torino', Milan: 'Milano', Naples: 'Napoli', Florence: 'Firenze', Venice: 'Venezia', Genoa: 'Genova', Padua: 'Padova', Mantua: 'Mantova', Syracuse: 'Siracusa', Leghorn: 'Livorno', Geneva: 'Ginevra', Munich: 'Monaco di Baviera', Cologne: 'Colonia', Nice: 'Nizza', Marseille: 'Marsiglia', Lyon: 'Lione', Barcelona: 'Barcellona', Seville: 'Siviglia', 'The Hague': "L'Aia", Antwerp: 'Anversa', Bucharest: 'Bucarest', Paris: 'Parigi', London: 'Londra', Lisbon: 'Lisbona', Brussels: 'Bruxelles', Zurich: 'Zurigo', Vienna: 'Vienna', Berlin: 'Berlino', Madrid: 'Madrid', Athens: 'Atene', Copenhagen: 'Copenaghen', Warsaw: 'Varsavia', Prague: 'Praga', Moscow: 'Mosca' };

export function rilevaZona(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (!tz.includes('/') || tz.startsWith('Etc/')) return '';
    const citta = (tz.split('/').pop() || '').replace(/_/g, ' ');
    return CITTA_IT[citta] || citta;
  } catch { return ''; }
}

// Posizione approssimata dalla rete (vedi app/api/posizione): città e
// coordinate arrotondate, mai l'indirizzo IP. Si chiede una volta per
// sessione; se non è disponibile resta la città del fuso orario, senza
// punto sulla mappa.
export type Posizione = { zona: string; lat: number | null; lon: number | null };

function nomePaese(codice: string): string {
  try { return new Intl.DisplayNames(['it'], { type: 'region' }).of(codice) || codice; } catch { return codice; }
}

export async function ottieniPosizione(): Promise<Posizione> {
  const CHIAVE = 'design3_posizione_voto';
  try {
    const salvata = sessionStorage.getItem(CHIAVE);
    if (salvata) return JSON.parse(salvata);
  } catch {}
  let pos: Posizione = { zona: rilevaZona(), lat: null, lon: null };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const r = await fetch('/api/posizione', { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    const d = await r.json();
    if (d && (d.citta || d.paese)) {
      const citta = CITTA_IT[d.citta] || d.citta;
      pos = { zona: citta || nomePaese(d.paese), lat: typeof d.lat === 'number' ? d.lat : null, lon: typeof d.lon === 'number' ? d.lon : null };
    }
  } catch {}
  try { sessionStorage.setItem(CHIAVE, JSON.stringify(pos)); } catch {}
  return pos;
}

export function idDispositivo(): string {
  const K = 'design3_dispositivo_voto';
  try {
    let v = localStorage.getItem(K);
    if (!v) {
      v = (crypto as any).randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
      localStorage.setItem(K, v);
    }
    return v;
  } catch {
    return 'sessione-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
}

export const ETICHETTA_DISPOSITIVO: Record<string, string> = {
  smartphone: 'Smartphone', tablet: 'Tablet', computer: 'Computer', altro: 'Altro',
};

// Le immagini si comprimono con la funzione già usata da tutta la piattaforma.
export { comprimiImmagine } from './immagine';

// Statistiche aggregate, aggiornate di continuo. Restituisce anche lo
// scarto tra orologio del server e del browser, per countdown precisi.
export function useStatistiche(contestId: string | null, intervallo = 2500, passcode?: string) {
  const [stat, setStat] = useState<Statistiche | null>(null);
  const [scarto, setScarto] = useState(0);
  const attivo = useRef(true);

  useEffect(() => {
    attivo.current = true;
    if (!contestId) { setStat(null); return; }
    let timer: any;
    const carica = async () => {
      const t0 = Date.now();
      const { data, error } = await supabase.rpc('contest_statistiche', {
        p_contest_id: contestId, p_passcode: passcode || null,
      });
      if (!attivo.current) return;
      if (!error && data) {
        const s = data as Statistiche;
        const t1 = Date.now();
        setScarto(new Date(s.ora).getTime() - (t0 + t1) / 2);
        setStat(s);
      }
      timer = setTimeout(carica, document.hidden ? intervallo * 4 : intervallo);
    };
    carica();
    return () => { attivo.current = false; clearTimeout(timer); };
  }, [contestId, intervallo, passcode]);

  return { stat, scarto };
}

export function useAdesso(scarto = 0, ogniMs = 250) {
  const [ora, setOra] = useState(() => Date.now() + scarto);
  useEffect(() => {
    const t = setInterval(() => setOra(Date.now() + scarto), ogniMs);
    return () => clearInterval(t);
  }, [scarto, ogniMs]);
  return ora;
}

export function scomponiDurata(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { g: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

export function riduciMovimento(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function tempoFa(iso: string, adesso: number): string {
  const d = Math.max(0, Math.round((adesso - new Date(iso).getTime()) / 1000));
  if (d < 5) return 'ora';
  if (d < 60) return `${d}s fa`;
  if (d < 3600) return `${Math.floor(d / 60)} min fa`;
  if (d < 86400) return `${Math.floor(d / 3600)} h fa`;
  return `${Math.floor(d / 86400)} g fa`;
}

export const pad = (n: number, l = 2) => String(n).padStart(l, '0');
