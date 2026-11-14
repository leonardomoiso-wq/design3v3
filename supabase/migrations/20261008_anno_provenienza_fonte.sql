-- =============================================================
-- Nuovi campi del passo 1 ("Il Caso Studio") del form di caricamento:
--   - anno: anno di realizzazione/pubblicazione del caso studio;
--   - provenienza: 'italia' o 'estero';
--   - fonte: sito web o fonte da cui il caso studio è tratto.
-- Anno e provenienza compaiono nelle card dei casi studio.
--
-- Le consegne già esistenti restano senza questi valori (NULL): sono
-- obbligatori solo per le nuove consegne e quando una consegna viene
-- modificata (controllo nel form).
--
-- Da eseguire nel SQL editor di Supabase DOPO 20261007_multi_corso.sql,
-- insieme al deploy del codice aggiornato. Idempotente.
-- =============================================================

alter table casi_studio add column if not exists anno int;
alter table casi_studio add column if not exists provenienza text;
alter table casi_studio add column if not exists fonte text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'casi_studio_anno_valido') then
    alter table casi_studio add constraint casi_studio_anno_valido check (anno is null or anno between 1000 and 2100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'casi_studio_provenienza_valida') then
    alter table casi_studio add constraint casi_studio_provenienza_valida check (provenienza is null or provenienza in ('italia', 'estero'));
  end if;
end $$;

-- I nuovi parametri hanno un default, così un client non ancora
-- aggiornato continua a funzionare (salvando i campi vuoti).

drop function if exists crea_caso_studio(uuid, text, int, text, text, text, text[], jsonb, numeric, numeric, text);

create or replace function crea_caso_studio(
  p_corso_id uuid,
  p_gruppo_nome text,
  p_gruppo_num int,
  p_titolo text,
  p_descrizione text,
  p_immagine text,
  p_tags text[],
  p_driver jsonb,
  p_x numeric,
  p_y numeric,
  p_codice text,
  p_anno int default null,
  p_provenienza text default null,
  p_fonte text default null
) returns bigint
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id bigint;
begin
  if not exists (select 1 from corsi where id = p_corso_id and not archiviato) then
    raise exception 'corso_non_trovato';
  end if;
  if p_codice is null or length(trim(p_codice)) < 4 then
    raise exception 'codice_troppo_corto';
  end if;
  if p_provenienza is not null and p_provenienza not in ('italia', 'estero') then
    raise exception 'provenienza_non_valida';
  end if;

  insert into casi_studio (
    corso_id, gruppo_nome, gruppo_num, titolo, descrizione, immagine, tags, driver, x, y, codice_hash,
    anno, provenienza, fonte
  ) values (
    p_corso_id, p_gruppo_nome, p_gruppo_num, p_titolo, p_descrizione, p_immagine, p_tags, p_driver, p_x, p_y,
    crypt(p_codice, gen_salt('bf')),
    p_anno, p_provenienza, nullif(trim(coalesce(p_fonte, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

drop function if exists aggiorna_caso_studio(bigint, text, text, int, text, text, text, text[], jsonb, numeric, numeric);

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
  p_y numeric,
  p_anno int default null,
  p_provenienza text default null,
  p_fonte text default null
) returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select codice_hash into v_hash from casi_studio where id = p_id;
  if v_hash is null then raise exception 'caso_non_trovato'; end if;
  if crypt(p_codice, v_hash) <> v_hash then raise exception 'codice_errato'; end if;
  if p_provenienza is not null and p_provenienza not in ('italia', 'estero') then
    raise exception 'provenienza_non_valida';
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
    y = p_y,
    anno = p_anno,
    provenienza = p_provenienza,
    fonte = nullif(trim(coalesce(p_fonte, '')), '')
  where id = p_id;
end;
$$;

grant execute on function crea_caso_studio(uuid, text, int, text, text, text, text[], jsonb, numeric, numeric, text, int, text, text) to anon;
grant execute on function aggiorna_caso_studio(bigint, text, text, int, text, text, text, text[], jsonb, numeric, numeric, int, text, text) to anon;

notify pgrst, 'reload schema';
