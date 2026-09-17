-- Cambia la password dell'area docente. La precedente ("admin2026") era
-- visibile in chiaro nel codice sorgente mentre il repository era
-- pubblico su GitHub: va sostituita, non basta rendere privato il repo
-- (chi l'ha già vista/clonata la conosce comunque).
--
-- Da eseguire nel SQL editor di Supabase DOPO tutte le migrazioni
-- precedenti. Va eseguita insieme al deploy del codice aggiornato
-- (app/teacher/layout.tsx) — finché non fai entrambe le cose insieme,
-- login lato client e verifica lato server useranno password diverse.

update docente_config
set passcode_hash = extensions.crypt('polito27', extensions.gen_salt('bf'))
where id = true;
