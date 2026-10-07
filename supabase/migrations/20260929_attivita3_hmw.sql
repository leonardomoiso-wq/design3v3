-- =============================================================
-- Attività 3 — HMW + Role-Prompting come moltiplicatore di prospettive.
-- Stessa identità "leggera" già usata per casi_studio e submission_crazy8:
-- nessun account, gruppo_num/gruppo_nome + codice scelto dal team.
--
-- Le iterazioni HMW sono APPEND-ONLY (v1, v2, ... righe distinte, mai
-- sovrascritte): il changelog è semplicemente "guardale tutte in ordine".
-- Lo stesso codice scelto alla v1 sblocca la creazione di ogni versione
-- successiva per lo stesso team sulla stessa attività.
--
-- I ruoli proposti dagli studenti passano da un template fisso lato
-- piattaforma (mai dal testo libero dello studente) e restano en
-- 'proposto' finché il/la docente non li approva: nessun ruolo è
-- utilizzabile in uno stress test prima dell'approvazione, imposto anche
-- lato server in salva_stress_test (non solo nella UI).
-- =============================================================

create table if not exists ruoli_prompt (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descrizione text not null,       -- fornita da chi propone il ruolo
  gruppo_proponente_nome text,     -- NULL se creato da docente/admin
  gruppo_proponente_num int,
  tipo_creatore text not null default 'studente' check (tipo_creatore in ('admin', 'docente', 'studente')),
  stato text not null default 'proposto' check (stato in ('proposto', 'approvato', 'rifiutato')),
  visibilita text not null default 'privato_team' check (visibilita in ('privato_team', 'condiviso_classe')),
  created_at timestamptz not null default now()
);

create table if not exists hmw_iterazioni (
  id uuid primary key default gen_random_uuid(),
  attivita_id uuid references attivita(id),
  gruppo_nome text not null,
  gruppo_num int not null,
  versione int not null,
  testo text not null,
  note_prompt text,
  riflessione text,
  codice_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists hmw_stress_test (
  id uuid primary key default gen_random_uuid(),
  hmw_iterazione_id uuid not null references hmw_iterazioni(id) on delete cascade,
  ruolo_id uuid not null references ruoli_prompt(id),
  risposta_llm text not null,
  created_at timestamptz not null default now()
);

alter table ruoli_prompt enable row level security;
alter table hmw_iterazioni enable row level security;
alter table hmw_stress_test enable row level security;

drop policy if exists "ruoli_prompt_select_pubblico" on ruoli_prompt;
create policy "ruoli_prompt_select_pubblico" on ruoli_prompt for select using (true);

drop policy if exists "hmw_iterazioni_select_pubblico" on hmw_iterazioni;
create policy "hmw_iterazioni_select_pubblico" on hmw_iterazioni for select using (true);

drop policy if exists "hmw_stress_test_select_pubblico" on hmw_stress_test;
create policy "hmw_stress_test_select_pubblico" on hmw_stress_test for select using (true);

-- === Libreria ruoli ===

create or replace function proponi_ruolo(
  p_nome text,
  p_descrizione text,
  p_gruppo_nome text,
  p_gruppo_num int,
  p_visibilita text
)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if p_nome is null or length(trim(p_nome)) = 0 then raise exception 'nome_mancante'; end if;
  if p_descrizione is null or length(trim(p_descrizione)) = 0 then raise exception 'descrizione_mancante'; end if;
  if p_visibilita not in ('privato_team', 'condiviso_classe') then
    p_visibilita := 'privato_team';
  end if;

  insert into ruoli_prompt (nome, descrizione, gruppo_proponente_nome, gruppo_proponente_num, tipo_creatore, stato, visibilita)
  values (trim(p_nome), trim(p_descrizione), p_gruppo_nome, p_gruppo_num, 'studente', 'proposto', p_visibilita)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function docente_crea_ruolo(p_nome text, p_descrizione text, p_visibilita text, p_passcode text)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash) then
    raise exception 'passcode_errato';
  end if;
  if p_nome is null or length(trim(p_nome)) = 0 then raise exception 'nome_mancante'; end if;
  if p_visibilita not in ('privato_team', 'condiviso_classe') then
    p_visibilita := 'condiviso_classe';
  end if;

  insert into ruoli_prompt (nome, descrizione, tipo_creatore, stato, visibilita)
  values (trim(p_nome), trim(p_descrizione), 'docente', 'approvato', p_visibilita)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function docente_modera_ruolo(p_id uuid, p_stato text, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash) then
    raise exception 'passcode_errato';
  end if;
  if p_stato not in ('proposto', 'approvato', 'rifiutato') then
    raise exception 'stato_non_valido';
  end if;
  update ruoli_prompt set stato = p_stato where id = p_id;
