import { supabase } from './supabase';
import { comprimiImmagine } from './immagine';

// Immagini di Crazy 8 nello Storage di Supabase (bucket "crazy8"):
// per ogni immagine si caricano due file, quello intero (max 1600 px) e
// una miniatura leggera (max 420 px, "_t.jpg") per gallerie ed elenchi.
// Nel database si salva solo l'indirizzo. Se lo Storage non è
// disponibile (bucket non ancora creato) si ripiega sul vecchio modo:
// l'immagine compressa salvata come data URL nella riga.

const BUCKET = 'crazy8';

function dataUrlInBlob(dataUrl: string): Blob {
  const [testa, dati] = dataUrl.split(',');
  const tipo = testa.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const bin = atob(dati);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: tipo });
}

const idCasuale = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export async function caricaImmagineC8(corsoId: string, file: File): Promise<string> {
  const intera = await comprimiImmagine(file);
  try {
    const piccola = await comprimiImmagine(file, 420, 0.78);
    const base = `${corsoId}/${idCasuale()}`;
    const su = (percorso: string, dataUrl: string) =>
      supabase.storage.from(BUCKET).upload(percorso, dataUrlInBlob(dataUrl), { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
    const [a, b] = await Promise.all([su(`${base}.jpg`, intera), su(`${base}_t.jpg`, piccola)]);
    if (a.error || b.error) throw a.error || b.error;
    return supabase.storage.from(BUCKET).getPublicUrl(`${base}.jpg`).data.publicUrl;
  } catch {
    return intera; // Storage non disponibile: resta il salvataggio nella riga
  }
}

// Miniatura di un'immagine: per i file nello Storage è il gemello "_t.jpg",
// per le immagini salvate nella riga (consegne vecchie) è l'immagine stessa.
export function miniaturaC8(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  return /\/crazy8\/.+\.jpg$/.test(url) ? url.replace(/\.jpg$/, '_t.jpg') : url;
}
