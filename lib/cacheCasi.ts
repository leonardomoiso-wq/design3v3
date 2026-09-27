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

// Restituisce le righe aggiornate di casi_studio (formato grezzo dal db,
// snake_case) usando la cache locale per evitare di riscaricare le
// immagini di righe non cambiate dall'ultima visita.
export async function caricaCasiConCache(): Promise<{ righe: any[]; errore: string | null }> {
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
    return { righe: [], errore: messaggioErrore(erroreElenco) };
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

  let nuovi: any[] = [];
  if (daScaricare.length > 0) {
    const { data, error } = await eseguiConTimeout(signal =>
      supabase.from('casi_studio').select('*').in('id', daScaricare).abortSignal(signal)
    );
    if (error) {
      return { righe: cache.filter(r => idAttuali.has(Number(r.id))), errore: messaggioErrore(error) };
    }
    nuovi = data || [];
    await scriviCache(nuovi);
  }

  const mappaFinale = new Map(
    cache.filter(r => idAttuali.has(Number(r.id))).map(r => [Number(r.id), r])
  );
  nuovi.forEach(r => mappaFinale.set(Number(r.id), r));

  return { righe: Array.from(mappaFinale.values()), errore: null };
}
