-- =============================================================
-- Testi di storytelling e introduzione alla piattaforma (schermata
-- di atterraggio e home): erano hardcoded nel codice. Li spostiamo
-- in una tabella chiave/valore che il/la docente può curare da un
-- pannello, senza toccare nulla finché non viene modificata.
-- =============================================================

create table if not exists contenuto_piattaforma (
  chiave text primary key,
  valore text not null,
  aggiornato_il timestamptz not null default now()
);

alter table contenuto_piattaforma enable row level security;

drop policy if exists "contenuto_piattaforma_select_pubblico" on contenuto_piattaforma;
create policy "contenuto_piattaforma_select_pubblico" on contenuto_piattaforma for select using (true);

create or replace function docente_aggiorna_testo_piattaforma(p_chiave text, p_valore text, p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash) then
    raise exception 'passcode_errato';
  end if;
  if p_chiave is null or length(trim(p_chiave)) = 0 then
    raise exception 'chiave_vuota';
  end if;

  insert into contenuto_piattaforma (chiave, valore, aggiornato_il)
  values (trim(p_chiave), coalesce(p_valore, ''), now())
  on conflict (chiave) do update set valore = excluded.valore, aggiornato_il = now();
end;
$$;

grant execute on function docente_aggiorna_testo_piattaforma to anon;