end;
$$;

create or replace function docente_elimina_ruolo(p_id uuid, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash) then
    raise exception 'passcode_errato';
  end if;
  delete from ruoli_prompt where id = p_id;
end;
$$;

-- === Iterazioni HMW (append-only, protette dal codice scelto alla v1) ===

create or replace function crea_hmw_iterazione(
  p_attivita_id uuid,
  p_gruppo_nome text,
  p_gruppo_num int,
  p_testo text,
  p_note_prompt text,
  p_riflessione text,
  p_codice text
)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
  v_versione int;
  v_id uuid;
begin
  select codice_hash into v_hash
  from hmw_iterazioni
  where attivita_id = p_attivita_id and gruppo_num = p_gruppo_num
  order by versione desc limit 1;

  select coalesce(max(versione), 0) into v_versione
  from hmw_iterazioni
  where attivita_id = p_attivita_id and gruppo_num = p_gruppo_num;

  if v_hash is null then
    if p_codice is null or length(trim(p_codice)) < 4 then
      raise exception 'codice_troppo_corto';
    end if;
    v_hash := crypt(p_codice, gen_salt('bf'));
  else
    if p_codice is null or crypt(p_codice, v_hash) <> v_hash then
      raise exception 'codice_errato';
    end if;
  end if;

  insert into hmw_iterazioni (attivita_id, gruppo_nome, gruppo_num, versione, testo, note_prompt, riflessione, codice_hash)
  values (p_attivita_id, p_gruppo_nome, p_gruppo_num, v_versione + 1, p_testo, p_note_prompt, p_riflessione, v_hash)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function verifica_codice_hmw_gruppo(p_attivita_id uuid, p_gruppo_num int, p_codice text)
returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select codice_hash into v_hash
  from hmw_iterazioni
  where attivita_id = p_attivita_id and gruppo_num = p_gruppo_num
  order by versione desc limit 1;

  if v_hash is null then return false; end if;
  return crypt(p_codice, v_hash) = v_hash;
end;
$$;

-- === Stress test (l'LLM viene chiamato lato Next.js, qui si salva solo il risultato) ===

create or replace function salva_stress_test(
  p_hmw_iterazione_id uuid,
  p_ruolo_id uuid,
  p_risposta_llm text,
  p_codice text
)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
  v_ruolo_stato text;
  v_id uuid;
begin
  select codice_hash into v_hash from hmw_iterazioni where id = p_hmw_iterazione_id;
  if v_hash is null then raise exception 'iterazione_non_trovata'; end if;
  if p_codice is null or crypt(p_codice, v_hash) <> v_hash then
    raise exception 'codice_errato';
  end if;

  select stato into v_ruolo_stato from ruoli_prompt where id = p_ruolo_id;
  if v_ruolo_stato is distinct from 'approvato' then
    raise exception 'ruolo_non_approvato';
  end if;

  insert into hmw_stress_test (hmw_iterazione_id, ruolo_id, risposta_llm)
  values (p_hmw_iterazione_id, p_ruolo_id, p_risposta_llm)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function proponi_ruolo to anon;
grant execute on function docente_crea_ruolo to anon;
grant execute on function docente_modera_ruolo to anon;
grant execute on function docente_elimina_ruolo to anon;
grant execute on function crea_hmw_iterazione to anon;
grant execute on function verifica_codice_hmw_gruppo to anon;
grant execute on function salva_stress_test to anon;

-- === Realtime ===

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ruoli_prompt') then
    alter publication supabase_realtime add table ruoli_prompt;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'hmw_iterazioni') then
    alter publication supabase_realtime add table hmw_iterazioni;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'hmw_stress_test') then
    alter publication supabase_realtime add table hmw_stress_test;
  end if;
end $$;

-- === Attiva il modulo nel pannello attività (se non già presente) ===

insert into attivita (titolo, descrizione, tipo, ordine, stato, richiedi_log_prompt, richiedi_riflessione)
select
  'HMW + Role-Prompting',
  'Stress test multi-ruolo degli How Might We: libreria di ruoli proposti dagli studenti, evoluzione da v1 a v2 con changelog visibile.',
  'hmw_role_prompting',
  2,
  'bozza',
  true,
  true
where not exists (select 1 from attivita where tipo = 'hmw_role_prompting');
