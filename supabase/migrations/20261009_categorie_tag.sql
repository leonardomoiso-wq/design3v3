-- =============================================================
-- Tag a "layer": i tag predefiniti del passo "Temi" possono essere
-- raggruppati in categorie (es. Natura dell'innovazione: Prodotto,
-- Servizio, Processo · Tipologia: Packaging, Prodotto edibile, Spazio ·
-- Ampiezza: Modulare, Architetturale, Incrementale, Dirompente).
--
-- Per ogni categoria il/la docente sceglie:
--   - selezione 'singola' (una sola voce) o 'multipla';
--   - se è obbligatoria (lo studente deve sceglierne almeno una).
-- I tag senza categoria (quelli già esistenti) restano validi e vengono
-- mostrati in un gruppo "Altri temi". Sul caso studio i tag scelti
-- restano salvati come elenco di testi (casi_studio.tags), quindi filtri
-- e ricerche esistenti continuano a funzionare.
--
-- Da eseguire nel SQL editor di Supabase DOPO 20261008, insieme al
-- deploy del codice aggiornato. Idempotente.
-- =============================================================

create table if not exists categorie_tag (
  id uuid primary key default gen_random_uuid(),
  corso_id uuid not null references corsi(id) on delete cascade,
  nome text not null,
  ordine int not null default 0,
  selezione text not null default 'multipla' check (selezione in ('singola', 'multipla')),
  obbligatoria boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists categorie_tag_corso_idx on categorie_tag (corso_id);

alter table categorie_tag enable row level security;
drop policy if exists "categorie_tag_select_pubblico" on categorie_tag;
create policy "categorie_tag_select_pubblico" on categorie_tag for select using (true);
grant select on categorie_tag to anon, authenticated;

alter table tag_default_caso_studio
  add column if not exists categoria_id uuid references categorie_tag(id) on delete cascade;

-- === Funzioni docente: categorie ===

create or replace function docente_crea_categoria_tag(
  p_corso_id uuid, p_nome text, p_selezione text, p_obbligatoria boolean, p_passcode text
)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
  v_ordine int;
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  if p_nome is null or length(trim(p_nome)) = 0 then raise exception 'nome_mancante'; end if;
  if p_selezione not in ('singola', 'multipla') then raise exception 'selezione_non_valida'; end if;
  select coalesce(max(ordine), -1) + 1 into v_ordine from categorie_tag where corso_id = p_corso_id;
  insert into categorie_tag (corso_id, nome, ordine, selezione, obbligatoria)
  values (p_corso_id, trim(p_nome), v_ordine, p_selezione, coalesce(p_obbligatoria, false))
  returning id into v_id;
  return v_id;
end; $$;

create or replace function docente_aggiorna_categoria_tag(
  p_id uuid, p_nome text, p_selezione text, p_obbligatoria boolean, p_passcode text
)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from categorie_tag where id = p_id), p_passcode);
  if p_nome is null or length(trim(p_nome)) = 0 then raise exception 'nome_mancante'; end if;
  if p_selezione not in ('singola', 'multipla') then raise exception 'selezione_non_valida'; end if;
  update categorie_tag set nome = trim(p_nome), selezione = p_selezione, obbligatoria = coalesce(p_obbligatoria, false)
  where id = p_id;
end; $$;

