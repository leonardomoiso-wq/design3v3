import type { RealtimeChannel } from '@supabase/supabase-js';

// Ascolta i cambiamenti di una tabella limitandoli a un corso. Supabase
// Realtime filtra INSERT/UPDATE per colonna, ma non i DELETE: questi
// arrivano per tutti i corsi e vanno gestiti in modo innocuo (es.
// rimuovere un id solo se presente, o ricaricare i dati già filtrati).
export function ascoltaCorso(
  canale: RealtimeChannel,
  tabella: string,
  corsoId: string,
  callback: (payload: any) => void
): RealtimeChannel {
  const filtro = { schema: 'public', table: tabella, filter: `corso_id=eq.${corsoId}` };
  return canale
    .on('postgres_changes' as any, { event: 'INSERT', ...filtro }, callback)
    .on('postgres_changes' as any, { event: 'UPDATE', ...filtro }, callback)
    .on('postgres_changes' as any, { event: 'DELETE', schema: 'public', table: tabella }, callback);
}
