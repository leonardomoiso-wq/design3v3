-- =============================================================
-- Architettura multi-corso: la piattaforma non è più legata a "Design 3"
-- ma ospita più corsi (ecosistemi) indipendenti. Ogni corso ha:
--   - la propria password docente (chi la conosce entra in quel corso);
--   - la propria coorte di studenti, team, casi studio, attività,
--     votazioni, tag, prompt, ruoli e testi;
--   - la propria configurazione del form dei casi studio (nome del
--     framework e i 4 driver di valutazione: etichetta e domanda guida).
--
-- La password che già esisteva (docente_config) diventa la password di
-- AMMINISTRAZIONE della piattaforma: vede e gestisce tutti i corsi. Tutti
-- i dati esistenti vengono assegnati a un primo corso, "Design 3", che
-- per ora usa la stessa password (si può cambiare da Area Docente → Corso).
--
-- I 4 driver restano salvati con le chiavi interne storiche
-- (desiderabilita, fattibilita, responsabilita, vitalita) usate come
-- "slot" 1-4: il corso ne cambia solo etichette e domande, così i dati
-- esistenti non vanno convertiti.
--
-- Da eseguire nel SQL editor di Supabase DOPO tutte le migrazioni
-- precedenti, e insieme al deploy del codice aggiornato. Idempotente.
-- =============================================================

create extension if not exists pgcrypto;

-- === Tabella corsi ===

create table if not exists corsi (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  -- Codice breve e leggibile (es. "design-3") con cui gli studenti
  -- trovano il corso anche quando non è elencato in home.
  codice text not null,
  descrizione text not null default '',
  passcode_hash text not null,
  visibile_in_home boolean not null default true,
  archiviato boolean not null default false,
  configurazione jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists corsi_codice_unico on corsi (lower(codice));

alter table corsi enable row level security;

drop policy if exists "corsi_select_pubblico" on corsi;
create policy "corsi_select_pubblico" on corsi for select using (true);

-- La riga è leggibile da tutti, ma non l'hash della password: solo le
-- colonne qui sotto (il client deve quindi elencarle esplicitamente
-- nella select, mai "select *").
revoke select on corsi from anon, authenticated;
grant select (id, nome, codice, descrizione, visibile_in_home, archiviato, configurazione, created_at)
  on corsi to anon, authenticated;

-- Configurazione predefinita (framework IDEO, come finora in Design 3).
create or replace function configurazione_corso_predefinita()
returns jsonb
language sql immutable
as $$
  select jsonb_build_object(
    'framework', 'IDEO 4-Driver',
    'istruzioni', '',
    'driver', jsonb_build_array(
      jsonb_build_object('chiave', 'desiderabilita', 'etichetta', 'Desiderabilità',
        'domanda', 'Le persone (o le altre specie coinvolte) desiderano davvero questa soluzione? Risponde a un bisogno reale e sentito?'),
      jsonb_build_object('chiave', 'fattibilita', 'etichetta', 'Fattibilità',
        'domanda', 'È realizzabile con le tecnologie, i materiali e le competenze che avete a disposizione oggi?'),
      jsonb_build_object('chiave', 'responsabilita', 'etichetta', 'Responsabilità',
        'domanda', 'Avete considerato gli impatti etici, sociali e ambientali — anche su chi non ha voce in capitolo?'),
      jsonb_build_object('chiave', 'vitalita', 'etichetta', 'Vitalità',
        'domanda', 'Può reggersi nel tempo? È sostenibile a livello economico, ecologico e sociale, non solo nel breve periodo?')
    )
  );
$$;

-- === Primo corso: Design 3, con tutti i dati esistenti ===

do $$
begin
  if not exists (select 1 from corsi) then
    insert into corsi (nome, codice, descrizione, passcode_hash, configurazione)
    select
      'Design 3',
      'design-3',
      'Laboratorio di Design 3',
      coalesce((select passcode_hash from docente_config where id = true), crypt('polito27', gen_salt('bf'))),
      configurazione_corso_predefinita();
  end if;
end $$;

-- === corso_id su tutte le tabelle "radice" ===

do $$
declare
  v_primo uuid;
  t text;
  tabelle text[] := array[
    'casi_studio', 'team', 'attivita', 'submission_crazy8', 'hmw_iterazioni',
    'ruoli_prompt', 'prompt_suggeriti_crazy8', 'tag_default_caso_studio', 'contenuto_piattaforma'
  ];
begin
  select id into v_primo from corsi order by created_at asc limit 1;
  foreach t in array tabelle loop
    execute format('alter table %I add column if not exists corso_id uuid references corsi(id) on delete cascade', t);
    execute format('update %I set corso_id = %L where corso_id is null', t, v_primo);
    execute format('alter table %I alter column corso_id set not null', t);
    execute format('create index if not exists %I on %I (corso_id)', t || '_corso_idx', t);
  end loop;
end $$;

-- contenuto_piattaforma: una chiave per corso (non più globale).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'contenuto_piattaforma'::regclass and contype = 'p'
      and array_length(conkey, 1) = 1
  ) then
    alter table contenuto_piattaforma drop constraint contenuto_piattaforma_pkey;
    alter table contenuto_piattaforma add primary key (corso_id, chiave);
  end if;
