-- Permette al/alla docente di scegliere quali casi studio includere
-- nella sequenza di Peer Review in Aula, invece di doverli discutere
-- tutti nell'ordine di invio. Di default tutti i casi sono inclusi
-- (comportamento invariato finché non si usa il pannello di selezione).
--
-- Da eseguire nel SQL editor di Supabase dopo tutte le migrazioni/lo
-- script precedenti.

alter table casi_studio add column if not exists incluso_revisione boolean not null default true;

create or replace function docente_imposta_inclusione_revisione(
  p_caso_id bigint,
  p_incluso boolean,
  p_passcode text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash
  ) then
    raise exception 'passcode_errato';
  end if;

  update casi_studio set incluso_revisione = p_incluso where id = p_caso_id;
end;
$$;

grant execute on function docente_imposta_inclusione_revisione to anon;

notify pgrst, 'reload schema';
