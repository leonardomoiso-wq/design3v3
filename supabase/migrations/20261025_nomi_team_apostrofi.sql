-- =============================================================
-- Nomi dei team: apostrofi e virgolette tipografiche.
-- Un team creato da telefono come «Crazy 20’s» (apostrofo curvo) non
-- si trovava scrivendo «Crazy 20's» (apostrofo dritto), e viceversa.
-- Ora i nomi si confrontano con una chiave che ignora maiuscole,
-- spazi doppi e il tipo di apostrofo o virgolette.
-- Vale per l'accesso al corso (login, recupero password, creazione) e
-- per i team delle attività (Crazy 8). Idempotente: si può rieseguire.
-- =============================================================

create or replace function chiave_nome_team(p text)
returns text
language sql immutable
as $$
  select lower(regexp_replace(trim(translate(coalesce(p, ''), '’‘ʼ`´′“”„', $q$''''''"""$q$)), '\s+', ' ', 'g'));
$$;
grant execute on function chiave_nome_team(text) to anon;

CREATE OR REPLACE FUNCTION public.login_team(p_corso_id uuid, p_nome text, p_password text)
 RETURNS TABLE(id uuid, numero integer, nome text, membri text[], tipo text, matricola text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v team%rowtype;
begin
  select * into v from team t where t.corso_id = p_corso_id and chiave_nome_team(t.nome) = chiave_nome_team(p_nome);
  if v.id is null or crypt(coalesce(p_password, ''), v.password_hash) <> v.password_hash then
    raise exception 'credenziali_errate';
  end if;
  return query select v.id, v.numero, v.nome, v.membri, v.tipo, v.matricola;
end; $function$;

CREATE OR REPLACE FUNCTION public.recupera_domanda_team(p_corso_id uuid, p_nome text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_domanda text;
begin
  select t.domanda_segreta into v_domanda from team t where t.corso_id = p_corso_id and chiave_nome_team(t.nome) = chiave_nome_team(p_nome);
  if v_domanda is null then raise exception 'team_non_trovato'; end if;
  return v_domanda;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reimposta_password_team(p_corso_id uuid, p_nome text, p_risposta_segreta text, p_nuova_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_hash text;
begin
  if p_nuova_password is null or length(trim(p_nuova_password)) < 4 then raise exception 'password_troppo_corta'; end if;
  select t.risposta_hash into v_hash from team t where t.corso_id = p_corso_id and chiave_nome_team(t.nome) = chiave_nome_team(p_nome);
  if v_hash is null then raise exception 'team_non_trovato'; end if;
  if crypt(lower(trim(p_risposta_segreta)), v_hash) <> v_hash then raise exception 'risposta_errata'; end if;
  update team set password_hash = crypt(p_nuova_password, gen_salt('bf'))
  where corso_id = p_corso_id and chiave_nome_team(nome) = chiave_nome_team(p_nome);
end;
$function$;

CREATE OR REPLACE FUNCTION public.crea_team(p_corso_id uuid, p_nome text, p_password text, p_domanda_segreta text, p_risposta_segreta text, p_membri text[] DEFAULT '{}'::text[], p_tipo text DEFAULT 'gruppo'::text, p_matricola text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, numero integer, nome text, membri text[], tipo text, matricola text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_numero int;
  v_id uuid;
  v_membri text[];
  v_tipo text := coalesce(p_tipo, 'gruppo');
  v_matricola text := normalizza_matricola(p_matricola);
begin
  if not exists (select 1 from corsi c where c.id = p_corso_id and not c.archiviato) then
    raise exception 'corso_non_trovato';
  end if;
  if v_tipo not in ('gruppo', 'individuale') then raise exception 'tipo_non_valido'; end if;
  if p_nome is null or length(regexp_replace(trim(p_nome), '\s+', ' ', 'g')) < 2 then raise exception 'nome_troppo_corto'; end if;
  -- Accesso individuale: nome e cognome, entrambi.
  if v_tipo = 'individuale' and not nome_completo(p_nome) then raise exception 'nome_cognome_mancanti'; end if;
  if v_matricola is not null then
    if v_tipo <> 'individuale' then raise exception 'matricola_solo_individuale'; end if;
    if not matricola_valida(v_matricola) then raise exception 'matricola_non_valida'; end if;
    -- Una matricola, un accesso in tutto l'ateneo.
    perform pg_advisory_xact_lock(hashtext('matricola:' || v_matricola));
    if not matricola_libera(p_corso_id, v_matricola) then raise exception 'matricola_gia_usata'; end if;
  end if;
  if p_password is null or length(trim(p_password)) < 4 then raise exception 'password_troppo_corta'; end if;
  if p_domanda_segreta is null or length(trim(p_domanda_segreta)) = 0 then raise exception 'domanda_mancante'; end if;
  if p_risposta_segreta is null or length(trim(p_risposta_segreta)) = 0 then raise exception 'risposta_mancante'; end if;
  if exists (select 1 from team t where t.corso_id = p_corso_id and chiave_nome_team(t.nome) = chiave_nome_team(p_nome)) then
    raise exception 'nome_gia_usato';
  end if;

  select coalesce(max(t.numero), 0) + 1 into v_numero from team t where t.corso_id = p_corso_id;
  if v_tipo = 'individuale' then
    -- Una persona sola: il "membro" è lei stessa.
    v_membri := array[regexp_replace(trim(p_nome), '\s+', ' ', 'g')];
  else
    select coalesce(array_agg(nullif(trim(m), '')) filter (where nullif(trim(m), '') is not null), '{}')
      into v_membri
      from unnest(coalesce(p_membri, '{}')) as m;
  end if;

  insert into team (corso_id, numero, nome, password_hash, domanda_segreta, risposta_hash, membri, tipo, matricola)
  values (
    p_corso_id, v_numero, regexp_replace(trim(p_nome), '\s+', ' ', 'g'),
    crypt(p_password, gen_salt('bf')),
    trim(p_domanda_segreta),
    crypt(lower(trim(p_risposta_segreta)), gen_salt('bf')),
    v_membri, v_tipo, v_matricola
  )
  returning team.id into v_id;

  return query select v_id, v_numero, regexp_replace(trim(p_nome), '\s+', ' ', 'g'), v_membri, v_tipo, v_matricola;
end;
$function$;

CREATE OR REPLACE FUNCTION public.accedi_team_attivita(p_attivita_id uuid, p_nome text, p_password text)
 RETURNS TABLE(id uuid, numero integer, nome text, membri text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  r team_attivita%rowtype;
begin
  select * into r from team_attivita t where t.attivita_id = p_attivita_id and chiave_nome_team(t.nome) = chiave_nome_team(p_nome);
  if r.id is null or crypt(p_password, r.password_hash) <> r.password_hash then raise exception 'credenziali_errate'; end if;
  return query select r.id, r.numero, r.nome, r.membri;
end;
$function$;

CREATE OR REPLACE FUNCTION public.crea_team_attivita(p_attivita_id uuid, p_nome text, p_membri text[], p_password text)
 RETURNS TABLE(id uuid, numero integer, nome text, membri text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_corso uuid;
  v_numero int;
  v_id uuid;
  v_membri text[];
begin
  select a.corso_id into v_corso from attivita a where a.id = p_attivita_id;
  if v_corso is null then raise exception 'attivita_non_trovata'; end if;
  if p_nome is null or length(trim(p_nome)) < 2 then raise exception 'nome_troppo_corto'; end if;
  if p_password is null or length(trim(p_password)) < 4 then raise exception 'password_troppo_corta'; end if;
  if exists (select 1 from team_attivita t where t.attivita_id = p_attivita_id and chiave_nome_team(t.nome) = chiave_nome_team(p_nome)) then
    raise exception 'nome_gia_usato';
  end if;
  select coalesce(array_agg(trim(m)) filter (where nullif(trim(m), '') is not null), '{}') into v_membri from unnest(coalesce(p_membri, '{}')) as m;
  if cardinality(v_membri) = 0 then raise exception 'membri_mancanti'; end if;
  select coalesce(max(t.numero), 0) + 1 into v_numero from team_attivita t where t.attivita_id = p_attivita_id;

  insert into team_attivita (attivita_id, corso_id, numero, nome, membri, password_hash)
  values (p_attivita_id, v_corso, v_numero, trim(p_nome), v_membri, crypt(p_password, gen_salt('bf')))
  returning team_attivita.id into v_id;
  return query select v_id, v_numero, trim(p_nome), v_membri;
end;
$function$;
