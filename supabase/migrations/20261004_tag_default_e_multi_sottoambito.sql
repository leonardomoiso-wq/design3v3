-- =============================================================
-- Tag di default per i Design Case Studies: erano un array
-- hardcoded nel codice (duplicato tra /student e /teacher). Li
-- spostiamo in una tabella che il/la docente può curare da un
-- pannello, seminata con la stessa lista già in uso così che nulla
-- cambi finché il/la docente non la modifica.
-- =============================================================

create table if not exists tag_default_caso_studio (
  id uuid primary key default gen_random_uuid(),
  testo text not null,
  ordine int not null default 0,
  created_at timestamptz not null default now()
);

alter table tag_default_caso_studio enable row level security;

drop policy if exists "tag_default_caso_studio_select_pubblico" on tag_default_caso_studio;
create policy "tag_default_caso_studio_select_pubblico" on tag_default_caso_studio for select using (true);

insert into tag_default_caso_studio (testo, ordine)
select testo, ordine from (values
  ('Eco-feedback interfaces', 0),
  ('Bio-digital architecture', 1),
  ('Non-human interaction design (NHID)', 2),
  ('Algorithmic conservation', 3),
  ('Multispecies product design', 4),
  ('Regenerative urban prototyping', 5),
  ('Foraged and bio-based materials', 6),
  ('More-than-human service design', 7),
  ('Speculative multispecies products', 8),
  ('Microbial design', 9)
) as seme(testo, ordine)
where not exists (select 1 from tag_default_caso_studio);

create or replace function docente_aggiungi_tag_default(p_testo text, p_passcode text)
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
  if p_testo is null or length(trim(p_testo)) = 0 then
    raise exception 'tag_vuoto';
  end if;

  select coalesce(max(ordine), -1) + 1 into v_ordine from tag_default_caso_studio;

  insert into tag_default_caso_studio (testo, ordine)
  values (trim(p_testo), v_ordine)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function docente_elimina_tag_default(p_id uuid, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash) then
    raise exception 'passcode_errato';
  end if;
  delete from tag_default_caso_studio where id = p_id;
end;
$$;

grant execute on function docente_aggiungi_tag_default to anon;
grant execute on function docente_elimina_tag_default to anon;
