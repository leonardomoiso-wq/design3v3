-- Aggiunge una colonna "updated_at" mantenuta automaticamente da un trigger,
-- cosi' il browser puo' capire quali casi studio sono cambiati dall'ultima
-- visita senza dover riscaricare le immagini di tutti i 100+ casi ogni
-- volta: si scarica un elenco leggero (id + updated_at) e solo le righe
-- nuove o modificate vengono davvero riscaricate (il resto arriva dalla
-- cache locale del browser, vedi lib/cacheCasi.ts).
--
-- Da eseguire nel SQL editor di Supabase dopo tutte le migrazioni/lo
-- script precedenti.

alter table casi_studio add column if not exists updated_at timestamptz not null default now();

create or replace function casi_studio_imposta_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_casi_studio_updated_at on casi_studio;
create trigger trg_casi_studio_updated_at
before update on casi_studio
for each row
execute function casi_studio_imposta_updated_at();

notify pgrst, 'reload schema';