end $$;

-- team: il nome è unico dentro il corso, non su tutta la piattaforma.
alter table team drop constraint if exists team_nome_key;
create unique index if not exists team_corso_nome_unico on team (corso_id, lower(nome));

-- revisione_stato: da riga singola globale a una riga per corso.
alter table revisione_stato add column if not exists corso_id uuid references corsi(id) on delete cascade;
do $$
declare
  v_primo uuid;
begin
  select id into v_primo from corsi order by created_at asc limit 1;
  update revisione_stato set corso_id = v_primo where corso_id is null;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'revisione_stato'::regclass and conname = 'revisione_stato_singleton'
  ) then
    alter table revisione_stato drop constraint revisione_stato_singleton;
  end if;
  if exists (
    select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conrelid = 'revisione_stato'::regclass and c.contype = 'p' and a.attname = 'id'
  ) then
    alter table revisione_stato drop constraint revisione_stato_pkey;
  end if;
  alter table revisione_stato alter column id drop not null;
  alter table revisione_stato alter column corso_id set not null;
  if not exists (
    select 1 from pg_constraint where conrelid = 'revisione_stato'::regclass and contype = 'p'
  ) then
    alter table revisione_stato add primary key (corso_id);
  end if;

  insert into revisione_stato (corso_id, caso_attivo_id)
  select c.id, null from corsi c
  where not exists (select 1 from revisione_stato r where r.corso_id = c.id);
end $$;

-- =============================================================
-- Autorizzazione
-- =============================================================

-- Password di amministrazione della piattaforma (vede tutti i corsi).
create or replace function e_amministratore(p_passcode text)
returns boolean
language sql security definer set search_path = public, extensions
as $$
  select exists (select 1 from docente_config where crypt(coalesce(p_passcode, ''), passcode_hash) = passcode_hash);
$$;

-- Vero se la password apre questo corso (password del corso o di amministrazione).
create or replace function docente_autorizzato(p_corso_id uuid, p_passcode text)
returns boolean
language sql security definer set search_path = public, extensions
as $$
  select p_corso_id is not null and (
    e_amministratore(p_passcode)
    or exists (select 1 from corsi where id = p_corso_id and crypt(coalesce(p_passcode, ''), passcode_hash) = passcode_hash)
  );
$$;

