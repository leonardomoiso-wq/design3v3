-- =============================================================
-- Rescala i 4 driver IDEO da 0-100 a 0-5 (scala più semplice e
-- intuitiva, sia in fase di caricamento che in aula durante la
-- peer review). Le coordinate x/y della matrice NON cambiano: sono
-- uno spazio schermo -100..100 indipendente dalla scala dei driver,
-- usato solo per posizionare le schede sulla matrice globale.
--
-- Idempotente: riproporziona solo se trova ancora valori sopra 5
-- (cioè sulla vecchia scala 0-100). Rieseguirlo dopo la prima
-- migrazione non ha alcun effetto.
-- =============================================================

do $$
declare
  necessita_migrazione boolean;
  riga record;
  chiavi text[] := array['desiderabilita', 'fattibilita', 'responsabilita', 'vitalita'];
  chiave text;
  vecchio jsonb;
  valore numeric;
  nota text;
  nuovo jsonb;
begin
  select exists (
    select 1
    from casi_studio,
         lateral unnest(chiavi) as k(chiave)
    where driver is not null
      and coalesce(
        (driver -> k.chiave ->> 'valore')::numeric,
        (driver ->> k.chiave)::numeric,
        0
      ) > 5
  ) into necessita_migrazione;

  if not necessita_migrazione then
    raise notice 'Nessun driver sopra 5 trovato: migrazione già applicata (o database vuoto). Nessuna modifica.';
    return;
  end if;

  for riga in select id, driver from casi_studio where driver is not null loop
    nuovo := '{}'::jsonb;
    foreach chiave in array chiavi loop
      vecchio := riga.driver -> chiave;
      if vecchio is null then
        valore := 50;
        nota := '';
      elsif jsonb_typeof(vecchio) = 'object' then
        valore := coalesce((vecchio ->> 'valore')::numeric, 50);
        nota := coalesce(vecchio ->> 'nota', '');
      else
        valore := coalesce((vecchio)::text::numeric, 50);
        nota := '';
      end if;

      nuovo := jsonb_set(
        nuovo,
        array[chiave],
        jsonb_build_object(
          'valore', greatest(0, least(5, round(valore * 5.0 / 100.0))),
          'nota', nota
        )
      );
    end loop;

    update casi_studio set driver = nuovo where id = riga.id;
  end loop;

  raise notice 'Migrazione driver 0-100 -> 0-5 completata.';
end $$;
