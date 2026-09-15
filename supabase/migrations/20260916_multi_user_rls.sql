-- Rende la piattaforma sicura per l'uso simultaneo di più gruppi:
-- - ogni caso studio è protetto da un codice di gruppo (hash, mai in chiaro)
-- - tutte le scritture passano da funzioni che verificano il codice/passcode
--   lato server, non più da chiamate dirette insert/update/delete sulla
--   tabella con la sola anon key condivisa da tutti.
--
-- Da eseguire per intero nel SQL editor di Supabase, DOPO aver applicato
-- la migrazione 20260915_add_tags_column.sql.

create extension if not exists pgcrypto;

alter table casi_studio
  add column if not exists codice_hash text;

-- Riga singola di configurazione per il passcode docente. Il valore di
-- default corrisponde alla password attualmente hardcoded nel client
-- ("admin2026"): cambiala qui e nel codice se vuoi sostituirla.
create table if not exists docente_config (
  id boolean primary key default true,
  passcode_hash text not null,
  constraint docente_config_singleton check (id)
);

insert into docente_config (id, passcode_hash)
values (true, crypt('admin2026', gen_salt('bf')))
on conflict (id) do nothing;

alter table casi_studio enable row level security;
alter table docente_config enable row level security;

-- Lettura pubblica: serve alla matrice, al radar e all'elenco studenti.
drop policy if exists "casi_studio_select_pubblico" on casi_studio;
create policy "casi_studio_select_pubblico"
  on casi_studio for select
  using (true);

-- Nessuna policy insert/update/delete per il ruolo anon: da qui in poi
-- ogni scrittura deve passare dalle funzioni SECURITY DEFINER seguenti.

-- === Scritture studenti ===

create or replace function crea_caso_studio(
  p_gruppo_nome text,
  p_gruppo_num int,
  p_titolo text,
  p_descrizione text,
  p_immagine text,
  p_tags text[],
  p_driver jsonb,
  p_x numeric,
  p_y numeric,
  p_codice text
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if p_codice is null or length(trim(p_codice)) < 4 then
    raise exception 'codice_troppo_corto';
  end if;

  insert into casi_studio (
    gruppo_nome, gruppo_num, titolo, descrizione, immagine, tags, driver, x, y, codice_hash
  ) values (
    p_gruppo_nome, p_gruppo_num, p_titolo, p_descrizione, p_immagine, p_tags, p_driver, p_x, p_y,
    crypt(p_codice, gen_salt('bf'))
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function aggiorna_caso_studio(
  p_id bigint,
  p_codice text,
  p_gruppo_nome text,
  p_gruppo_num int,
  p_titolo text,
  p_descrizione text,
  p_immagine text,
  p_tags text[],
  p_driver jsonb,
  p_x numeric,
  p_y numeric
) returns void
language plpgsql
security definer
set search_path = public
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

  update casi_studio set
    gruppo_nome = p_gruppo_nome,
    gruppo_num = p_gruppo_num,
    titolo = p_titolo,
    descrizione = p_descrizione,
    immagine = p_immagine,
    tags = p_tags,
    driver = p_driver,
    x = p_x,
    y = p_y
  where id = p_id;
end;
$$;

-- === Scritture docente ===

create or replace function docente_aggiorna_posizione(
  p_id bigint,
  p_x numeric,
  p_y numeric,
  p_driver jsonb,
  p_passcode text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash
  ) then
    raise exception 'passcode_errato';
  end if;

  update casi_studio set x = p_x, y = p_y, driver = p_driver where id = p_id;
end;
$$;

create or replace function docente_resetta_tutto(p_passcode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash
  ) then
    raise exception 'passcode_errato';
  end if;

  delete from casi_studio;
end;
$$;

grant execute on function crea_caso_studio to anon;
grant execute on function aggiorna_caso_studio to anon;
grant execute on function docente_aggiorna_posizione to anon;
grant execute on function docente_resetta_tutto to anon;
