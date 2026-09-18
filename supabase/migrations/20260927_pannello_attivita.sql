-- =============================================================
-- Pannello "attiva/disattiva attività" (Fase 1 della roadmap multi-attività).
-- Sostituisce l'array statico lib/attivita.ts con una tabella reale: il/la
-- docente gestisce titolo, stato (visibilità in home) e i due flag di
-- obbligatorietà (log prompt / riflessione) da un pannello, letti a runtime
-- dai form di consegna delle attività future (Crazy8, HMW, ...).
--
-- "tipo" è il discriminatore che lega una riga al modulo di pagine che la
-- implementa (vedi lib/attivita.ts, MODULI_ATTIVITA): un'attività può
-- esistere ed essere visibile prima ancora che il suo modulo sia stato
-- scritto (stato 'prossimamente'), ma diventa avviabile solo quando lo è.
-- =============================================================

create table if not exists attivita (
  id uuid primary key default gen_random_uuid(),
  titolo text not null,
  descrizione text,
  tipo text not null,
  ordine int not null default 0,
  -- bozza: nascosta agli studenti, il/la docente la sta ancora preparando.
  -- prossimamente: visibile in home come anteprima, non avviabile.
  -- attiva: visibile e avviabile.
  -- archiviata: non più mostrata in home.
  stato text not null default 'bozza'
    check (stato in ('bozza', 'prossimamente', 'attiva', 'archiviata')),
  classe_o_team_target uuid, -- NULL = visibile a tutti (nessun modello classi/team ancora esistente)
  data_inizio timestamptz,
  data_fine timestamptz,
  richiedi_log_prompt boolean not null default true,
  richiedi_riflessione boolean not null default true,
  created_at timestamptz not null default now()
);

alter table attivita enable row level security;

drop policy if exists "attivita_select_pubblico" on attivita;
create policy "attivita_select_pubblico" on attivita for select using (true);

-- === Funzioni (SECURITY DEFINER, passcode docente, search_path corretto per pgcrypto) ===

create or replace function docente_crea_attivita(
  p_titolo text,
  p_descrizione text,
  p_tipo text,
  p_ordine int,
  p_richiedi_log_prompt boolean,
  p_richiedi_riflessione boolean,
  p_passcode text
)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  nuovo_id uuid;
begin
  if not exists (select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash) then
    raise exception 'passcode_errato';
  end if;

  insert into attivita (titolo, descrizione, tipo, ordine, richiedi_log_prompt, richiedi_riflessione)
  values (p_titolo, p_descrizione, p_tipo, p_ordine, p_richiedi_log_prompt, p_richiedi_riflessione)
  returning id into nuovo_id;

  return nuovo_id;
end;
$$;

create or replace function docente_aggiorna_attivita(
  p_id uuid,
  p_titolo text,
  p_descrizione text,
  p_tipo text,
  p_ordine int,
  p_data_inizio timestamptz,
  p_data_fine timestamptz,
  p_passcode text
)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash) then
    raise exception 'passcode_errato';
  end if;

  update attivita set
    titolo = p_titolo,
    descrizione = p_descrizione,
    tipo = p_tipo,
    ordine = p_ordine,
    data_inizio = p_data_inizio,
    data_fine = p_data_fine
  where id = p_id;
end;
$$;

create or replace function docente_imposta_stato_attivita(p_id uuid, p_stato text, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash) then
    raise exception 'passcode_errato';
  end if;

  if p_stato not in ('bozza', 'prossimamente', 'attiva', 'archiviata') then
    raise exception 'stato_non_valido';
  end if;

  update attivita set stato = p_stato where id = p_id;
end;
$$;

create or replace function docente_imposta_flag_attivita(
  p_id uuid,
  p_richiedi_log_prompt boolean,
  p_richiedi_riflessione boolean,
  p_passcode text
)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash) then
    raise exception 'passcode_errato';
  end if;

  update attivita set
    richiedi_log_prompt = p_richiedi_log_prompt,
    richiedi_riflessione = p_richiedi_riflessione
  where id = p_id;
end;
$$;

create or replace function docente_elimina_attivita(p_id uuid, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash) then
    raise exception 'passcode_errato';
  end if;

  delete from attivita where id = p_id;
end;
$$;

grant execute on function docente_crea_attivita to anon;
grant execute on function docente_aggiorna_attivita to anon;
grant execute on function docente_imposta_stato_attivita to anon;
grant execute on function docente_imposta_flag_attivita to anon;
grant execute on function docente_elimina_attivita to anon;

-- === Realtime: la home page reagisce subito a un cambio di stato ===

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'attivita'
  ) then
    alter publication supabase_realtime add table attivita;
  end if;
end $$;

-- === Migrazione dei contenuti: porta "Design Case Studies" nella nuova tabella ===
-- (prima viveva solo come voce statica in lib/attivita.ts)

insert into attivita (titolo, descrizione, tipo, ordine, stato, richiedi_log_prompt, richiedi_riflessione)
select
  'Design Case Studies',
  'Sottomissione dei progetti, matrice IDEO, radar multicriterio e peer review con voto di gruppo in tempo reale.',
  'design_case_studies',
  0,
  'attiva',
  false,
  false
where not exists (select 1 from attivita where tipo = 'design_case_studies');
