-- =============================================================
-- Contest: mappa del voto. La zona non viene più dal fuso orario del
-- dispositivo (che per tutta Italia dice "Roma") ma dall'indirizzo IP,
-- letto dal server (app/api/posizione): al database arrivano solo città
-- e coordinate arrotondate a 0,1° (circa 10 km). L'IP non viene mai
-- salvato. contest_statistiche restituisce i punti aggregati per la mappa.
--
-- Da eseguire nel SQL editor di Supabase DOPO 20261012_contest_votazione.sql,
-- PRIMA di pubblicare il codice aggiornato. Idempotente. I nuovi parametri
-- hanno un valore predefinito: il codice precedente continua a funzionare.
-- =============================================================

alter table contest_voti add column if not exists lat numeric(4,1);
alter table contest_voti add column if not exists lon numeric(4,1);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contest_voti_coordinate_valide') then
    alter table contest_voti add constraint contest_voti_coordinate_valide
      check ((lat is null or lat between -90 and 90) and (lon is null or lon between -180 and 180));
  end if;
end $$;

-- Arrotonda a 0,1° e scarta valori fuori scala.
create or replace function contest_pulisci_coordinata(p numeric, p_limite numeric) returns numeric
language sql immutable as $$
  select case when p is null or abs(p) > p_limite then null else round(p, 1) end;
$$;

drop function if exists vota_remoto(uuid, text, bigint, text, text);
drop function if exists vota_live(uuid, bigint, text, text, text, text);

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
  if v_c.corso_id <> v_t.corso_id then raise exception 'proposta_non_trovata'; end if;
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
    'iscritti', (select count(*) from team where corso_id = v_c.corso_id),
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

grant execute on function vota_remoto(uuid, text, bigint, text, text, numeric, numeric) to anon;
grant execute on function vota_live(uuid, bigint, text, text, text, text, numeric, numeric) to anon;
grant execute on function contest_statistiche(uuid, text) to anon;

-- Titolo e descrizione dell'attività più asciutti (anche per i corsi
-- già creati, se non sono stati modificati dal docente).
update attivita set titolo = 'Contest del progetto migliore',
  descrizione = 'Le proposte in gara e il voto anonimo, da remoto e dal vivo in aula.'
where tipo = 'contest_voto' and titolo = 'Contest · Il progetto migliore';

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
revoke execute on function semina_attivita_corso(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
