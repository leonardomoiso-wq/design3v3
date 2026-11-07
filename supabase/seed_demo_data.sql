-- Dati dimostrativi per popolare la piattaforma con 8 casi studio di
-- esempio (2 per ogni quadrante della matrice), utili per una demo o per
-- provare radar, peer review e voto senza aspettare le consegne reali.
--
-- Non è una migrazione di schema: eseguila quando vuoi nell'SQL editor di
-- Supabase, DOPO aver applicato tutte le migrazioni in supabase/migrations
-- (compresa 20261007_multi_corso.sql: i casi demo vanno nel corso Design 3).
-- È scritta per essere ripetibile: se un caso con lo stesso titolo esiste
-- già non viene ricreato.
--
-- Codice di gruppo per modificare/cancellare ciascuna scheda demo: "demo1234"
-- (uguale per tutte, per semplicità durante una demo).

do $$
declare
  -- Dopo l'introduzione dei corsi i dati demo vanno nel primo corso
  -- (Design 3); cambia il codice qui per popolarne un altro.
  v_corso uuid := (select id from corsi where codice = 'design-3');
begin
  if v_corso is null then
    raise exception 'Corso design-3 non trovato: esegui prima supabase/migrations/20261007_multi_corso.sql';
  end if;
  if not exists (select 1 from casi_studio where corso_id = v_corso and titolo = 'Pareti Vive') then
    perform crea_caso_studio(
      v_corso,
      'BioFacciata Studio', 1, 'Pareti Vive',
      'Un sistema di pannelli in micelio coltivato che regola l''umidità e la temperatura degli edifici, restituendo alla città una pelle capace di respirare insieme a chi la abita.',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScyNDAnIGhlaWdodD0nMjQwJz48cmVjdCB3aWR0aD0nMjQwJyBoZWlnaHQ9JzI0MCcgcng9JzI0JyBmaWxsPScjRENFRUUzJy8+PHRleHQgeD0nNTAlJyB5PSc1MyUnIGZvbnQtc2l6ZT0nOTYnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGRvbWluYW50LWJhc2VsaW5lPSdtaWRkbGUnPvCfjYQ8L3RleHQ+PC9zdmc+',
      array['Bio-digital architecture', 'Foraged and bio-based materials'],
      jsonb_build_object('desiderabilita', 2, 'fattibilita', 4, 'responsabilita', 2, 'vitalita', 3),
      40, 25, 'demo1234'
    );
  end if;

  if not exists (select 1 from casi_studio where corso_id = v_corso and titolo = 'Rete Micorrizica Urbana') then
    perform crea_caso_studio(
      v_corso,
      'Collettivo Sporocarpo', 2, 'Rete Micorrizica Urbana',
      'Un''infrastruttura sotterranea ispirata alle reti fungine che connette le aiuole cittadine, permettendo agli alberi di scambiarsi nutrienti e segnali di stress.',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScyNDAnIGhlaWdodD0nMjQwJz48cmVjdCB3aWR0aD0nMjQwJyBoZWlnaHQ9JzI0MCcgcng9JzI0JyBmaWxsPScjRTNFOURDJy8+PHRleHQgeD0nNTAlJyB5PSc1MyUnIGZvbnQtc2l6ZT0nOTYnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGRvbWluYW50LWJhc2VsaW5lPSdtaWRkbGUnPvCflbjvuI88L3RleHQ+PC9zdmc+',
      array['Microbial design', 'Regenerative urban prototyping'],
      jsonb_build_object('desiderabilita', 2, 'fattibilita', 4, 'responsabilita', 2, 'vitalita', 3),
      25, 20, 'demo1234'
    );
  end if;

  if not exists (select 1 from casi_studio where corso_id = v_corso and titolo = 'Passaggio per Rospi') then
    perform crea_caso_studio(
      v_corso,
      'Studio Anfibio', 8, 'Passaggio per Rospi',
      'Un sottopasso stradale stagionale che si attiva durante le migrazioni degli anfibi, guidato da sensori di movimento e presenza per fermare il traffico al momento giusto.',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScyNDAnIGhlaWdodD0nMjQwJz48cmVjdCB3aWR0aD0nMjQwJyBoZWlnaHQ9JzI0MCcgcng9JzI0JyBmaWxsPScjRTlGMERDJy8+PHRleHQgeD0nNTAlJyB5PSc1MyUnIGZvbnQtc2l6ZT0nOTYnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGRvbWluYW50LWJhc2VsaW5lPSdtaWRkbGUnPvCfkLg8L3RleHQ+PC9zdmc+',
      array['Non-human interaction design (NHID)', 'Regenerative urban prototyping'],
      jsonb_build_object('desiderabilita', 3, 'fattibilita', 2, 'responsabilita', 2, 'vitalita', 3),
      -20, 20, 'demo1234'
    );
  end if;

  if not exists (select 1 from casi_studio where corso_id = v_corso and titolo = 'Casette Sensibili') then
    perform crea_caso_studio(
      v_corso,
      'Laboratorio Cince', 7, 'Casette Sensibili',
      'Nidi artificiali dotati di microfoni che riconoscono i canti degli uccelli e regolano automaticamente l''illuminazione notturna della strada per ridurne il disturbo.',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScyNDAnIGhlaWdodD0nMjQwJz48cmVjdCB3aWR0aD0nMjQwJyBoZWlnaHQ9JzI0MCcgcng9JzI0JyBmaWxsPScjRENFRkVDJy8+PHRleHQgeD0nNTAlJyB5PSc1MyUnIGZvbnQtc2l6ZT0nOTYnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGRvbWluYW50LWJhc2VsaW5lPSdtaWRkbGUnPvCfjrY8L3RleHQ+PC9zdmc+',
      array['Non-human interaction design (NHID)', 'Speculative multispecies products'],
      jsonb_build_object('desiderabilita', 4, 'fattibilita', 2, 'responsabilita', 2, 'vitalita', 4),
      -40, 40, 'demo1234'
    );
  end if;

  if not exists (select 1 from casi_studio where corso_id = v_corso and titolo = 'Cassetta di Convivenza') then
    perform crea_caso_studio(
      v_corso,
      'Studio Alveare', 3, 'Cassetta di Convivenza',
      'Un''arnia urbana progettata per essere gestita a quattro mani da apicoltori e cittadini, con un''interfaccia che traduce il ronzio delle api in indicazioni di cura.',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScyNDAnIGhlaWdodD0nMjQwJz48cmVjdCB3aWR0aD0nMjQwJyBoZWlnaHQ9JzI0MCcgcng9JzI0JyBmaWxsPScjRjNFOUQyJy8+PHRleHQgeD0nNTAlJyB5PSc1MyUnIGZvbnQtc2l6ZT0nOTYnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGRvbWluYW50LWJhc2VsaW5lPSdtaWRkbGUnPvCfkJ08L3RleHQ+PC9zdmc+',
      array['Multispecies product design', 'More-than-human service design'],
      jsonb_build_object('desiderabilita', 4, 'fattibilita', 2, 'responsabilita', 4, 'vitalita', 2),
      -40, -40, 'demo1234'
    );
  end if;

  if not exists (select 1 from casi_studio where corso_id = v_corso and titolo = 'Balconi per Rondini') then
    perform crea_caso_studio(
      v_corso,
      'Nido Comune', 4, 'Balconi per Rondini',
      'Moduli prefabbricati che trasformano i balconi condominiali in nidi certificati, negoziando lo spazio abitativo tra famiglie umane e colonie di rondini.',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScyNDAnIGhlaWdodD0nMjQwJz48cmVjdCB3aWR0aD0nMjQwJyBoZWlnaHQ9JzI0MCcgcng9JzI0JyBmaWxsPScjRENFN0YwJy8+PHRleHQgeD0nNTAlJyB5PSc1MyUnIGZvbnQtc2l6ZT0nOTYnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGRvbWluYW50LWJhc2VsaW5lPSdtaWRkbGUnPvCfkKY8L3RleHQ+PC9zdmc+',
      array['Multispecies product design', 'Regenerative urban prototyping'],
      jsonb_build_object('desiderabilita', 4, 'fattibilita', 3, 'responsabilita', 3, 'vitalita', 2),
      -20, -25, 'demo1234'
    );
  end if;

  if not exists (select 1 from casi_studio where corso_id = v_corso and titolo = 'Sensori per il Sottosuolo') then
    perform crea_caso_studio(
      v_corso,
      'Osservatorio Radice', 5, 'Sensori per il Sottosuolo',
      'Una rete di sensori che ascolta lo stress idrico delle radici in un bosco urbano e traduce i dati in un bollettino leggibile da guardiaparco e cittadini.',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScyNDAnIGhlaWdodD0nMjQwJz48cmVjdCB3aWR0aD0nMjQwJyBoZWlnaHQ9JzI0MCcgcng9JzI0JyBmaWxsPScjRTZEQ0VGJy8+PHRleHQgeD0nNTAlJyB5PSc1MyUnIGZvbnQtc2l6ZT0nOTYnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGRvbWluYW50LWJhc2VsaW5lPSdtaWRkbGUnPvCfjLE8L3RleHQ+PC9zdmc+',
      array['Eco-feedback interfaces', 'Algorithmic conservation'],
      jsonb_build_object('desiderabilita', 2, 'fattibilita', 4, 'responsabilita', 4, 'vitalita', 2),
      30, -45, 'demo1234'
    );
  end if;

  if not exists (select 1 from casi_studio where corso_id = v_corso and titolo = 'Compostiera Parlante') then
    perform crea_caso_studio(
      v_corso,
      'Fabbrica Lenta', 6, 'Compostiera Parlante',
      'Un compostiere di quartiere che comunica lo stato di decomposizione attraverso segnali luminosi, rendendo visibile il lavoro invisibile dei microrganismi.',
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScyNDAnIGhlaWdodD0nMjQwJz48cmVjdCB3aWR0aD0nMjQwJyBoZWlnaHQ9JzI0MCcgcng9JzI0JyBmaWxsPScjRjBFM0RDJy8+PHRleHQgeD0nNTAlJyB5PSc1MyUnIGZvbnQtc2l6ZT0nOTYnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGRvbWluYW50LWJhc2VsaW5lPSdtaWRkbGUnPuKZu++4jzwvdGV4dD48L3N2Zz4=',
      array['Eco-feedback interfaces', 'Foraged and bio-based materials'],
      jsonb_build_object('desiderabilita', 3, 'fattibilita', 3, 'responsabilita', 3, 'vitalita', 2),
      15, -25, 'demo1234'
    );
  end if;
end;
$$;
