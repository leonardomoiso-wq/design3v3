-- =============================================================
-- Crazy 8: domande HMW in numero variabile, sblocco degli sketch
-- coerente con la regia dell'aula, password del team reimpostabile.
-- Idempotente: si può rieseguire.
--
-- 1. attivita.config.hmw_per_team (1–4, di norma 2): le domande, gli
--    sketch (immagini.domanda), la revisione e le stelle accettano
--    gli indici da 0 a 3.
-- 2. Sbloccare gli sketch (a un team o a tutti) apre anche la fase 3
--    nella regia, se era chiusa; «a tutti» vale per tutti i team,
--    anche per chi non ha ancora premuto «Inviate».
-- 3. Password del team dell'attività: il team la cambia conoscendo
--    quella attuale; se l'ha dimenticata la reimposta il docente.
--    Si aggiorna anche il codice della consegna (stesso hash).
-- =============================================================

-- === 1. Domande HMW in numero variabile ===
create or replace function aggiorna_campi_submission_crazy8(p_id uuid, p_codice text, p_campi jsonb)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
  v_attivita uuid;
  v_max int;
  v_hmw int;
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
  -- quante domande HMW per team: attivita.config.hmw_per_team (1–4, di norma 2)
  select least(4, greatest(1, coalesce((config ->> 'hmw_per_team')::int, 2))) into v_hmw from attivita where id = v_attivita;
  if p_campi ? 'hmw' and (jsonb_typeof(p_campi -> 'hmw') <> 'array' or jsonb_array_length(p_campi -> 'hmw') > coalesce(v_hmw, 2)) then
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
  if p_domanda is not null and (p_domanda < 0 or p_domanda > 3) then raise exception 'domanda_non_valida'; end if;

  select coalesce(max(ordine), -1) + 1 into v_ordine
  from immagini where submission_id = p_submission_id and tipo = 'sketch_originale';

  insert into immagini (submission_id, tipo, ordine, url_file, domanda)
  values (p_submission_id, 'sketch_originale', v_ordine, p_url_file, p_domanda)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function docente_revisione_hmw_crazy8(p_id uuid, p_indice int, p_stato text, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_rev jsonb;
begin
  perform richiedi_docente((select corso_id from submission_crazy8 where id = p_id), p_passcode);
  if p_indice is null or p_indice < 0 or p_indice > 3 then raise exception 'indice_non_valido'; end if;
  if p_stato is not null and p_stato not in ('ok', 'rivedere') then raise exception 'stato_non_valido'; end if;
  select hmw_revisione into v_rev from submission_crazy8 where id = p_id;
  if v_rev is null or jsonb_typeof(v_rev) <> 'array' then v_rev := '[]'::jsonb; end if;
  while jsonb_array_length(v_rev) <= p_indice loop v_rev := v_rev || 'null'::jsonb; end loop;
  v_rev := jsonb_set(v_rev, array[p_indice::text], coalesce(to_jsonb(p_stato), 'null'::jsonb));
  update submission_crazy8 set hmw_revisione = v_rev where id = p_id;
end;
$$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'voti_hmw_crazy8_indice_check') then
    alter table voti_hmw_crazy8 drop constraint voti_hmw_crazy8_indice_check;
  end if;
  alter table voti_hmw_crazy8 add constraint voti_hmw_crazy8_indice_check check (indice between 0 and 3);
end $$;

create or replace function vota_hmw_crazy8(p_team_attivita_id uuid, p_password text, p_submission_id uuid, p_indice int, p_valore boolean)
returns int
language plpgsql security definer set search_path = public, extensions
as $$
declare
  r team_attivita%rowtype;
  v_target submission_crazy8%rowtype;
  v_n int;
begin
  select * into r from team_attivita where id = p_team_attivita_id;
  if r.id is null or crypt(p_password, r.password_hash) <> r.password_hash then raise exception 'credenziali_errate'; end if;
  select * into v_target from submission_crazy8 where id = p_submission_id;
  if v_target.id is null then raise exception 'submission_non_trovata'; end if;
  if v_target.attivita_id <> r.attivita_id then raise exception 'attivita_diversa'; end if;
  if v_target.team_attivita_id = r.id then raise exception 'voto_proprio'; end if;
  if p_indice is null or p_indice < 0 or p_indice > 3 then raise exception 'indice_non_valido'; end if;

  if coalesce(p_valore, false) then
    insert into voti_hmw_crazy8 (submission_id, indice, team_attivita_id) values (p_submission_id, p_indice, r.id)
    on conflict do nothing;
  else
    delete from voti_hmw_crazy8 where submission_id = p_submission_id and indice = p_indice and team_attivita_id = r.id;
  end if;
  select count(*) into v_n from voti_hmw_crazy8 where submission_id = p_submission_id and indice = p_indice;
  return v_n;
end;
$$;

-- === 2. Sblocco degli sketch coerente con la regia ===
-- Se la regia tiene chiusa la fase 3, sbloccare gli sketch la apre.
create or replace function crazy8_apri_fase_sketch(p_attivita_id uuid)
returns void
language sql security definer set search_path = public, extensions
as $$
  update attivita set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('fase_aperta', 3)
  where id = p_attivita_id and (config ->> 'fase_aperta') is not null and (config ->> 'fase_aperta')::int < 3;
