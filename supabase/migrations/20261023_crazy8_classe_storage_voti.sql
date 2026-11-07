-- =============================================================
-- Crazy 8: immagini nello Storage, voti tra team sulle domande,
-- valutazione delle immagini generate sui 4 driver.
--
-- 1. Storage: bucket pubblico "crazy8" per sketch e immagini generate.
--    Le righe di immagini/generazioni_crazy8 salvano l'indirizzo del file
--    invece del contenuto (data URL); le consegne vecchie restano come
--    sono e continuano a funzionare. Il bucket si crea solo se lo schema
--    storage esiste (su Supabase sì).
-- 2. voti_hmw_crazy8: ogni team può mettere una stella alle domande
--    degli altri team (non alle proprie), una per domanda.
-- 3. generazioni_crazy8.driver: il team valuta l'immagine generata sui 4
--    driver del corso ({chiave: {valore, nota}}); il radar del docente le
--    mostra accanto ai casi studio.
--
-- Da eseguire nel SQL Editor di Supabase DOPO 20261022, insieme al
-- deploy del codice. Idempotente.
-- =============================================================

-- === 1. Storage ===
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage')
     and exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public)
    values ('crazy8', 'crazy8', true)
    on conflict (id) do update set public = true;

    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'crazy8_lettura') then
      execute $p$create policy "crazy8_lettura" on storage.objects for select using (bucket_id = 'crazy8')$p$;
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'crazy8_caricamento') then
      -- solo immagini, solo dentro la cartella del corso (prima parte del percorso = uuid)
      execute $p$create policy "crazy8_caricamento" on storage.objects for insert to anon, authenticated
        with check (bucket_id = 'crazy8' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and lower(name) ~ '\.(jpg|jpeg|png|webp)$')$p$;
    end if;
  end if;
end $$;

-- === 2. Voti tra team ===
create table if not exists voti_hmw_crazy8 (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submission_crazy8(id) on delete cascade,
  indice int not null check (indice in (0, 1)),
  team_attivita_id uuid not null references team_attivita(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (submission_id, indice, team_attivita_id)
);
alter table voti_hmw_crazy8 enable row level security;
drop policy if exists "voti_hmw_crazy8_select_pubblico" on voti_hmw_crazy8;
create policy "voti_hmw_crazy8_select_pubblico" on voti_hmw_crazy8 for select using (true);

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
  if p_indice not in (0, 1) then raise exception 'indice_non_valido'; end if;

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
grant execute on function vota_hmw_crazy8(uuid, text, uuid, int, boolean) to anon;

-- === 3. Valutazione delle immagini generate ===
alter table generazioni_crazy8 add column if not exists driver jsonb;

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
  if p_campi ? 'driver' and jsonb_typeof(p_campi -> 'driver') not in ('object', 'null') then raise exception 'driver_non_validi'; end if;

  update generazioni_crazy8 set
    positivo = case when p_campi ? 'positivo' then p_campi ->> 'positivo' else positivo end,
    negativo = case when p_campi ? 'negativo' then p_campi ->> 'negativo' else negativo end,
    deduzione = case when p_campi ? 'deduzione' then p_campi ->> 'deduzione' else deduzione end,
    motore = case when p_campi ? 'motore' then p_campi ->> 'motore' else motore end,
    driver = case when p_campi ? 'driver' then p_campi -> 'driver' else driver end
  where id = p_id;
end;
$$;
grant execute on function aggiorna_generazione_crazy8(uuid, text, jsonb) to anon;

-- === Controllo del database ===
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
                    'vota_hmw_crazy8']) as f
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
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'voti_hmw_crazy8') then
    alter publication supabase_realtime add table voti_hmw_crazy8;
  end if;
end $$;