create or replace function richiedi_docente(p_corso_id uuid, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not docente_autorizzato(p_corso_id, p_passcode) then
    raise exception 'passcode_errato';
  end if;
end;
$$;

-- Funzioni interne: non richiamabili direttamente dal client.
revoke execute on function richiedi_docente(uuid, text) from public, anon, authenticated;
revoke execute on function docente_autorizzato(uuid, text) from public, anon, authenticated;
revoke execute on function e_amministratore(text) from public, anon, authenticated;

-- Attività standard con cui nasce ogni corso.
create or replace function semina_attivita_corso(p_corso_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  insert into attivita (corso_id, titolo, descrizione, tipo, ordine, stato, richiedi_log_prompt, richiedi_riflessione)
  select p_corso_id, v.titolo, v.descrizione, v.tipo, v.ordine, v.stato, v.log, v.rifl
  from (values
    ('Design Case Studies', 'Sottomissione dei progetti, matrice a 4 driver, radar multicriterio e peer review con voto di gruppo in tempo reale.', 'design_case_studies', 0, 'attiva', false, false),
    ('Crazy 8 + Co-creazione Generativa', 'Sketch rapidi evoluti con AI image-to-image: caricamento sketch + generate, galleria di revisione e commenti per immagine.', 'crazy8_ai', 1, 'bozza', true, true),
    ('HMW + Role-Prompting', 'Stress test multi-ruolo degli How Might We: libreria di ruoli proposti dagli studenti, evoluzione da v1 a v2 con changelog visibile.', 'hmw_role_prompting', 2, 'bozza', true, true)
  ) as v(titolo, descrizione, tipo, ordine, stato, log, rifl)
  where not exists (select 1 from attivita a where a.corso_id = p_corso_id and a.tipo = v.tipo);
end;
$$;

revoke execute on function semina_attivita_corso(uuid) from public, anon, authenticated;

-- =============================================================
-- Gestione corsi (docente)
-- =============================================================

-- Accesso docente: restituisce i corsi che la password apre (tutti, se è
-- quella di amministrazione). Nessuna riga = password errata.
create or replace function docente_accedi(p_passcode text)
returns table(id uuid, nome text, codice text, descrizione text, visibile_in_home boolean, archiviato boolean,
              configurazione jsonb, created_at timestamptz, amministratore boolean)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_admin boolean := e_amministratore(p_passcode);
begin
  return query
    select c.id, c.nome, c.codice, c.descrizione, c.visibile_in_home, c.archiviato, c.configurazione, c.created_at, v_admin
    from corsi c
    where v_admin or crypt(coalesce(p_passcode, ''), c.passcode_hash) = c.passcode_hash
    order by c.archiviato asc, c.created_at asc;
end;
$$;

-- Crea un nuovo corso. Serve una password docente valida (di un corso
-- qualsiasi o di amministrazione). p_copia_da (facoltativo) copia
-- configurazione dei driver, tag predefiniti, prompt suggeriti e ruoli
-- del docente da un corso che la stessa password apre.
create or replace function docente_crea_corso(
  p_passcode text,
  p_nome text,
  p_codice text,
  p_descrizione text,
  p_password_corso text,
  p_copia_da uuid default null
)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_config jsonb := configurazione_corso_predefinita();
  v_codice text := lower(regexp_replace(trim(coalesce(p_codice, '')), '[^a-zA-Z0-9]+', '-', 'g'));
begin
  if not (e_amministratore(p_passcode) or exists (select 1 from corsi where crypt(coalesce(p_passcode, ''), passcode_hash) = passcode_hash)) then
    raise exception 'passcode_errato';
  end if;
  if p_nome is null or length(trim(p_nome)) < 2 then raise exception 'nome_troppo_corto'; end if;
  v_codice := trim(both '-' from v_codice);
  if length(v_codice) < 3 then raise exception 'codice_troppo_corto'; end if;
  if exists (select 1 from corsi where lower(codice) = v_codice) then raise exception 'codice_gia_usato'; end if;
  if p_password_corso is null or length(trim(p_password_corso)) < 6 then raise exception 'password_troppo_corta'; end if;

  if p_copia_da is not null then
    if not docente_autorizzato(p_copia_da, p_passcode) then raise exception 'passcode_errato'; end if;
    select configurazione into v_config from corsi where id = p_copia_da;
  end if;

  insert into corsi (nome, codice, descrizione, passcode_hash, configurazione)
  values (trim(p_nome), v_codice, coalesce(trim(p_descrizione), ''), crypt(p_password_corso, gen_salt('bf')), coalesce(v_config, configurazione_corso_predefinita()))
  returning corsi.id into v_id;

  insert into revisione_stato (corso_id, caso_attivo_id) values (v_id, null);
  perform semina_attivita_corso(v_id);

  if p_copia_da is not null then
    insert into tag_default_caso_studio (corso_id, testo, ordine)
      select v_id, testo, ordine from tag_default_caso_studio where corso_id = p_copia_da;
    insert into prompt_suggeriti_crazy8 (corso_id, etichetta, testo_prompt, ordine)
      select v_id, etichetta, testo_prompt, ordine from prompt_suggeriti_crazy8 where corso_id = p_copia_da;
    insert into ruoli_prompt (corso_id, nome, descrizione, tipo_creatore, stato, visibilita)
      select v_id, nome, descrizione, tipo_creatore, stato, visibilita from ruoli_prompt
      where corso_id = p_copia_da and tipo_creatore in ('docente', 'admin');
  end if;

  return v_id;
end;
$$;

create or replace function docente_aggiorna_corso(
  p_corso_id uuid,
  p_passcode text,
  p_nome text,
  p_codice text,
  p_descrizione text,
  p_visibile_in_home boolean,
  p_archiviato boolean,
  p_configurazione jsonb
)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_codice text := lower(regexp_replace(trim(coalesce(p_codice, '')), '[^a-zA-Z0-9]+', '-', 'g'));
  v_driver jsonb;
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  if p_nome is null or length(trim(p_nome)) < 2 then raise exception 'nome_troppo_corto'; end if;
  v_codice := trim(both '-' from v_codice);
  if length(v_codice) < 3 then raise exception 'codice_troppo_corto'; end if;
  if exists (select 1 from corsi where lower(codice) = v_codice and id <> p_corso_id) then raise exception 'codice_gia_usato'; end if;

  -- Sempre esattamente 4 driver, ognuno con un'etichetta non vuota.
  v_driver := p_configurazione -> 'driver';
  if v_driver is null or jsonb_typeof(v_driver) <> 'array' or jsonb_array_length(v_driver) <> 4 then
    raise exception 'driver_non_validi';
  end if;
  if exists (select 1 from jsonb_array_elements(v_driver) d where length(trim(coalesce(d ->> 'etichetta', ''))) = 0) then
    raise exception 'driver_non_validi';
  end if;

  update corsi set
    nome = trim(p_nome),
    codice = v_codice,
    descrizione = coalesce(trim(p_descrizione), ''),
    visibile_in_home = coalesce(p_visibile_in_home, true),
    archiviato = coalesce(p_archiviato, false),
    configurazione = p_configurazione
  where id = p_corso_id;
end;
$$;

create or replace function docente_cambia_password_corso(p_corso_id uuid, p_passcode text, p_nuova_password text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  if p_nuova_password is null or length(trim(p_nuova_password)) < 6 then raise exception 'password_troppo_corta'; end if;
  update corsi set passcode_hash = crypt(p_nuova_password, gen_salt('bf')) where id = p_corso_id;
end;
$$;

-- Elimina un corso e TUTTO il suo contenuto (cascade). Per sicurezza va
-- riscritto il nome esatto del corso.
create or replace function docente_elimina_corso(p_corso_id uuid, p_passcode text, p_conferma_nome text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  if not exists (select 1 from corsi where id = p_corso_id and nome = p_conferma_nome) then
    raise exception 'conferma_errata';
  end if;
  delete from corsi where id = p_corso_id;
end;
$$;

-- =============================================================
-- Funzioni studente
-- =============================================================

drop function if exists crea_caso_studio(text, int, text, text, text, text[], jsonb, numeric, numeric, text);

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
  p_codice text
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

  insert into casi_studio (
    corso_id, gruppo_nome, gruppo_num, titolo, descrizione, immagine, tags, driver, x, y, codice_hash
  ) values (
    p_corso_id, p_gruppo_nome, p_gruppo_num, p_titolo, p_descrizione, p_immagine, p_tags, p_driver, p_x, p_y,
    crypt(p_codice, gen_salt('bf'))
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function vota_caso_studio(
  p_caso_id bigint,
  p_gruppo_num int,
  p_colore text
) returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if p_colore not in ('verde', 'giallo', 'rosso') then
    raise exception 'colore_non_valido';
  end if;

  if not exists (
    select 1 from revisione_stato r join casi_studio c on c.corso_id = r.corso_id
    where c.id = p_caso_id and r.caso_attivo_id = p_caso_id
  ) then
    raise exception 'votazione_non_attiva';
  end if;

  insert into voti_revisione (caso_id, gruppo_num, colore)
  values (p_caso_id, p_gruppo_num, p_colore)
  on conflict (caso_id, gruppo_num)
  do update set colore = excluded.colore, creato_il = now();
end;
$$;

-- Team: tutto avviene dentro un corso (lo stesso nome può esistere in
-- corsi diversi, la numerazione riparte da 1 in ogni corso).

drop function if exists crea_team(text, text, text, text, text[]);
drop function if exists login_team(text, text);
drop function if exists recupera_domanda_team(text);
drop function if exists reimposta_password_team(text, text, text);

create or replace function crea_team(
  p_corso_id uuid,
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
  if not exists (select 1 from corsi c where c.id = p_corso_id and not c.archiviato) then
    raise exception 'corso_non_trovato';
  end if;
  if p_nome is null or length(trim(p_nome)) < 2 then raise exception 'nome_troppo_corto'; end if;
  if p_password is null or length(trim(p_password)) < 4 then raise exception 'password_troppo_corta'; end if;
  if p_domanda_segreta is null or length(trim(p_domanda_segreta)) = 0 then raise exception 'domanda_mancante'; end if;
  if p_risposta_segreta is null or length(trim(p_risposta_segreta)) = 0 then raise exception 'risposta_mancante'; end if;
  if exists (select 1 from team t where t.corso_id = p_corso_id and lower(t.nome) = lower(trim(p_nome))) then
    raise exception 'nome_gia_usato';
  end if;

  select coalesce(max(t.numero), 0) + 1 into v_numero from team t where t.corso_id = p_corso_id;
  select coalesce(array_agg(nullif(trim(m), '')) filter (where nullif(trim(m), '') is not null), '{}')
    into v_membri
    from unnest(p_membri) as m;

  insert into team (corso_id, numero, nome, password_hash, domanda_segreta, risposta_hash, membri)
  values (
    p_corso_id,
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

create or replace function login_team(p_corso_id uuid, p_nome text, p_password text)
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
  from team t where t.corso_id = p_corso_id and lower(t.nome) = lower(trim(p_nome));
  if v_hash is null or crypt(p_password, v_hash) <> v_hash then
    raise exception 'credenziali_errate';
  end if;
  return query select v_id, v_numero, v_nome, v_membri;
end;
$$;

create or replace function recupera_domanda_team(p_corso_id uuid, p_nome text)
returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_domanda text;
begin
  select t.domanda_segreta into v_domanda from team t where t.corso_id = p_corso_id and lower(t.nome) = lower(trim(p_nome));
  if v_domanda is null then raise exception 'team_non_trovato'; end if;
  return v_domanda;
end;
$$;

create or replace function reimposta_password_team(p_corso_id uuid, p_nome text, p_risposta_segreta text, p_nuova_password text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  if p_nuova_password is null or length(trim(p_nuova_password)) < 4 then raise exception 'password_troppo_corta'; end if;
  select t.risposta_hash into v_hash from team t where t.corso_id = p_corso_id and lower(t.nome) = lower(trim(p_nome));
  if v_hash is null then raise exception 'team_non_trovato'; end if;
  if crypt(lower(trim(p_risposta_segreta)), v_hash) <> v_hash then raise exception 'risposta_errata'; end if;
  update team set password_hash = crypt(p_nuova_password, gen_salt('bf'))
  where corso_id = p_corso_id and lower(nome) = lower(trim(p_nome));
end;
$$;

-- Crazy 8 e HMW: il corso si ricava dall'attività (che appartiene già a
-- un corso), quindi la firma per il client non cambia.

create or replace function crea_submission_crazy8(
  p_attivita_id uuid,
  p_gruppo_nome text,
  p_gruppo_num int,
  p_sotto_ambito text,
  p_codice text
)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_corso uuid;
begin
  select corso_id into v_corso from attivita where id = p_attivita_id;
  if v_corso is null then raise exception 'attivita_non_trovata'; end if;
  if p_codice is null or length(trim(p_codice)) < 4 then raise exception 'codice_troppo_corto'; end if;

  insert into submission_crazy8 (corso_id, attivita_id, gruppo_nome, gruppo_num, hmw_o_tema, stato, codice_hash)
  values (v_corso, p_attivita_id, p_gruppo_nome, p_gruppo_num, p_sotto_ambito, 'in_corso', crypt(p_codice, gen_salt('bf')))
  returning id into v_id;
  return v_id;
end;
$$;

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
  v_corso uuid;
begin
  select corso_id into v_corso from attivita where id = p_attivita_id;
  if v_corso is null then raise exception 'attivita_non_trovata'; end if;

  select codice_hash into v_hash
  from hmw_iterazioni
  where attivita_id = p_attivita_id and gruppo_num = p_gruppo_num
  order by versione desc limit 1;

  select coalesce(max(versione), 0) into v_versione
  from hmw_iterazioni
  where attivita_id = p_attivita_id and gruppo_num = p_gruppo_num;

  if v_hash is null then
    if p_codice is null or length(trim(p_codice)) < 4 then raise exception 'codice_troppo_corto'; end if;
    v_hash := crypt(p_codice, gen_salt('bf'));
  else
    if p_codice is null or crypt(p_codice, v_hash) <> v_hash then raise exception 'codice_errato'; end if;
  end if;

  insert into hmw_iterazioni (corso_id, attivita_id, gruppo_nome, gruppo_num, versione, testo, note_prompt, riflessione, codice_hash)
  values (v_corso, p_attivita_id, p_gruppo_nome, p_gruppo_num, v_versione + 1, p_testo, p_note_prompt, p_riflessione, v_hash)
  returning id into v_id;

  return v_id;
end;
$$;

-- Lo stress test può usare solo ruoli approvati DELLO STESSO corso.
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
  v_corso uuid;
  v_ruolo_stato text;
  v_id uuid;
begin
  select codice_hash, corso_id into v_hash, v_corso from hmw_iterazioni where id = p_hmw_iterazione_id;
  if v_hash is null then raise exception 'iterazione_non_trovata'; end if;
  if p_codice is null or crypt(p_codice, v_hash) <> v_hash then raise exception 'codice_errato'; end if;

  select stato into v_ruolo_stato from ruoli_prompt where id = p_ruolo_id and corso_id = v_corso;
  if v_ruolo_stato is distinct from 'approvato' then raise exception 'ruolo_non_approvato'; end if;

  insert into hmw_stress_test (hmw_iterazione_id, ruolo_id, risposta_llm)
  values (p_hmw_iterazione_id, p_ruolo_id, p_risposta_llm)
  returning id into v_id;

  return v_id;
end;
$$;

drop function if exists proponi_ruolo(text, text, text, int, text);

create or replace function proponi_ruolo(
  p_corso_id uuid,
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
  if not exists (select 1 from corsi where id = p_corso_id and not archiviato) then raise exception 'corso_non_trovato'; end if;
  if p_nome is null or length(trim(p_nome)) = 0 then raise exception 'nome_mancante'; end if;
  if p_descrizione is null or length(trim(p_descrizione)) = 0 then raise exception 'descrizione_mancante'; end if;
  if p_visibilita not in ('privato_team', 'condiviso_classe') then p_visibilita := 'privato_team'; end if;

  insert into ruoli_prompt (corso_id, nome, descrizione, gruppo_proponente_nome, gruppo_proponente_num, tipo_creatore, stato, visibilita)
  values (p_corso_id, trim(p_nome), trim(p_descrizione), p_gruppo_nome, p_gruppo_num, 'studente', 'proposto', p_visibilita)
  returning id into v_id;

  return v_id;
end;
$$;

-- =============================================================
-- Funzioni docente — operazioni su una riga: il corso si ricava dalla
-- riga stessa (firma invariata per il client), così una password può
-- modificare solo i dati dei propri corsi.
-- =============================================================

create or replace function docente_aggiorna_posizione(p_id bigint, p_x numeric, p_y numeric, p_driver jsonb, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from casi_studio where id = p_id), p_passcode);
  update casi_studio set x = p_x, y = p_y, driver = p_driver where id = p_id;
end; $$;

create or replace function docente_azzera_voti(p_caso_id bigint, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from casi_studio where id = p_caso_id), p_passcode);
  delete from voti_revisione where caso_id = p_caso_id;
end; $$;

create or replace function docente_imposta_esito_revisione(p_caso_id bigint, p_esito text, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from casi_studio where id = p_caso_id), p_passcode);
  if p_esito is not null and p_esito not in ('verde', 'giallo', 'rosso') then raise exception 'esito_non_valido'; end if;
  update casi_studio set esito_revisione = p_esito where id = p_caso_id;
end; $$;

create or replace function docente_reimposta_codice(p_caso_id bigint, p_nuovo_codice text, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from casi_studio where id = p_caso_id), p_passcode);
  if p_nuovo_codice is null or length(trim(p_nuovo_codice)) < 4 then raise exception 'codice_troppo_corto'; end if;
  update casi_studio set codice_hash = crypt(p_nuovo_codice, gen_salt('bf')) where id = p_caso_id;
  if not found then raise exception 'caso_non_trovato'; end if;
end; $$;

create or replace function docente_imposta_inclusione_revisione(p_caso_id bigint, p_incluso boolean, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from casi_studio where id = p_caso_id), p_passcode);
  update casi_studio set incluso_revisione = p_incluso where id = p_caso_id;
end; $$;

create or replace function docente_imposta_scelto(p_caso_id bigint, p_valore numeric, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from casi_studio where id = p_caso_id), p_passcode);
  if p_valore not in (0, 0.5, 1) then raise exception 'valore_non_valido'; end if;
  update casi_studio set scelto = p_valore where id = p_caso_id;
end; $$;

create or replace function docente_aggiorna_attivita(
  p_id uuid, p_titolo text, p_descrizione text, p_tipo text, p_ordine int,
  p_data_inizio timestamptz, p_data_fine timestamptz, p_passcode text
)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from attivita where id = p_id), p_passcode);
  update attivita set titolo = p_titolo, descrizione = p_descrizione, tipo = p_tipo, ordine = p_ordine,
    data_inizio = p_data_inizio, data_fine = p_data_fine
  where id = p_id;
