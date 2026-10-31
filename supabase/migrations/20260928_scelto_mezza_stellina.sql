-- Il contrassegno "scelto" passa da un semplice sì/no a un valore a due
-- livelli: mezza stellina o stellina intera (0 / 0.5 / 1), mostrato come
-- simbolo (niente più l'etichetta testuale "Scelto").
--
-- Da eseguire nel SQL editor di Supabase dopo tutte le migrazioni/lo
-- script precedenti, inclusa 20260928_caso_studio_scelto.sql.

alter table casi_studio alter column scelto drop default;
alter table casi_studio alter column scelto type numeric(2,1)
  using (case when scelto then 1 else 0 end);
alter table casi_studio alter column scelto set default 0;
alter table casi_studio add constraint casi_studio_scelto_valori
  check (scelto in (0, 0.5, 1));

-- La vecchia funzione prendeva un booleano: va sostituita, non solo
-- "or replace" (Postgres tratta un parametro di tipo diverso come una
-- funzione diversa, e lascerebbe quella vecchia inutilizzata a fianco).
drop function if exists docente_imposta_scelto(bigint, boolean, text);

create or replace function docente_imposta_scelto(
  p_caso_id bigint,
  p_valore numeric,
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

  if p_valore not in (0, 0.5, 1) then
    raise exception 'valore_non_valido';
  end if;

  update casi_studio set scelto = p_valore where id = p_caso_id;
end;
$$;

grant execute on function docente_imposta_scelto to anon;

-- Qualsiasi livello (mezza o intera) conta come "scelto" ai fini della
-- selezione automatica per la Peer Review.
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

  update casi_studio set incluso_revisione = (scelto > 0) where true;
end;
$$;

grant execute on function docente_seleziona_revisione_da_scelti to anon;

notify pgrst, 'reload schema';
