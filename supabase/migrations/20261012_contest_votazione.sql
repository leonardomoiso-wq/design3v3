-- =============================================================
-- Nuova attività "Contest" (tipo contest_voto) e iscrizione individuale.
--
-- 1. Iscrizione individuale: un team può essere di tipo 'gruppo' (come
--    finora) o 'individuale' (una persona sola). Login, recupero
--    password e pannello Team restano gli stessi: per alcune attività,
--    come il contest, l'impegno è individuale.
-- 2. Contest: proposte di progetto caricate dai docenti e votate in forma
--    anonima, da remoto (team/individui iscritti al corso, con scadenza e
--    countdown) e dal vivo (pubblico in aula, senza iscrizione, con un
--    codice proiettato). Le proposte le caricano i docenti oppure, se il
--    contest lo prevede (proposte_da = 'studenti'), anche i team e gli
--    individui durante l'anteprima. "iscrizione" dice chi può candidare e
--    votare da remoto: solo individui, solo gruppi o entrambi.
--    Ogni contest appartiene a un corso; il docente lo gestisce con la
--    password del corso. L'attività compare nel pannello Attività come le
--    altre (bozza / in arrivo / attiva / archiviata).
--
-- Anonimato: la tabella dei voti non è leggibile dal client. Ogni voto
-- conserva solo un'impronta (hash con un sale segreto per contest) di chi
-- ha votato: serve a impedire il doppio voto, non a risalire al team. I
-- dati visibili sono solo aggregati e passano da contest_statistiche.
--
-- Da eseguire nel SQL editor di Supabase DOPO tutte le migrazioni
-- precedenti (compresa 20261011), PRIMA di pubblicare il codice
-- aggiornato. Idempotente: si può rieseguire senza danni.
-- =============================================================

-- =============================================================
-- 1. Team individuali
-- =============================================================

alter table team add column if not exists tipo text not null default 'gruppo';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'team_tipo_valido') then
    alter table team add constraint team_tipo_valido check (tipo in ('gruppo', 'individuale'));
  end if;
end $$;

-- Cambiano i tipi restituiti: le vecchie versioni vanno ritirate.
drop function if exists crea_team(uuid, text, text, text, text, text[]);
drop function if exists login_team(uuid, text, text);
drop function if exists docente_lista_team(uuid, text);

create or replace function crea_team(
  p_corso_id uuid,
  p_nome text,
  p_password text,
  p_domanda_segreta text,
  p_risposta_segreta text,
  p_membri text[] default '{}',
  p_tipo text default 'gruppo'
)
returns table(id uuid, numero int, nome text, membri text[], tipo text)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_numero int;
  v_id uuid;
  v_membri text[];
  v_tipo text := coalesce(p_tipo, 'gruppo');
begin
  if not exists (select 1 from corsi c where c.id = p_corso_id and not c.archiviato) then
    raise exception 'corso_non_trovato';
  end if;
  if v_tipo not in ('gruppo', 'individuale') then raise exception 'tipo_non_valido'; end if;
  if p_nome is null or length(trim(p_nome)) < 2 then raise exception 'nome_troppo_corto'; end if;
  if p_password is null or length(trim(p_password)) < 4 then raise exception 'password_troppo_corta'; end if;
  if p_domanda_segreta is null or length(trim(p_domanda_segreta)) = 0 then raise exception 'domanda_mancante'; end if;
  if p_risposta_segreta is null or length(trim(p_risposta_segreta)) = 0 then raise exception 'risposta_mancante'; end if;
  if exists (select 1 from team t where t.corso_id = p_corso_id and lower(t.nome) = lower(trim(p_nome))) then
    raise exception 'nome_gia_usato';
  end if;

  select coalesce(max(t.numero), 0) + 1 into v_numero from team t where t.corso_id = p_corso_id;
  if v_tipo = 'individuale' then
    -- Una persona sola: il "membro" è lei stessa.
    v_membri := array[trim(p_nome)];
  else
    select coalesce(array_agg(nullif(trim(m), '')) filter (where nullif(trim(m), '') is not null), '{}')
      into v_membri
      from unnest(coalesce(p_membri, '{}')) as m;
  end if;

  insert into team (corso_id, numero, nome, password_hash, domanda_segreta, risposta_hash, membri, tipo)
  values (
    p_corso_id, v_numero, trim(p_nome),
    crypt(p_password, gen_salt('bf')),
    trim(p_domanda_segreta),
    crypt(lower(trim(p_risposta_segreta)), gen_salt('bf')),
    v_membri, v_tipo
  )
  returning team.id into v_id;

  return query select v_id, v_numero, trim(p_nome), v_membri, v_tipo;
