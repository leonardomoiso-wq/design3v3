-- Sposta la votazione a cartellino (verde/giallo/rosso) della peer review
-- dal docente (che prima cliccava per conto della classe) ai singoli
-- gruppi, che votano dal proprio dispositivo sulla pagina studenti. Il
-- docente vede il conteggio aggiornarsi in tempo reale sulla pagina
-- /teacher/review.
--
-- Da eseguire nel SQL editor di Supabase DOPO le due migrazioni precedenti
-- (20260915_add_tags_column.sql, 20260916_multi_user_rls.sql).

-- Traccia quale caso studio è attualmente aperto al voto in aula.
create table if not exists revisione_stato (
  id boolean primary key default true,
  caso_attivo_id bigint references casi_studio(id) on delete set null,
  constraint revisione_stato_singleton check (id)
);

insert into revisione_stato (id, caso_attivo_id)
values (true, null)
on conflict (id) do nothing;

-- Esito finale (approvazione) deciso dal docente per ciascun caso studio.
alter table casi_studio
  add column if not exists esito_revisione text
    check (esito_revisione is null or esito_revisione in ('verde', 'giallo', 'rosso'));

-- Un voto per gruppo per caso studio (rivotare aggiorna il voto precedente).
create table if not exists voti_revisione (
  id bigint generated always as identity primary key,
  caso_id bigint not null references casi_studio(id) on delete cascade,
  gruppo_num int not null,
  colore text not null check (colore in ('verde', 'giallo', 'rosso')),
  creato_il timestamptz not null default now(),
  unique (caso_id, gruppo_num)
);

alter table revisione_stato enable row level security;
alter table voti_revisione enable row level security;

drop policy if exists "revisione_stato_select_pubblico" on revisione_stato;
create policy "revisione_stato_select_pubblico"
  on revisione_stato for select
  using (true);

drop policy if exists "voti_revisione_select_pubblico" on voti_revisione;
create policy "voti_revisione_select_pubblico"
  on voti_revisione for select
  using (true);

-- Nessuna policy insert/update/delete diretta: tutto passa dalle funzioni.

create or replace function docente_imposta_caso_attivo(
  p_caso_id bigint,
  p_passcode text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash
  ) then
    raise exception 'passcode_errato';
  end if;

  update revisione_stato set caso_attivo_id = p_caso_id where id = true;
end;
$$;

create or replace function docente_azzera_voti(
  p_caso_id bigint,
  p_passcode text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash
  ) then
    raise exception 'passcode_errato';
  end if;

  delete from voti_revisione where caso_id = p_caso_id;
end;
$$;

create or replace function docente_imposta_esito_revisione(
  p_caso_id bigint,
  p_esito text,
  p_passcode text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash
  ) then
    raise exception 'passcode_errato';
  end if;

  if p_esito is not null and p_esito not in ('verde', 'giallo', 'rosso') then
    raise exception 'esito_non_valido';
  end if;

  update casi_studio set esito_revisione = p_esito where id = p_caso_id;
end;
$$;

create or replace function vota_caso_studio(
  p_caso_id bigint,
  p_gruppo_num int,
  p_colore text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_colore not in ('verde', 'giallo', 'rosso') then
    raise exception 'colore_non_valido';
  end if;

  if not exists (
    select 1 from revisione_stato where id = true and caso_attivo_id = p_caso_id
  ) then
    raise exception 'votazione_non_attiva';
  end if;

  insert into voti_revisione (caso_id, gruppo_num, colore)
  values (p_caso_id, p_gruppo_num, p_colore)
  on conflict (caso_id, gruppo_num)
  do update set colore = excluded.colore, creato_il = now();
end;
$$;

grant execute on function docente_imposta_caso_attivo to anon;
grant execute on function docente_azzera_voti to anon;
grant execute on function docente_imposta_esito_revisione to anon;
grant execute on function vota_caso_studio to anon;

-- Necessario per il realtime (aggiornamento live del conteggio voti e
-- dello stato di revisione sulle pagine collegate). Idempotente: non
-- fallisce se la tabella è già stata aggiunta in un run precedente.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'voti_revisione'
  ) then
    alter publication supabase_realtime add table voti_revisione;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'revisione_stato'
  ) then
    alter publication supabase_realtime add table revisione_stato;
  end if;
end;
$$;
