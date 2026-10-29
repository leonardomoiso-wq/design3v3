-- =============================================================
-- Nuova attività "Contest": proposte di progetto votate in forma
-- anonima, da remoto (studenti iscritti, con scadenza) e dal vivo
-- (pubblico in aula, con codice proiettato). In più:
--   * iscrizione degli studenti come INDIVIDUO o come GRUPPO
--     (tabella partecipanti, password solo come hash);
--   * stato di ogni attività (attiva / prossimamente / nascosta)
--     deciso dal pannello docente invece che scritto nel codice.
--
-- Da eseguire nel SQL editor di Supabase DOPO tutte le migrazioni
-- precedenti, PRIMA di pubblicare il codice aggiornato. Idempotente:
-- si può rieseguire senza danni.
--
-- Anonimato: la tabella dei voti non è leggibile dal client. Ogni voto
-- conserva solo un'impronta (hash con un sale segreto per contest) di
-- chi ha votato, che serve a impedire il doppio voto ma non permette di
-- risalire alla persona. I dati visibili sono solo aggregati (quanti,
-- da dove, da che dispositivo, quando) e passano da contest_statistiche.
-- =============================================================

-- === Funzione interna: verifica password docente ===
create or replace function e_docente(p_passcode text) returns boolean
language sql security definer set search_path = public, extensions as $$
  select exists (
    select 1 from docente_config
    where crypt(coalesce(p_passcode, ''), passcode_hash) = passcode_hash
  );
$$;
revoke execute on function e_docente(text) from public, anon, authenticated;

-- === Stato delle attività in home ===
create table if not exists attivita_stato (
  id text primary key,
  stato text not null default 'prossimamente',
  aggiornato_il timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'attivita_stato_valido') then
    alter table attivita_stato add constraint attivita_stato_valido
      check (stato in ('attiva', 'prossimamente', 'nascosta'));
  end if;
end $$;
alter table attivita_stato enable row level security;
drop policy if exists "attivita_stato_select_pubblico" on attivita_stato;
create policy "attivita_stato_select_pubblico" on attivita_stato for select using (true);
grant select on attivita_stato to anon, authenticated;

insert into attivita_stato (id, stato) values ('case-studies', 'attiva')
on conflict (id) do nothing;
insert into attivita_stato (id, stato) values ('contest', 'prossimamente')
on conflict (id) do nothing;

