-- Permette a un gruppo di cancellare la propria scheda, verificando il
-- codice come per la modifica. Cancellare un caso studio elimina anche
-- (in automatico, via i vincoli già presenti) i suoi voti di revisione;
-- se era il caso attivo in aula, la votazione si chiude da sola.
--
-- Da eseguire nel SQL editor di Supabase dopo tutte le migrazioni
-- precedenti.

create or replace function elimina_caso_studio(
  p_id bigint,
  p_codice text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select codice_hash into v_hash from casi_studio where id = p_id;

  if v_hash is null then
    raise exception 'caso_non_trovato';
  end if;

  if crypt(p_codice, v_hash) <> v_hash then
    raise exception 'codice_errato';
  end if;

  delete from casi_studio where id = p_id;
end;
$$;

grant execute on function elimina_caso_studio to anon;
