-- =============================================================
-- Contest: pesi, voti che non contano, nome e cognome obbligatori.
--
-- * Pesi: peso_remoto e peso_live (interi da 0 a 10). Classifica e
--   vincitore usano i punti: voti da remoto x peso + voti in aula x peso.
-- * Voti che non contano (restano salvati, si possono riammettere):
--   - esclusi a mano dal docente (contest_voti.escluso);
--   - di chi si è iscritto con il solo nome (regola del contest);
--   - senza posizione (regola del contest);
--   - da zone escluse sulla mappa (zone_escluse, chiave "lat,lon").
-- * Iscrizione individuale: nome e cognome, entrambi (anche nel database).
-- * Matricola (se il contest la richiede): unica in tutto l'ateneo, una
--   per accesso, non modificabile. Senza matricola non si vota, né da
--   remoto né in aula. In aula, con la matricola richiesta, si vota con
--   il proprio accesso (non più per dispositivo).
-- * Il docente può eliminare un accesso individuale iscritto solo al
--   contest o nel proprio corso (con i suoi voti); gli altri accessi si
--   possono solo escludere, i team non si eliminano da qui.
--
-- Fa anche da riallineamento: toglie ogni versione delle funzioni del
-- Contest e rimette l'ultima. Si può rieseguire in qualsiasi momento.
-- Da eseguire DOPO 20261019_votanti_contest.sql.
-- =============================================================

alter table contest add column if not exists peso_remoto int not null default 1;
alter table contest add column if not exists peso_live int not null default 1;
alter table contest add column if not exists escludi_nome_singolo boolean not null default false;
alter table contest add column if not exists escludi_senza_posizione boolean not null default false;
alter table contest add column if not exists zone_escluse text[] not null default '{}';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contest_pesi_validi') then
    alter table contest add constraint contest_pesi_validi check (peso_remoto between 0 and 10 and peso_live between 0 and 10);
  end if;
end $$;
alter table contest_voti add column if not exists escluso boolean not null default false;
alter table contest add column if not exists richiedi_matricola boolean not null default false;
alter table contest add column if not exists escludi_senza_matricola boolean not null default false;
alter table team add column if not exists matricola text;
create index if not exists team_matricola_idx on team (upper(matricola)) where matricola is not null;

-- Matricola: maiuscole, senza spazi; da 4 a 12 lettere o cifre.
create or replace function normalizza_matricola(p text) returns text
language sql immutable as $$ select nullif(upper(regexp_replace(coalesce(p, ''), '\s+', '', 'g')), '') $$;
create or replace function matricola_valida(p text) returns boolean
language sql immutable as $$ select coalesce(normalizza_matricola(p) ~ '^[A-Z0-9]{4,12}$', false) $$;

-- La matricola è libera nell'ateneo del corso (o nel corso, se senza ateneo)?
create or replace function matricola_libera(p_corso_id uuid, p_matricola text, p_tranne uuid default null) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select not exists (
    select 1 from team t join corsi c on c.id = t.corso_id
    where upper(t.matricola) = normalizza_matricola(p_matricola)
      and (t.id is distinct from p_tranne)
      and (t.corso_id = p_corso_id
           or (c.ateneo_id is not null and c.ateneo_id = (select ateneo_id from corsi where id = p_corso_id))));
$$;
revoke execute on function matricola_libera(uuid, text, uuid) from public, anon, authenticated;

-- Nome e cognome: almeno due parole, ognuna con almeno due lettere.
create or replace function nome_completo(p text) returns boolean
language sql immutable as $$
  select coalesce((select count(*) >= 2 and bool_and(length(regexp_replace(w, '[^[:alpha:]]', '', 'g')) >= 2)
                   from regexp_split_to_table(trim(coalesce(p, '')), '\s+') w where w <> ''), false);