end; $$;

create or replace function docente_imposta_stato_attivita(p_id uuid, p_stato text, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from attivita where id = p_id), p_passcode);
  if p_stato not in ('bozza', 'prossimamente', 'attiva', 'archiviata') then raise exception 'stato_non_valido'; end if;
  update attivita set stato = p_stato where id = p_id;
end; $$;

create or replace function docente_imposta_flag_attivita(p_id uuid, p_richiedi_log_prompt boolean, p_richiedi_riflessione boolean, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from attivita where id = p_id), p_passcode);
  update attivita set richiedi_log_prompt = p_richiedi_log_prompt, richiedi_riflessione = p_richiedi_riflessione where id = p_id;
end; $$;

create or replace function docente_elimina_attivita(p_id uuid, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from attivita where id = p_id), p_passcode);
  delete from attivita where id = p_id;
end; $$;

create or replace function docente_aggiungi_commento(p_immagine_id uuid, p_testo text, p_passcode text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
begin
  perform richiedi_docente((
    select sc.corso_id from immagini i join submission_crazy8 sc on sc.id = i.submission_id where i.id = p_immagine_id
  ), p_passcode);
  if p_testo is null or length(trim(p_testo)) = 0 then raise exception 'commento_vuoto'; end if;
  insert into commenti (immagine_id, ruolo_autore, testo) values (p_immagine_id, 'docente', trim(p_testo)) returning id into v_id;
  return v_id;
end; $$;

create or replace function docente_elimina_commento(p_commento_id uuid, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((
    select sc.corso_id from commenti c
      join immagini i on i.id = c.immagine_id
      join submission_crazy8 sc on sc.id = i.submission_id
    where c.id = p_commento_id
  ), p_passcode);
  delete from commenti where id = p_commento_id;
end; $$;

create or replace function docente_imposta_stato_submission_crazy8(p_id uuid, p_stato text, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from submission_crazy8 where id = p_id), p_passcode);
  if p_stato not in ('in_corso', 'consegnato', 'revisionato') then raise exception 'stato_non_valido'; end if;
  update submission_crazy8 set stato = p_stato where id = p_id;
end; $$;

create or replace function docente_modera_ruolo(p_id uuid, p_stato text, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from ruoli_prompt where id = p_id), p_passcode);
  if p_stato not in ('proposto', 'approvato', 'rifiutato') then raise exception 'stato_non_valido'; end if;
  update ruoli_prompt set stato = p_stato where id = p_id;
