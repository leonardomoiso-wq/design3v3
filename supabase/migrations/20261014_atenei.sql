-- =============================================================
-- Atenei: un livello sopra i corsi.
--
-- * Ogni corso appartiene a un ateneo (es. Politecnico di Torino,
--   Università di Parma). Gli studenti scelgono prima l'ateneo e poi il
--   corso, e ogni corso ha un indirizzo da condividere:
--   /<ateneo>/<corso>  (es. /polito/design-3).
-- * Ogni ateneo ha uno "spazio di ateneo": un corso nascosto
--   (spazio_ateneo = true) che ospita le attività di ateneo, come il
--   Contest, con iscrizioni (in team o da soli) e password docente
--   proprie. Si raggiunge da /<ateneo>/contest, senza scegliere un corso.
--   Così il Contest riusa accessi, voto anonimo, pannello e proiezione
--   senza duplicarli.
--
-- Da eseguire nel SQL editor di Supabase DOPO 20261013_contest_mappa.sql,
-- PRIMA di pubblicare il codice aggiornato. Idempotente.
-- =============================================================

create table if not exists atenei (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  -- Codice breve usato nell'indirizzo: /polito, /unipr
  codice text not null,
  descrizione text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists atenei_codice_unico on atenei (lower(codice));
alter table atenei enable row level security;
drop policy if exists "atenei_select_pubblico" on atenei;
create policy "atenei_select_pubblico" on atenei for select using (true);
grant select on atenei to anon, authenticated;

alter table corsi add column if not exists ateneo_id uuid references atenei(id) on delete set null;
alter table corsi add column if not exists spazio_ateneo boolean not null default false;
create index if not exists corsi_ateneo_idx on corsi (ateneo_id);
-- Un solo spazio per ateneo.
create unique index if not exists corsi_spazio_unico on corsi (ateneo_id) where spazio_ateneo;
-- Le colonne della tabella corsi si concedono una per una (c'è l'hash della password).
grant select (ateneo_id, spazio_ateneo) on corsi to anon, authenticated;

-- Codici che non possono essere un ateneo: sono già pagine della piattaforma.
create or replace function codice_ateneo_riservato(p text) returns boolean
language sql immutable as $$
  select lower(coalesce(p, '')) in ('student', 'teacher', 'crazy8', 'hmw', 'contest', 'manuali', 'api', '_next', 'favicon.ico', 'corsi', 'atenei');
$$;

-- Crea lo spazio di ateneo (se manca) con l'attività Contest in bozza.
create or replace function crea_spazio_ateneo(p_ateneo_id uuid, p_passcode_hash text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
  v_a atenei%rowtype;
  v_codice text;
begin
  select id into v_id from corsi where ateneo_id = p_ateneo_id and spazio_ateneo;
  if v_id is not null then return v_id; end if;
  select * into v_a from atenei where id = p_ateneo_id;
  v_codice := lower(v_a.codice) || '-ateneo';
  while exists (select 1 from corsi where lower(codice) = v_codice) loop
    v_codice := v_codice || '-1';
  end loop;
  insert into corsi (nome, codice, descrizione, passcode_hash, configurazione, visibile_in_home, ateneo_id, spazio_ateneo)
  values (v_a.nome, v_codice, 'Attività di ateneo', p_passcode_hash, configurazione_corso_predefinita(), false, p_ateneo_id, true)
  returning id into v_id;
  insert into revisione_stato (corso_id, caso_attivo_id) values (v_id, null) on conflict do nothing;
  insert into attivita (corso_id, titolo, descrizione, tipo, ordine, stato, richiedi_log_prompt, richiedi_riflessione)
  values (v_id, 'Contest del progetto migliore', 'Le proposte in gara e il voto anonimo, da remoto e dal vivo in aula.', 'contest_voto', 0, 'bozza', false, false);
  return v_id;
end; $$;
revoke execute on function crea_spazio_ateneo(uuid, text) from public, anon, authenticated;

-- === Primi atenei e assegnazione dei corsi esistenti ===
-- Politecnico di Torino e Università di Parma; i corsi esistenti vanno al
-- Politecnico, tranne quelli sulla tracciabilità (Parma). Si può cambiare
-- in qualsiasi momento da Area Docente → Atenei.
insert into atenei (nome, codice, descrizione)
select 'Politecnico di Torino', 'polito', ''
where not exists (select 1 from atenei where lower(codice) = 'polito');
insert into atenei (nome, codice, descrizione)
select 'Università di Parma', 'unipr', ''
where not exists (select 1 from atenei where lower(codice) = 'unipr');

update corsi set ateneo_id = (select id from atenei where lower(codice) = 'unipr')
where ateneo_id is null and not spazio_ateneo and nome ilike '%tracciabil%';
update corsi set ateneo_id = (select id from atenei where lower(codice) = 'polito')
where ateneo_id is null and not spazio_ateneo;

-- Spazi di ateneo: all'inizio si aprono con la password di amministrazione.
do $$
declare v record;
begin
  for v in select id from atenei loop
    perform crea_spazio_ateneo(v.id, (select passcode_hash from docente_config where id = true));
  end loop;
end $$;

-- === Accesso docente: ora restituisce anche l'ateneo ===
drop function if exists docente_accedi(text);
create or replace function docente_accedi(p_passcode text)
returns table(id uuid, nome text, codice text, descrizione text, visibile_in_home boolean, archiviato boolean,
              configurazione jsonb, created_at timestamptz, amministratore boolean,
              ateneo_id uuid, spazio_ateneo boolean, ateneo_codice text, ateneo_nome text)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_admin boolean := e_amministratore(p_passcode);
begin
  return query
    select c.id, c.nome, c.codice, c.descrizione, c.visibile_in_home, c.archiviato, c.configurazione, c.created_at, v_admin,
           c.ateneo_id, c.spazio_ateneo, a.codice, a.nome
    from corsi c left join atenei a on a.id = c.ateneo_id
    where v_admin or crypt(coalesce(p_passcode, ''), c.passcode_hash) = c.passcode_hash
    order by c.archiviato asc, c.spazio_ateneo desc, c.created_at asc;
end;
$$;
grant execute on function docente_accedi(text) to anon;

-- === Gestione atenei (amministrazione) ===
create or replace function docente_crea_ateneo(p_passcode text, p_nome text, p_codice text, p_password_spazio text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
  v_codice text := trim(both '-' from lower(regexp_replace(trim(coalesce(p_codice, '')), '[^a-zA-Z0-9]+', '-', 'g')));
begin
  if not e_amministratore(p_passcode) then raise exception 'passcode_errato'; end if;
  if p_nome is null or length(trim(p_nome)) < 2 then raise exception 'nome_troppo_corto'; end if;
  if length(v_codice) < 2 then raise exception 'codice_troppo_corto'; end if;
  if codice_ateneo_riservato(v_codice) then raise exception 'codice_riservato'; end if;
  if exists (select 1 from atenei where lower(codice) = v_codice) then raise exception 'codice_gia_usato'; end if;
  if p_password_spazio is not null and length(trim(p_password_spazio)) > 0 and length(trim(p_password_spazio)) < 6 then
    raise exception 'password_troppo_corta';
  end if;
  insert into atenei (nome, codice) values (trim(p_nome), v_codice) returning id into v_id;
  perform crea_spazio_ateneo(v_id, case when coalesce(trim(p_password_spazio), '') = ''
    then (select passcode_hash from docente_config where id = true)
    else crypt(p_password_spazio, gen_salt('bf')) end);
  return v_id;
end; $$;
grant execute on function docente_crea_ateneo(text, text, text, text) to anon;

create or replace function docente_aggiorna_ateneo(p_id uuid, p_passcode text, p_nome text, p_codice text, p_descrizione text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_codice text := trim(both '-' from lower(regexp_replace(trim(coalesce(p_codice, '')), '[^a-zA-Z0-9]+', '-', 'g')));
  v_spazio uuid := (select id from corsi where ateneo_id = p_id and spazio_ateneo);
begin
  if not (e_amministratore(p_passcode) or docente_autorizzato(v_spazio, p_passcode)) then raise exception 'passcode_errato'; end if;
  if p_nome is null or length(trim(p_nome)) < 2 then raise exception 'nome_troppo_corto'; end if;
  if length(v_codice) < 2 then raise exception 'codice_troppo_corto'; end if;
  if codice_ateneo_riservato(v_codice) then raise exception 'codice_riservato'; end if;
  if exists (select 1 from atenei where lower(codice) = v_codice and id <> p_id) then raise exception 'codice_gia_usato'; end if;
  update atenei set nome = trim(p_nome), codice = v_codice, descrizione = coalesce(p_descrizione, '') where id = p_id;
  update corsi set nome = trim(p_nome) where id = v_spazio;
end; $$;
grant execute on function docente_aggiorna_ateneo(uuid, text, text, text, text) to anon;

-- Il docente di un corso (o l'amministrazione) sceglie a quale ateneo appartiene.
create or replace function docente_assegna_ateneo(p_corso_id uuid, p_ateneo_id uuid, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  if exists (select 1 from corsi where id = p_corso_id and spazio_ateneo) then raise exception 'spazio_ateneo'; end if;
  if p_ateneo_id is not null and not exists (select 1 from atenei where id = p_ateneo_id) then raise exception 'ateneo_non_trovato'; end if;
  update corsi set ateneo_id = p_ateneo_id where id = p_corso_id;
end; $$;
grant execute on function docente_assegna_ateneo(uuid, uuid, text) to anon;

-- I corsi visibili non sono mai gli spazi di ateneo.
update corsi set visibile_in_home = false where spazio_ateneo and visibile_in_home;

notify pgrst, 'reload schema';
