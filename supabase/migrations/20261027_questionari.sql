-- =============================================================
-- Questionari anonimi di fine percorso.
-- Ogni corso compone i suoi questionari scegliendo le domande (non
-- tutte le classi fanno tutte le attività). Si compilano da un link
-- diretto (/questionario?q=<id>) senza accedere al corso, in forma
-- anonima: si salvano solo le risposte, senza nome, team o dati del
-- dispositivo. Solo tabelle e funzioni nuove: rieseguibile.
-- =============================================================

create table if not exists questionari (
  id uuid primary key default gen_random_uuid(),
  corso_id uuid not null references corsi(id) on delete cascade,
  titolo text not null,
  intro text,
  domande text[] not null default '{}',
  aperto boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists questionari_corso on questionari(corso_id);
alter table questionari enable row level security;

create table if not exists risposte_questionario (
  id uuid primary key default gen_random_uuid(),
  questionario_id uuid not null references questionari(id) on delete cascade,
  risposte jsonb not null default '{}'::jsonb,
  -- serve solo a chi ha compilato, per correggere le proprie risposte
  -- dallo stesso dispositivo; non identifica nessuno
  token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists risposte_questionario_q on risposte_questionario(questionario_id);
alter table risposte_questionario enable row level security;
-- nessuna policy: si legge e si scrive solo con le funzioni qui sotto

-- Pagina pubblica: cosa mostrare
create or replace function info_questionario(p_id uuid)
returns table(id uuid, titolo text, intro text, domande text[], aperto boolean, corso_nome text)
language sql security definer set search_path = public, extensions
as $$
  select q.id, q.titolo, q.intro, q.domande, q.aperto, c.nome
  from questionari q join corsi c on c.id = q.corso_id
  where q.id = p_id;
$$;
grant execute on function info_questionario(uuid) to anon;

-- Invio (o correzione, con id e token dello stesso dispositivo)
create or replace function invia_questionario(p_id uuid, p_risposte jsonb, p_token text, p_risposta_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_aperto boolean;
  v_hash text;
  v_id uuid;
begin
  select aperto into v_aperto from questionari where id = p_id;
  if v_aperto is null then raise exception 'questionario_non_trovato'; end if;
  if not v_aperto then raise exception 'questionario_chiuso'; end if;
  if p_risposte is null or jsonb_typeof(p_risposte) <> 'object' or length(p_risposte::text) > 40000 then raise exception 'risposte_non_valide'; end if;
  if p_token is null or length(p_token) < 16 then raise exception 'token_non_valido'; end if;

  if p_risposta_id is not null then
    select token_hash into v_hash from risposte_questionario where id = p_risposta_id and questionario_id = p_id;
    if v_hash is not null and crypt(p_token, v_hash) = v_hash then
      update risposte_questionario set risposte = p_risposte, updated_at = now() where id = p_risposta_id;
      return p_risposta_id;
    end if;
  end if;

  insert into risposte_questionario (questionario_id, risposte, token_hash)
  values (p_id, p_risposte, crypt(p_token, gen_salt('bf')))
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function invia_questionario(uuid, jsonb, text, uuid) to anon;

-- Docente: elenco dei questionari del corso, con il numero di risposte
create or replace function docente_questionari(p_corso_id uuid, p_passcode text)
returns table(id uuid, titolo text, intro text, domande text[], aperto boolean, created_at timestamptz, risposte bigint)
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  return query
  select q.id, q.titolo, q.intro, q.domande, q.aperto, q.created_at,
         (select count(*) from risposte_questionario r where r.questionario_id = q.id)
  from questionari q where q.corso_id = p_corso_id
  order by q.created_at;
end;
$$;
grant execute on function docente_questionari(uuid, text) to anon;

-- Docente: crea (p_id nullo) o modifica un questionario
create or replace function docente_salva_questionario(p_corso_id uuid, p_passcode text, p_id uuid, p_titolo text, p_intro text, p_domande text[], p_aperto boolean)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  if p_titolo is null or length(trim(p_titolo)) < 2 then raise exception 'titolo_mancante'; end if;
  if p_id is null then
    insert into questionari (corso_id, titolo, intro, domande, aperto)
    values (p_corso_id, trim(p_titolo), nullif(trim(coalesce(p_intro, '')), ''), coalesce(p_domande, '{}'), coalesce(p_aperto, false))
    returning id into v_id;
  else
    update questionari set titolo = trim(p_titolo), intro = nullif(trim(coalesce(p_intro, '')), ''),
      domande = coalesce(p_domande, domande), aperto = coalesce(p_aperto, aperto)
    where id = p_id and corso_id = p_corso_id
    returning id into v_id;
    if v_id is null then raise exception 'questionario_non_trovato'; end if;
  end if;
  return v_id;
end;
$$;
grant execute on function docente_salva_questionario(uuid, text, uuid, text, text, text[], boolean) to anon;

create or replace function docente_elimina_questionario(p_corso_id uuid, p_passcode text, p_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  delete from questionari where id = p_id and corso_id = p_corso_id;
end;
$$;
grant execute on function docente_elimina_questionario(uuid, text, uuid) to anon;

-- Docente: le risposte (anonime) di un questionario
create or replace function docente_risposte_questionario(p_corso_id uuid, p_passcode text, p_id uuid)
returns table(id uuid, risposte jsonb, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  return query
  select r.id, r.risposte, r.created_at, r.updated_at
  from risposte_questionario r join questionari q on q.id = r.questionario_id
  where r.questionario_id = p_id and q.corso_id = p_corso_id
  order by r.created_at;
end;
$$;
grant execute on function docente_risposte_questionario(uuid, text, uuid) to anon;

-- /questionario è una pagina della piattaforma: nessun ateneo può usarne il nome
create or replace function codice_ateneo_riservato(p text) returns boolean
language sql immutable as $$
  select lower(coalesce(p, '')) in ('student', 'teacher', 'crazy8', 'hmw', 'contest', 'manuali', 'api', '_next', 'favicon.ico', 'corsi', 'atenei', 'questionario');
$$;
