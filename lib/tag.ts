import { supabase } from './supabase';

// Tag predefiniti del passo "Temi", raggruppati in categorie ("layer").
// Ogni categoria dice se si può scegliere una sola voce o più voci e se
// almeno una è obbligatoria. I tag senza categoria formano un gruppo
// libero ("Altri temi").

export type TagDefault = { id: string; testo: string };

export type CategoriaTag = {
  id: string;
  nome: string;
  ordine: number;
  selezione: 'singola' | 'multipla';
  obbligatoria: boolean;
  tag: TagDefault[];
};

export type TagCorso = { categorie: CategoriaTag[]; senzaCategoria: TagDefault[] };

export const TAG_VUOTI: TagCorso = { categorie: [], senzaCategoria: [] };

// Esempio pronto da inserire con un clic dal pannello docente.
export const CATEGORIE_ESEMPIO: { nome: string; selezione: 'singola' | 'multipla'; obbligatoria: boolean; tag: string[] }[] = [
  { nome: "Natura dell'Innovazione", selezione: 'multipla', obbligatoria: true, tag: ['Prodotto', 'Servizio', 'Processo'] },
  { nome: 'Tipologia', selezione: 'multipla', obbligatoria: true, tag: ['Packaging', 'Prodotto Edibile', 'Spazio'] },
  { nome: 'Ampiezza', selezione: 'singola', obbligatoria: true, tag: ['Modulare', 'Architetturale', 'Incrementale', 'Dirompente'] },
];

export async function caricaTagCorso(corsoId: string): Promise<{ dati: TagCorso; errore: boolean }> {
  const [{ data: cat, error: e1 }, { data: tag, error: e2 }] = await Promise.all([
    supabase.from('categorie_tag').select('id, nome, ordine, selezione, obbligatoria').eq('corso_id', corsoId).order('ordine', { ascending: true }),
    supabase.from('tag_default_caso_studio').select('id, testo, ordine, categoria_id').eq('corso_id', corsoId).order('ordine', { ascending: true }),
  ]);
  if (e2) return { dati: TAG_VUOTI, errore: true };
  const righe = (tag || []) as { id: string; testo: string; categoria_id: string | null }[];
  // Se la tabella delle categorie non esiste ancora (migrazione non
  // eseguita) si mostrano comunque tutti i tag, senza raggruppamento.
  const categorie: CategoriaTag[] = e1
    ? []
    : ((cat || []) as any[]).map(c => ({
        id: c.id,
        nome: c.nome,
        ordine: c.ordine,
        selezione: c.selezione === 'singola' ? 'singola' : 'multipla',
        obbligatoria: !!c.obbligatoria,
        tag: righe.filter(t => t.categoria_id === c.id).map(t => ({ id: t.id, testo: t.testo })),
      }));
  const idCategorie = new Set(categorie.map(c => c.id));
  const senzaCategoria = righe.filter(t => !t.categoria_id || !idCategorie.has(t.categoria_id)).map(t => ({ id: t.id, testo: t.testo }));
  return { dati: { categorie, senzaCategoria }, errore: false };
}

// Tutti i testi di tag predefiniti (per distinguere quelli personalizzati).
export function testiTag(dati: TagCorso): string[] {
  return [...dati.categorie.flatMap(c => c.tag.map(t => t.testo)), ...dati.senzaCategoria.map(t => t.testo)];
}

// Raggruppa i tag di un caso studio secondo le categorie del corso; quelli
// senza categoria (o scritti dagli studenti) finiscono in "Altri temi".
export function raggruppaTag(tags: string[], dati: TagCorso): { nome: string; tag: string[] }[] {
  const restanti = new Set(tags);
  const gruppi = dati.categorie
    .map(c => {
      const scelti = c.tag.map(t => t.testo).filter(t => restanti.has(t));
      scelti.forEach(t => restanti.delete(t));
      return { nome: c.nome, tag: scelti };
    })
    .filter(g => g.tag.length > 0);
  if (restanti.size > 0) gruppi.push({ nome: gruppi.length > 0 ? 'Altri temi' : 'Temi', tag: Array.from(restanti) });
  return gruppi;
}