-- Sposta una categoria di una posizione (p_direzione: -1 su, +1 giù).
create or replace function docente_sposta_categoria_tag(p_id uuid, p_direzione int, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_corso uuid;
  v_ordine int;
  v_altra record;
begin
  select corso_id, ordine into v_corso, v_ordine from categorie_tag where id = p_id;
  perform richiedi_docente(v_corso, p_passcode);
  if p_direzione < 0 then
    select id, ordine into v_altra from categorie_tag where corso_id = v_corso and ordine < v_ordine order by ordine desc limit 1;
  else
    select id, ordine into v_altra from categorie_tag where corso_id = v_corso and ordine > v_ordine order by ordine asc limit 1;
  end if;
  if v_altra.id is null then return; end if;
  update categorie_tag set ordine = v_altra.ordine where id = p_id;
  update categorie_tag set ordine = v_ordine where id = v_altra.id;
end; $$;

-- Elimina la categoria e i suoi tag predefiniti (i casi studio che li
-- usavano li mantengono: sono salvati come testo).
create or replace function docente_elimina_categoria_tag(p_id uuid, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from categorie_tag where id = p_id), p_passcode);
  delete from categorie_tag where id = p_id;
end; $$;

-- Aggiunta di un tag, ora con categoria facoltativa.
drop function if exists docente_aggiungi_tag_default(uuid, text, text);

create or replace function docente_aggiungi_tag_default(p_corso_id uuid, p_testo text, p_passcode text, p_categoria_id uuid default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ordine int;
  v_id uuid;
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  if p_testo is null or length(trim(p_testo)) = 0 then raise exception 'tag_vuoto'; end if;
  if p_categoria_id is not null and not exists (select 1 from categorie_tag where id = p_categoria_id and corso_id = p_corso_id) then
    raise exception 'categoria_non_trovata';
  end if;
  select coalesce(max(ordine), -1) + 1 into v_ordine from tag_default_caso_studio
  where corso_id = p_corso_id and categoria_id is not distinct from p_categoria_id;
  insert into tag_default_caso_studio (corso_id, categoria_id, testo, ordine)
  values (p_corso_id, p_categoria_id, trim(p_testo), v_ordine)
  returning id into v_id;
  return v_id;
end; $$;

-- Copia anche le categorie quando un nuovo corso parte da uno esistente.
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
  v_cat record;
  v_nuova_cat uuid;
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
    -- Categorie (layer) di tag con i loro tag, poi i tag senza categoria.
    for v_cat in select * from categorie_tag where corso_id = p_copia_da order by ordine loop
      insert into categorie_tag (corso_id, nome, ordine, selezione, obbligatoria)
      values (v_id, v_cat.nome, v_cat.ordine, v_cat.selezione, v_cat.obbligatoria)
      returning categorie_tag.id into v_nuova_cat;
      insert into tag_default_caso_studio (corso_id, categoria_id, testo, ordine)
        select v_id, v_nuova_cat, testo, ordine from tag_default_caso_studio where categoria_id = v_cat.id;
    end loop;
    insert into tag_default_caso_studio (corso_id, testo, ordine)
      select v_id, testo, ordine from tag_default_caso_studio where corso_id = p_copia_da and categoria_id is null;
    insert into prompt_suggeriti_crazy8 (corso_id, etichetta, testo_prompt, ordine)
      select v_id, etichetta, testo_prompt, ordine from prompt_suggeriti_crazy8 where corso_id = p_copia_da;
    insert into ruoli_prompt (corso_id, nome, descrizione, tipo_creatore, stato, visibilita)
      select v_id, nome, descrizione, tipo_creatore, stato, visibilita from ruoli_prompt
      where corso_id = p_copia_da and tipo_creatore in ('docente', 'admin');
  end if;

  return v_id;
end;
$$;

grant execute on function docente_crea_categoria_tag(uuid, text, text, boolean, text) to anon;
grant execute on function docente_aggiorna_categoria_tag(uuid, text, text, boolean, text) to anon;
grant execute on function docente_sposta_categoria_tag(uuid, int, text) to anon;
grant execute on function docente_elimina_categoria_tag(uuid, text) to anon;
grant execute on function docente_aggiungi_tag_default(uuid, text, text, uuid) to anon;
grant execute on function docente_crea_corso(text, text, text, text, text, uuid) to anon;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'categorie_tag') then
    alter publication supabase_realtime add table categorie_tag;
  end if;
end $$;

notify pgrst, 'reload schema';
