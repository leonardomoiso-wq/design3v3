-- =============================================================
-- Il progetto Supabase ha l'estensione pg-safeupdate attiva, che
-- blocca qualunque DELETE/UPDATE privo di clausola WHERE — anche
-- dentro una funzione SECURITY DEFINER — con l'errore "DELETE
-- requires a WHERE clause". Due funzioni di reset "cancella tutto"
-- usavano un DELETE senza WHERE e quindi fallivano sempre:
-- docente_elimina_tutti_team (pannello Team) e docente_resetta_tutto
-- (reset dei casi studio in dashboard). La correzione aggiunge un
-- "where true", che soddisfa il controllo sintattico senza cambiare
-- il comportamento (si cancella comunque tutto).
-- =============================================================

create or replace function docente_elimina_tutti_team(p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash) then
    raise exception 'passcode_errato';
  end if;

  delete from team where true;
end;
$$;

create or replace function docente_resetta_tutto(p_passcode text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1 from docente_config where crypt(p_passcode, passcode_hash) = passcode_hash
  ) then
    raise exception 'passcode_errato';
  end if;

  delete from casi_studio where true;
end;
$$;
