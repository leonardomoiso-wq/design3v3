-- Permette di verificare il codice di un gruppo PRIMA di entrare nel
-- flusso di modifica, invece di scoprirlo sbagliato solo al salvataggio
-- finale (esperienza confusa: si arrivava in fondo al wizard per poi
-- sentirsi dire "codice errato" e perdere il lavoro fatto).
--
-- Sola lettura: non modifica nulla, restituisce solo true/false.
--
-- Da eseguire nel SQL editor di Supabase dopo tutte le migrazioni
-- precedenti.

create or replace function verifica_codice_caso_studio(
  p_id bigint,
  p_codice text
) returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select codice_hash into v_hash from casi_studio where id = p_id;

  if v_hash is null then
    return false;
  end if;

  return crypt(p_codice, v_hash) = v_hash;
end;
$$;

grant execute on function verifica_codice_caso_studio to anon;
