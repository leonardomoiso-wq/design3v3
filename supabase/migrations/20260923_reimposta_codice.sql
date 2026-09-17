-- Permette al/alla docente di assegnare un nuovo codice di gruppo a un
-- caso studio, per i gruppi che dimenticano quello scelto alla
-- creazione. I codici sono salvati solo come hash: non sono mai
-- recuperabili, nemmeno dal database direttamente, quindi l'unica via
-- è reimpostarne uno nuovo.
--
-- Da eseguire nel SQL editor di Supabase dopo tutte le migrazioni
-- precedenti.

create or replace function docente_reimposta_codice(
  p_caso_id bigint,
  p_nuovo_codice text,
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

  if p_nuovo_codice is null or length(trim(p_nuovo_codice)) < 4 then
    raise exception 'codice_troppo_corto';
  end if;

  update casi_studio
  set codice_hash = crypt(p_nuovo_codice, gen_salt('bf'))
  where id = p_caso_id;

  if not found then
    raise exception 'caso_non_trovato';
  end if;
end;
$$;

grant execute on function docente_reimposta_codice to anon;