end;
$$;

create or replace function login_team(p_corso_id uuid, p_nome text, p_password text)
returns table(id uuid, numero int, nome text, membri text[], tipo text)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
  v_id uuid;
  v_numero int;
  v_nome text;
  v_membri text[];
  v_tipo text;
begin
  select t.id, t.numero, t.nome, t.password_hash, t.membri, t.tipo into v_id, v_numero, v_nome, v_hash, v_membri, v_tipo
  from team t where t.corso_id = p_corso_id and lower(t.nome) = lower(trim(p_nome));
  if v_hash is null or crypt(p_password, v_hash) <> v_hash then
    raise exception 'credenziali_errate';
  end if;
  return query select v_id, v_numero, v_nome, v_membri, v_tipo;
end;
$$;

create or replace function docente_lista_team(p_corso_id uuid, p_passcode text)
returns table(numero int, nome text, membri text[], creato_il timestamptz, tipo text)
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  return query select t.numero, t.nome, t.membri, t.created_at, t.tipo from team t where t.corso_id = p_corso_id order by t.numero asc;
end; $$;

grant execute on function crea_team(uuid, text, text, text, text, text[], text) to anon;
grant execute on function login_team(uuid, text, text) to anon;
grant execute on function docente_lista_team(uuid, text) to anon;

-- Verifica team + password (stessa identità usata da aggiorna_membri_team).
create or replace function team_verificato(p_team_id uuid, p_password text)
returns team
language plpgsql security definer set search_path = public, extensions
as $$
declare v team%rowtype;
begin
  select * into v from team where id = p_team_id;
  if v.id is null or crypt(coalesce(p_password, ''), v.password_hash) <> v.password_hash then
    raise exception 'credenziali_errate';
  end if;
  return v;
end;
$$;
revoke execute on function team_verificato(uuid, text) from public, anon, authenticated;

-- =============================================================
-- 2. Attività: il contest nasce in bozza in ogni corso
-- =============================================================

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
    ('HMW + Role-Prompting', 'Stress test multi-ruolo degli How Might We: libreria di ruoli proposti dagli studenti, evoluzione da v1 a v2 con changelog visibile.', 'hmw_role_prompting', 2, 'bozza', true, true),
    ('Contest · Il progetto migliore', 'Le proposte in gara e il voto anonimo: da remoto con countdown e dal vivo con il pubblico in aula, fino al vincitore svelato sullo schermo.', 'contest_voto', 3, 'bozza', false, false)
  ) as v(titolo, descrizione, tipo, ordine, stato, log, rifl)
  where not exists (select 1 from attivita a where a.corso_id = p_corso_id and a.tipo = v.tipo);
end;
$$;
revoke execute on function semina_attivita_corso(uuid) from public, anon, authenticated;

insert into attivita (corso_id, titolo, descrizione, tipo, ordine, stato, richiedi_log_prompt, richiedi_riflessione)
select c.id, 'Contest · Il progetto migliore',
  'Le proposte in gara e il voto anonimo: da remoto con countdown e dal vivo con il pubblico in aula, fino al vincitore svelato sullo schermo.',
  'contest_voto', coalesce((select max(a.ordine) + 1 from attivita a where a.corso_id = c.id), 0), 'bozza', false, false
from corsi c
where not exists (select 1 from attivita a where a.corso_id = c.id and a.tipo = 'contest_voto');

-- Vero se l'attività contest del corso è attiva (voto da remoto).
create or replace function contest_attivita_attiva(p_corso_id uuid)
returns boolean
language sql security definer set search_path = public, extensions as $$
  select exists (select 1 from attivita where corso_id = p_corso_id and tipo = 'contest_voto' and stato = 'attiva');
$$;
revoke execute on function contest_attivita_attiva(uuid) from public, anon, authenticated;

-- =============================================================
-- 3. Contest, proposte, voti
-- =============================================================

