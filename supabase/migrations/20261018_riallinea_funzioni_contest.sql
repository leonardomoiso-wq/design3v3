-- =============================================================
-- Riallineamento delle funzioni del Contest.
--
-- Rieseguire una migrazione vecchia (es. 20261012 o 20261013) dopo
-- quelle nuove rimette versioni superate delle funzioni di voto: per
-- esempio chi si iscrive dalla pagina dell'ateneo riceve «Questa
-- proposta non è più disponibile». Questa migrazione toglie ogni
-- versione (anche quelle doppie, con meno parametri) e rimette l'ultima.
--
-- Si può eseguire in qualsiasi momento, anche più volte: dopo le
-- migrazioni del Contest (fino alla 20261017) e ogni volta che ne è
-- stata rieseguita una vecchia.
-- =============================================================

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as firma from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and p.proname in ('semina_attivita_corso', 'docente_salva_contest', 'contest_statistiche', 'contest_iscritti',
                               'team_salva_proposta', 'team_ritira_proposta', 'vota_remoto', 'vota_live', 'contest_di_ateneo')
  loop
    execute 'drop function ' || r.firma;
  end loop;
end $$;

-- semina_attivita_corso: versione di 20261013_contest_mappa.sql
create or replace function semina_attivita_corso(p_corso_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  insert into attivita (corso_id, titolo, descrizione, tipo, ordine, stato, richiedi_log_prompt, richiedi_riflessione)
  select p_corso_id, v.titolo, v.descrizione, v.tipo, v.ordine, v.stato, v.log, v.rifl
  from (values
    ('Design Case Studies', 'Sottomissione dei progetti, matrice a 4 driver, radar multicriterio e peer review con voto di gruppo in tempo reale.', 'design_case_studies', 0, 'attiva', false, false),
    ('Crazy 8 + Co-creazione Generativa', 'Sketch rapidi evoluti con AI image-to-image: caricamento sketch + generate, galleria di revisione e commenti per immagine.', 'crazy8_ai', 1, 'bozza', true, true),
    ('HMW + Role-Prompting', 'Stress test multi-ruolo degli How Might We: libreria di ruoli proposti dagli studenti, evoluzione da v1 a v2 con changelog visibile.', 'hmw_role_prompting', 2, 'bozza', true, true),
    ('Contest del progetto migliore', 'Le proposte in gara e il voto anonimo, da remoto e dal vivo in aula.', 'contest_voto', 3, 'bozza', false, false)
  ) as v(titolo, descrizione, tipo, ordine, stato, log, rifl)
  where not exists (select 1 from attivita a where a.corso_id = p_corso_id and a.tipo = v.tipo);
end;
$$;

-- docente_salva_contest: versione di 20261015_contest_ateneo.sql
create or replace function docente_salva_contest(
  p_corso_id uuid, p_id uuid, p_titolo text, p_sottotitolo text, p_descrizione text,
  p_iscrizione text, p_mostra_classifica boolean, p_passcode text, p_proposte_da text default 'docente',
  p_ambito text default null
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
  v_corso corsi%rowtype;
  v_ambito text;
begin
  perform richiedi_docente(p_corso_id, p_passcode);
  select * into v_corso from corsi where id = p_corso_id;
  if p_titolo is null or length(trim(p_titolo)) = 0 then raise exception 'titolo_mancante'; end if;
  if p_iscrizione not in ('individuale', 'gruppo', 'entrambe') then raise exception 'iscrizione_non_valida'; end if;
  if coalesce(p_proposte_da, 'docente') not in ('docente', 'studenti') then raise exception 'proposte_da_non_valido'; end if;
  if p_ambito is not null and p_ambito not in ('corso', 'ateneo') then raise exception 'ambito_non_valido'; end if;
  v_ambito := case when v_corso.spazio_ateneo then 'ateneo'
                   else coalesce(p_ambito, (select ambito from contest where id = p_id), 'corso') end;
  if v_ambito = 'ateneo' and v_corso.ateneo_id is null then raise exception 'corso_senza_ateneo'; end if;
  if p_id is null then
    insert into contest (corso_id, titolo, sottotitolo, descrizione, iscrizione, mostra_classifica, proposte_da, ambito)
    values (p_corso_id, trim(p_titolo), coalesce(p_sottotitolo, ''), coalesce(p_descrizione, ''), p_iscrizione,
            coalesce(p_mostra_classifica, false), coalesce(p_proposte_da, 'docente'), v_ambito)
    returning id into v_id;
    insert into contest_segreti (contest_id) values (v_id) on conflict do nothing;
  else
    update contest set titolo = trim(p_titolo), sottotitolo = coalesce(p_sottotitolo, ''),
      descrizione = coalesce(p_descrizione, ''), iscrizione = p_iscrizione,
      mostra_classifica = coalesce(p_mostra_classifica, false), proposte_da = coalesce(p_proposte_da, 'docente'),
      ambito = v_ambito
    where id = p_id and corso_id = p_corso_id returning id into v_id;
    if v_id is null then raise exception 'contest_non_trovato'; end if;
  end if;
  return v_id;
end; $$;

-- contest_statistiche: versione di 20261015_contest_ateneo.sql
create or replace function contest_statistiche(p_contest_id uuid, p_passcode text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_c contest%rowtype;
  v_docente boolean;
  v_remoto_finito boolean;
  v_classifica boolean;
  v jsonb;
begin
  select * into v_c from contest where id = p_contest_id;
  v_docente := p_passcode is not null and docente_autorizzato(v_c.corso_id, p_passcode);
  if v_c.id is null or (v_c.fase = 'bozza' and v_c.live_stato = 'chiuso' and not v_docente) then
    raise exception 'contest_non_trovato';
  end if;
  v_remoto_finito := v_c.fase = 'chiuso' or (v_c.fase = 'voto' and v_c.voto_fine is not null and now() > v_c.voto_fine);
  v_classifica := v_docente or v_c.mostra_classifica or v_remoto_finito or v_c.vincitore_rivelato;

  select jsonb_build_object(
    'ora', now(),
    'fase', v_c.fase,
    'voto_inizio', v_c.voto_inizio,
    'voto_fine', v_c.voto_fine,
    'live_stato', v_c.live_stato,
    'live_inizio', v_c.live_inizio,
    'live_fine', v_c.live_fine,
    'vincitore_rivelato', v_c.vincitore_rivelato,
    'classifica_visibile', v_classifica,
    'remoto_finito', v_remoto_finito,
    'iscritti', contest_iscritti(v_c.id),
    'proposte', (select count(*) from contest_proposte where contest_id = p_contest_id and not nascosta),
    'totale', jsonb_build_object(
      'remoto', (select count(*) from contest_voti where contest_id = p_contest_id and fase = 'remoto'),
      'live', (select count(*) from contest_voti where contest_id = p_contest_id and fase = 'live')
    ),
    'dispositivi', coalesce((select jsonb_object_agg(dispositivo, n) from (
      select dispositivo, count(*) n from contest_voti where contest_id = p_contest_id group by dispositivo) d), '{}'),
    'zone', coalesce((select jsonb_agg(jsonb_build_object('zona', zona, 'n', n) order by n desc, zona) from (
      select coalesce(nullif(zona, ''), 'Non indicata') zona, count(*) n from contest_voti
      where contest_id = p_contest_id group by 1 order by 2 desc limit 8) z), '[]'),
    -- Mappa: voti raggruppati per punto (coordinate già arrotondate a ~10 km).
    'punti', coalesce((select jsonb_agg(jsonb_build_object('lat', lat, 'lon', lon, 'zona', zona, 'n', n, 'ultimo', ultimo) order by n desc) from (
      select lat, lon, mode() within group (order by coalesce(nullif(zona, ''), 'Non indicata')) zona,
             count(*) n, max(aggiornato_il) ultimo
      from contest_voti where contest_id = p_contest_id and lat is not null and lon is not null
      group by lat, lon order by count(*) desc limit 200) pt), '[]'),
    -- Andamento: voti per minuto negli ultimi 60 minuti di attività.
    'andamento', coalesce((select jsonb_agg(jsonb_build_object('t', t, 'remoto', r, 'live', l) order by t) from (
      select date_trunc('minute', creato_il) t,
             count(*) filter (where fase = 'remoto') r, count(*) filter (where fase = 'live') l
      from contest_voti where contest_id = p_contest_id
        and creato_il > (select max(creato_il) from contest_voti where contest_id = p_contest_id) - interval '60 minutes'
      group by 1) a), '[]'),
    -- Ultimi voti, senza proposta e senza votante: solo quando, da dove, come.
    'ultimi', coalesce((select jsonb_agg(jsonb_build_object('id', id, 't', aggiornato_il, 'fase', fase,
                'dispositivo', dispositivo, 'zona', zona) order by aggiornato_il desc) from (
      select id, aggiornato_il, fase, dispositivo, zona from contest_voti where contest_id = p_contest_id
      order by aggiornato_il desc limit 12) u), '[]'),
    'per_proposta', case when v_classifica then coalesce((select jsonb_agg(jsonb_build_object(
          'id', p.id, 'remoto', coalesce(r.n, 0), 'live', coalesce(l.n, 0)) order by p.id)
        from contest_proposte p
        left join (select proposta_id, count(*) n from contest_voti where contest_id = p_contest_id and fase = 'remoto' group by 1) r on r.proposta_id = p.id
        left join (select proposta_id, count(*) n from contest_voti where contest_id = p_contest_id and fase = 'live' group by 1) l on l.proposta_id = p.id
        where p.contest_id = p_contest_id and not p.nascosta), '[]') else null end
  ) into v;
  return v;
end; $$;

-- contest_iscritti: versione di 20261016_contest_copertina.sql
create or replace function contest_iscritti(p_contest_id uuid) returns bigint
language sql stable security definer set search_path = public, extensions as $$
  select count(*) from team t where t.tipo = 'individuale' and contest_ammette(p_contest_id, t.corso_id);
$$;

-- team_salva_proposta: versione di 20261017_contest_stato_ateneo.sql
create or replace function team_salva_proposta(
  p_team_id uuid, p_password text, p_contest_id uuid, p_titolo text, p_sintesi text, p_problema text,
  p_proposta text, p_perche text, p_immagine text, p_galleria text[] default '{}'
) returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare
  v_t team%rowtype := team_verificato(p_team_id, p_password);
  v_c contest%rowtype;
  v_id bigint;
  v_autori text;
begin
  select * into v_c from contest where id = p_contest_id;
  if v_c.id is null or not contest_ammette(v_c.id, v_t.corso_id) then raise exception 'contest_non_trovato'; end if;
  if not contest_aperto(v_c.id, v_t.corso_id) then raise exception 'attivita_non_attiva'; end if;
  if v_c.proposte_da <> 'studenti' or v_c.fase <> 'anteprima' then raise exception 'candidature_chiuse'; end if;
  if v_c.iscrizione <> 'entrambe' and v_c.iscrizione <> v_t.tipo then raise exception 'tipo_non_ammesso'; end if;
  if p_titolo is null or length(trim(p_titolo)) = 0 then raise exception 'titolo_mancante'; end if;
  if length(coalesce(p_sintesi, '')) > 220 then raise exception 'sintesi_troppo_lunga'; end if;
  v_autori := v_t.nome || case when v_t.tipo = 'gruppo' and coalesce(array_length(v_t.membri, 1), 0) > 0
                               then ' — ' || array_to_string(v_t.membri, ', ') else '' end;
  insert into contest_proposte (contest_id, team_id, autori, titolo, sintesi, problema, proposta, perche, immagine, galleria)
  values (p_contest_id, v_t.id, v_autori, trim(p_titolo), coalesce(p_sintesi, ''), coalesce(p_problema, ''),
          coalesce(p_proposta, ''), coalesce(p_perche, ''), coalesce(p_immagine, ''), coalesce(p_galleria, '{}'))
  on conflict (contest_id, team_id) where team_id is not null do update set
    autori = excluded.autori, titolo = excluded.titolo, sintesi = excluded.sintesi, problema = excluded.problema,
    proposta = excluded.proposta, perche = excluded.perche, immagine = excluded.immagine,
    galleria = excluded.galleria, aggiornato_il = now()
  returning id into v_id;
  return v_id;
end; $$;

-- team_ritira_proposta: versione di 20261015_contest_ateneo.sql
create or replace function team_ritira_proposta(p_team_id uuid, p_password text, p_contest_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_t team%rowtype := team_verificato(p_team_id, p_password);
begin
  if not contest_ammette(p_contest_id, v_t.corso_id)
     or not exists (select 1 from contest where id = p_contest_id and proposte_da = 'studenti' and fase = 'anteprima') then
    raise exception 'candidature_chiuse';
  end if;
  delete from contest_proposte where contest_id = p_contest_id and team_id = v_t.id;
end; $$;

-- vota_remoto: versione di 20261017_contest_stato_ateneo.sql, con un errore più preciso
create or replace function vota_remoto(
  p_team_id uuid, p_password text, p_proposta_id bigint, p_dispositivo text default 'altro', p_zona text default '',
  p_lat numeric default null, p_lon numeric default null
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_t team%rowtype := team_verificato(p_team_id, p_password);
  v_pr contest_proposte%rowtype;
  v_c contest%rowtype;
begin
  select * into v_pr from contest_proposte where id = p_proposta_id and not nascosta;
  if v_pr.id is null then raise exception 'proposta_non_trovata'; end if;
  select * into v_c from contest where id = v_pr.contest_id;
  -- Accesso di un corso che non partecipa a questo contest.
  if not contest_ammette(v_c.id, v_t.corso_id) then raise exception 'accesso_non_ammesso'; end if;
  if not contest_aperto(v_c.id, v_t.corso_id) then raise exception 'attivita_non_attiva'; end if;
  if v_c.fase <> 'voto' or now() < coalesce(v_c.voto_inizio, now()) or now() > v_c.voto_fine then
    raise exception 'votazione_non_attiva';
  end if;
  -- Si vota solo con un accesso individuale: una persona, un voto.
  if v_t.tipo <> 'individuale' then raise exception 'voto_solo_individuale'; end if;
  if v_pr.team_id = v_t.id then raise exception 'propria_proposta'; end if;
  insert into contest_segreti (contest_id) values (v_c.id) on conflict do nothing;
  insert into contest_voti (contest_id, proposta_id, fase, votante_hash, dispositivo, zona, lat, lon)
  values (v_c.id, p_proposta_id, 'remoto', contest_impronta(v_c.id, 't:' || v_t.id::text),
          contest_pulisci_dispositivo(p_dispositivo), contest_pulisci_zona(p_zona),
          contest_pulisci_coordinata(p_lat, 90), contest_pulisci_coordinata(p_lon, 180))
  on conflict (contest_id, fase, votante_hash) do update set
    proposta_id = excluded.proposta_id, dispositivo = excluded.dispositivo, zona = excluded.zona,
    lat = excluded.lat, lon = excluded.lon, aggiornato_il = now();
end; $$;

-- vota_live: versione di 20261013_contest_mappa.sql
create or replace function vota_live(
  p_contest_id uuid, p_proposta_id bigint, p_dispositivo_id text, p_codice text,
  p_dispositivo text default 'altro', p_zona text default '',
  p_lat numeric default null, p_lon numeric default null
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_c contest%rowtype;
begin
  select * into v_c from contest where id = p_contest_id;
  if v_c.id is null or v_c.live_stato <> 'aperto' or (v_c.live_fine is not null and now() > v_c.live_fine) then
    raise exception 'votazione_non_attiva';
  end if;
  if coalesce(p_codice, '') <> coalesce((select live_codice from contest_segreti where contest_id = p_contest_id), '#') then
    raise exception 'codice_errato';
  end if;
  if p_dispositivo_id is null or length(p_dispositivo_id) < 16 then raise exception 'dispositivo_non_valido'; end if;
  if not exists (select 1 from contest_proposte where id = p_proposta_id and contest_id = p_contest_id and not nascosta) then
    raise exception 'proposta_non_trovata';
  end if;
  insert into contest_voti (contest_id, proposta_id, fase, votante_hash, dispositivo, zona, lat, lon)
  values (p_contest_id, p_proposta_id, 'live', contest_impronta(p_contest_id, 'd:' || p_dispositivo_id),
          contest_pulisci_dispositivo(p_dispositivo), contest_pulisci_zona(p_zona),
          contest_pulisci_coordinata(p_lat, 90), contest_pulisci_coordinata(p_lon, 180))
  on conflict (contest_id, fase, votante_hash) do update set
    proposta_id = excluded.proposta_id, dispositivo = excluded.dispositivo, zona = excluded.zona,
    lat = excluded.lat, lon = excluded.lon, aggiornato_il = now();
end; $$;

-- contest_di_ateneo: versione di 20261017_contest_stato_ateneo.sql
create or replace function contest_di_ateneo(p_ateneo_id uuid)
returns table(id uuid, corso_id uuid, corso_nome text, spazio boolean, titolo text, sottotitolo text,
              fase text, voto_inizio timestamptz, voto_fine timestamptz, live_stato text,
              stato_attivita text, proposte bigint, copertina text, immagini text[])
language sql stable security definer set search_path = public, extensions as $$
  select r.id, r.corso_id, r.nome, r.spazio_ateneo, r.titolo, r.sottotitolo, r.fase, r.voto_inizio, r.voto_fine,
         r.live_stato, r.stato_attivita, r.proposte, r.copertina, r.immagini
  from (
    select k.id, k.corso_id, c.nome, c.spazio_ateneo, k.titolo, k.sottotitolo, k.fase, k.voto_inizio, k.voto_fine,
           k.live_stato,
           case when c.spazio_ateneo then (select a.stato from attivita a where a.corso_id = k.corso_id and a.tipo = 'contest_voto' limit 1)
                else k.stato_ateneo end as stato_attivita,
           (select count(*) from contest_proposte p where p.contest_id = k.id and not p.nascosta) as proposte,
           nullif(k.copertina, '') as copertina,
           coalesce((select array_agg(i.immagine) from (
             select p.immagine from contest_proposte p
             where p.contest_id = k.id and not p.nascosta and p.immagine <> ''
             order by p.creato_il limit 4) i), '{}') as immagini,
           k.creato_il
    from contest k
    join corsi c on c.id = k.corso_id
    where c.ateneo_id = p_ateneo_id and not c.archiviato
      and (k.ambito = 'ateneo' or c.spazio_ateneo)
      and k.fase <> 'bozza'
  ) r
  where r.stato_attivita in ('attiva', 'prossimamente')
  order by (r.fase = 'voto') desc, (r.fase = 'anteprima') desc, r.creato_il desc;
$$;

revoke execute on function semina_attivita_corso(uuid) from public, anon, authenticated;
revoke execute on function contest_iscritti(uuid) from public, anon, authenticated;
grant execute on function docente_salva_contest(uuid, uuid, text, text, text, text, boolean, text, text, text) to anon;
grant execute on function contest_statistiche(uuid, text) to anon;
grant execute on function team_salva_proposta(uuid, text, uuid, text, text, text, text, text, text, text[]) to anon;
grant execute on function team_ritira_proposta(uuid, text, uuid) to anon;
grant execute on function vota_remoto(uuid, text, bigint, text, text, numeric, numeric) to anon;
grant execute on function vota_live(uuid, bigint, text, text, text, text, numeric, numeric) to anon;
grant execute on function contest_di_ateneo(uuid) to anon;

-- === Controllo: le funzioni del Contest sono quelle giuste? ===
-- Restituisce l'elenco dei problemi (vuoto se tutto è a posto). Il
-- pannello docente lo mostra come avviso.
create or replace function contest_controlla_database() returns text[]
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v text[] := '{}';
  n int;
  src text;
begin
  select count(*) into n from pg_proc where pronamespace = 'public'::regnamespace and proname = 'vota_remoto';
  if n <> 1 then v := v || ('vota_remoto: ' || n || ' versioni'); end if;
  select count(*) into n from pg_proc where pronamespace = 'public'::regnamespace and proname = 'vota_live';
  if n <> 1 then v := v || ('vota_live: ' || n || ' versioni'); end if;
  select count(*) into n from pg_proc where pronamespace = 'public'::regnamespace and proname = 'docente_salva_contest';
  if n <> 1 then v := v || ('docente_salva_contest: ' || n || ' versioni'); end if;
  select string_agg(prosrc, ' ') into src from pg_proc where pronamespace = 'public'::regnamespace and proname = 'vota_remoto';
  if coalesce(src, '') not like '%contest_aperto%' or src not like '%voto_solo_individuale%' then v := v || 'vota_remoto non aggiornata'::text; end if;
  select string_agg(prosrc, ' ') into src from pg_proc where pronamespace = 'public'::regnamespace and proname = 'team_salva_proposta';
  if coalesce(src, '') not like '%contest_aperto%' then v := v || 'team_salva_proposta non aggiornata'::text; end if;
  select string_agg(prosrc, ' ') into src from pg_proc where pronamespace = 'public'::regnamespace and proname = 'contest_statistiche';
  if coalesce(src, '') not like '%contest_iscritti%' then v := v || 'contest_statistiche non aggiornata'::text; end if;
  select string_agg(prosrc, ' ') into src from pg_proc where pronamespace = 'public'::regnamespace and proname = 'contest_di_ateneo';
  if coalesce(src, '') not like '%stato_ateneo%' then v := v || 'contest_di_ateneo non aggiornata'::text; end if;
  return v;
end; $$;
grant execute on function contest_controlla_database() to anon;

notify pgrst, 'reload schema';