end; $$;

create or replace function docente_elimina_ruolo(p_id uuid, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from ruoli_prompt where id = p_id), p_passcode);
  delete from ruoli_prompt where id = p_id;
end; $$;

create or replace function docente_aggiorna_prompt_suggerito(p_id uuid, p_etichetta text, p_testo_prompt text, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from prompt_suggeriti_crazy8 where id = p_id), p_passcode);
  if p_etichetta is null or length(trim(p_etichetta)) = 0 then raise exception 'etichetta_mancante'; end if;
  if p_testo_prompt is null or length(trim(p_testo_prompt)) = 0 then raise exception 'prompt_mancante'; end if;
  update prompt_suggeriti_crazy8 set etichetta = trim(p_etichetta), testo_prompt = trim(p_testo_prompt) where id = p_id;
end; $$;

create or replace function docente_elimina_prompt_suggerito(p_id uuid, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from prompt_suggeriti_crazy8 where id = p_id), p_passcode);
  delete from prompt_suggeriti_crazy8 where id = p_id;
end; $$;

create or replace function docente_elimina_tag_default(p_id uuid, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from tag_default_caso_studio where id = p_id), p_passcode);
  delete from tag_default_caso_studio where id = p_id;
end; $$;

-- =============================================================
-- Funzioni docente — operazioni sull'intero corso: ricevono p_corso_id.
-- Le vecchie versioni senza corso vengono rimosse.
-- =============================================================

