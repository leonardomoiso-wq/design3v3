-- =============================================================
-- Crazy 8 riletto come Design Fiction Prototyping.
--
-- 1. Lo scenario del "mondo futuro" in cui vivono gli artefatti del
--    team (segnale dal presente, what-if, orizzonte temporale, tipo di
--    futuro secondo il cono dei futuri, chi abita quel mondo) è salvato
--    sulla consegna, nella colonna scenario (jsonb).
-- 2. Le immagini finali scelte per la moodboard vengono rivalutate dal
--    team con i 4 driver del corso e con i tag del corso: questi dati
--    vivono dentro ogni voce della moodboard (titolo, tags, driver),
--    così il radar del/della docente può confrontarle con i casi studio.
-- 3. Le fasi diventano 9 (si aggiunge "Valutazione" prima dello share).
-- =============================================================

alter table submission_crazy8 add column if not exists scenario jsonb not null default '{}'::jsonb;

create or replace function aggiorna_campi_submission_crazy8(p_id uuid, p_codice text, p_campi jsonb)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select codice_hash into v_hash from submission_crazy8 where id = p_id;
  if v_hash is null then raise exception 'submission_non_trovata'; end if;
  if crypt(p_codice, v_hash) <> v_hash then raise exception 'codice_errato'; end if;

  if p_campi ? 'stato' and (p_campi ->> 'stato') not in ('in_corso', 'consegnato') then
    raise exception 'stato_non_valido';
  end if;
  if p_campi ? 'moodboard' and (
    jsonb_typeof(p_campi -> 'moodboard') <> 'array' or jsonb_array_length(p_campi -> 'moodboard') > 5
  ) then
    raise exception 'moodboard_non_valida';
  end if;
  if p_campi ? 'scenario' and jsonb_typeof(p_campi -> 'scenario') <> 'object' then
    raise exception 'scenario_non_valido';
  end if;

  update submission_crazy8 set
    hmw_o_tema = case when p_campi ? 'sotto_ambito' then p_campi ->> 'sotto_ambito' else hmw_o_tema end,
    motore_usato = case when p_campi ? 'motore_usato' then p_campi ->> 'motore_usato' else motore_usato end,
    note_prompt = case when p_campi ? 'note_prompt' then p_campi ->> 'note_prompt' else note_prompt end,
    riflessione = case when p_campi ? 'riflessione' then p_campi ->> 'riflessione' else riflessione end,
    -- la fase raggiunta può solo avanzare: tornare a rivedere una fase
    -- precedente non deve "richiudere" quelle successive.
    fase_raggiunta = case when p_campi ? 'fase_raggiunta'
      then greatest(fase_raggiunta, least(9, (p_campi ->> 'fase_raggiunta')::int)) else fase_raggiunta end,
    moodboard = case when p_campi ? 'moodboard' then p_campi -> 'moodboard' else moodboard end,
    scenario = case when p_campi ? 'scenario' then p_campi -> 'scenario' else scenario end,
    concept_titolo = case when p_campi ? 'concept_titolo' then p_campi ->> 'concept_titolo' else concept_titolo end,
    concept_descrizione = case when p_campi ? 'concept_descrizione' then p_campi ->> 'concept_descrizione' else concept_descrizione end,
    concept_motivazioni = case when p_campi ? 'concept_motivazioni' then p_campi ->> 'concept_motivazioni' else concept_motivazioni end,
    -- una consegna già revisionata dal/dalla docente non torna indietro
    stato = case when p_campi ? 'stato' and stato <> 'revisionato' then p_campi ->> 'stato' else stato end
  where id = p_id;
end;
$$;

grant execute on function aggiorna_campi_submission_crazy8 to anon;
