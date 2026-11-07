-- =============================================================
-- Contest di corso o di ateneo.
--
-- Ogni contest resta gestito dal corso che lo crea (stessa password
-- docente, stesso pannello), ma può aprirsi a tutto l'ateneo:
-- ambito = 'ateneo'. Allora:
-- * compare nella pagina dell'ateneo (/polito) e si apre da
--   /polito/contest, senza scegliere un corso;
-- * vota (e, se previsto, candida) chi ha un accesso in un qualsiasi corso
--   dello stesso ateneo, oppure chi si iscrive solo al contest (lo spazio
--   di ateneo): nessuno deve iscriversi a un corso che non frequenta.
-- I contest creati nello spazio di ateneo sono sempre di ateneo.
--
-- Da eseguire DOPO 20261014_atenei.sql. Idempotente.
-- =============================================================

alter table contest add column if not exists ambito text not null default 'corso';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contest_ambito_valido') then
    alter table contest add constraint contest_ambito_valido check (ambito in ('corso', 'ateneo'));
  end if;
end $$;
update contest set ambito = 'ateneo'
where ambito <> 'ateneo' and corso_id in (select id from corsi where spazio_ateneo);

-- L'ateneo a cui è aperto un contest (null se è solo del corso).
create or replace function contest_ateneo(p_contest_id uuid) returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select c.ateneo_id from contest k join corsi c on c.id = k.corso_id
  where k.id = p_contest_id and (k.ambito = 'ateneo' or c.spazio_ateneo);
$$;

-- Un accesso (team o individuo) può partecipare al contest?
create or replace function contest_ammette(p_contest_id uuid, p_team_corso_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from contest k where k.id = p_contest_id and k.corso_id = p_team_corso_id)
      or exists (select 1 from corsi c where c.id = p_team_corso_id and not c.archiviato
                 and c.ateneo_id is not null and c.ateneo_id = contest_ateneo(p_contest_id));
$$;
revoke execute on function contest_ammette(uuid, uuid) from public, anon, authenticated;

-- Quanti accessi possono votare: il corso, oppure tutti i corsi dell'ateneo.
create or replace function contest_iscritti(p_contest_id uuid) returns bigint
language sql stable security definer set search_path = public, extensions as $$
  select count(*) from team t where contest_ammette(p_contest_id, t.corso_id);
$$;
revoke execute on function contest_iscritti(uuid) from public, anon, authenticated;

-- === Impostazioni del contest: ora anche l'ambito ===
drop function if exists docente_salva_contest(uuid, uuid, text, text, text, text, boolean, text, text);
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
grant execute on function docente_salva_contest(uuid, uuid, text, text, text, text, boolean, text, text, text) to anon;

-- === Candidature, ritiro e voto: il corso oppure tutto l'ateneo ===
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
  if not contest_attivita_attiva(v_c.corso_id) then raise exception 'attivita_non_attiva'; end if;
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
  if not contest_ammette(v_c.id, v_t.corso_id) then raise exception 'proposta_non_trovata'; end if;
  if not contest_attivita_attiva(v_c.corso_id) then raise exception 'attivita_non_attiva'; end if;
  if v_c.fase <> 'voto' or now() < coalesce(v_c.voto_inizio, now()) or now() > v_c.voto_fine then
    raise exception 'votazione_non_attiva';
  end if;
  if v_c.iscrizione <> 'entrambe' and v_c.iscrizione <> v_t.tipo then raise exception 'tipo_non_ammesso'; end if;
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
grant execute on function vota_remoto(uuid, text, bigint, text, text, numeric, numeric) to anon;

-- === Statistiche: iscritti del corso o dell'intero ateneo ===
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
grant execute on function contest_statistiche(uuid, text) to anon;

-- === Contest aperti a un ateneo, per la sua pagina ===
-- Solo quelli non in bozza, con l'attività Contest del corso che li
-- gestisce attiva o "in arrivo". Copertina: la prima proposta in gara.
create or replace function contest_di_ateneo(p_ateneo_id uuid)
returns table(id uuid, corso_id uuid, corso_nome text, spazio boolean, titolo text, sottotitolo text,
              fase text, voto_inizio timestamptz, voto_fine timestamptz, live_stato text,
              stato_attivita text, proposte bigint, copertina text)
language sql stable security definer set search_path = public, extensions as $$
  select k.id, k.corso_id, c.nome, c.spazio_ateneo, k.titolo, k.sottotitolo, k.fase, k.voto_inizio, k.voto_fine,
         k.live_stato, a.stato,
         (select count(*) from contest_proposte p where p.contest_id = k.id and not p.nascosta),
         (select p.immagine from contest_proposte p where p.contest_id = k.id and not p.nascosta and p.immagine <> ''
          order by p.creato_il limit 1)
  from contest k
  join corsi c on c.id = k.corso_id
  join attivita a on a.corso_id = k.corso_id and a.tipo = 'contest_voto'
  where c.ateneo_id = p_ateneo_id and not c.archiviato
    and (k.ambito = 'ateneo' or c.spazio_ateneo)
    and k.fase <> 'bozza'
    and a.stato in ('attiva', 'prossimamente')
  order by (k.fase = 'voto') desc, (k.fase = 'anteprima') desc, k.creato_il desc;
$$;
grant execute on function contest_di_ateneo(uuid) to anon;

notify pgrst, 'reload schema';
