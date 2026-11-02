-- =============================================================
-- Copertina del contest e voto solo individuale.
-- =============================================================

-- =============================================================
-- Copertina del contest.
--
-- Il docente può caricare un'immagine di copertina: compare nella
-- pagina dell'ateneo e in testa alla pagina del contest. Senza
-- copertina, la pagina dell'ateneo mostra un mosaico delle proposte.
--
-- Da eseguire DOPO 20261015_contest_ateneo.sql. Idempotente.
-- =============================================================

alter table contest add column if not exists copertina text not null default '';

create or replace function docente_imposta_copertina_contest(p_id uuid, p_copertina text, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from contest where id = p_id), p_passcode);
  if p_copertina is not null and p_copertina <> '' and p_copertina not like 'data:image/%' then
    raise exception 'immagine_non_valida';
  end if;
  update contest set copertina = coalesce(p_copertina, '') where id = p_id;
  if not found then raise exception 'contest_non_trovato'; end if;
end; $$;
grant execute on function docente_imposta_copertina_contest(uuid, text, text) to anon;

-- Pagina dell'ateneo: copertina del contest e fino a 4 immagini delle proposte.
drop function if exists contest_di_ateneo(uuid);
create or replace function contest_di_ateneo(p_ateneo_id uuid)
returns table(id uuid, corso_id uuid, corso_nome text, spazio boolean, titolo text, sottotitolo text,
              fase text, voto_inizio timestamptz, voto_fine timestamptz, live_stato text,
              stato_attivita text, proposte bigint, copertina text, immagini text[])
language sql stable security definer set search_path = public, extensions as $$
  select k.id, k.corso_id, c.nome, c.spazio_ateneo, k.titolo, k.sottotitolo, k.fase, k.voto_inizio, k.voto_fine,
         k.live_stato, a.stato,
         (select count(*) from contest_proposte p where p.contest_id = k.id and not p.nascosta),
         nullif(k.copertina, ''),
         coalesce((select array_agg(i.immagine) from (
           select p.immagine from contest_proposte p
           where p.contest_id = k.id and not p.nascosta and p.immagine <> ''
           order by p.creato_il limit 4) i), '{}')
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

-- =============================================================
-- Voto solo individuale.
--
-- Da remoto vota una persona alla volta: solo gli accessi individuali
-- (iscrizione "Da solo/a"). I team possono ancora candidare proposte,
-- secondo l'impostazione del contest (`iscrizione` ora riguarda solo
-- le candidature).
-- =============================================================
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

create or replace function contest_iscritti(p_contest_id uuid) returns bigint
language sql stable security definer set search_path = public, extensions as $$
  select count(*) from team t where t.tipo = 'individuale' and contest_ammette(p_contest_id, t.corso_id);
$$;
revoke execute on function contest_iscritti(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