$$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as firma from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and p.proname in ('semina_attivita_corso', 'docente_salva_contest', 'contest_statistiche', 'contest_iscritti',
                               'team_salva_proposta', 'team_ritira_proposta', 'vota_remoto', 'vota_live', 'contest_di_ateneo',
                               'crea_team', 'docente_lista_votanti_contest', 'contest_voti_valutati',
                               'login_team', 'mio_voto_live', 'docente_regole_conteggio', 'docente_escludi_voto',
                               'docente_elimina_votante', 'team_imposta_matricola', 'team_matricola', 'docente_imposta_matricola_contest')
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
  -- Contest con matricola: senza matricola non si vota.
  if v_c.richiedi_matricola and v_t.matricola is null then raise exception 'matricola_richiesta'; end if;
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

-- vota_live: con la matricola richiesta si vota con il proprio accesso
-- (una persona, un voto in aula); altrimenti un voto per dispositivo.
create or replace function vota_live(
  p_contest_id uuid, p_proposta_id bigint, p_dispositivo_id text, p_codice text,
  p_dispositivo text default 'altro', p_zona text default '',
  p_lat numeric default null, p_lon numeric default null,
  p_team_id uuid default null, p_password text default null
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_c contest%rowtype;
  v_t team%rowtype;
  v_chi text;
begin
  select * into v_c from contest where id = p_contest_id;
  if v_c.id is null or v_c.live_stato <> 'aperto' or (v_c.live_fine is not null and now() > v_c.live_fine) then
    raise exception 'votazione_non_attiva';
  end if;
  if coalesce(p_codice, '') <> coalesce((select live_codice from contest_segreti where contest_id = p_contest_id), '#') then
    raise exception 'codice_errato';
  end if;
  if not exists (select 1 from contest_proposte where id = p_proposta_id and contest_id = p_contest_id and not nascosta) then
    raise exception 'proposta_non_trovata';
  end if;
  if v_c.richiedi_matricola then
    if p_team_id is null then raise exception 'accesso_richiesto'; end if;
    v_t := team_verificato(p_team_id, p_password);
    if v_t.tipo <> 'individuale' then raise exception 'voto_solo_individuale'; end if;
    if v_t.matricola is null then raise exception 'matricola_richiesta'; end if;
    if not contest_ammette(p_contest_id, v_t.corso_id) then raise exception 'accesso_non_ammesso'; end if;
    v_chi := 't:' || v_t.id::text;
  else
    if p_dispositivo_id is null or length(p_dispositivo_id) < 16 then raise exception 'dispositivo_non_valido'; end if;
    v_chi := 'd:' || p_dispositivo_id;
  end if;
  insert into contest_voti (contest_id, proposta_id, fase, votante_hash, dispositivo, zona, lat, lon)
  values (p_contest_id, p_proposta_id, 'live', contest_impronta(p_contest_id, v_chi),
          contest_pulisci_dispositivo(p_dispositivo), contest_pulisci_zona(p_zona),
          contest_pulisci_coordinata(p_lat, 90), contest_pulisci_coordinata(p_lon, 180))
  on conflict (contest_id, fase, votante_hash) do update set
    proposta_id = excluded.proposta_id, dispositivo = excluded.dispositivo, zona = excluded.zona,
    lat = excluded.lat, lon = excluded.lon, aggiornato_il = now();
end; $$;

create or replace function mio_voto_live(p_contest_id uuid, p_dispositivo_id text, p_team_id uuid default null, p_password text default null)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare v_chi text := 'd:' || coalesce(p_dispositivo_id, '');
begin
  if p_team_id is not null then
    perform team_verificato(p_team_id, p_password);
    v_chi := 't:' || p_team_id::text;
  end if;
  return (select proposta_id from contest_voti
          where contest_id = p_contest_id and fase = 'live' and votante_hash = contest_impronta(p_contest_id, v_chi));
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
grant execute on function team_salva_proposta(uuid, text, uuid, text, text, text, text, text, text, text[]) to anon;
grant execute on function team_ritira_proposta(uuid, text, uuid) to anon;
grant execute on function vota_remoto(uuid, text, bigint, text, text, numeric, numeric) to anon;
grant execute on function vota_live(uuid, bigint, text, text, text, text, numeric, numeric, uuid, text) to anon;
grant execute on function mio_voto_live(uuid, text, uuid, text) to anon;
grant execute on function contest_di_ateneo(uuid) to anon;


-- crea_team: versione di 20261012, con nome e cognome obbligatori per gli individui
create or replace function crea_team(
  p_corso_id uuid,
  p_nome text,
  p_password text,
  p_domanda_segreta text,
  p_risposta_segreta text,
  p_membri text[] default '{}',
  p_tipo text default 'gruppo',
  p_matricola text default null
)
returns table(id uuid, numero int, nome text, membri text[], tipo text, matricola text)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_numero int;
  v_id uuid;
  v_membri text[];
  v_tipo text := coalesce(p_tipo, 'gruppo');
  v_matricola text := normalizza_matricola(p_matricola);
begin
  if not exists (select 1 from corsi c where c.id = p_corso_id and not c.archiviato) then
    raise exception 'corso_non_trovato';
  end if;
  if v_tipo not in ('gruppo', 'individuale') then raise exception 'tipo_non_valido'; end if;
  if p_nome is null or length(regexp_replace(trim(p_nome), '\s+', ' ', 'g')) < 2 then raise exception 'nome_troppo_corto'; end if;
  -- Accesso individuale: nome e cognome, entrambi.
  if v_tipo = 'individuale' and not nome_completo(p_nome) then raise exception 'nome_cognome_mancanti'; end if;
  if v_matricola is not null then
    if v_tipo <> 'individuale' then raise exception 'matricola_solo_individuale'; end if;
    if not matricola_valida(v_matricola) then raise exception 'matricola_non_valida'; end if;
    -- Una matricola, un accesso in tutto l'ateneo.
    perform pg_advisory_xact_lock(hashtext('matricola:' || v_matricola));
    if not matricola_libera(p_corso_id, v_matricola) then raise exception 'matricola_gia_usata'; end if;
  end if;
  if p_password is null or length(trim(p_password)) < 4 then raise exception 'password_troppo_corta'; end if;
  if p_domanda_segreta is null or length(trim(p_domanda_segreta)) = 0 then raise exception 'domanda_mancante'; end if;
  if p_risposta_segreta is null or length(trim(p_risposta_segreta)) = 0 then raise exception 'risposta_mancante'; end if;
  if exists (select 1 from team t where t.corso_id = p_corso_id and lower(t.nome) = lower(regexp_replace(trim(p_nome), '\s+', ' ', 'g'))) then
    raise exception 'nome_gia_usato';
  end if;

  select coalesce(max(t.numero), 0) + 1 into v_numero from team t where t.corso_id = p_corso_id;
  if v_tipo = 'individuale' then
    -- Una persona sola: il "membro" è lei stessa.
    v_membri := array[regexp_replace(trim(p_nome), '\s+', ' ', 'g')];
  else
    select coalesce(array_agg(nullif(trim(m), '')) filter (where nullif(trim(m), '') is not null), '{}')
      into v_membri
      from unnest(coalesce(p_membri, '{}')) as m;
  end if;

  insert into team (corso_id, numero, nome, password_hash, domanda_segreta, risposta_hash, membri, tipo, matricola)
  values (
    p_corso_id, v_numero, regexp_replace(trim(p_nome), '\s+', ' ', 'g'),
    crypt(p_password, gen_salt('bf')),
    trim(p_domanda_segreta),
    crypt(lower(trim(p_risposta_segreta)), gen_salt('bf')),
    v_membri, v_tipo, v_matricola
  )
  returning team.id into v_id;

  return query select v_id, v_numero, regexp_replace(trim(p_nome), '\s+', ' ', 'g'), v_membri, v_tipo, v_matricola;
end;
$$;
grant execute on function crea_team(uuid, text, text, text, text, text[], text, text) to anon;

-- login_team: restituisce anche la matricola.
create or replace function login_team(p_corso_id uuid, p_nome text, p_password text)
returns table(id uuid, numero int, nome text, membri text[], tipo text, matricola text)
language plpgsql security definer set search_path = public, extensions as $$
declare v team%rowtype;
begin
  select * into v from team t where t.corso_id = p_corso_id and lower(t.nome) = lower(regexp_replace(trim(p_nome), '\s+', ' ', 'g'));
  if v.id is null or crypt(coalesce(p_password, ''), v.password_hash) <> v.password_hash then
    raise exception 'credenziali_errate';
  end if;
  return query select v.id, v.numero, v.nome, v.membri, v.tipo, v.matricola;
end; $$;
grant execute on function login_team(uuid, text, text) to anon;

-- Aggiunge la matricola a un accesso individuale che non ce l'ha.
-- Una volta impostata non si cambia (si libererebbe per un altro accesso).
create or replace function team_imposta_matricola(p_team_id uuid, p_password text, p_matricola text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_t team%rowtype := team_verificato(p_team_id, p_password);
  v_m text := normalizza_matricola(p_matricola);
begin
  if v_t.tipo <> 'individuale' then raise exception 'matricola_solo_individuale'; end if;
  if not matricola_valida(v_m) then raise exception 'matricola_non_valida'; end if;
  if v_t.matricola is not null then
    if v_t.matricola = v_m then return v_m; end if;
    raise exception 'matricola_gia_impostata';
  end if;
  perform pg_advisory_xact_lock(hashtext('matricola:' || v_m));
  if not matricola_libera(v_t.corso_id, v_m, v_t.id) then raise exception 'matricola_gia_usata'; end if;
  update team set matricola = v_m where id = v_t.id;
  return v_m;
end; $$;
grant execute on function team_imposta_matricola(uuid, text, text) to anon;

create or replace function team_matricola(p_team_id uuid, p_password text) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  return (team_verificato(p_team_id, p_password)).matricola;
end; $$;
grant execute on function team_matricola(uuid, text) to anon;

-- Il docente richiede (o no) la matricola per votare nel contest.
create or replace function docente_imposta_matricola_contest(p_id uuid, p_richiedi boolean, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from contest where id = p_id), p_passcode);
  update contest set richiedi_matricola = coalesce(p_richiedi, false) where id = p_id;
  if not found then raise exception 'contest_non_trovato'; end if;
end; $$;
grant execute on function docente_imposta_matricola_contest(uuid, boolean, text) to anon;

-- Ogni voto del contest, con "conta" e il motivo se non conta.
create or replace function contest_voti_valutati(p_contest_id uuid)
returns table(id bigint, proposta_id bigint, fase text, dispositivo text, zona text, lat numeric, lon numeric,
              creato_il timestamptz, aggiornato_il timestamptz, votante_hash text, conta boolean, motivo text)
language sql stable security definer set search_path = public, extensions as $$
  with k as (select * from contest where contest.id = p_contest_id),
  autori as (
    -- Solo se servono le regole su nome o matricola: impronta di voto di ogni accesso ammesso.
    select contest_impronta(p_contest_id, 't:' || t.id::text) h, t.nome, t.matricola
    from team t, k where (k.escludi_nome_singolo or k.escludi_senza_matricola) and contest_ammette(p_contest_id, t.corso_id)
  )
  select v.id, v.proposta_id, v.fase, v.dispositivo, v.zona, v.lat, v.lon, v.creato_il, v.aggiornato_il, v.votante_hash,
         m.motivo is null, m.motivo
  from contest_voti v
  cross join k
  left join autori a on a.h = v.votante_hash
  cross join lateral (select case
      when v.escluso then 'escluso_docente'
      when k.escludi_senza_posizione and v.lat is null then 'senza_posizione'
      when v.lat is not null and v.lon is not null and (v.lat::text || ',' || v.lon::text) = any(k.zone_escluse) then 'zona_esclusa'
      when v.fase = 'remoto' and k.escludi_nome_singolo and a.nome is not null and not nome_completo(a.nome) then 'solo_nome'
      -- Senza matricola: accessi che non ce l'hanno, e voti in aula per dispositivo.
      when k.escludi_senza_matricola and (a.h is null or a.matricola is null) then 'senza_matricola'
      else null end as motivo) m
  where v.contest_id = p_contest_id;
$$;
revoke execute on function contest_voti_valutati(uuid) from public, anon, authenticated;

-- contest_statistiche: conta solo i voti validi, con pesi e punteggio.
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

  -- I voti che contano, calcolati una volta sola.
  with vv as materialized (select * from contest_voti_valutati(p_contest_id) where conta)
  select jsonb_build_object(
    'pesi', jsonb_build_object('remoto', v_c.peso_remoto, 'live', v_c.peso_live),
    'regole', jsonb_build_object('nome_singolo', v_c.escludi_nome_singolo, 'senza_posizione', v_c.escludi_senza_posizione, 'zone', to_jsonb(v_c.zone_escluse),
                                  'senza_matricola', v_c.escludi_senza_matricola, 'richiedi_matricola', v_c.richiedi_matricola),
    -- Solo per il docente: quanti voti non contano e perché, e tutte le zone (anche escluse).
    'esclusi', case when v_docente then coalesce((select jsonb_object_agg(motivo, n) from (
      select motivo, count(*) n from contest_voti_valutati(p_contest_id) where not conta group by motivo) e), '{}') else null end,
    'punti_tutti', case when v_docente then coalesce((select jsonb_agg(jsonb_build_object('chiave', chiave, 'zona', zona, 'n', n, 'esclusa', chiave = any(v_c.zone_escluse)) order by n desc) from (
      select lat::text || ',' || lon::text chiave, mode() within group (order by coalesce(nullif(zona, ''), 'Non indicata')) zona, count(*) n
      from contest_voti_valutati(p_contest_id) where lat is not null and lon is not null group by lat, lon) pt), '[]') else null end,
    'senza_posizione', case when v_docente then (select count(*) from contest_voti_valutati(p_contest_id) where lat is null) else null end,
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
      'remoto', (select count(*) from vv where true and fase = 'remoto'),
      'live', (select count(*) from vv where true and fase = 'live')
    ),
    'dispositivi', coalesce((select jsonb_object_agg(dispositivo, n) from (
      select dispositivo, count(*) n from vv where true group by dispositivo) d), '{}'),
    'zone', coalesce((select jsonb_agg(jsonb_build_object('zona', zona, 'n', n) order by n desc, zona) from (
      select coalesce(nullif(zona, ''), 'Non indicata') zona, count(*) n from vv
      group by 1 order by 2 desc limit 8) z), '[]'),
    -- Mappa: voti raggruppati per punto (coordinate già arrotondate a ~10 km).
    'punti', coalesce((select jsonb_agg(jsonb_build_object('lat', lat, 'lon', lon, 'zona', zona, 'n', n, 'ultimo', ultimo) order by n desc) from (
      select lat, lon, mode() within group (order by coalesce(nullif(zona, ''), 'Non indicata')) zona,
             count(*) n, max(aggiornato_il) ultimo
      from vv where true and lat is not null and lon is not null
      group by lat, lon order by count(*) desc limit 200) pt), '[]'),
    -- Andamento: voti per minuto negli ultimi 60 minuti di attività.
    'andamento', coalesce((select jsonb_agg(jsonb_build_object('t', t, 'remoto', r, 'live', l) order by t) from (
      select date_trunc('minute', creato_il) t,
             count(*) filter (where fase = 'remoto') r, count(*) filter (where fase = 'live') l
      from vv where true
        and creato_il > (select max(creato_il) from vv where true) - interval '60 minutes'
      group by 1) a), '[]'),
    -- Ultimi voti, senza proposta e senza votante: solo quando, da dove, come.
    'ultimi', coalesce((select jsonb_agg(jsonb_build_object('id', id, 't', aggiornato_il, 'fase', fase,
                'dispositivo', dispositivo, 'zona', zona) order by aggiornato_il desc) from (
      select id, aggiornato_il, fase, dispositivo, zona from vv where true
      order by aggiornato_il desc limit 12) u), '[]'),
    'per_proposta', case when v_classifica then coalesce((select jsonb_agg(jsonb_build_object(
          'id', p.id, 'remoto', coalesce(r.n, 0), 'live', coalesce(l.n, 0),
          'punteggio', coalesce(r.n, 0) * v_c.peso_remoto + coalesce(l.n, 0) * v_c.peso_live) order by p.id)
        from contest_proposte p
        left join (select proposta_id, count(*) n from vv where true and fase = 'remoto' group by 1) r on r.proposta_id = p.id
        left join (select proposta_id, count(*) n from vv where true and fase = 'live' group by 1) l on l.proposta_id = p.id
        where p.contest_id = p_contest_id and not p.nascosta), '[]') else null end
  ) into v;
  return v;
