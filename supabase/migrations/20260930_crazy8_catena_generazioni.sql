-- =============================================================
-- Ripensamento di Attività 2 (Crazy 8): non è un confronto "uno sketch,
-- una generata", è una CATENA iterativa per ogni sketch selezionato:
-- prompt -> immagine generata -> cosa se ne deduce -> prompt successivo
-- (informato da quella deduzione) -> immagine successiva, e così via.
-- L'attività segue la presentazione in aula dei sotto-ambiti progettuali
-- scelti dagli studenti: "hmw_o_tema" diventa "sotto_ambito" per
-- rispecchiare questo.
--
-- Le consegne ora si costruiscono in modo incrementale nel tempo (crea
-- la scheda -> carica sketch -> aggiungi round di generazione via via
-- che arrivano dallo strumento esterno -> torna più tardi e aggiungine
-- altri), non più con un unico invio "tutto insieme". Per questo le
-- vecchie crea_submission_crazy8/aggiorna_submission_crazy8 (che
-- sostituivano TUTTE le immagini a ogni modifica) vengono sostituite:
-- ricreare le righe di immagini a ogni modifica avrebbe fatto scattare
-- l'on delete cascade e cancellato le catene di generazione già
-- costruite su quello sketch.
-- =============================================================

create table if not exists generazioni_crazy8 (
  id uuid primary key default gen_random_uuid(),
  sketch_immagine_id uuid not null references immagini(id) on delete cascade,
  ordine int not null,          -- numero del round nella catena di questo sketch (1, 2, 3...)
  prompt_usato text not null,   -- il prompt scritto per QUESTO round
  url_immagine text not null,   -- l'immagine generata in questo round (data URL, come le altre immagini)
  deduzione text,               -- cosa se ne deduce: informa il prompt del round successivo
  created_at timestamptz not null default now()
);

alter table generazioni_crazy8 enable row level security;

drop policy if exists "generazioni_crazy8_select_pubblico" on generazioni_crazy8;
create policy "generazioni_crazy8_select_pubblico" on generazioni_crazy8 for select using (true);

-- === Le vecchie funzioni "tutto in un colpo" vengono ritirate ===

drop function if exists crea_submission_crazy8(uuid, text, int, text, text, text, text, text, jsonb, text);
drop function if exists aggiorna_submission_crazy8(uuid, text, text, int, text, text, text, text, text, jsonb);

-- === Nuove funzioni, incrementali ===

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
begin
  if p_codice is null or length(trim(p_codice)) < 4 then
    raise exception 'codice_troppo_corto';
  end if;

  insert into submission_crazy8 (attivita_id, gruppo_nome, gruppo_num, hmw_o_tema, stato, codice_hash)
  values (p_attivita_id, p_gruppo_nome, p_gruppo_num, p_sotto_ambito, 'in_corso', crypt(p_codice, gen_salt('bf')))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function aggiorna_dettagli_submission_crazy8(
  p_id uuid,
  p_codice text,
  p_gruppo_nome text,
  p_gruppo_num int,
  p_sotto_ambito text,
  p_motore_usato text,
  p_note_prompt text,
  p_riflessione text,
  p_stato text
)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
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
    hmw_o_tema = p_sotto_ambito,
    motore_usato = p_motore_usato,
    note_prompt = p_note_prompt,
    riflessione = p_riflessione,
    stato = p_stato
  where id = p_id;
end;
$$;

create or replace function aggiungi_sketch_crazy8(p_submission_id uuid, p_codice text, p_url_file text)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
  v_ordine int;
  v_id uuid;
begin
  select codice_hash into v_hash from submission_crazy8 where id = p_submission_id;
  if v_hash is null then raise exception 'submission_non_trovata'; end if;
  if crypt(p_codice, v_hash) <> v_hash then raise exception 'codice_errato'; end if;

  select coalesce(max(ordine), -1) + 1 into v_ordine
  from immagini where submission_id = p_submission_id and tipo = 'sketch_originale';

  insert into immagini (submission_id, tipo, ordine, url_file)
  values (p_submission_id, 'sketch_originale', v_ordine, p_url_file)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function elimina_sketch_crazy8(p_immagine_id uuid, p_codice text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select sc.codice_hash into v_hash
  from immagini i join submission_crazy8 sc on sc.id = i.submission_id
  where i.id = p_immagine_id;

  if v_hash is null then raise exception 'sketch_non_trovato'; end if;
  if crypt(p_codice, v_hash) <> v_hash then raise exception 'codice_errato'; end if;

  delete from immagini where id = p_immagine_id;
end;
$$;

create or replace function aggiungi_generazione_crazy8(
  p_sketch_immagine_id uuid,
  p_codice text,
  p_prompt_usato text,
  p_url_immagine text,
  p_deduzione text
)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
  v_ordine int;
  v_id uuid;
begin
  select sc.codice_hash into v_hash
  from immagini i join submission_crazy8 sc on sc.id = i.submission_id
  where i.id = p_sketch_immagine_id;

  if v_hash is null then raise exception 'sketch_non_trovato'; end if;
  if crypt(p_codice, v_hash) <> v_hash then raise exception 'codice_errato'; end if;
  if p_prompt_usato is null or length(trim(p_prompt_usato)) = 0 then
    raise exception 'prompt_mancante';
  end if;

  select coalesce(max(ordine), 0) + 1 into v_ordine
  from generazioni_crazy8 where sketch_immagine_id = p_sketch_immagine_id;

  insert into generazioni_crazy8 (sketch_immagine_id, ordine, prompt_usato, url_immagine, deduzione)
  values (p_sketch_immagine_id, v_ordine, trim(p_prompt_usato), p_url_immagine, p_deduzione)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function elimina_generazione_crazy8(p_id uuid, p_codice text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select sc.codice_hash into v_hash
  from generazioni_crazy8 g
    join immagini i on i.id = g.sketch_immagine_id
    join submission_crazy8 sc on sc.id = i.submission_id
  where g.id = p_id;

  if v_hash is null then raise exception 'generazione_non_trovata'; end if;
  if crypt(p_codice, v_hash) <> v_hash then raise exception 'codice_errato'; end if;

  delete from generazioni_crazy8 where id = p_id;
end;
$$;

grant execute on function crea_submission_crazy8 to anon;
grant execute on function aggiorna_dettagli_submission_crazy8 to anon;
grant execute on function aggiungi_sketch_crazy8 to anon;
grant execute on function elimina_sketch_crazy8 to anon;
grant execute on function aggiungi_generazione_crazy8 to anon;
grant execute on function elimina_generazione_crazy8 to anon;

-- === Realtime ===

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'generazioni_crazy8'
  ) then
    alter publication supabase_realtime add table generazioni_crazy8;
  end if;
end $$;