create or replace function docente_imposta_stato_attivita(p_id text, p_stato text, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not e_docente(p_passcode) then raise exception 'passcode_errato'; end if;
  if p_stato not in ('attiva', 'prossimamente', 'nascosta') then raise exception 'stato_non_valido'; end if;
  if p_id is null or length(trim(p_id)) = 0 then raise exception 'attivita_non_valida'; end if;
  insert into attivita_stato (id, stato, aggiornato_il) values (p_id, p_stato, now())
  on conflict (id) do update set stato = excluded.stato, aggiornato_il = now();
end; $$;
grant execute on function docente_imposta_stato_attivita(text, text, text) to anon;

-- === Partecipanti: iscrizione individuale o di gruppo ===
create table if not exists partecipanti (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'individuale',
  nome text not null,
  membri text[] not null default '{}',
  password_hash text not null,
  creato_il timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'partecipanti_tipo_valido') then
    alter table partecipanti add constraint partecipanti_tipo_valido check (tipo in ('individuale', 'gruppo'));
  end if;
end $$;
create unique index if not exists partecipanti_nome_unico on partecipanti (lower(trim(nome)));
alter table partecipanti enable row level security;
drop policy if exists "partecipanti_select_pubblico" on partecipanti;
create policy "partecipanti_select_pubblico" on partecipanti for select using (true);
-- Solo le colonne senza segreti: mai select * su questa tabella.
revoke select on partecipanti from anon, authenticated;
grant select (id, tipo, nome, membri, creato_il) on partecipanti to anon, authenticated;

create table if not exists partecipanti_sessioni (
  token_hash text primary key,
  partecipante_id uuid not null references partecipanti(id) on delete cascade,
  creato_il timestamptz not null default now()
);
create index if not exists partecipanti_sessioni_partecipante on partecipanti_sessioni (partecipante_id);
alter table partecipanti_sessioni enable row level security;
revoke all on partecipanti_sessioni from anon, authenticated;

create or replace function partecipante_da_token(p_token text) returns uuid
language sql security definer set search_path = public, extensions as $$
  select partecipante_id from partecipanti_sessioni
  where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;
revoke execute on function partecipante_da_token(text) from public, anon, authenticated;

create or replace function nuova_sessione_partecipante(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_token text := encode(gen_random_bytes(24), 'hex');
  v jsonb;
begin
  insert into partecipanti_sessioni (token_hash, partecipante_id)
  values (encode(digest(v_token, 'sha256'), 'hex'), p_id);
  select jsonb_build_object('token', v_token, 'id', id, 'tipo', tipo, 'nome', nome, 'membri', membri)
    into v from partecipanti where id = p_id;
  return v;
end; $$;
revoke execute on function nuova_sessione_partecipante(uuid) from public, anon, authenticated;

create or replace function partecipante_registra(
  p_tipo text, p_nome text, p_password text, p_membri text[] default '{}'
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
  v_membri text[];
begin
  if p_tipo not in ('individuale', 'gruppo') then raise exception 'tipo_non_valido'; end if;
  if p_nome is null or length(trim(p_nome)) < 2 or length(trim(p_nome)) > 80 then raise exception 'nome_non_valido'; end if;
  if p_password is null or length(p_password) < 4 then raise exception 'password_troppo_corta'; end if;
  if exists (select 1 from partecipanti where lower(trim(nome)) = lower(trim(p_nome))) then
    raise exception 'nome_gia_usato';
  end if;
  select coalesce(array_agg(trim(m)), '{}') into v_membri
    from unnest(coalesce(p_membri, '{}')) m where length(trim(m)) > 0;
  if p_tipo = 'individuale' then v_membri := '{}'; end if;
  insert into partecipanti (tipo, nome, membri, password_hash)
  values (p_tipo, trim(p_nome), v_membri, crypt(p_password, gen_salt('bf')))
  returning id into v_id;
  return nuova_sessione_partecipante(v_id);
end; $$;
grant execute on function partecipante_registra(text, text, text, text[]) to anon;

create or replace function partecipante_accedi(p_nome text, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  select id into v_id from partecipanti
  where lower(trim(nome)) = lower(trim(coalesce(p_nome, '')))
    and crypt(coalesce(p_password, ''), password_hash) = password_hash;
  if v_id is null then raise exception 'credenziali_errate'; end if;
  return nuova_sessione_partecipante(v_id);
end; $$;
grant execute on function partecipante_accedi(text, text) to anon;

create or replace function partecipante_io(p_token text) returns jsonb
language sql security definer set search_path = public, extensions as $$
  select jsonb_build_object('id', id, 'tipo', tipo, 'nome', nome, 'membri', membri)
  from partecipanti where id = partecipante_da_token(p_token);
$$;
grant execute on function partecipante_io(text) to anon;

create or replace function partecipante_esci(p_token text) returns void
language sql security definer set search_path = public, extensions as $$
  delete from partecipanti_sessioni where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;
grant execute on function partecipante_esci(text) to anon;

create or replace function docente_reimposta_password_partecipante(p_id uuid, p_nuova text, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not e_docente(p_passcode) then raise exception 'passcode_errato'; end if;
  if p_nuova is null or length(p_nuova) < 4 then raise exception 'password_troppo_corta'; end if;
  update partecipanti set password_hash = crypt(p_nuova, gen_salt('bf')) where id = p_id;
  if not found then raise exception 'partecipante_non_trovato'; end if;
  delete from partecipanti_sessioni where partecipante_id = p_id;
end; $$;
grant execute on function docente_reimposta_password_partecipante(uuid, text, text) to anon;

create or replace function docente_elimina_partecipante(p_id uuid, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not e_docente(p_passcode) then raise exception 'passcode_errato'; end if;
  delete from partecipanti where id = p_id;
end; $$;
grant execute on function docente_elimina_partecipante(uuid, text) to anon;

-- === Contest ===
create table if not exists contest (
  id uuid primary key default gen_random_uuid(),
  titolo text not null,
  sottotitolo text not null default '',
  descrizione text not null default '',
  iscrizione text not null default 'individuale',
  fase text not null default 'bozza',
  voto_inizio timestamptz,
  voto_fine timestamptz,
  mostra_classifica boolean not null default false,
  live_stato text not null default 'chiuso',
  live_inizio timestamptz,
  live_fine timestamptz,
  vincitore_rivelato boolean not null default false,
  creato_il timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contest_iscrizione_valida') then
    alter table contest add constraint contest_iscrizione_valida check (iscrizione in ('individuale', 'gruppo', 'entrambe'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contest_fase_valida') then
    alter table contest add constraint contest_fase_valida check (fase in ('bozza', 'candidature', 'voto', 'chiuso'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contest_live_valido') then
    alter table contest add constraint contest_live_valido check (live_stato in ('chiuso', 'aperto', 'concluso'));
  end if;
end $$;
alter table contest enable row level security;
drop policy if exists "contest_select_pubblico" on contest;
create policy "contest_select_pubblico" on contest for select using (fase <> 'bozza');
grant select on contest to anon, authenticated;

-- Segreti per contest: sale dell'impronta di voto e codice del voto dal vivo.
create table if not exists contest_segreti (
  contest_id uuid primary key references contest(id) on delete cascade,
  sale text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  live_codice text
);
alter table contest_segreti enable row level security;
revoke all on contest_segreti from anon, authenticated;

create table if not exists contest_proposte (
  id bigint generated by default as identity primary key,
  contest_id uuid not null references contest(id) on delete cascade,
  partecipante_id uuid references partecipanti(id) on delete set null,
  autori text not null default '',
  titolo text not null,
  sintesi text not null default '',
  problema text not null default '',
  proposta text not null default '',
  perche text not null default '',
  immagine text not null default '',
  galleria text[] not null default '{}',
  nascosta boolean not null default false,
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);
create index if not exists contest_proposte_contest on contest_proposte (contest_id);
create unique index if not exists contest_proposte_una_per_partecipante
  on contest_proposte (contest_id, partecipante_id) where partecipante_id is not null;
alter table contest_proposte enable row level security;
drop policy if exists "contest_proposte_select_pubblico" on contest_proposte;
create policy "contest_proposte_select_pubblico" on contest_proposte for select
  using (not nascosta and exists (select 1 from contest c where c.id = contest_id and c.fase <> 'bozza'));
grant select on contest_proposte to anon, authenticated;

create table if not exists contest_voti (
  id bigint generated always as identity primary key,
  contest_id uuid not null references contest(id) on delete cascade,
  proposta_id bigint not null references contest_proposte(id) on delete cascade,
  fase text not null,
  votante_hash text not null,
  dispositivo text not null default 'altro',
  zona text not null default '',
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  unique (contest_id, fase, votante_hash)
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contest_voti_fase_valida') then
    alter table contest_voti add constraint contest_voti_fase_valida check (fase in ('remoto', 'live'));
  end if;
end $$;
create index if not exists contest_voti_contest_fase on contest_voti (contest_id, fase, creato_il);
alter table contest_voti enable row level security;
-- Nessuna policy e nessun grant: i voti si leggono solo come aggregati.
revoke all on contest_voti from anon, authenticated;

-- Pulizia dei dati del client: dispositivo da un elenco, zona breve.
create or replace function contest_pulisci_dispositivo(p text) returns text
language sql immutable as $$
  select case when p in ('smartphone', 'tablet', 'computer') then p else 'altro' end;
$$;
create or replace function contest_pulisci_zona(p text) returns text
language sql immutable as $$
  select left(regexp_replace(trim(coalesce(p, '')), '[^[:alnum:] _''./-]', '', 'g'), 40);
$$;

-- --- Docente: crea / modifica / fasi / live ---
create or replace function docente_salva_contest(
  p_id uuid, p_titolo text, p_sottotitolo text, p_descrizione text,
  p_iscrizione text, p_mostra_classifica boolean, p_passcode text
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if not e_docente(p_passcode) then raise exception 'passcode_errato'; end if;
  if p_titolo is null or length(trim(p_titolo)) = 0 then raise exception 'titolo_mancante'; end if;
  if p_iscrizione not in ('individuale', 'gruppo', 'entrambe') then raise exception 'iscrizione_non_valida'; end if;
  if p_id is null then
    insert into contest (titolo, sottotitolo, descrizione, iscrizione, mostra_classifica)
    values (trim(p_titolo), coalesce(p_sottotitolo, ''), coalesce(p_descrizione, ''), p_iscrizione, coalesce(p_mostra_classifica, false))
    returning id into v_id;
    insert into contest_segreti (contest_id) values (v_id) on conflict do nothing;
  else
    update contest set titolo = trim(p_titolo), sottotitolo = coalesce(p_sottotitolo, ''),
      descrizione = coalesce(p_descrizione, ''), iscrizione = p_iscrizione,
      mostra_classifica = coalesce(p_mostra_classifica, false)
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'contest_non_trovato'; end if;
  end if;
  return v_id;
end; $$;
grant execute on function docente_salva_contest(uuid, text, text, text, text, boolean, text) to anon;

create or replace function docente_imposta_fase_contest(
  p_id uuid, p_fase text, p_voto_fine timestamptz, p_passcode text
) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not e_docente(p_passcode) then raise exception 'passcode_errato'; end if;
  if p_fase not in ('bozza', 'candidature', 'voto', 'chiuso') then raise exception 'fase_non_valida'; end if;
  if p_fase = 'voto' and (p_voto_fine is null or p_voto_fine <= now()) then raise exception 'scadenza_non_valida'; end if;
  update contest set
    fase = p_fase,
    voto_inizio = case when p_fase = 'voto' then coalesce(case when voto_fine > now() then voto_inizio end, now()) else voto_inizio end,
    voto_fine = case when p_fase = 'voto' then p_voto_fine
                     when p_fase = 'chiuso' and voto_fine > now() then now()
                     else voto_fine end
  where id = p_id;
  if not found then raise exception 'contest_non_trovato'; end if;
end; $$;
grant execute on function docente_imposta_fase_contest(uuid, text, timestamptz, text) to anon;

create or replace function docente_elimina_contest(p_id uuid, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not e_docente(p_passcode) then raise exception 'passcode_errato'; end if;
  delete from contest where id = p_id;
end; $$;
grant execute on function docente_elimina_contest(uuid, text) to anon;

-- p_azione: apri (nuovo codice, durata facoltativa) | chiudi | rivela | copri | azzera
create or replace function docente_live_contest(
  p_id uuid, p_azione text, p_durata_sec int, p_passcode text
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_codice text;
begin
  if not e_docente(p_passcode) then raise exception 'passcode_errato'; end if;
  if not exists (select 1 from contest where id = p_id) then raise exception 'contest_non_trovato'; end if;
  insert into contest_segreti (contest_id) values (p_id) on conflict do nothing;
  if p_azione = 'apri' then
    -- Un solo voto dal vivo aperto alla volta: la pagina pubblica lo trova da sola.
    update contest set live_stato = 'concluso', live_fine = least(coalesce(live_fine, now()), now())
      where live_stato = 'aperto' and id <> p_id;
    v_codice := lpad((floor(random() * 10000))::int::text, 4, '0');
    update contest_segreti set live_codice = v_codice where contest_id = p_id;
    update contest set live_stato = 'aperto', live_inizio = coalesce(live_inizio, now()),
      live_fine = case when coalesce(p_durata_sec, 0) > 0 then now() + make_interval(secs => p_durata_sec) else null end,
      vincitore_rivelato = false
    where id = p_id;
  elsif p_azione = 'chiudi' then
    update contest set live_stato = 'concluso', live_fine = least(coalesce(live_fine, now()), now()) where id = p_id;
  elsif p_azione = 'rivela' then
    update contest set vincitore_rivelato = true where id = p_id;
  elsif p_azione = 'copri' then
    update contest set vincitore_rivelato = false where id = p_id;
  elsif p_azione = 'azzera' then
    delete from contest_voti where contest_id = p_id and fase = 'live';
    update contest set live_stato = 'chiuso', live_inizio = null, live_fine = null, vincitore_rivelato = false where id = p_id;
    update contest_segreti set live_codice = null where contest_id = p_id;
  else
    raise exception 'azione_non_valida';
  end if;
  select live_codice into v_codice from contest_segreti where contest_id = p_id;
  return jsonb_build_object('codice', v_codice);
end; $$;
grant execute on function docente_live_contest(uuid, text, int, text) to anon;

create or replace function docente_codice_live(p_id uuid, p_passcode text) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not e_docente(p_passcode) then raise exception 'passcode_errato'; end if;
  return (select live_codice from contest_segreti where contest_id = p_id);
end; $$;
grant execute on function docente_codice_live(uuid, text) to anon;

-- Il docente vede anche le bozze e le proposte nascoste.
create or replace function docente_lista_contest(p_passcode text) returns setof contest
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not e_docente(p_passcode) then raise exception 'passcode_errato'; end if;
  return query select * from contest order by creato_il desc;
end; $$;
grant execute on function docente_lista_contest(text) to anon;

create or replace function docente_lista_proposte(p_contest_id uuid, p_passcode text) returns setof contest_proposte
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not e_docente(p_passcode) then raise exception 'passcode_errato'; end if;
  return query select * from contest_proposte where contest_id = p_contest_id order by creato_il;
end; $$;
grant execute on function docente_lista_proposte(uuid, text) to anon;

create or replace function docente_salva_proposta(
  p_contest_id uuid, p_id bigint, p_autori text, p_titolo text, p_sintesi text,
  p_problema text, p_proposta text, p_perche text, p_immagine text, p_galleria text[], p_passcode text
) returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare v_id bigint;
begin
  if not e_docente(p_passcode) then raise exception 'passcode_errato'; end if;
  if p_titolo is null or length(trim(p_titolo)) = 0 then raise exception 'titolo_mancante'; end if;
  if p_id is null then
    insert into contest_proposte (contest_id, autori, titolo, sintesi, problema, proposta, perche, immagine, galleria)
    values (p_contest_id, coalesce(p_autori, ''), trim(p_titolo), coalesce(p_sintesi, ''), coalesce(p_problema, ''),
            coalesce(p_proposta, ''), coalesce(p_perche, ''), coalesce(p_immagine, ''), coalesce(p_galleria, '{}'))
    returning id into v_id;
  else
    update contest_proposte set autori = coalesce(p_autori, ''), titolo = trim(p_titolo), sintesi = coalesce(p_sintesi, ''),
      problema = coalesce(p_problema, ''), proposta = coalesce(p_proposta, ''), perche = coalesce(p_perche, ''),
      immagine = coalesce(p_immagine, ''), galleria = coalesce(p_galleria, '{}'), aggiornato_il = now()
    where id = p_id and contest_id = p_contest_id returning id into v_id;
    if v_id is null then raise exception 'proposta_non_trovata'; end if;
  end if;
  return v_id;
end; $$;
grant execute on function docente_salva_proposta(uuid, bigint, text, text, text, text, text, text, text, text[], text) to anon;

create or replace function docente_nascondi_proposta(p_id bigint, p_nascosta boolean, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not e_docente(p_passcode) then raise exception 'passcode_errato'; end if;
  update contest_proposte set nascosta = coalesce(p_nascosta, false) where id = p_id;
end; $$;
grant execute on function docente_nascondi_proposta(bigint, boolean, text) to anon;

create or replace function docente_elimina_proposta(p_id bigint, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not e_docente(p_passcode) then raise exception 'passcode_errato'; end if;
  delete from contest_proposte where id = p_id;
end; $$;
grant execute on function docente_elimina_proposta(bigint, text) to anon;

create or replace function docente_azzera_voti_remoti(p_id uuid, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not e_docente(p_passcode) then raise exception 'passcode_errato'; end if;
  delete from contest_voti where contest_id = p_id and fase = 'remoto';
end; $$;
grant execute on function docente_azzera_voti_remoti(uuid, text) to anon;

-- --- Studenti: candidare una proposta ---
create or replace function partecipante_salva_proposta(
  p_token text, p_contest_id uuid, p_titolo text, p_sintesi text, p_problema text,
  p_proposta text, p_perche text, p_immagine text, p_galleria text[] default '{}'
) returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare
  v_pid uuid := partecipante_da_token(p_token);
  v_p partecipanti%rowtype;
  v_c contest%rowtype;
  v_id bigint;
  v_autori text;
begin
  if v_pid is null then raise exception 'sessione_scaduta'; end if;
  select * into v_p from partecipanti where id = v_pid;
  select * into v_c from contest where id = p_contest_id;
  if v_c.id is null then raise exception 'contest_non_trovato'; end if;
  if v_c.fase <> 'candidature' then raise exception 'candidature_chiuse'; end if;
  if v_c.iscrizione <> 'entrambe' and v_c.iscrizione <> v_p.tipo then raise exception 'tipo_non_ammesso'; end if;
  if p_titolo is null or length(trim(p_titolo)) = 0 then raise exception 'titolo_mancante'; end if;
  if length(coalesce(p_sintesi, '')) > 220 then raise exception 'sintesi_troppo_lunga'; end if;
  v_autori := v_p.nome || case when array_length(v_p.membri, 1) > 0 then ' — ' || array_to_string(v_p.membri, ', ') else '' end;
  insert into contest_proposte (contest_id, partecipante_id, autori, titolo, sintesi, problema, proposta, perche, immagine, galleria)
  values (p_contest_id, v_pid, v_autori, trim(p_titolo), coalesce(p_sintesi, ''), coalesce(p_problema, ''),
          coalesce(p_proposta, ''), coalesce(p_perche, ''), coalesce(p_immagine, ''), coalesce(p_galleria, '{}'))
  on conflict (contest_id, partecipante_id) where partecipante_id is not null do update set
    autori = excluded.autori, titolo = excluded.titolo, sintesi = excluded.sintesi, problema = excluded.problema,
    proposta = excluded.proposta, perche = excluded.perche, immagine = excluded.immagine,
    galleria = excluded.galleria, aggiornato_il = now()
  returning id into v_id;
  return v_id;
end; $$;
grant execute on function partecipante_salva_proposta(text, uuid, text, text, text, text, text, text, text[]) to anon;

create or replace function partecipante_ritira_proposta(p_token text, p_contest_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_pid uuid := partecipante_da_token(p_token);
begin
  if v_pid is null then raise exception 'sessione_scaduta'; end if;
  if not exists (select 1 from contest where id = p_contest_id and fase = 'candidature') then
    raise exception 'candidature_chiuse';
  end if;
  delete from contest_proposte where contest_id = p_contest_id and partecipante_id = v_pid;
end; $$;
grant execute on function partecipante_ritira_proposta(text, uuid) to anon;

-- --- Voto ---
create or replace function contest_impronta(p_contest_id uuid, p_chi text) returns text
language sql security definer set search_path = public, extensions as $$
  select encode(digest((select sale from contest_segreti where contest_id = p_contest_id) || ':' || p_chi, 'sha256'), 'hex');
$$;
revoke execute on function contest_impronta(uuid, text) from public, anon, authenticated;

create or replace function vota_remoto(
  p_token text, p_proposta_id bigint, p_dispositivo text default 'altro', p_zona text default ''
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_pid uuid := partecipante_da_token(p_token);
  v_pr contest_proposte%rowtype;
  v_c contest%rowtype;
begin
  if v_pid is null then raise exception 'sessione_scaduta'; end if;
  select * into v_pr from contest_proposte where id = p_proposta_id and not nascosta;
  if v_pr.id is null then raise exception 'proposta_non_trovata'; end if;
  select * into v_c from contest where id = v_pr.contest_id;
  if v_c.fase <> 'voto' or now() < coalesce(v_c.voto_inizio, now()) or now() > v_c.voto_fine then
    raise exception 'votazione_non_attiva';
  end if;
  if v_pr.partecipante_id = v_pid then raise exception 'propria_proposta'; end if;
  insert into contest_segreti (contest_id) values (v_c.id) on conflict do nothing;
  insert into contest_voti (contest_id, proposta_id, fase, votante_hash, dispositivo, zona)
  values (v_c.id, p_proposta_id, 'remoto', contest_impronta(v_c.id, 'p:' || v_pid::text),
          contest_pulisci_dispositivo(p_dispositivo), contest_pulisci_zona(p_zona))
  on conflict (contest_id, fase, votante_hash) do update set
    proposta_id = excluded.proposta_id, dispositivo = excluded.dispositivo, zona = excluded.zona, aggiornato_il = now();
end; $$;
grant execute on function vota_remoto(text, bigint, text, text) to anon;

create or replace function mio_voto_remoto(p_token text, p_contest_id uuid) returns bigint
language sql security definer set search_path = public, extensions as $$
  select proposta_id from contest_voti
  where contest_id = p_contest_id and fase = 'remoto'
    and partecipante_da_token(p_token) is not null
    and votante_hash = contest_impronta(p_contest_id, 'p:' || partecipante_da_token(p_token)::text);
$$;
grant execute on function mio_voto_remoto(text, uuid) to anon;

-- Voto dal pubblico: nessun login, un voto per dispositivo (id casuale
-- generato dal browser), con il codice a 4 cifre proiettato in aula.
create or replace function vota_live(
  p_contest_id uuid, p_proposta_id bigint, p_dispositivo_id text, p_codice text,
  p_dispositivo text default 'altro', p_zona text default ''
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_c contest%rowtype;
begin
  select * into v_c from contest where id = p_contest_id;
  if v_c.id is null or v_c.live_stato <> 'aperto' or (v_c.live_fine is not null and now() > v_c.live_fine) then
    raise exception 'votazione_non_attiva';
  end if;
  if coalesce(p_codice, '') <> coalesce((select live_codice from contest_segreti where contest_id = p_contest_id), '#') then
    raise exception 'codice_errato';
  end if;
  if p_dispositivo_id is null or length(p_dispositivo_id) < 16 then raise exception 'dispositivo_non_valido'; end if;
  if not exists (select 1 from contest_proposte where id = p_proposta_id and contest_id = p_contest_id and not nascosta) then
    raise exception 'proposta_non_trovata';
  end if;
  insert into contest_voti (contest_id, proposta_id, fase, votante_hash, dispositivo, zona)
  values (p_contest_id, p_proposta_id, 'live', contest_impronta(p_contest_id, 'd:' || p_dispositivo_id),
          contest_pulisci_dispositivo(p_dispositivo), contest_pulisci_zona(p_zona))
  on conflict (contest_id, fase, votante_hash) do update set
    proposta_id = excluded.proposta_id, dispositivo = excluded.dispositivo, aggiornato_il = now();
end; $$;
grant execute on function vota_live(uuid, bigint, text, text, text, text) to anon;

create or replace function verifica_codice_live(p_contest_id uuid, p_codice text) returns boolean
language sql security definer set search_path = public, extensions as $$
  select coalesce(p_codice, '') = coalesce((select live_codice from contest_segreti where contest_id = p_contest_id), '#');
$$;
grant execute on function verifica_codice_live(uuid, text) to anon;

create or replace function mio_voto_live(p_contest_id uuid, p_dispositivo_id text) returns bigint
language sql security definer set search_path = public, extensions as $$
  select proposta_id from contest_voti
  where contest_id = p_contest_id and fase = 'live'
    and votante_hash = contest_impronta(p_contest_id, 'd:' || coalesce(p_dispositivo_id, ''));
$$;
grant execute on function mio_voto_live(uuid, text) to anon;

-- --- Statistiche aggregate (l'unica finestra sui voti) ---
-- I conteggi per proposta compaiono solo se: docente, oppure classifica
-- resa visibile, oppure votazione remota scaduta/chiusa, oppure vincitore
-- rivelato. Così nessuno può sbirciare la classifica dalle API.
create or replace function contest_statistiche(p_contest_id uuid, p_passcode text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_c contest%rowtype;
  v_docente boolean := p_passcode is not null and e_docente(p_passcode);
  v_remoto_finito boolean;
  v_classifica boolean;
  v jsonb;
begin
  select * into v_c from contest where id = p_contest_id;
  if v_c.id is null or (v_c.fase = 'bozza' and not v_docente) then raise exception 'contest_non_trovato'; end if;
  v_remoto_finito := v_c.fase = 'chiuso' or (v_c.fase = 'voto' and v_c.voto_fine is not null and now() > v_c.voto_fine);
  v_classifica := v_docente or v_c.mostra_classifica or v_remoto_finito or v_c.vincitore_rivelato;

  select jsonb_build_object(
    'ora', now(),
    'fase', v_c.fase,
    'voto_inizio', v_c.voto_inizio,
    'voto_fine', v_c.voto_fine,
    'live_stato', v_c.live_stato,
    'live_inizio', v_c.live_inizio,
    'live_fine', v_c.live_fine,
    'vincitore_rivelato', v_c.vincitore_rivelato,
    'classifica_visibile', v_classifica,
    'remoto_finito', v_remoto_finito,
    'iscritti', (select count(*) from partecipanti),
    'proposte', (select count(*) from contest_proposte where contest_id = p_contest_id and not nascosta),
    'totale', jsonb_build_object(
      'remoto', (select count(*) from contest_voti where contest_id = p_contest_id and fase = 'remoto'),
      'live', (select count(*) from contest_voti where contest_id = p_contest_id and fase = 'live')
    ),
    'dispositivi', coalesce((select jsonb_object_agg(dispositivo, n) from (
      select dispositivo, count(*) n from contest_voti where contest_id = p_contest_id group by dispositivo) d), '{}'),
    'zone', coalesce((select jsonb_agg(jsonb_build_object('zona', zona, 'n', n) order by n desc, zona) from (
      select coalesce(nullif(zona, ''), 'Sconosciuta') zona, count(*) n from contest_voti
      where contest_id = p_contest_id group by 1 order by 2 desc limit 8) z), '[]'),
    -- Andamento: voti per minuto negli ultimi 60 minuti di attività.
    'andamento', coalesce((select jsonb_agg(jsonb_build_object('t', t, 'remoto', r, 'live', l) order by t) from (
      select date_trunc('minute', creato_il) t,
             count(*) filter (where fase = 'remoto') r, count(*) filter (where fase = 'live') l
      from contest_voti where contest_id = p_contest_id
        and creato_il > (select max(creato_il) from contest_voti where contest_id = p_contest_id) - interval '60 minutes'
      group by 1) a), '[]'),
    -- Ultimi voti, senza proposta e senza votante: solo quando, da dove, come.
    'ultimi', coalesce((select jsonb_agg(jsonb_build_object('id', id, 't', aggiornato_il, 'fase', fase,
                'dispositivo', dispositivo, 'zona', zona) order by aggiornato_il desc) from (
      select id, aggiornato_il, fase, dispositivo, zona from contest_voti where contest_id = p_contest_id
      order by aggiornato_il desc limit 12) u), '[]'),
    'per_proposta', case when v_classifica then coalesce((select jsonb_agg(jsonb_build_object(
          'id', p.id, 'remoto', coalesce(r.n, 0), 'live', coalesce(l.n, 0)) order by p.id)
        from contest_proposte p
        left join (select proposta_id, count(*) n from contest_voti where contest_id = p_contest_id and fase = 'remoto' group by 1) r on r.proposta_id = p.id
        left join (select proposta_id, count(*) n from contest_voti where contest_id = p_contest_id and fase = 'live' group by 1) l on l.proposta_id = p.id
        where p.contest_id = p_contest_id and not p.nascosta), '[]') else null end
  ) into v;
  return v;
end; $$;
grant execute on function contest_statistiche(uuid, text) to anon;

-- Realtime: contest e proposte cambiano raramente e non contengono
-- segreti; i voti NON sono pubblicati (si leggono via statistiche).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'contest') then
      alter publication supabase_realtime add table contest;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'contest_proposte') then
      alter publication supabase_realtime add table contest_proposte;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'attivita_stato') then
      alter publication supabase_realtime add table attivita_stato;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
