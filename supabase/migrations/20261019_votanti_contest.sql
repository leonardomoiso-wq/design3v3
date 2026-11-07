-- =============================================================
-- Chi può votare un contest, per il pannello docente.
--
-- Per un contest di ateneo votano anche gli iscritti "solo per il
-- contest" (spazio di ateneo) e gli accessi individuali degli altri
-- corsi: il docente li vede tutti, con l'origine dell'iscrizione e se
-- hanno già votato. Il voto resta anonimo: si sa chi ha partecipato,
-- mai per quale proposta.
--
-- Da eseguire DOPO 20261018_riallinea_funzioni_contest.sql. Idempotente.
-- =============================================================

drop function if exists docente_lista_votanti_contest(uuid, text);
create or replace function docente_lista_votanti_contest(p_contest_id uuid, p_passcode text)
returns table(team_id uuid, numero int, nome text, tipo text, membri text[], corso_nome text, spazio boolean,
              creato_il timestamptz, ha_votato boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform richiedi_docente((select corso_id from contest where id = p_contest_id), p_passcode);
  return query
    select t.id, t.numero, t.nome, t.tipo, t.membri, c.nome, c.spazio_ateneo, t.created_at,
           exists (select 1 from contest_voti v
                   where v.contest_id = p_contest_id and v.fase = 'remoto'
                     and v.votante_hash = contest_impronta(p_contest_id, 't:' || t.id::text))
    from team t join corsi c on c.id = t.corso_id
    where contest_ammette(p_contest_id, t.corso_id)
    order by (t.tipo = 'individuale') desc, t.created_at desc;
end; $$;
grant execute on function docente_lista_votanti_contest(uuid, text) to anon;

notify pgrst, 'reload schema';
