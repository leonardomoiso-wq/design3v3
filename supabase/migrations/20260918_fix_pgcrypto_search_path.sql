-- Corregge un bug nelle migrazioni precedenti: tutte le funzioni che usano
-- crypt()/gen_salt() (verifica di codici gruppo e passcode docente) erano
-- definite con `set search_path = public`, ma su Supabase l'estensione
-- pgcrypto è preinstallata nello schema "extensions", non in "public".
-- Risultato: ogni chiamata a queste funzioni falliva con un errore del
-- tipo "function crypt(text, text) does not exist" — quindi creazione,
-- modifica, reset, riposizionamento e apertura/gestione della votazione
-- non funzionavano.
--
-- Da eseguire nel SQL editor di Supabase DOPO tutte le migrazioni
-- precedenti (20260915, 20260916, 20260917).

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
set search_path = public, extensions
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

create or replace function docente_aggiorna_posizione(
  p_id bigint,
  p_x numeric,
  p_y numeric,
  p_driver jsonb,
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

  update casi_studio set x = p_x, y = p_y, driver = p_driver where id = p_id;
end;
$$;

create or replace function docente_resetta_tutto(p_passcode text)
returns void
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

  delete from casi_studio;
end;
$$;

create or replace function docente_imposta_caso_attivo(
  p_caso_id bigint,
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

  update revisione_stato set caso_attivo_id = p_caso_id where id = true;
end;
$$;

create or replace function docente_azzera_voti(
  p_caso_id bigint,
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

  delete from voti_revisione where caso_id = p_caso_id;
end;
$$;

create or replace function docente_imposta_esito_revisione(
  p_caso_id bigint,
  p_esito text,
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

  if p_esito is not null and p_esito not in ('verde', 'giallo', 'rosso') then
    raise exception 'esito_non_valido';
  end if;

  update casi_studio set esito_revisione = p_esito where id = p_caso_id;
end;
$$;
