-- =============================================================
-- Crazy 8: team propri dell'attività, bacheca dei contesti, due domande
-- HMW riviste dal/dalla docente, sketch sbloccati dal/dalla docente.
--
-- 1. team_attivita: ogni attività ha la sua composizione dei team (nome,
--    membri, password). Entrando in Crazy 8 uno studente crea il team,
--    gli altri entrano con nome e password. La consegna del team usa la
--    stessa password come codice (si copia l'hash: nessun secondo codice).
-- 2. contesti_crazy8: la bacheca dei contesti curata dal/dalla docente;
--    attivita.config.contesti_per_team dice quanti contesti sceglie ogni
--    team (0 = tutti quelli che vuole).
-- 3. submission_crazy8: contesti scelti, due HMW (azione, utente,
--    risultato, contesto), invio al docente, revisione del docente per
--    ogni domanda, sblocco degli sketch. immagini.domanda dice a quale
--    delle due domande risponde uno sketch.
-- 4. Funzioni docente: eliminare consegne e team, rivedere le HMW,
--    sbloccare gli sketch (a un team o a tutti).
--
-- Da eseguire nel SQL Editor di Supabase DOPO 20261021_crazy8_riallinea,
-- insieme al deploy del codice. Idempotente.
-- =============================================================

-- === Configurazione per attività ===
alter table attivita add column if not exists config jsonb not null default '{}'::jsonb;

-- === Team dell'attività ===
create table if not exists team_attivita (
  id uuid primary key default gen_random_uuid(),
  attivita_id uuid not null references attivita(id) on delete cascade,
  corso_id uuid not null,
  numero int not null,
  nome text not null,
  membri text[] not null default '{}',
  password_hash text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists team_attivita_nome_unico on team_attivita (attivita_id, lower(nome));
-- Nessuna lettura diretta (c'è l'hash della password): solo via funzioni.
alter table team_attivita enable row level security;

-- === Bacheca dei contesti ===
create table if not exists contesti_crazy8 (
  id uuid primary key default gen_random_uuid(),
  attivita_id uuid not null references attivita(id) on delete cascade,
  corso_id uuid not null,
  titolo text not null,
  descrizione text,
  ordine int not null default 0,
  created_at timestamptz not null default now()
);
alter table contesti_crazy8 enable row level security;
drop policy if exists "contesti_crazy8_select_pubblico" on contesti_crazy8;
create policy "contesti_crazy8_select_pubblico" on contesti_crazy8 for select using (true);

-- === Consegna: contesti, HMW, sblocco ===
alter table submission_crazy8 add column if not exists team_attivita_id uuid references team_attivita(id) on delete cascade;
alter table submission_crazy8 add column if not exists contesti jsonb not null default '[]'::jsonb;
alter table submission_crazy8 add column if not exists hmw jsonb not null default '[]'::jsonb;
alter table submission_crazy8 add column if not exists hmw_inviate boolean not null default false;
alter table submission_crazy8 add column if not exists hmw_revisione jsonb not null default '[]'::jsonb;
alter table submission_crazy8 add column if not exists sketch_sbloccato boolean not null default false;
alter table immagini add column if not exists domanda int;

-- Le consegne nate prima di questa migrazione (senza team dell'attività)
-- avevano già gli sketch liberi: restano sbloccate.
update submission_crazy8 set sketch_sbloccato = true where team_attivita_id is null and not sketch_sbloccato;

create unique index if not exists submission_crazy8_un_team on submission_crazy8 (team_attivita_id) where team_attivita_id is not null;

-- =============================================================
-- Team dell'attività
-- =============================================================

create or replace function elenco_team_attivita(p_attivita_id uuid)
returns table(id uuid, numero int, nome text, membri text[], creato_il timestamptz)
language sql security definer set search_path = public, extensions
as $$
  select t.id, t.numero, t.nome, t.membri, t.created_at from team_attivita t
  where t.attivita_id = p_attivita_id order by t.numero;
$$;

create or replace function crea_team_attivita(p_attivita_id uuid, p_nome text, p_membri text[], p_password text)
returns table(id uuid, numero int, nome text, membri text[])
language plpgsql security definer set search_path = public, extensions
as $$
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
  if exists (select 1 from team_attivita t where t.attivita_id = p_attivita_id and lower(t.nome) = lower(trim(p_nome))) then
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
$$;

create or replace function accedi_team_attivita(p_attivita_id uuid, p_nome text, p_password text)
returns table(id uuid, numero int, nome text, membri text[])
language plpgsql security definer set search_path = public, extensions
as $$
declare
  r team_attivita%rowtype;
begin
  select * into r from team_attivita t where t.attivita_id = p_attivita_id and lower(t.nome) = lower(trim(p_nome));
  if r.id is null or crypt(p_password, r.password_hash) <> r.password_hash then raise exception 'credenziali_errate'; end if;
  return query select r.id, r.numero, r.nome, r.membri;
end;
$$;

create or replace function aggiorna_membri_team_attivita(p_id uuid, p_password text, p_membri text[])
returns text[]
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
  v_membri text[];
begin
  select password_hash into v_hash from team_attivita where id = p_id;
  if v_hash is null or crypt(p_password, v_hash) <> v_hash then raise exception 'credenziali_errate'; end if;
  select coalesce(array_agg(trim(m)) filter (where nullif(trim(m), '') is not null), '{}') into v_membri from unnest(coalesce(p_membri, '{}')) as m;
  if cardinality(v_membri) = 0 then raise exception 'membri_mancanti'; end if;
  update team_attivita set membri = v_membri where id = p_id;
  return v_membri;
end;
$$;

-- La consegna del team: una sola per team, con la password del team
-- come codice (stesso hash), così le funzioni di Crazy 8 restano le stesse.
create or replace function crea_submission_crazy8_team(p_team_attivita_id uuid, p_password text)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  r team_attivita%rowtype;
  v_id uuid;
begin
  select * into r from team_attivita where id = p_team_attivita_id;
  if r.id is null or crypt(p_password, r.password_hash) <> r.password_hash then raise exception 'credenziali_errate'; end if;
  select id into v_id from submission_crazy8 where team_attivita_id = r.id;
  if v_id is not null then return v_id; end if;
  insert into submission_crazy8 (corso_id, attivita_id, team_attivita_id, gruppo_nome, gruppo_num, stato, codice_hash)
  values (r.corso_id, r.attivita_id, r.id, r.nome, r.numero, 'in_corso', r.password_hash)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function docente_elimina_team_attivita(p_id uuid, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform richiedi_docente((select corso_id from team_attivita where id = p_id), p_passcode);
  delete from team_attivita where id = p_id;
end;
$$;

create or replace function docente_svuota_team_attivita(p_attivita_id uuid, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform richiedi_docente((select corso_id from attivita where id = p_attivita_id), p_passcode);
  delete from team_attivita where attivita_id = p_attivita_id;
end;
$$;

-- =============================================================
-- Configurazione e bacheca dei contesti (docente)
-- =============================================================

create or replace function docente_imposta_config_attivita(p_id uuid, p_config jsonb, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform richiedi_docente((select corso_id from attivita where id = p_id), p_passcode);
  if jsonb_typeof(p_config) <> 'object' then raise exception 'config_non_valida'; end if;
  update attivita set config = config || p_config where id = p_id;
end;
$$;

create or replace function docente_salva_contesto_crazy8(p_attivita_id uuid, p_id uuid, p_titolo text, p_descrizione text, p_passcode text)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_corso uuid;
  v_id uuid := p_id;
begin
  select corso_id into v_corso from attivita where id = p_attivita_id;
  perform richiedi_docente(v_corso, p_passcode);
  if p_titolo is null or length(trim(p_titolo)) = 0 then raise exception 'titolo_mancante'; end if;
  if v_id is null then
    insert into contesti_crazy8 (attivita_id, corso_id, titolo, descrizione, ordine)
    values (p_attivita_id, v_corso, trim(p_titolo), nullif(trim(coalesce(p_descrizione, '')), ''),
            (select coalesce(max(ordine), -1) + 1 from contesti_crazy8 where attivita_id = p_attivita_id))
    returning id into v_id;
  else
    update contesti_crazy8 set titolo = trim(p_titolo), descrizione = nullif(trim(coalesce(p_descrizione, '')), '')
    where id = v_id and attivita_id = p_attivita_id;
  end if;
  return v_id;
end;
$$;

create or replace function docente_elimina_contesto_crazy8(p_id uuid, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform richiedi_docente((select corso_id from contesti_crazy8 where id = p_id), p_passcode);
  delete from contesti_crazy8 where id = p_id;
end;
$$;

-- =============================================================
-- Funzioni docente sulle consegne
-- =============================================================

create or replace function docente_elimina_submission_crazy8(p_id uuid, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform richiedi_docente((select corso_id from submission_crazy8 where id = p_id), p_passcode);
  delete from submission_crazy8 where id = p_id;
end;
$$;

-- Revisione di una delle due domande: 'ok', 'rivedere' oppure null.
create or replace function docente_revisione_hmw_crazy8(p_id uuid, p_indice int, p_stato text, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_rev jsonb;
begin
  perform richiedi_docente((select corso_id from submission_crazy8 where id = p_id), p_passcode);
  if p_indice not in (0, 1) then raise exception 'indice_non_valido'; end if;
  if p_stato is not null and p_stato not in ('ok', 'rivedere') then raise exception 'stato_non_valido'; end if;
  select hmw_revisione into v_rev from submission_crazy8 where id = p_id;
  if jsonb_typeof(v_rev) <> 'array' then v_rev := '[]'::jsonb; end if;
  while jsonb_array_length(v_rev) < 2 loop v_rev := v_rev || 'null'::jsonb; end loop;
  v_rev := jsonb_set(v_rev, array[p_indice::text], coalesce(to_jsonb(p_stato), 'null'::jsonb));
  update submission_crazy8 set hmw_revisione = v_rev where id = p_id;
end;
$$;

create or replace function docente_sblocca_sketch_crazy8(p_id uuid, p_valore boolean, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform richiedi_docente((select corso_id from submission_crazy8 where id = p_id), p_passcode);
  update submission_crazy8 set sketch_sbloccato = coalesce(p_valore, false) where id = p_id;
end;
$$;

-- Sblocca (o ri-blocca) gli sketch a tutti i team che hanno inviato le domande.
create or replace function docente_sblocca_sketch_tutti_crazy8(p_attivita_id uuid, p_valore boolean, p_passcode text)
returns int
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_n int;
begin
  perform richiedi_docente((select corso_id from attivita where id = p_attivita_id), p_passcode);
  update submission_crazy8 set sketch_sbloccato = coalesce(p_valore, false)
  where attivita_id = p_attivita_id and hmw_inviate;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- =============================================================
-- Funzioni studente: aggiornamento della consegna e sketch
-- =============================================================

create or replace function aggiorna_campi_submission_crazy8(p_id uuid, p_codice text, p_campi jsonb)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
  v_attivita uuid;
  v_max int;
begin
  select codice_hash, attivita_id into v_hash, v_attivita from submission_crazy8 where id = p_id;
  if v_hash is null then raise exception 'submission_non_trovata'; end if;
  if crypt(p_codice, v_hash) <> v_hash then raise exception 'codice_errato'; end if;

  if p_campi ? 'stato' and (p_campi ->> 'stato') not in ('in_corso', 'consegnato') then
    raise exception 'stato_non_valido';
  end if;
  if p_campi ? 'moodboard' and (
    jsonb_typeof(p_campi -> 'moodboard') <> 'array' or jsonb_array_length(p_campi -> 'moodboard') > 5
  ) then
    raise exception 'moodboard_non_valida';
  end if;
  if p_campi ? 'scenario' and jsonb_typeof(p_campi -> 'scenario') <> 'object' then
    raise exception 'scenario_non_valido';
  end if;
  if p_campi ? 'contesti' then
    if jsonb_typeof(p_campi -> 'contesti') <> 'array' then raise exception 'contesti_non_validi'; end if;
    select coalesce((config ->> 'contesti_per_team')::int, 2) into v_max from attivita where id = v_attivita;
    if coalesce(v_max, 0) > 0 and jsonb_array_length(p_campi -> 'contesti') > v_max then raise exception 'troppi_contesti'; end if;
    if exists (
      select 1 from jsonb_array_elements_text(p_campi -> 'contesti') c
      where not exists (select 1 from contesti_crazy8 k where k.id::text = c and k.attivita_id = v_attivita)
    ) then raise exception 'contesto_non_trovato'; end if;
  end if;
  if p_campi ? 'hmw' and (jsonb_typeof(p_campi -> 'hmw') <> 'array' or jsonb_array_length(p_campi -> 'hmw') > 2) then
    raise exception 'hmw_non_valide';
  end if;

  update submission_crazy8 set
    hmw_o_tema = case when p_campi ? 'sotto_ambito' then p_campi ->> 'sotto_ambito' else hmw_o_tema end,
    motore_usato = case when p_campi ? 'motore_usato' then p_campi ->> 'motore_usato' else motore_usato end,
    note_prompt = case when p_campi ? 'note_prompt' then p_campi ->> 'note_prompt' else note_prompt end,
    riflessione = case when p_campi ? 'riflessione' then p_campi ->> 'riflessione' else riflessione end,
    -- la fase raggiunta può solo avanzare
    fase_raggiunta = case when p_campi ? 'fase_raggiunta'
      then greatest(fase_raggiunta, least(9, (p_campi ->> 'fase_raggiunta')::int)) else fase_raggiunta end,
    moodboard = case when p_campi ? 'moodboard' then p_campi -> 'moodboard' else moodboard end,
    scenario = case when p_campi ? 'scenario' then p_campi -> 'scenario' else scenario end,
    concept_titolo = case when p_campi ? 'concept_titolo' then p_campi ->> 'concept_titolo' else concept_titolo end,
    concept_descrizione = case when p_campi ? 'concept_descrizione' then p_campi ->> 'concept_descrizione' else concept_descrizione end,
    concept_motivazioni = case when p_campi ? 'concept_motivazioni' then p_campi ->> 'concept_motivazioni' else concept_motivazioni end,
    contesti = case when p_campi ? 'contesti' then p_campi -> 'contesti' else contesti end,
    hmw = case when p_campi ? 'hmw' then p_campi -> 'hmw' else hmw end,
    hmw_inviate = case when p_campi ? 'hmw_inviate' then coalesce((p_campi ->> 'hmw_inviate')::boolean, false) else hmw_inviate end,
    stato = case when p_campi ? 'stato' and stato <> 'revisionato' then p_campi ->> 'stato' else stato end
  where id = p_id;
end;
$$;

-- Lo sketch ora dice a quale domanda risponde (0 o 1) e si può caricare
-- solo dopo lo sblocco del/della docente.
drop function if exists aggiungi_sketch_crazy8(uuid, text, text);

create or replace function aggiungi_sketch_crazy8(p_submission_id uuid, p_codice text, p_url_file text, p_domanda int default null)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
  v_sbloccato boolean;
  v_ordine int;
  v_id uuid;
begin
  select codice_hash, sketch_sbloccato into v_hash, v_sbloccato from submission_crazy8 where id = p_submission_id;
  if v_hash is null then raise exception 'submission_non_trovata'; end if;
  if crypt(p_codice, v_hash) <> v_hash then raise exception 'codice_errato'; end if;
  if not v_sbloccato then raise exception 'sketch_bloccati'; end if;
  if p_domanda is not null and p_domanda not in (0, 1) then raise exception 'domanda_non_valida'; end if;

  select coalesce(max(ordine), -1) + 1 into v_ordine
  from immagini where submission_id = p_submission_id and tipo = 'sketch_originale';

  insert into immagini (submission_id, tipo, ordine, url_file, domanda)
  values (p_submission_id, 'sketch_originale', v_ordine, p_url_file, p_domanda)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function elenco_team_attivita(uuid) to anon;
grant execute on function crea_team_attivita(uuid, text, text[], text) to anon;
grant execute on function accedi_team_attivita(uuid, text, text) to anon;
grant execute on function aggiorna_membri_team_attivita(uuid, text, text[]) to anon;
grant execute on function crea_submission_crazy8_team(uuid, text) to anon;
grant execute on function docente_elimina_team_attivita(uuid, text) to anon;
grant execute on function docente_svuota_team_attivita(uuid, text) to anon;
grant execute on function docente_imposta_config_attivita(uuid, jsonb, text) to anon;
grant execute on function docente_salva_contesto_crazy8(uuid, uuid, text, text, text) to anon;
grant execute on function docente_elimina_contesto_crazy8(uuid, text) to anon;
grant execute on function docente_elimina_submission_crazy8(uuid, text) to anon;
grant execute on function docente_revisione_hmw_crazy8(uuid, int, text, text) to anon;
grant execute on function docente_sblocca_sketch_crazy8(uuid, boolean, text) to anon;
grant execute on function docente_sblocca_sketch_tutti_crazy8(uuid, boolean, text) to anon;
grant execute on function aggiorna_campi_submission_crazy8(uuid, text, jsonb) to anon;
grant execute on function aggiungi_sketch_crazy8(uuid, text, text, int) to anon;

-- === Controllo del database: ora anche le parti di questa migrazione ===
create or replace function crazy8_controlla_database()
returns table(problema text)
language plpgsql security definer set search_path = public, extensions
as $$
begin
  return query
  select 'manca la colonna ' || t || '.' || c
  from (values
    ('submission_crazy8', 'fase_raggiunta'), ('submission_crazy8', 'moodboard'),
    ('submission_crazy8', 'scenario'), ('submission_crazy8', 'concept_titolo'),
    ('submission_crazy8', 'team_attivita_id'), ('submission_crazy8', 'contesti'), ('submission_crazy8', 'hmw'),
    ('submission_crazy8', 'hmw_revisione'), ('submission_crazy8', 'sketch_sbloccato'),
    ('immagini', 'selezionato'), ('immagini', 'interpretazione'), ('immagini', 'sotto_ambito'), ('immagini', 'domanda'),
    ('generazioni_crazy8', 'motore'), ('generazioni_crazy8', 'positivo'), ('generazioni_crazy8', 'negativo'),
    ('attivita', 'config')
  ) as atteso(t, c)
  where not exists (
    select 1 from information_schema.columns ic
    where ic.table_schema = 'public' and ic.table_name = atteso.t and ic.column_name = atteso.c
  );

  return query
  select 'manca la funzione ' || f
  from unnest(array['aggiorna_campi_submission_crazy8', 'aggiorna_sketch_crazy8', 'aggiorna_generazione_crazy8', 'aggiungi_generazione_crazy8',
                    'crea_team_attivita', 'crea_submission_crazy8_team', 'docente_revisione_hmw_crazy8', 'docente_sblocca_sketch_crazy8']) as f
  where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f);

  return query
  select 'aggiorna_campi_submission_crazy8 è in una versione vecchia'::text
  where exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'aggiorna_campi_submission_crazy8'
      and pg_get_functiondef(p.oid) not like '%hmw_inviate%'
  );
end;
$$;

grant execute on function crazy8_controlla_database() to anon;

-- === Realtime ===
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'contesti_crazy8') then
    alter publication supabase_realtime add table contesti_crazy8;
  end if;
end $$;
