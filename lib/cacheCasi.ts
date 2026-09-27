import { supabase } from './supabase';

// Cache locale (IndexedDB) dei casi_studio: evita di riscaricare le
// immagini (spesso centinaia di KB ciascuna) di casi gia' visti in una
// visita precedente. A ogni caricamento si interroga solo un elenco
// leggero (id + updated_at, senza immagini) e si riscaricano per intero
// soltanto le righe nuove o cambiate da allora; le altre vengono lette
// dalla cache del browser. Richiede la colonna updated_at aggiunta dalla
// migrazione 20260927_updated_at_casi_studio.sql.

const DB_NOME = 'design3v3-cache';
const STORE = 'casi_studio';
const DB_VERSIONE = 1;

function apriDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexeddb_non_disponibile'));
      return;
    }
    const richiesta = indexedDB.open(DB_NOME, DB_VERSIONE);
    richiesta.onupgradeneeded = () => {
      if (!richiesta.result.objectStoreNames.contains(STORE)) {
        richiesta.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    richiesta.onsuccess = () => resolve(richiesta.result);
    richiesta.onerror = () => reject(richiesta.error);
    // "onblocked" (un'altra scheda con una versione diversa del DB aperta) e
    // qualsiasi altro caso limite in cui indexedDB.open non chiama mai
    // onsuccess/onerror non devono bloccare per sempre il caricamento dei
    // casi studio: dopo un timeout si rinuncia alla cache per questo giro.
    richiesta.onblocked = () => reject(new Error('indexeddb_bloccato'));
  });
}

function conTimeout<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promessa.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); }
    );
  });
}

function apriDbConTimeout(): Promise<IDBDatabase> {
  return conTimeout(apriDb(), 2000);
}

async function leggiCache(): Promise<any[]> {
  try {
    const db = await apriDbConTimeout();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const richiesta = tx.objectStore(STORE).getAll();
      richiesta.onsuccess = () => resolve(richiesta.result || []);
      richiesta.onerror = () => reject(richiesta.error);
    });
  } catch {
    // Safari in navigazione privata, quota esaurita, browser molto vecchi...
    // in questi casi si procede semplicemente senza cache.
    return [];
  }
}

async function scriviCache(righe: any[]): Promise<void> {
  if (righe.length === 0) return;
  try {
    const db = await apriDbConTimeout();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      righe.forEach(r => store.put(r));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Non blocca l'app: al prossimo caricamento si ritenterà da zero.
  }
}

async function rimuoviDallaCache(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const db = await apriDbConTimeout();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      ids.forEach(id => store.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // idem
  }
}

// Da chiamare quando un evento realtime porta gia' la riga aggiornata:
// tiene la cache in sincrono cosi' il prossimo caricamento non deve
// riscaricarla di nuovo.
export async function aggiornaCacheCaso(riga: any): Promise<void> {
  if (riga) await scriviCache([riga]);
}

export async function rimuoviCasoDallaCache(id: number): Promise<void> {
  await rimuoviDallaCache([id]);
}

// Da chiamare dopo un reset completo (docente_resetta_tutto): la cache
// locale non deve continuare a mostrare casi ormai cancellati sul server.
export async function svuotaCacheCasi(): Promise<void> {
  try {
    const db = await apriDbConTimeout();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // idem
  }
}

// Un fetch che non risponde mai (rete instabile, tabella troppo pesante)
// non deve tenere la pagina in caricamento all'infinito senza dire nulla:
// dopo TIMEOUT_MS la richiesta viene annullata e trattata come un errore
// chiaro, mostrabile all'utente.
const TIMEOUT_MS = 20000;

function eseguiConTimeout<T>(costruisciQuery: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return Promise.resolve(costruisciQuery(controller.signal)).finally(() => clearTimeout(timer));
}

function messaggioErrore(error: any): string {
  if (error?.name === 'AbortError' || /abort/i.test(error?.message || '')) {
    return `Il caricamento è troppo lento (timeout dopo ${TIMEOUT_MS / 1000}s). Controlla la connessione e riprova.`;
  }
  return error?.message || 'Errore sconosciuto';
}

// Con una connessione lenta, scaricare tutte le immagini nuove/cambiate in
// un'unica richiesta enorme può far scadere il timeout prima che arrivi
// qualsiasi cosa: si scarica invece un piccolo gruppo di righe alla volta,
// così ogni singola richiesta resta leggera (va a buon fine anche su una
// connessione lenta) e chi guarda vede i casi studio comparire un po' alla
// volta invece di aspettare tutto o niente.
const DIMENSIONE_BLOCCO = 8;