end; $$;
grant execute on function contest_statistiche(uuid, text) to anon;

-- Chi può votare: con lo stato del voto (conta o no, e perché).
create or replace function docente_lista_votanti_contest(p_contest_id uuid, p_passcode text)
returns table(team_id uuid, numero int, nome text, tipo text, membri text[], corso_nome text, spazio boolean,
              creato_il timestamptz, ha_votato boolean, conta boolean, motivo text, escluso boolean,
              nome_completo boolean, eliminabile boolean,
              voto_zona text, voto_dispositivo text, voto_il timestamptz,
              matricola text, ha_votato_live boolean, live_conta boolean, voto_live_il timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_corso uuid := (select corso_id from contest where id = p_contest_id);
begin
  perform richiedi_docente(v_corso, p_passcode);
  return query
    with tutti as materialized (select * from contest_voti_valutati(p_contest_id)),
         vv as (select * from tutti where fase = 'remoto'),
         vl as (select * from tutti where fase = 'live')
    select t.id, t.numero, t.nome, t.tipo, t.membri, c.nome, c.spazio_ateneo, t.created_at,
           vv.id is not null, coalesce(vv.conta, false), vv.motivo, coalesce((select x.escluso from contest_voti x where x.id = vv.id), false),
           nome_completo(t.nome), (t.tipo = 'individuale' and (c.spazio_ateneo or c.id = v_corso)),
           -- Da dove e come ha votato (città dall'IP, arrotondata): mai per quale proposta.
           vv.zona, vv.dispositivo, vv.aggiornato_il,
           -- Matricola e voto in aula (con l'accesso, quando il contest la richiede).
           t.matricola, vl.id is not null, coalesce(vl.conta, false), vl.aggiornato_il
    from team t
    join corsi c on c.id = t.corso_id
    left join vv on vv.votante_hash = contest_impronta(p_contest_id, 't:' || t.id::text)
    left join vl on vl.votante_hash = contest_impronta(p_contest_id, 't:' || t.id::text)
    where contest_ammette(p_contest_id, t.corso_id)
    order by (t.tipo = 'individuale') desc, t.created_at desc;
end; $$;
grant execute on function docente_lista_votanti_contest(uuid, text) to anon;

-- Escludi (o riammetti) i voti di un accesso (da remoto e in aula).
create or replace function docente_escludi_voto(p_contest_id uuid, p_team_id uuid, p_escluso boolean, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from contest where id = p_contest_id), p_passcode);
  update contest_voti set escluso = coalesce(p_escluso, true)
  where contest_id = p_contest_id and votante_hash = contest_impronta(p_contest_id, 't:' || p_team_id::text);
  if not found then raise exception 'voto_non_trovato'; end if;
end; $$;
grant execute on function docente_escludi_voto(uuid, uuid, boolean, text) to anon;

-- Elimina un'utenza (solo iscritta al contest o nel corso del contest),
-- con i suoi voti da remoto nei contest a cui partecipa.
create or replace function docente_elimina_votante(p_contest_id uuid, p_team_id uuid, p_passcode text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_corso uuid := (select corso_id from contest where id = p_contest_id);
  v_t team%rowtype;
  v_c corsi%rowtype;
begin
  perform richiedi_docente(v_corso, p_passcode);
  select * into v_t from team where id = p_team_id;
  if v_t.id is null then raise exception 'team_non_trovato'; end if;
  select * into v_c from corsi where id = v_t.corso_id;
  -- Solo accessi individuali: i team hanno altre attività collegate.
  if v_t.tipo <> 'individuale' or not contest_ammette(p_contest_id, v_t.corso_id) or not (v_c.spazio_ateneo or v_c.id = v_corso) then
    raise exception 'utenza_non_eliminabile';
  end if;
  delete from contest_voti v using contest k
  where v.contest_id = k.id and contest_ammette(k.id, v_t.corso_id)
    and v.votante_hash = contest_impronta(k.id, 't:' || v_t.id::text);
  delete from team where id = v_t.id;
end; $$;
grant execute on function docente_elimina_votante(uuid, uuid, text) to anon;

-- Pesi e regole del conteggio.
create or replace function docente_regole_conteggio(p_id uuid, p_peso_remoto int, p_peso_live int,
  p_escludi_nome_singolo boolean, p_escludi_senza_posizione boolean, p_zone_escluse text[], p_passcode text,
  p_escludi_senza_matricola boolean default false)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from contest where id = p_id), p_passcode);
  if p_peso_remoto not between 0 and 10 or p_peso_live not between 0 and 10 then raise exception 'peso_non_valido'; end if;
  if p_peso_remoto + p_peso_live = 0 then raise exception 'peso_non_valido'; end if;
  update contest set peso_remoto = p_peso_remoto, peso_live = p_peso_live,
    escludi_nome_singolo = coalesce(p_escludi_nome_singolo, false),
    escludi_senza_posizione = coalesce(p_escludi_senza_posizione, false),
    zone_escluse = coalesce(p_zone_escluse, '{}'),
    escludi_senza_matricola = coalesce(p_escludi_senza_matricola, false)
  where id = p_id;
  if not found then raise exception 'contest_non_trovato'; end if;
end; $$;
grant execute on function docente_regole_conteggio(uuid, int, int, boolean, boolean, text[], text, boolean) to anon;

-- Controllo: le funzioni del Contest sono quelle giuste?
create or replace function contest_controlla_database() returns text[]
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v text[] := '{}';
  n int;
  src text;
  f text;
begin
  foreach f in array array['vota_remoto', 'vota_live', 'mio_voto_live', 'docente_salva_contest', 'crea_team', 'login_team',
                           'contest_statistiche', 'docente_regole_conteggio'] loop
    select count(*) into n from pg_proc where pronamespace = 'public'::regnamespace and proname = f;
    if n <> 1 then v := v || (f || ': ' || n || ' versioni'); end if;
  end loop;
  select string_agg(prosrc, ' ') into src from pg_proc where pronamespace = 'public'::regnamespace and proname = 'vota_remoto';
  if coalesce(src, '') not like '%contest_aperto%' or src not like '%voto_solo_individuale%' then v := v || 'vota_remoto non aggiornata'::text; end if;
  select string_agg(prosrc, ' ') into src from pg_proc where pronamespace = 'public'::regnamespace and proname = 'team_salva_proposta';
  if coalesce(src, '') not like '%contest_aperto%' then v := v || 'team_salva_proposta non aggiornata'::text; end if;
  select string_agg(prosrc, ' ') into src from pg_proc where pronamespace = 'public'::regnamespace and proname = 'contest_statistiche';
  if coalesce(src, '') not like '%contest_voti_valutati%' then v := v || 'contest_statistiche non aggiornata'::text; end if;
  select string_agg(prosrc, ' ') into src from pg_proc where pronamespace = 'public'::regnamespace and proname = 'crea_team';
  if coalesce(src, '') not like '%nome_completo%' or src not like '%matricola_libera%' then v := v || 'crea_team non aggiornata'::text; end if;
  select string_agg(prosrc, ' ') into src from pg_proc where pronamespace = 'public'::regnamespace and proname = 'vota_live';
  if coalesce(src, '') not like '%richiedi_matricola%' then v := v || 'vota_live non aggiornata'::text; end if;
  select string_agg(prosrc, ' ') into src from pg_proc where pronamespace = 'public'::regnamespace and proname = 'docente_lista_votanti_contest';
  if coalesce(src, '') not like '%vv.zona%' then v := v || 'docente_lista_votanti_contest non aggiornata'::text; end if;
  select string_agg(prosrc, ' ') into src from pg_proc where pronamespace = 'public'::regnamespace and proname = 'contest_di_ateneo';
  if coalesce(src, '') not like '%stato_ateneo%' then v := v || 'contest_di_ateneo non aggiornata'::text; end if;
  return v;
end; $$;
grant execute on function contest_controlla_database() to anon;

notify pgrst, 'reload schema';
