-- =============================================================
-- Attività 2 — Crazy 8 + co-creazione generativa (sketch → image-to-image).
-- Segue lo stesso modello di identità già usato per casi_studio: nessun
-- account, un gruppo si identifica con gruppo_num/gruppo_nome e protegge
-- la propria consegna con un codice scelto da loro (hashato, mai leggibile).
-- La revisione (fase attuale) è solo del/della docente, non tra pari: i
-- commenti studente↔studente restano per la fase 4 (peer review).
-- =============================================================

create table if not exists submission_crazy8 (
  id uuid primary key default gen_random_uuid(),
  attivita_id uuid references attivita(id),
  gruppo_nome text not null,
  gruppo_num int not null,
  hmw_o_tema text,
  motore_usato text,       -- campo libero, non validato (es. "Midjourney", "SD img2img")
  note_prompt text,        -- log prompt: obbligatorietà letta da attivita.richiedi_log_prompt
  riflessione text,        -- riflessione post-consegna: obbligatorietà da attivita.richiedi_riflessione
  stato text not null default 'in_corso'
    check (stato in ('in_corso', 'consegnato', 'revisionato')),
  codice_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists immagini (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submission_crazy8(id) on delete cascade,
  tipo text not null check (tipo in ('sketch_originale', 'generata')),
  ordine int not null default 0,
  url_file text not null, -- data URL base64, stesso pattern di casi_studio.immagine
  created_at timestamptz not null default now()
);

create table if not exists commenti (
  id uuid primary key default gen_random_uuid(),
  immagine_id uuid not null references immagini(id) on delete cascade,
  ruolo_autore text not null default 'docente' check (ruolo_autore in ('docente', 'studente')),
  testo text not null,
  created_at timestamptz not null default now()
);

alter table submission_crazy8 enable row level security;
alter table immagini enable row level security;
alter table commenti enable row level security;

drop policy if exists "submission_crazy8_select_pubblico" on submission_crazy8;
create policy "submission_crazy8_select_pubblico" on submission_crazy8 for select using (true);

drop policy if exists "immagini_select_pubblico" on immagini;
create policy "immagini_select_pubblico" on immagini for select using (true);

drop policy if exists "commenti_select_pubblico" on commenti;
create policy "commenti_select_pubblico" on commenti for select using (true);

-- === Funzioni studente (protette da codice di gruppo, mai da passcode docente) ===

create or replace function crea_submission_crazy8(
  p_attivita_id uuid,
  p_gruppo_nome text,
  p_gruppo_num int,
  p_hmw_o_tema text,
  p_motore_usato text,
  p_note_prompt text,
  p_riflessione text,
  p_stato text,
  p_immagini jsonb, -- array di {"tipo": "sketch_originale"|"generata", "ordine": int, "url_file": text}
  p_codice text
)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_immagine jsonb;
begin
  if p_codice is null or length(trim(p_codice)) < 4 then
    raise exception 'codice_troppo_corto';
  end if;
  if p_stato not in ('in_corso', 'consegnato') then
    p_stato := 'in_corso';
  end if;

  insert into submission_crazy8 (
    attivita_id, gruppo_nome, gruppo_num, hmw_o_tema, motore_usato,
    note_prompt, riflessione, stato, codice_hash
  ) values (
    p_attivita_id, p_gruppo_nome, p_gruppo_num, p_hmw_o_tema, p_motore_usato,
    p_note_prompt, p_riflessione, p_stato, crypt(p_codice, gen_salt('bf'))
  )
  returning id into v_id;

  for v_immagine in select * from jsonb_array_elements(coalesce(p_immagini, '[]'::jsonb))
  loop
    insert into immagini (submission_id, tipo, ordine, url_file)
    values (
      v_id,
      v_immagine ->> 'tipo',
      coalesce((v_immagine ->> 'ordine')::int, 0),
      v_immagine ->> 'url_file'
    );
  end loop;

  return v_id;
end;
$$;

create or replace function aggiorna_submission_crazy8(
  p_id uuid,
  p_codice text,
  p_gruppo_nome text,
  p_gruppo_num int,
  p_hmw_o_tema text,
  p_motore_usato text,
  p_note_prompt text,
  p_riflessione text,
  p_stato text,
  p_immagini jsonb
)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
  v_immagine jsonb;
begin
  select codice_hash into v_hash from submission_crazy8 where id = p_id;
  if v_hash is null then raise exception 'submission_non_trovata'; end if;
  if crypt(p_codice, v_hash) <> v_hash then raise exception 'codice_errato'; end if;
  if p_stato not in ('in_corso', 'consegnato', 'revisionato') then
    raise exception 'stato_non_valido';
  end if;

  update submission_crazy8 set
    gruppo_nome = p_gruppo_nome,
    gruppo_num = p_gruppo_num,
    hmw_o_tema = p_hmw_o_tema,
    motore_usato = p_motore_usato,
    note_prompt = p_note_prompt,
    riflessione = p_riflessione,
    stato = p_stato
  where id = p_id;

  delete from immagini where submission_id = p_id;
  for v_immagine in select * from jsonb_array_elements(coalesce(p_immagini, '[]'::jsonb))
  loop
    insert into immagini (submission_id, tipo, ordine, url_file)
    values (
      p_id,
      v_immagine ->> 'tipo',
      coalesce((v_immagine ->> 'ordine')::int, 0),
      v_immagine ->> 'url_file'
    );
  end loop;
end;
$$;

create or replace function verifica_codice_submission_crazy8(p_id uuid, p_codice text)
returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select codice_hash into v_hash from submission_crazy8 where id = p_id;
  if v_hash is null then return false; end if;
  return crypt(p_codice, v_hash) = v_hash;
end;
$$;

create or replace function elimina_submission_crazy8(p_id uuid, p_codice text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select codice_hash into v_hash from submission_crazy8 where id = p_id;
  if v_hash is null then raise exception 'submission_non_trovata'; end if;
  if crypt(p_codice, v_hash) <> v_hash then raise exception 'codice_errato'; end if;

  delete from submission_crazy8 where id = p_id;
end;
$$;

-- === Funzioni docente (protette da passcode, stesso pattern del resto del pannello) ===

create or replace function docente_aggiungi_commento(p_immagine_id uuid, p_testo text, p_passcode text)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash) then
    raise exception 'passcode_errato';
  end if;
  if p_testo is null or length(trim(p_testo)) = 0 then
    raise exception 'commento_vuoto';
  end if;

  insert into commenti (immagine_id, ruolo_autore, testo)
  values (p_immagine_id, 'docente', trim(p_testo))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function docente_elimina_commento(p_commento_id uuid, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash) then
    raise exception 'passcode_errato';
  end if;
  delete from commenti where id = p_commento_id;
end;
$$;

create or replace function docente_imposta_stato_submission_crazy8(p_id uuid, p_stato text, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash) then
    raise exception 'passcode_errato';
  end if;
  if p_stato not in ('in_corso', 'consegnato', 'revisionato') then
    raise exception 'stato_non_valido';
  end if;
  update submission_crazy8 set stato = p_stato where id = p_id;
end;
$$;

grant execute on function crea_submission_crazy8 to anon;
grant execute on function aggiorna_submission_crazy8 to anon;
grant execute on function verifica_codice_submission_crazy8 to anon;
grant execute on function elimina_submission_crazy8 to anon;
grant execute on function docente_aggiungi_commento to anon;
grant execute on function docente_elimina_commento to anon;
grant execute on function docente_imposta_stato_submission_crazy8 to anon;

-- === Realtime ===

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'submission_crazy8'
  ) then
    alter publication supabase_realtime add table submission_crazy8;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'immagini'
  ) then
    alter publication supabase_realtime add table immagini;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'commenti'
  ) then
    alter publication supabase_realtime add table commenti;
  end if;
end $$;

-- === Attiva il modulo nel pannello attività (se non già presente) ===

insert into attivita (titolo, descrizione, tipo, ordine, stato, richiedi_log_prompt, richiedi_riflessione)
select
  'Crazy 8 + Co-creazione Generativa',
  'Sketch rapidi evoluti con AI image-to-image: caricamento sketch + generate, galleria di revisione e commenti per immagine.',
  'crazy8_ai',
  1,
  'bozza',
  true,
  true
where not exists (select 1 from attivita where tipo = 'crazy8_ai');
