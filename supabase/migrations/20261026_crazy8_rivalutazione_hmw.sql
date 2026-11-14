-- =============================================================
-- Crazy 8: il team può chiedere una nuova lettura di una domanda HMW.
-- hmw_revisione[i] diventa 'richiesta' e la domanda compare sul wall
-- nel filtro «Da rivalutare». Il docente poi la segna ✓ o da ritoccare
-- (docente_revisione_hmw_crazy8, che sovrascrive lo stato).
-- Solo funzioni nuove o ridefinite con la stessa firma: rieseguibile.
-- =============================================================

create or replace function richiedi_rivalutazione_hmw_crazy8(p_id uuid, p_codice text, p_indice int)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
  v_rev jsonb;
begin
  select codice_hash, hmw_revisione into v_hash, v_rev from submission_crazy8 where id = p_id;
  if v_hash is null then raise exception 'submission_non_trovata'; end if;
  if crypt(p_codice, v_hash) <> v_hash then raise exception 'codice_errato'; end if;
  if p_indice is null or p_indice < 0 or p_indice > 3 then raise exception 'indice_non_valido'; end if;
  if v_rev is null or jsonb_typeof(v_rev) <> 'array' then v_rev := '[]'::jsonb; end if;
  while jsonb_array_length(v_rev) <= p_indice loop v_rev := v_rev || 'null'::jsonb; end loop;
  v_rev := jsonb_set(v_rev, array[p_indice::text], '"richiesta"'::jsonb);
  update submission_crazy8 set hmw_revisione = v_rev, hmw_inviate = true where id = p_id;
end;
$$;
grant execute on function richiedi_rivalutazione_hmw_crazy8(uuid, text, int) to anon;

create or replace function crazy8_controlla_database()
returns table(problema text)
language plpgsql security definer set search_path = public, extensions
as $$
begin
  return query
  select 'manca la colonna ' || t || '.' || c
  from (values
    ('submission_crazy8', 'fase_raggiunta'), ('submission_crazy8', 'team_attivita_id'), ('submission_crazy8', 'contesti'),
    ('submission_crazy8', 'hmw'), ('submission_crazy8', 'hmw_revisione'), ('submission_crazy8', 'sketch_sbloccato'),
    ('immagini', 'selezionato'), ('immagini', 'interpretazione'), ('immagini', 'domanda'),
    ('generazioni_crazy8', 'motore'), ('generazioni_crazy8', 'driver'), ('attivita', 'config')
  ) as atteso(t, c)
  where not exists (
    select 1 from information_schema.columns ic
    where ic.table_schema = 'public' and ic.table_name = atteso.t and ic.column_name = atteso.c
  );

  return query
  select 'manca la funzione ' || f
  from unnest(array['aggiorna_campi_submission_crazy8', 'aggiorna_sketch_crazy8', 'aggiorna_generazione_crazy8', 'aggiungi_generazione_crazy8',
                    'crea_team_attivita', 'crea_submission_crazy8_team', 'docente_revisione_hmw_crazy8', 'docente_sblocca_sketch_crazy8',
                    'vota_hmw_crazy8', 'cambia_password_team_attivita', 'docente_reimposta_password_team_attivita', 'crazy8_apri_fase_sketch', 'richiedi_rivalutazione_hmw_crazy8']) as f
  where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f);

  return query
  select 'aggiorna_campi_submission_crazy8 è in una versione vecchia'::text
  where exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'aggiorna_campi_submission_crazy8'
      and pg_get_functiondef(p.oid) not like '%hmw_per_team%'
  );
end;
$$;
grant execute on function crazy8_controlla_database() to anon;
