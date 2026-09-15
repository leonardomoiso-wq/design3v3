-- Aggiunge la colonna "tags" alla tabella casi_studio, usata dall'area
-- studenti per i tag tematici e dalla dashboard docente (matrice e radar)
-- per i filtri. Da eseguire nel SQL editor di Supabase.

alter table casi_studio
  add column if not exists tags text[] not null default '{}';