drop function if exists docente_resetta_tutto(text);
drop function if exists docente_imposta_caso_attivo(bigint, text);
drop function if exists docente_seleziona_revisione_da_scelti(text);
drop function if exists docente_crea_attivita(text, text, text, int, boolean, boolean, text);
drop function if exists docente_lista_team(text);
drop function if exists docente_elimina_tutti_team(text);
drop function if exists docente_elimina_team(text, text);
drop function if exists docente_crea_ruolo(text, text, text, text);
drop function if exists docente_aggiungi_prompt_suggerito(text, text, text);
drop function if exists docente_aggiungi_tag_default(text, text);
drop function if exists docente_aggiorna_testo_piattaforma(text, text, text);

create or replace function docente_resetta_tutto(p_corso_id uuid, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  delete from casi_studio where corso_id = p_corso_id;
end; $$;

create or replace function docente_imposta_caso_attivo(p_corso_id uuid, p_caso_id bigint, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  if p_caso_id is not null and not exists (select 1 from casi_studio where id = p_caso_id and corso_id = p_corso_id) then
    raise exception 'caso_non_trovato';
  end if;
  insert into revisione_stato (corso_id, caso_attivo_id) values (p_corso_id, p_caso_id)
  on conflict (corso_id) do update set caso_attivo_id = excluded.caso_attivo_id;
end; $$;

create or replace function docente_seleziona_revisione_da_scelti(p_corso_id uuid, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  update casi_studio set incluso_revisione = (scelto > 0) where corso_id = p_corso_id;
end; $$;

create or replace function docente_crea_attivita(
  p_corso_id uuid, p_titolo text, p_descrizione text, p_tipo text, p_ordine int,
  p_richiedi_log_prompt boolean, p_richiedi_riflessione boolean, p_passcode text
)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  nuovo_id uuid;
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  insert into attivita (corso_id, titolo, descrizione, tipo, ordine, richiedi_log_prompt, richiedi_riflessione)
  values (p_corso_id, p_titolo, p_descrizione, p_tipo, p_ordine, p_richiedi_log_prompt, p_richiedi_riflessione)
  returning id into nuovo_id;
  return nuovo_id;
end; $$;

create or replace function docente_lista_team(p_corso_id uuid, p_passcode text)
returns table(numero int, nome text, membri text[], creato_il timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  return query select t.numero, t.nome, t.membri, t.created_at from team t where t.corso_id = p_corso_id order by t.numero asc;
end; $$;

create or replace function docente_elimina_tutti_team(p_corso_id uuid, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  delete from team where corso_id = p_corso_id;
end; $$;

create or replace function docente_elimina_team(p_corso_id uuid, p_nome text, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  delete from team where corso_id = p_corso_id and nome = p_nome;
end; $$;

create or replace function docente_crea_ruolo(p_corso_id uuid, p_nome text, p_descrizione text, p_visibilita text, p_passcode text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  if p_nome is null or length(trim(p_nome)) = 0 then raise exception 'nome_mancante'; end if;
  if p_visibilita not in ('privato_team', 'condiviso_classe') then p_visibilita := 'condiviso_classe'; end if;
  insert into ruoli_prompt (corso_id, nome, descrizione, tipo_creatore, stato, visibilita)
  values (p_corso_id, trim(p_nome), trim(p_descrizione), 'docente', 'approvato', p_visibilita)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function docente_aggiungi_prompt_suggerito(p_corso_id uuid, p_etichetta text, p_testo_prompt text, p_passcode text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ordine int;
  v_id uuid;
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  if p_etichetta is null or length(trim(p_etichetta)) = 0 then raise exception 'etichetta_mancante'; end if;
  if p_testo_prompt is null or length(trim(p_testo_prompt)) = 0 then raise exception 'prompt_mancante'; end if;
  select coalesce(max(ordine), -1) + 1 into v_ordine from prompt_suggeriti_crazy8 where corso_id = p_corso_id;
  insert into prompt_suggeriti_crazy8 (corso_id, etichetta, testo_prompt, ordine)
  values (p_corso_id, trim(p_etichetta), trim(p_testo_prompt), v_ordine)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function docente_aggiungi_tag_default(p_corso_id uuid, p_testo text, p_passcode text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ordine int;
  v_id uuid;
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  if p_testo is null or length(trim(p_testo)) = 0 then raise exception 'tag_vuoto'; end if;
  select coalesce(max(ordine), -1) + 1 into v_ordine from tag_default_caso_studio where corso_id = p_corso_id;
  insert into tag_default_caso_studio (corso_id, testo, ordine) values (p_corso_id, trim(p_testo), v_ordine) returning id into v_id;
  return v_id;
end; $$;

create or replace function docente_aggiorna_testo_piattaforma(p_corso_id uuid, p_chiave text, p_valore text, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  if p_chiave is null or length(trim(p_chiave)) = 0 then raise exception 'chiave_vuota'; end if;
  insert into contenuto_piattaforma (corso_id, chiave, valore, aggiornato_il)
  values (p_corso_id, trim(p_chiave), coalesce(p_valore, ''), now())
  on conflict (corso_id, chiave) do update set valore = excluded.valore, aggiornato_il = now();
end; $$;

-- =============================================================
-- Permessi
-- =============================================================

grant execute on function docente_accedi(text) to anon;
grant execute on function docente_crea_corso(text, text, text, text, text, uuid) to anon;
grant execute on function docente_aggiorna_corso(uuid, text, text, text, text, boolean, boolean, jsonb) to anon;
grant execute on function docente_cambia_password_corso(uuid, text, text) to anon;
grant execute on function docente_elimina_corso(uuid, text, text) to anon;

grant execute on function crea_caso_studio(uuid, text, int, text, text, text, text[], jsonb, numeric, numeric, text) to anon;
grant execute on function vota_caso_studio(bigint, int, text) to anon;
grant execute on function crea_team(uuid, text, text, text, text, text[]) to anon;
grant execute on function login_team(uuid, text, text) to anon;
grant execute on function recupera_domanda_team(uuid, text) to anon;
grant execute on function reimposta_password_team(uuid, text, text, text) to anon;
grant execute on function crea_submission_crazy8(uuid, text, int, text, text) to anon;
grant execute on function crea_hmw_iterazione(uuid, text, int, text, text, text, text) to anon;
grant execute on function salva_stress_test(uuid, uuid, text, text) to anon;
grant execute on function proponi_ruolo(uuid, text, text, text, int, text) to anon;

grant execute on function docente_resetta_tutto(uuid, text) to anon;
grant execute on function docente_imposta_caso_attivo(uuid, bigint, text) to anon;
grant execute on function docente_seleziona_revisione_da_scelti(uuid, text) to anon;
grant execute on function docente_crea_attivita(uuid, text, text, text, int, boolean, boolean, text) to anon;
grant execute on function docente_lista_team(uuid, text) to anon;
grant execute on function docente_elimina_tutti_team(uuid, text) to anon;
grant execute on function docente_elimina_team(uuid, text, text) to anon;
grant execute on function docente_crea_ruolo(uuid, text, text, text, text) to anon;
grant execute on function docente_aggiungi_prompt_suggerito(uuid, text, text, text) to anon;
grant execute on function docente_aggiungi_tag_default(uuid, text, text) to anon;
grant execute on function docente_aggiorna_testo_piattaforma(uuid, text, text, text) to anon;

-- Le funzioni "per riga" mantengono i grant già dati in precedenza
-- (create or replace non li toglie).

-- === Realtime: i filtri per corso_id richiedono la riga completa ===

alter table team replica identity full;
alter table attivita replica identity full;
alter table revisione_stato replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'revisione_stato') then
    alter publication supabase_realtime add table revisione_stato;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'voti_revisione') then
    alter publication supabase_realtime add table voti_revisione;
  end if;
end $$;

notify pgrst, 'reload schema';
