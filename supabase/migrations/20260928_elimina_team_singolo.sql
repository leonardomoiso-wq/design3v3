-- Permette al/alla docente di eliminare un singolo team (es. creato per
-- sbaglio o duplicato), senza dover cancellare tutti i team con l'azione
-- distruttiva già esistente. "nome" è la colonna univoca della tabella
-- team (vedi 20261002_teambuilding.sql: unique(nome)), quindi identifica
-- il team in modo sicuro anche se "numero" non fosse univoco.
--
-- Da eseguire nel SQL editor di Supabase dopo tutte le migrazioni/lo
-- script precedenti.

create or replace function docente_elimina_team(
  p_nome text,
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

  delete from team where nome = p_nome;
end;
$$;

grant execute on function docente_elimina_team to anon;

notify pgrst, 'reload schema';
