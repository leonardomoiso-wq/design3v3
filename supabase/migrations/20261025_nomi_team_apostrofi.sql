-- =============================================================
-- Nomi dei team: apostrofi e virgolette tipografiche.
-- Un team creato da telefono come «Crazy 20’s» (apostrofo curvo) non
-- si trovava scrivendo «Crazy 20's» (apostrofo dritto), e viceversa.
-- Ora i nomi si confrontano con una chiave che ignora maiuscole,
-- spazi doppi e il tipo di apostrofo o virgolette.
-- Vale per l'accesso al corso (login, recupero password, creazione) e
-- per i team delle attività (Crazy 8). Idempotente: si può rieseguire.
-- =============================================================

create or replace function chiave_nome_team(p text)
returns text
language sql immutable
as $$
  select lower(regexp_replace(trim(translate(coalesce(p, ''), '’‘ʼ`´′“”„', $q$''''''"""$q$)), '\s+', ' ', 'g'));
$$;
grant execute on function chiave_nome_team(text) to anon;

-- Non si riscrivono le funzioni: si prende la versione già presente nel
-- database (qualunque sia) e si cambia solo il confronto del nome. Così
-- tipo di ritorno e il resto del codice restano quelli che ci sono.
do $$
declare
  r record;
  d text;
  n text;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname in ('login_team', 'recupera_domanda_team', 'reimposta_password_team', 'crea_team',
                        'accedi_team_attivita', 'crea_team_attivita')
  loop
    d := pg_get_functiondef(r.oid);
    n := regexp_replace(d,
      $re$lower\((t\.)?nome\) = lower\((regexp_replace\()?trim\(p_nome\)(, '\\s\+', ' ', 'g'\))?\)$re$,
      'chiave_nome_team(\1nome) = chiave_nome_team(p_nome)', 'g');
    if n <> d then
      execute n;
      raise notice 'aggiornata: %', r.proname;
    else
      raise notice 'già a posto o senza confronto sul nome: %', r.proname;
    end if;
  end loop;
end $$;

-- Verifica: elenca le funzioni dei team e se usano la nuova chiave
select p.proname as funzione, pg_get_functiondef(p.oid) like '%chiave_nome_team%' as usa_la_chiave
from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
where ns.nspname = 'public'
  and p.proname in ('login_team', 'recupera_domanda_team', 'reimposta_password_team', 'crea_team',
                    'accedi_team_attivita', 'crea_team_attivita')
order by 1;
