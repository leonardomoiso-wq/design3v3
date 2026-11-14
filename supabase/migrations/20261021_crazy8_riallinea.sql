-- =============================================================
-- Crazy 8: riallineamento del database (idempotente).
--
-- Raccoglie in un solo file tutto ciò che serve alla versione a fasi di
-- Crazy 8 (le migrazioni 20261010 e 20261011): colonne nuove, funzioni
-- nell'ultima versione e un controllo che dice cosa manca. Si può
-- eseguire sempre, anche più volte e anche se 20261010/20261011 sono
-- già state eseguite: rimette le funzioni nell'ultima versione (per
-- esempio dopo aver rieseguito per errore una migrazione più vecchia).
--
-- Da eseguire nel SQL Editor di Supabase DOPO tutte le migrazioni
-- precedenti, insieme al deploy del codice aggiornato.
-- =============================================================

alter table submission_crazy8 add column if not exists fase_raggiunta int not null default 1;
alter table submission_crazy8 add column if not exists moodboard jsonb not null default '[]'::jsonb;
alter table submission_crazy8 add column if not exists concept_titolo text;
alter table submission_crazy8 add column if not exists concept_descrizione text;
alter table submission_crazy8 add column if not exists concept_motivazioni text;

alter table immagini add column if not exists selezionato boolean not null default false;
alter table immagini add column if not exists interpretazione text;
alter table immagini add column if not exists sotto_ambito text;

alter table generazioni_crazy8 add column if not exists motore text;
alter table generazioni_crazy8 add column if not exists positivo text;
alter table generazioni_crazy8 add column if not exists negativo text;

alter table submission_crazy8 add column if not exists scenario jsonb not null default '{}'::jsonb;

-- === Consegna: aggiornamento parziale (fasi 1-9, scenario, moodboard) ===

create or replace function aggiorna_campi_submission_crazy8(p_id uuid, p_codice text, p_campi jsonb)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select codice_hash into v_hash from submission_crazy8 where id = p_id;
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

  update submission_crazy8 set
    hmw_o_tema = case when p_campi ? 'sotto_ambito' then p_campi ->> 'sotto_ambito' else hmw_o_tema end,
    motore_usato = case when p_campi ? 'motore_usato' then p_campi ->> 'motore_usato' else motore_usato end,
    note_prompt = case when p_campi ? 'note_prompt' then p_campi ->> 'note_prompt' else note_prompt end,
    riflessione = case when p_campi ? 'riflessione' then p_campi ->> 'riflessione' else riflessione end,
    -- la fase raggiunta può solo avanzare: tornare a rivedere una fase
    -- precedente non deve "richiudere" quelle successive.
    fase_raggiunta = case when p_campi ? 'fase_raggiunta'
      then greatest(fase_raggiunta, least(9, (p_campi ->> 'fase_raggiunta')::int)) else fase_raggiunta end,
    moodboard = case when p_campi ? 'moodboard' then p_campi -> 'moodboard' else moodboard end,
    scenario = case when p_campi ? 'scenario' then p_campi -> 'scenario' else scenario end,
    concept_titolo = case when p_campi ? 'concept_titolo' then p_campi ->> 'concept_titolo' else concept_titolo end,
    concept_descrizione = case when p_campi ? 'concept_descrizione' then p_campi ->> 'concept_descrizione' else concept_descrizione end,
    concept_motivazioni = case when p_campi ? 'concept_motivazioni' then p_campi ->> 'concept_motivazioni' else concept_motivazioni end,
    -- una consegna già revisionata dal/dalla docente non torna indietro
    stato = case when p_campi ? 'stato' and stato <> 'revisionato' then p_campi ->> 'stato' else stato end
  where id = p_id;
end;
$$;

grant execute on function aggiorna_campi_submission_crazy8 to anon;

-- === Sketch: selezione, interpretazione, sotto-ambito ===

create or replace function aggiorna_sketch_crazy8(p_immagine_id uuid, p_codice text, p_campi jsonb)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select sc.codice_hash into v_hash
  from immagini i join submission_crazy8 sc on sc.id = i.submission_id
  where i.id = p_immagine_id;

  if v_hash is null then raise exception 'sketch_non_trovato'; end if;
  if crypt(p_codice, v_hash) <> v_hash then raise exception 'codice_errato'; end if;

  update immagini set
    selezionato = case when p_campi ? 'selezionato' then coalesce((p_campi ->> 'selezionato')::boolean, false) else selezionato end,
    interpretazione = case when p_campi ? 'interpretazione' then p_campi ->> 'interpretazione' else interpretazione end,
    sotto_ambito = case when p_campi ? 'sotto_ambito' then p_campi ->> 'sotto_ambito' else sotto_ambito end
  where id = p_immagine_id;
