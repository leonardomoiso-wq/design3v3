-- =============================================================
-- Estende il teambuilding con:
-- - l'elenco dei nomi degli studenti del team (compilato alla
--   creazione, modificabile in seguito dal team stesso);
-- - due funzioni per il/la docente: scaricare l'elenco dei team
--   formati e azzerare tutti i team (utile passando da un'attività/
--   edizione del corso all'altra, quando serve ripartire con nuovi
--   team senza i vecchi login già salvati nei browser degli studenti).
-- =============================================================

alter table team add column if not exists membri text[] not null default '{}';

-- Le firme di crea_team/login_team cambiano (restituiscono anche i
-- membri): le vecchie versioni vanno ritirate esplicitamente prima di
-- ricrearle, perché create or replace non permette di cambiare il
-- tipo di ritorno.
drop function if exists crea_team(text, text, text, text);
drop function if exists login_team(text, text);

create or replace function crea_team(
  p_nome text,
  p_password text,
  p_domanda_segreta text,
  p_risposta_segreta text,
  p_membri text[] default '{}'
)
returns table(id uuid, numero int, nome text, membri text[])
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_numero int;
  v_id uuid;
  v_membri text[];
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
  select coalesce(array_agg(nullif(trim(m), '')) filter (where nullif(trim(m), '') is not null), '{}')
    into v_membri
    from unnest(p_membri) as m;

  insert into team (numero, nome, password_hash, domanda_segreta, risposta_hash, membri)
  values (
    v_numero,
    trim(p_nome),
    crypt(p_password, gen_salt('bf')),
    trim(p_domanda_segreta),
    crypt(lower(trim(p_risposta_segreta)), gen_salt('bf')),
    v_membri
  )
  returning team.id into v_id;

  return query select v_id, v_numero, trim(p_nome), v_membri;
end;
$$;

create or replace function login_team(p_nome text, p_password text)
returns table(id uuid, numero int, nome text, membri text[])
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
  v_id uuid;
  v_numero int;
  v_nome text;
  v_membri text[];
begin
  select t.id, t.numero, t.nome, t.password_hash, t.membri into v_id, v_numero, v_nome, v_hash, v_membri
  from team t where lower(t.nome) = lower(trim(p_nome));

  if v_hash is null or crypt(p_password, v_hash) <> v_hash then
    raise exception 'credenziali_errate';
  end if;

  return query select v_id, v_numero, v_nome, v_membri;
end;
$$;

create or replace function aggiorna_membri_team(p_id uuid, p_password text, p_membri text[])
returns text[]
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
  v_membri text[];
begin
  select t.password_hash into v_hash from team t where t.id = p_id;
  if v_hash is null then raise exception 'team_non_trovato'; end if;
  if crypt(p_password, v_hash) <> v_hash then raise exception 'credenziali_errate'; end if;

  select coalesce(array_agg(nullif(trim(m), '')) filter (where nullif(trim(m), '') is not null), '{}')
    into v_membri
    from unnest(p_membri) as m;

  update team set membri = v_membri where id = p_id;
  return v_membri;
end;
$$;

create or replace function docente_lista_team(p_passcode text)
returns table(numero int, nome text, membri text[], creato_il timestamptz)
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash) then
    raise exception 'passcode_errato';
  end if;

  return query select t.numero, t.nome, t.membri, t.created_at from team t order by t.numero asc;
end;
$$;

create or replace function docente_elimina_tutti_team(p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash) then
    raise exception 'passcode_errato';
  end if;

  delete from team;
end;
$$;

grant execute on function crea_team to anon;
grant execute on function login_team to anon;
grant execute on function aggiorna_membri_team to anon;
grant execute on function docente_lista_team to anon;
grant execute on function docente_elimina_tutti_team to anon;
