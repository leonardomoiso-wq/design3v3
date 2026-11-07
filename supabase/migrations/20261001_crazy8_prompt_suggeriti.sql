-- =============================================================
-- Prompt suggeriti per Crazy 8: una libreria di "direzioni di
-- prompt" (es. "ambientazione", "gamme cromatiche", "close up",
-- "raggi X dei componenti interni") che il/la docente cura dal
-- pannello di Crazy 8 e che gli studenti vedono come ispirazione
-- mentre scrivono il prompt di un nuovo round, in BloccoNuovaGenerazione.
-- =============================================================

create table if not exists prompt_suggeriti_crazy8 (
  id uuid primary key default gen_random_uuid(),
  etichetta text not null,
  testo_prompt text not null,
  ordine int not null default 0,
  created_at timestamptz not null default now()
);

alter table prompt_suggeriti_crazy8 enable row level security;

drop policy if exists "prompt_suggeriti_crazy8_select_pubblico" on prompt_suggeriti_crazy8;
create policy "prompt_suggeriti_crazy8_select_pubblico" on prompt_suggeriti_crazy8 for select using (true);

create or replace function docente_aggiungi_prompt_suggerito(p_etichetta text, p_testo_prompt text, p_passcode text)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_ordine int;
  v_id uuid;
begin
  if not exists (select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash) then
    raise exception 'passcode_errato';
  end if;
  if p_etichetta is null or length(trim(p_etichetta)) = 0 then
    raise exception 'etichetta_mancante';
  end if;
  if p_testo_prompt is null or length(trim(p_testo_prompt)) = 0 then
    raise exception 'prompt_mancante';
  end if;

  select coalesce(max(ordine), -1) + 1 into v_ordine from prompt_suggeriti_crazy8;

  insert into prompt_suggeriti_crazy8 (etichetta, testo_prompt, ordine)
  values (trim(p_etichetta), trim(p_testo_prompt), v_ordine)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function docente_aggiorna_prompt_suggerito(p_id uuid, p_etichetta text, p_testo_prompt text, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash) then
    raise exception 'passcode_errato';
  end if;
  if p_etichetta is null or length(trim(p_etichetta)) = 0 then
    raise exception 'etichetta_mancante';
  end if;
  if p_testo_prompt is null or length(trim(p_testo_prompt)) = 0 then
    raise exception 'prompt_mancante';
  end if;

  update prompt_suggeriti_crazy8 set etichetta = trim(p_etichetta), testo_prompt = trim(p_testo_prompt) where id = p_id;
end;
$$;

create or replace function docente_elimina_prompt_suggerito(p_id uuid, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash) then
    raise exception 'passcode_errato';
  end if;
  delete from prompt_suggeriti_crazy8 where id = p_id;
end;
$$;

grant execute on function docente_aggiungi_prompt_suggerito to anon;
grant execute on function docente_aggiorna_prompt_suggerito to anon;
grant execute on function docente_elimina_prompt_suggerito to anon;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'prompt_suggeriti_crazy8'
  ) then
    alter publication supabase_realtime add table prompt_suggeriti_crazy8;
  end if;
end $$;