$$;
revoke all on function crazy8_apri_fase_sketch(uuid) from public, anon;

create or replace function docente_sblocca_sketch_crazy8(p_id uuid, p_valore boolean, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_attivita uuid;
begin
  perform richiedi_docente((select corso_id from submission_crazy8 where id = p_id), p_passcode);
  update submission_crazy8 set sketch_sbloccato = coalesce(p_valore, false) where id = p_id
  returning attivita_id into v_attivita;
  if coalesce(p_valore, false) and v_attivita is not null then perform crazy8_apri_fase_sketch(v_attivita); end if;
end;
$$;

create or replace function docente_sblocca_sketch_tutti_crazy8(p_attivita_id uuid, p_valore boolean, p_passcode text)
returns int
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_n int;
begin
  perform richiedi_docente((select corso_id from attivita where id = p_attivita_id), p_passcode);
  update submission_crazy8 set sketch_sbloccato = coalesce(p_valore, false)
  where attivita_id = p_attivita_id and team_attivita_id is not null;
  get diagnostics v_n = row_count;
  if coalesce(p_valore, false) then perform crazy8_apri_fase_sketch(p_attivita_id); end if;
  return v_n;
end;
$$;

-- === 3. Password del team dell'attività ===
create or replace function cambia_password_team_attivita(p_id uuid, p_password text, p_nuova text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select password_hash into v_hash from team_attivita where id = p_id;
  if v_hash is null or crypt(p_password, v_hash) <> v_hash then raise exception 'credenziali_errate'; end if;
  if p_nuova is null or length(trim(p_nuova)) < 4 then raise exception 'password_troppo_corta'; end if;
  v_hash := crypt(p_nuova, gen_salt('bf'));
  update team_attivita set password_hash = v_hash where id = p_id;
  update submission_crazy8 set codice_hash = v_hash where team_attivita_id = p_id;
end;
$$;

create or replace function docente_reimposta_password_team_attivita(p_id uuid, p_nuova text, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  perform richiedi_docente((select corso_id from team_attivita where id = p_id), p_passcode);
  if p_nuova is null or length(trim(p_nuova)) < 4 then raise exception 'password_troppo_corta'; end if;
  v_hash := crypt(p_nuova, gen_salt('bf'));
  update team_attivita set password_hash = v_hash where id = p_id;
  update submission_crazy8 set codice_hash = v_hash where team_attivita_id = p_id;
end;
$$;

grant execute on function aggiorna_campi_submission_crazy8(uuid, text, jsonb) to anon;
grant execute on function aggiungi_sketch_crazy8(uuid, text, text, int) to anon;
grant execute on function docente_revisione_hmw_crazy8(uuid, int, text, text) to anon;
grant execute on function vota_hmw_crazy8(uuid, text, uuid, int, boolean) to anon;
grant execute on function docente_sblocca_sketch_crazy8(uuid, boolean, text) to anon;
grant execute on function docente_sblocca_sketch_tutti_crazy8(uuid, boolean, text) to anon;
grant execute on function cambia_password_team_attivita(uuid, text, text) to anon;
grant execute on function docente_reimposta_password_team_attivita(uuid, text, text) to anon;

-- === Controllo del database: ora anche questa migrazione ===
create or replace function crazy8_controlla_database()
returns table(problema text)
language plpgsql security definer set search_path = public, extensions
as $$
begin
  return query
  select 'manca la colonna ' || t || '.' || c
  from (values
    ('submission_crazy8', 'fase_raggiunta'), ('submission_crazy8', 'team_attivita_id'), ('submission_crazy8', 'contesti'),
    ('submission_crazy8', 'hmw'), ('submission_crazy8', 'hmw_revisione'), ('submission_crazy8', 'sketch_sbloccato'),
    ('immagini', 'selezionato'), ('immagini', 'interpretazione'), ('immagini', 'domanda'),
    ('generazioni_crazy8', 'motore'), ('generazioni_crazy8', 'driver'), ('attivita', 'config')
  ) as atteso(t, c)
  where not exists (
    select 1 from information_schema.columns ic
    where ic.table_schema = 'public' and ic.table_name = atteso.t and ic.column_name = atteso.c
  );

  return query
  select 'manca la funzione ' || f
  from unnest(array['aggiorna_campi_submission_crazy8', 'aggiorna_sketch_crazy8', 'aggiorna_generazione_crazy8', 'aggiungi_generazione_crazy8',
                    'crea_team_attivita', 'crea_submission_crazy8_team', 'docente_revisione_hmw_crazy8', 'docente_sblocca_sketch_crazy8',
                    'vota_hmw_crazy8', 'cambia_password_team_attivita', 'docente_reimposta_password_team_attivita', 'crazy8_apri_fase_sketch']) as f
  where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f);

  return query
  select 'aggiorna_campi_submission_crazy8 è in una versione vecchia'::text
  where exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'aggiorna_campi_submission_crazy8'
      and pg_get_functiondef(p.oid) not like '%hmw_per_team%'
  );
end;
$$;
grant execute on function crazy8_controlla_database() to anon;
