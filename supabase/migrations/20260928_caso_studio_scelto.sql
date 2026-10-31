-- Permette al/alla docente di contrassegnare un caso studio come
-- "interessante" (scelto): il segno resta visibile in matrice e radar, e
-- un'unica azione può usarlo per impostare in blocco la selezione dei casi
-- da discutere nella Peer Review in Aula.
--
-- Da eseguire nel SQL editor di Supabase dopo tutte le migrazioni/lo
-- script precedenti.

alter table casi_studio add column if not exists scelto boolean not null default false;

create or replace function docente_imposta_scelto(
  p_caso_id bigint,
  p_scelto boolean,
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

  update casi_studio set scelto = p_scelto where id = p_caso_id;
end;
$$;

grant execute on function docente_imposta_scelto to anon;

-- Applica in un colpo solo la marcatura "scelto" alla selezione per la Peer
-- Review (incluso_revisione = scelto per tutti i casi): questa tabella ha
-- l'estensione pg-safeupdate attiva, che rifiuta un UPDATE senza WHERE
-- anche dentro una funzione SECURITY DEFINER — da qui il "where true".
create or replace function docente_seleziona_revisione_da_scelti(
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

  update casi_studio set incluso_revisione = scelto where true;
end;
$$;

grant execute on function docente_seleziona_revisione_da_scelti to anon;

notify pgrst, 'reload schema';
