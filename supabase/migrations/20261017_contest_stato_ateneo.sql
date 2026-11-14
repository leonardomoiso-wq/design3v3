-- =============================================================
-- Stato del contest nell'ateneo, separato da quello nel corso.
--
-- Nel pannello docente un contest ha due interruttori:
-- * nel corso: l'attività Contest del corso (bozza, in arrivo, attiva,
--   archiviata), come le altre attività;
-- * nell'ateneo: stato_ateneo (bozza = non visibile, prossimamente =
--   in arrivo, attiva). Può essere attivo per tutto l'ateneo anche se
--   nel corso non è visibile.
-- `ambito` resta 'ateneo' finché il contest è in arrivo o attivo
-- nell'ateneo. Nello spazio di ateneo vale l'attività dello spazio.
--
-- Da eseguire DOPO 20261016_contest_copertina.sql. Idempotente.
-- =============================================================

alter table contest add column if not exists stato_ateneo text not null default 'bozza';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contest_stato_ateneo_valido') then
    alter table contest add constraint contest_stato_ateneo_valido check (stato_ateneo in ('bozza', 'prossimamente', 'attiva'));
  end if;
end $$;

-- Contest già aperti all'ateneo: lo stato nell'ateneo parte da quello del corso.
update contest k set stato_ateneo = case when a.stato = 'attiva' then 'attiva' else 'prossimamente' end
from corsi c, attivita a
where c.id = k.corso_id and not c.spazio_ateneo and a.corso_id = k.corso_id and a.tipo = 'contest_voto'
  and k.ambito = 'ateneo' and k.stato_ateneo = 'bozza';

-- Il contest è aperto per un accesso di questo corso?
create or replace function contest_aperto(p_contest_id uuid, p_team_corso_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((
    select case
      when c.spazio_ateneo then contest_attivita_attiva(k.corso_id)
      when k.ambito = 'ateneo' and k.stato_ateneo = 'attiva' then true
      when p_team_corso_id = k.corso_id then contest_attivita_attiva(k.corso_id)
      else false end
    from contest k join corsi c on c.id = k.corso_id where k.id = p_contest_id), false);
$$;
revoke execute on function contest_aperto(uuid, uuid) from public, anon, authenticated;

-- Il docente del corso imposta lo stato nell'ateneo.
create or replace function docente_stato_ateneo_contest(p_id uuid, p_stato text, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_corso corsi%rowtype;
begin
  select c.* into v_corso from contest k join corsi c on c.id = k.corso_id where k.id = p_id;
  if v_corso.id is null then raise exception 'contest_non_trovato'; end if;
  perform richiedi_docente(v_corso.id, p_passcode);
  if p_stato not in ('bozza', 'prossimamente', 'attiva') then raise exception 'stato_non_valido'; end if;
  if v_corso.ateneo_id is null then raise exception 'corso_senza_ateneo'; end if;
  update contest set stato_ateneo = p_stato,
    ambito = case when v_corso.spazio_ateneo or p_stato in ('prossimamente', 'attiva') then 'ateneo' else 'corso' end
  where id = p_id;
end; $$;
grant execute on function docente_stato_ateneo_contest(uuid, text, text) to anon;

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
grant execute on function vota_remoto(uuid, text, bigint, text, text, numeric, numeric) to anon;

-- Pagina dell'ateneo: conta lo stato nell'ateneo (o l'attività dello spazio).
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
grant execute on function contest_di_ateneo(uuid) to anon;

notify pgrst, 'reload schema';
