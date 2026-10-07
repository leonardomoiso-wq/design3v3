-- Bug: dopo aver spuntato "scelto" (o qualsiasi altra modifica che non
-- tocca l'immagine, es. spostare un punto in matrice), l'immagine del
-- caso studio spariva. Causa: la colonna immagine è grande e Postgres la
-- salva "TOASTed" fuori riga; quando un UPDATE non la tocca, la
-- replica logica (da cui legge Supabase Realtime) non re-includeva il
-- valore invariato, e il nostro aggiornamento incrementale la sovrascriveva
-- con un vuoto. REPLICA IDENTITY FULL include sempre la riga intera nel
-- flusso di replica, anche le colonne TOASTed non cambiate.
--
-- Da eseguire nel SQL editor di Supabase dopo tutte le migrazioni/lo
-- script precedenti.

alter table casi_studio replica identity full;