create table if not exists contest (
  id uuid primary key default gen_random_uuid(),
  corso_id uuid not null references corsi(id) on delete cascade,
  titolo text not null,
  sottotitolo text not null default '',
  descrizione text not null default '',
  iscrizione text not null default 'individuale',
  -- Chi carica le proposte: solo i docenti, oppure anche gli studenti
  -- (una proposta per team/individuo, durante la fase di anteprima).
  proposte_da text not null default 'docente',
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
create index if not exists contest_corso_idx on contest (corso_id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contest_iscrizione_valida') then
    alter table contest add constraint contest_iscrizione_valida check (iscrizione in ('individuale', 'gruppo', 'entrambe'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contest_fase_valida') then
    alter table contest add constraint contest_fase_valida check (fase in ('bozza', 'anteprima', 'voto', 'chiuso'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contest_proposte_da_valido') then
    alter table contest add constraint contest_proposte_da_valido check (proposte_da in ('docente', 'studenti'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contest_live_valido') then
    alter table contest add constraint contest_live_valido check (live_stato in ('chiuso', 'aperto', 'concluso'));
  end if;
end $$;
alter table contest enable row level security;
-- Le bozze restano private, salvo un voto dal vivo già aperto.
drop policy if exists "contest_select_pubblico" on contest;
create policy "contest_select_pubblico" on contest for select using (fase <> 'bozza' or live_stato <> 'chiuso');
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
  team_id uuid references team(id) on delete set null,
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
create unique index if not exists contest_proposte_una_per_team
  on contest_proposte (contest_id, team_id) where team_id is not null;
alter table contest_proposte enable row level security;
drop policy if exists "contest_proposte_select_pubblico" on contest_proposte;
create policy "contest_proposte_select_pubblico" on contest_proposte for select
  using (not nascosta and exists (select 1 from contest c where c.id = contest_id and (c.fase <> 'bozza' or c.live_stato <> 'chiuso')));
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

create or replace function contest_pulisci_dispositivo(p text) returns text
language sql immutable as $$
  select case when p in ('smartphone', 'tablet', 'computer') then p else 'altro' end;
$$;
create or replace function contest_pulisci_zona(p text) returns text
language sql immutable as $$
  select left(regexp_replace(trim(coalesce(p, '')), '[^[:alnum:] _''./-]', '', 'g'), 40);
$$;

create or replace function contest_impronta(p_contest_id uuid, p_chi text) returns text
language sql security definer set search_path = public, extensions as $$
  select encode(digest((select sale from contest_segreti where contest_id = p_contest_id) || ':' || p_chi, 'sha256'), 'hex');
$$;
revoke execute on function contest_impronta(uuid, text) from public, anon, authenticated;

-- --- Docente ---

create or replace function docente_lista_contest(p_corso_id uuid, p_passcode text) returns setof contest
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  return query select * from contest where corso_id = p_corso_id order by creato_il desc;
end; $$;

create or replace function docente_salva_contest(
  p_corso_id uuid, p_id uuid, p_titolo text, p_sottotitolo text, p_descrizione text,
  p_iscrizione text, p_mostra_classifica boolean, p_passcode text, p_proposte_da text default 'docente'
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  if p_titolo is null or length(trim(p_titolo)) = 0 then raise exception 'titolo_mancante'; end if;
  if p_iscrizione not in ('individuale', 'gruppo', 'entrambe') then raise exception 'iscrizione_non_valida'; end if;
  if coalesce(p_proposte_da, 'docente') not in ('docente', 'studenti') then raise exception 'proposte_da_non_valido'; end if;
  if p_id is null then
    insert into contest (corso_id, titolo, sottotitolo, descrizione, iscrizione, mostra_classifica, proposte_da)
    values (p_corso_id, trim(p_titolo), coalesce(p_sottotitolo, ''), coalesce(p_descrizione, ''), p_iscrizione,
            coalesce(p_mostra_classifica, false), coalesce(p_proposte_da, 'docente'))
    returning id into v_id;
    insert into contest_segreti (contest_id) values (v_id) on conflict do nothing;
  else
    update contest set titolo = trim(p_titolo), sottotitolo = coalesce(p_sottotitolo, ''),
      descrizione = coalesce(p_descrizione, ''), iscrizione = p_iscrizione,
      mostra_classifica = coalesce(p_mostra_classifica, false), proposte_da = coalesce(p_proposte_da, 'docente')
    where id = p_id and corso_id = p_corso_id returning id into v_id;
    if v_id is null then raise exception 'contest_non_trovato'; end if;
  end if;
  return v_id;
end; $$;

create or replace function docente_imposta_fase_contest(p_id uuid, p_fase text, p_voto_fine timestamptz, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from contest where id = p_id), p_passcode);
  if p_fase not in ('bozza', 'anteprima', 'voto', 'chiuso') then raise exception 'fase_non_valida'; end if;
  if p_fase = 'voto' and (p_voto_fine is null or p_voto_fine <= now()) then raise exception 'scadenza_non_valida'; end if;
  update contest set
    fase = p_fase,
    voto_inizio = case when p_fase = 'voto' then coalesce(case when voto_fine > now() then voto_inizio end, now()) else voto_inizio end,
    voto_fine = case when p_fase = 'voto' then p_voto_fine
                     when p_fase = 'chiuso' and voto_fine > now() then now()
                     else voto_fine end
  where id = p_id;
end; $$;

create or replace function docente_elimina_contest(p_id uuid, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from contest where id = p_id), p_passcode);
  delete from contest where id = p_id;
end; $$;

-- p_azione: apri (nuovo codice, durata facoltativa) | chiudi | rivela | copri | azzera
create or replace function docente_live_contest(p_id uuid, p_azione text, p_durata_sec int, p_passcode text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_codice text;
  v_corso uuid := (select corso_id from contest where id = p_id);
begin
  perform richiedi_docente(v_corso, p_passcode);
  insert into contest_segreti (contest_id) values (p_id) on conflict do nothing;
  if p_azione = 'apri' then
    -- Un voto dal vivo aperto alla volta per corso.
    update contest set live_stato = 'concluso', live_fine = least(coalesce(live_fine, now()), now())
      where corso_id = v_corso and live_stato = 'aperto' and id <> p_id;
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

create or replace function docente_codice_live(p_id uuid, p_passcode text) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from contest where id = p_id), p_passcode);
  return (select live_codice from contest_segreti where contest_id = p_id);
end; $$;

create or replace function docente_lista_proposte(p_contest_id uuid, p_passcode text) returns setof contest_proposte
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from contest where id = p_contest_id), p_passcode);
  return query select * from contest_proposte where contest_id = p_contest_id order by creato_il;
end; $$;

create or replace function docente_salva_proposta(
  p_contest_id uuid, p_id bigint, p_autori text, p_titolo text, p_sintesi text,
  p_problema text, p_proposta text, p_perche text, p_immagine text, p_galleria text[], p_passcode text
) returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare v_id bigint;
begin
  perform richiedi_docente((select corso_id from contest where id = p_contest_id), p_passcode);
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

create or replace function docente_nascondi_proposta(p_id bigint, p_nascosta boolean, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select c.corso_id from contest_proposte p join contest c on c.id = p.contest_id where p.id = p_id), p_passcode);
  update contest_proposte set nascosta = coalesce(p_nascosta, false) where id = p_id;
end; $$;

create or replace function docente_elimina_proposta(p_id bigint, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select c.corso_id from contest_proposte p join contest c on c.id = p.contest_id where p.id = p_id), p_passcode);
  delete from contest_proposte where id = p_id;
end; $$;

create or replace function docente_azzera_voti_remoti(p_id uuid, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from contest where id = p_id), p_passcode);
  delete from contest_voti where contest_id = p_id and fase = 'remoto';
end; $$;

-- --- Studenti (team o individui): candidare la propria proposta ---
-- Solo nei contest con proposte_da = 'studenti', durante l'anteprima.

create or replace function team_salva_proposta(
  p_team_id uuid, p_password text, p_contest_id uuid, p_titolo text, p_sintesi text, p_problema text,
  p_proposta text, p_perche text, p_immagine text, p_galleria text[] default '{}'
) returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare
  v_t team%rowtype := team_verificato(p_team_id, p_password);
  v_c contest%rowtype;
  v_id bigint;
  v_autori text;
begin
  select * into v_c from contest where id = p_contest_id;
  if v_c.id is null or v_c.corso_id <> v_t.corso_id then raise exception 'contest_non_trovato'; end if;
  if not contest_attivita_attiva(v_c.corso_id) then raise exception 'attivita_non_attiva'; end if;
  if v_c.proposte_da <> 'studenti' or v_c.fase <> 'anteprima' then raise exception 'candidature_chiuse'; end if;
  if v_c.iscrizione <> 'entrambe' and v_c.iscrizione <> v_t.tipo then raise exception 'tipo_non_ammesso'; end if;
  if p_titolo is null or length(trim(p_titolo)) = 0 then raise exception 'titolo_mancante'; end if;
  if length(coalesce(p_sintesi, '')) > 220 then raise exception 'sintesi_troppo_lunga'; end if;
  v_autori := v_t.nome || case when v_t.tipo = 'gruppo' and coalesce(array_length(v_t.membri, 1), 0) > 0
                               then ' — ' || array_to_string(v_t.membri, ', ') else '' end;
  insert into contest_proposte (contest_id, team_id, autori, titolo, sintesi, problema, proposta, perche, immagine, galleria)
  values (p_contest_id, v_t.id, v_autori, trim(p_titolo), coalesce(p_sintesi, ''), coalesce(p_problema, ''),
          coalesce(p_proposta, ''), coalesce(p_perche, ''), coalesce(p_immagine, ''), coalesce(p_galleria, '{}'))
  on conflict (contest_id, team_id) where team_id is not null do update set
    autori = excluded.autori, titolo = excluded.titolo, sintesi = excluded.sintesi, problema = excluded.problema,
    proposta = excluded.proposta, perche = excluded.perche, immagine = excluded.immagine,
    galleria = excluded.galleria, aggiornato_il = now()
  returning id into v_id;
  return v_id;
end; $$;

create or replace function team_ritira_proposta(p_team_id uuid, p_password text, p_contest_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_t team%rowtype := team_verificato(p_team_id, p_password);
begin
  if not exists (select 1 from contest where id = p_contest_id and corso_id = v_t.corso_id
                 and proposte_da = 'studenti' and fase = 'anteprima') then
    raise exception 'candidature_chiuse';
  end if;
  delete from contest_proposte where contest_id = p_contest_id and team_id = v_t.id;
end; $$;

-- --- Voto da remoto: un voto per team (o individuo) iscritto al corso ---

create or replace function vota_remoto(
  p_team_id uuid, p_password text, p_proposta_id bigint, p_dispositivo text default 'altro', p_zona text default ''
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_t team%rowtype := team_verificato(p_team_id, p_password);
  v_pr contest_proposte%rowtype;
  v_c contest%rowtype;
begin
  select * into v_pr from contest_proposte where id = p_proposta_id and not nascosta;
  if v_pr.id is null then raise exception 'proposta_non_trovata'; end if;
  select * into v_c from contest where id = v_pr.contest_id;
  if v_c.corso_id <> v_t.corso_id then raise exception 'proposta_non_trovata'; end if;
  if not contest_attivita_attiva(v_c.corso_id) then raise exception 'attivita_non_attiva'; end if;
  if v_c.fase <> 'voto' or now() < coalesce(v_c.voto_inizio, now()) or now() > v_c.voto_fine then
    raise exception 'votazione_non_attiva';
  end if;
  if v_c.iscrizione <> 'entrambe' and v_c.iscrizione <> v_t.tipo then raise exception 'tipo_non_ammesso'; end if;
  if v_pr.team_id = v_t.id then raise exception 'propria_proposta'; end if;
  insert into contest_segreti (contest_id) values (v_c.id) on conflict do nothing;
  insert into contest_voti (contest_id, proposta_id, fase, votante_hash, dispositivo, zona)
  values (v_c.id, p_proposta_id, 'remoto', contest_impronta(v_c.id, 't:' || v_t.id::text),
          contest_pulisci_dispositivo(p_dispositivo), contest_pulisci_zona(p_zona))
  on conflict (contest_id, fase, votante_hash) do update set
    proposta_id = excluded.proposta_id, dispositivo = excluded.dispositivo, zona = excluded.zona, aggiornato_il = now();
end; $$;

create or replace function mio_voto_remoto(p_team_id uuid, p_password text, p_contest_id uuid) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare v_t team%rowtype := team_verificato(p_team_id, p_password);
begin
  return (select proposta_id from contest_voti
          where contest_id = p_contest_id and fase = 'remoto'
            and votante_hash = contest_impronta(p_contest_id, 't:' || v_t.id::text));
end; $$;

-- --- Voto dal vivo: nessun login, un voto per dispositivo, codice proiettato ---

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

-- Il pubblico scrive solo il codice: si trova il voto dal vivo aperto con
-- quel codice (in qualsiasi corso), senza dover scegliere il corso.
create or replace function trova_voto_live(p_codice text) returns uuid
language sql security definer set search_path = public, extensions as $$
  select c.id from contest c join contest_segreti s on s.contest_id = c.id
  where c.live_stato = 'aperto' and (c.live_fine is null or c.live_fine > now())
    and s.live_codice = coalesce(p_codice, '#')
  order by c.live_inizio desc nulls last limit 1;
$$;

create or replace function verifica_codice_live(p_contest_id uuid, p_codice text) returns boolean
language sql security definer set search_path = public, extensions as $$
  select coalesce(p_codice, '') = coalesce((select live_codice from contest_segreti where contest_id = p_contest_id), '#');
$$;

create or replace function mio_voto_live(p_contest_id uuid, p_dispositivo_id text) returns bigint
language sql security definer set search_path = public, extensions as $$
  select proposta_id from contest_voti
  where contest_id = p_contest_id and fase = 'live'
    and votante_hash = contest_impronta(p_contest_id, 'd:' || coalesce(p_dispositivo_id, ''));
$$;

-- --- Statistiche aggregate (l'unica finestra sui voti) ---
-- I conteggi per proposta compaiono solo se: docente del corso, oppure
-- classifica resa visibile, oppure votazione remota scaduta/chiusa, oppure
-- vincitore svelato. Così nessuno può sbirciare la classifica dalle API.
create or replace function contest_statistiche(p_contest_id uuid, p_passcode text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_c contest%rowtype;
  v_docente boolean;
  v_remoto_finito boolean;
  v_classifica boolean;
  v jsonb;
begin
  select * into v_c from contest where id = p_contest_id;
  v_docente := p_passcode is not null and docente_autorizzato(v_c.corso_id, p_passcode);
  if v_c.id is null or (v_c.fase = 'bozza' and v_c.live_stato = 'chiuso' and not v_docente) then
    raise exception 'contest_non_trovato';
  end if;
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
    'iscritti', (select count(*) from team where corso_id = v_c.corso_id),
    'proposte', (select count(*) from contest_proposte where contest_id = p_contest_id and not nascosta),
    'totale', jsonb_build_object(
      'remoto', (select count(*) from contest_voti where contest_id = p_contest_id and fase = 'remoto'),
      'live', (select count(*) from contest_voti where contest_id = p_contest_id and fase = 'live')
    ),
    'dispositivi', coalesce((select jsonb_object_agg(dispositivo, n) from (
      select dispositivo, count(*) n from contest_voti where contest_id = p_contest_id group by dispositivo) d), '{}'),
    'zone', coalesce((select jsonb_agg(jsonb_build_object('zona', zona, 'n', n) order by n desc, zona) from (
      select coalesce(nullif(zona, ''), 'Non indicata') zona, count(*) n from contest_voti
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

-- =============================================================
-- Permessi
-- =============================================================

grant execute on function docente_lista_contest(uuid, text) to anon;
grant execute on function docente_salva_contest(uuid, uuid, text, text, text, text, boolean, text, text) to anon;
grant execute on function docente_imposta_fase_contest(uuid, text, timestamptz, text) to anon;
grant execute on function docente_elimina_contest(uuid, text) to anon;
grant execute on function docente_live_contest(uuid, text, int, text) to anon;
grant execute on function docente_codice_live(uuid, text) to anon;
grant execute on function docente_lista_proposte(uuid, text) to anon;
grant execute on function docente_salva_proposta(uuid, bigint, text, text, text, text, text, text, text, text[], text) to anon;
grant execute on function docente_nascondi_proposta(bigint, boolean, text) to anon;
grant execute on function docente_elimina_proposta(bigint, text) to anon;
grant execute on function docente_azzera_voti_remoti(uuid, text) to anon;
grant execute on function team_salva_proposta(uuid, text, uuid, text, text, text, text, text, text, text[]) to anon;
grant execute on function team_ritira_proposta(uuid, text, uuid) to anon;
grant execute on function vota_remoto(uuid, text, bigint, text, text) to anon;
grant execute on function mio_voto_remoto(uuid, text, uuid) to anon;
grant execute on function vota_live(uuid, bigint, text, text, text, text) to anon;
grant execute on function trova_voto_live(text) to anon;
grant execute on function verifica_codice_live(uuid, text) to anon;
grant execute on function mio_voto_live(uuid, text) to anon;
grant execute on function contest_statistiche(uuid, text) to anon;

-- =============================================================
-- Realtime: contest e proposte (filtrati per corso / contest). I voti NON
-- sono pubblicati: si leggono via contest_statistiche.
-- =============================================================

alter table contest replica identity full;
alter table contest_proposte replica identity full;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'contest') then
      alter publication supabase_realtime add table contest;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'contest_proposte') then
      alter publication supabase_realtime add table contest_proposte;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