async function scaricaAcBlocchi(
  ids: (number | string)[],
  correntiIniziali: any[],
  onProgresso?: (righeCorrenti: any[]) => void
): Promise<{ righe: any[]; errore: string | null }> {
  let correnti = correntiIniziali;
  for (let i = 0; i < ids.length; i += DIMENSIONE_BLOCCO) {
    const blocco = ids.slice(i, i + DIMENSIONE_BLOCCO);
    const { data, error } = await eseguiConTimeout(signal =>
      supabase.from('casi_studio').select('*').in('id', blocco).abortSignal(signal)
    );
    if (error) {
      // Quello scaricato finora resta comunque visibile: meglio una lista
      // parziale che ripartire da zero o restare a schermo vuoto.
      return { righe: correnti, errore: messaggioErrore(error) };
    }
    const nuovi = data || [];
    await scriviCache(nuovi);
    const mappa = new Map(correnti.map(r => [Number(r.id), r]));
    nuovi.forEach(r => mappa.set(Number(r.id), r));
    correnti = Array.from(mappa.values());
    onProgresso?.(correnti);
  }
  return { righe: correnti, errore: null };
}

// Restituisce le righe aggiornate di casi_studio (formato grezzo dal db,
// snake_case) usando la cache locale per evitare di riscaricare le
// immagini di righe non cambiate dall'ultima visita, e scaricando quelle
// nuove/cambiate a piccoli blocchi cosi' il caricamento avanza in modo
// graduale anche su una connessione lenta. Se passato, onProgresso viene
// richiamato via via che nuovi blocchi arrivano, con l'elenco più
// aggiornato disponibile in quel momento.
export async function caricaCasiConCache(
  onProgresso?: (righeCorrenti: any[]) => void
): Promise<{ righe: any[]; errore: string | null }> {
  // La cache locale (IndexedDB) non deve mai bloccare il caricamento: se
  // per qualsiasi motivo non risponde, si procede semplicemente senza.
  const cache = await leggiCache();
  const cacheMap = new Map(cache.map(r => [Number(r.id), r]));

  const { data: elenco, error: erroreElenco } = await eseguiConTimeout(signal =>
    supabase.from('casi_studio').select('id, updated_at').abortSignal(signal)
  );

  if (erroreElenco) {
    if (cache.length > 0) {
      // Query fallita ma abbiamo dati locali: meglio mostrare quelli
      // (anche se non freschissimi) che uno schermo vuoto o un errore.
      return { righe: cache, errore: null };
    }
    // La query leggera (id + updated_at) può fallire per un motivo specifico
    // della cache (es. la colonna updated_at non esiste ancora perché la
    // migrazione non è stata eseguita): la cache è solo un'ottimizzazione e
    // non deve impedire il caricamento di base. Non conosciamo ancora gli id
    // (quella query è fallita), quindi si scarica prima un elenco leggero
    // di soli id e poi si procede comunque a blocchi.
    const { data: soliId, error: erroreSoliId } = await eseguiConTimeout(signal =>
      supabase.from('casi_studio').select('id').abortSignal(signal)
    );
    if (erroreSoliId) {
      return { righe: [], errore: messaggioErrore(erroreSoliId) };
    }
    return await scaricaAcBlocchi((soliId || []).map((r: any) => r.id), [], onProgresso);
  }
  if (!elenco) return { righe: cache, errore: null };

  const idAttuali = new Set(elenco.map((r: any) => Number(r.id)));
  const daRimuovere = cache.map(r => Number(r.id)).filter(id => !idAttuali.has(id));
  if (daRimuovere.length > 0) await rimuoviDallaCache(daRimuovere);

  const daScaricare = elenco
    .filter((r: any) => {
      const inCache = cacheMap.get(Number(r.id));
      return !inCache || inCache.updated_at !== r.updated_at;
    })
    .map((r: any) => r.id);

  const correntiIniziali = cache.filter(r => idAttuali.has(Number(r.id)));
  if (daScaricare.length === 0) return { righe: correntiIniziali, errore: null };

  onProgresso?.(correntiIniziali);
  return await scaricaAcBlocchi(daScaricare, correntiIniziali, onProgresso);
}