end;
$$;

-- === Generazioni: ora con il motore usato (ChatGPT, Gemini...) ===

drop function if exists aggiungi_generazione_crazy8(uuid, text, text, text, text);

create or replace function aggiungi_generazione_crazy8(
  p_sketch_immagine_id uuid,
  p_codice text,
  p_prompt_usato text,
  p_url_immagine text,
  p_deduzione text default null,
  p_motore text default null
)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
  v_ordine int;
  v_id uuid;
begin
  select sc.codice_hash into v_hash
  from immagini i join submission_crazy8 sc on sc.id = i.submission_id
  where i.id = p_sketch_immagine_id;

  if v_hash is null then raise exception 'sketch_non_trovato'; end if;
  if crypt(p_codice, v_hash) <> v_hash then raise exception 'codice_errato'; end if;
  if p_prompt_usato is null or length(trim(p_prompt_usato)) = 0 then
    raise exception 'prompt_mancante';
  end if;

  select coalesce(max(ordine), 0) + 1 into v_ordine
  from generazioni_crazy8 where sketch_immagine_id = p_sketch_immagine_id;

  insert into generazioni_crazy8 (sketch_immagine_id, ordine, prompt_usato, url_immagine, deduzione, motore)
  values (p_sketch_immagine_id, v_ordine, trim(p_prompt_usato), p_url_immagine, p_deduzione, nullif(trim(coalesce(p_motore, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function aggiorna_generazione_crazy8(p_id uuid, p_codice text, p_campi jsonb)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select sc.codice_hash into v_hash
  from generazioni_crazy8 g
    join immagini i on i.id = g.sketch_immagine_id
    join submission_crazy8 sc on sc.id = i.submission_id
  where g.id = p_id;

  if v_hash is null then raise exception 'generazione_non_trovata'; end if;
  if crypt(p_codice, v_hash) <> v_hash then raise exception 'codice_errato'; end if;

  update generazioni_crazy8 set
    positivo = case when p_campi ? 'positivo' then p_campi ->> 'positivo' else positivo end,
    negativo = case when p_campi ? 'negativo' then p_campi ->> 'negativo' else negativo end,
    deduzione = case when p_campi ? 'deduzione' then p_campi ->> 'deduzione' else deduzione end,
    motore = case when p_campi ? 'motore' then p_campi ->> 'motore' else motore end
  where id = p_id;
end;
$$;

grant execute on function aggiorna_campi_submission_crazy8 to anon;
grant execute on function aggiorna_sketch_crazy8 to anon;
grant execute on function aggiungi_generazione_crazy8 to anon;
grant execute on function aggiorna_generazione_crazy8 to anon;

-- === Controllo: cosa manca al database per Crazy 8 ===
-- Restituisce una riga per ogni problema; nessuna riga = tutto a posto.
-- Usata dal pannello docente e dalla pagina studente per mostrare un
-- avviso chiaro invece di errori di salvataggio generici.

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
    ('immagini', 'selezionato'), ('immagini', 'interpretazione'), ('immagini', 'sotto_ambito'),
    ('generazioni_crazy8', 'motore'), ('generazioni_crazy8', 'positivo'), ('generazioni_crazy8', 'negativo')
  ) as atteso(t, c)
  where not exists (
    select 1 from information_schema.columns ic
    where ic.table_schema = 'public' and ic.table_name = atteso.t and ic.column_name = atteso.c
  );

  return query
  select 'manca la funzione ' || f
  from unnest(array['aggiorna_campi_submission_crazy8', 'aggiorna_sketch_crazy8', 'aggiorna_generazione_crazy8', 'aggiungi_generazione_crazy8']) as f
  where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f);

  -- la versione vecchia limitava le fasi a 8: la nona (Share) non si sbloccava
  return query
  select 'aggiorna_campi_submission_crazy8 è in una versione vecchia'::text
  where exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'aggiorna_campi_submission_crazy8'
      and (pg_get_functiondef(p.oid) not like '%least(9,%' or pg_get_functiondef(p.oid) not like '%scenario%')
  );
end;
$$;

grant execute on function crazy8_controlla_database() to anon;
