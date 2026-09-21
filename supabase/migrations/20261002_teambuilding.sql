-- =============================================================
-- Teambuilding: un account condiviso per team (nome + password
-- scelti dal team stesso), pensato per essere la porta d'accesso
-- all'app prima della home page con le attività. Non sostituisce
-- (per ora) il codice per-consegna già usato dalle singole attività:
-- resta un secondo layer, più comodo, che permette di non dover
-- re-inserire nome/numero gruppo ogni volta.
--
-- Sicurezza volutamente semplice (nessuna select pubblica sulla
-- tabella, password e risposta segreta in bcrypt via pgcrypto,
-- verifica solo dentro funzioni SECURITY DEFINER) coerente con lo
-- stesso livello di protezione già usato per submission_crazy8,
-- caso_studio, docente_config, ecc. in questo progetto.
-- =============================================================

create table if not exists team (
  id uuid primary key default gen_random_uuid(),
  numero int not null,
  nome text not null,
  password_hash text not null,
  domanda_segreta text not null,
  risposta_hash text not null,
  created_at timestamptz not null default now(),
  unique (nome)
);

alter table team enable row level security;
-- Nessuna policy di select: la tabella non è leggibile direttamente
-- (né da anon né da altri), solo tramite le funzioni sotto, che
-- restituiscono solo i campi non sensibili.

create or replace function crea_team(
  p_nome text,
  p_password text,
  p_domanda_segreta text,
  p_risposta_segreta text
)
returns table(id uuid, numero int, nome text)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_numero int;
  v_id uuid;
begin
  if p_nome is null or length(trim(p_nome)) < 2 then
    raise exception 'nome_troppo_corto';
  end if;
  if p_password is null or length(trim(p_password)) < 4 then
    raise exception 'password_troppo_corta';
  end if;
  if p_domanda_segreta is null or length(trim(p_domanda_segreta)) = 0 then
    raise exception 'domanda_mancante';
  end if;
  if p_risposta_segreta is null or length(trim(p_risposta_segreta)) = 0 then
    raise exception 'risposta_mancante';
  end if;
  if exists (select 1 from team t where lower(t.nome) = lower(trim(p_nome))) then
    raise exception 'nome_gia_usato';
  end if;

  select coalesce(max(t.numero), 0) + 1 into v_numero from team t;

  insert into team (numero, nome, password_hash, domanda_segreta, risposta_hash)
  values (
    v_numero,
    trim(p_nome),
    crypt(p_password, gen_salt('bf')),
    trim(p_domanda_segreta),
    crypt(lower(trim(p_risposta_segreta)), gen_salt('bf'))
  )
  returning team.id into v_id;

  return query select v_id, v_numero, trim(p_nome);
end;
$$;

create or replace function login_team(p_nome text, p_password text)
returns table(id uuid, numero int, nome text)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
  v_id uuid;
  v_numero int;
  v_nome text;
begin
  select t.id, t.numero, t.nome, t.password_hash into v_id, v_numero, v_nome, v_hash
  from team t where lower(t.nome) = lower(trim(p_nome));

  if v_hash is null or crypt(p_password, v_hash) <> v_hash then
    raise exception 'credenziali_errate';
  end if;

  return query select v_id, v_numero, v_nome;
end;
$$;

create or replace function recupera_domanda_team(p_nome text)
returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_domanda text;
begin
  select t.domanda_segreta into v_domanda from team t where lower(t.nome) = lower(trim(p_nome));
  if v_domanda is null then
    raise exception 'team_non_trovato';
  end if;
  return v_domanda;
end;
$$;

create or replace function reimposta_password_team(p_nome text, p_risposta_segreta text, p_nuova_password text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  if p_nuova_password is null or length(trim(p_nuova_password)) < 4 then
    raise exception 'password_troppo_corta';
  end if;

  select t.risposta_hash into v_hash from team t where lower(t.nome) = lower(trim(p_nome));
  if v_hash is null then
    raise exception 'team_non_trovato';
  end if;
  if crypt(lower(trim(p_risposta_segreta)), v_hash) <> v_hash then
    raise exception 'risposta_errata';
  end if;

  update team set password_hash = crypt(p_nuova_password, gen_salt('bf')) where lower(nome) = lower(trim(p_nome));
end;
$$;

grant execute on function crea_team to anon;
grant execute on function login_team to anon;
grant execute on function recupera_domanda_team to anon;
grant execute on function reimposta_password_team to anon;
