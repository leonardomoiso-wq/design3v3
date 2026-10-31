# Codice, dati, deploy e verifica

## Indice
1. Mappa del repository
2. Database e migrazioni
3. Il Contest nel database
4. Posizione del voto
5. Deploy
6. Verifica

## 1. Mappa del repository (`leonardomoiso-wq/design3v3`, branch `leonardomoiso-wq/patch-70977`)

- `app/page.tsx`: scelta corso, presentazione, accesso team/individuale, elenco attività.
- `app/student`, `app/crazy8`, `app/hmw`, `app/contest` (+ `live`): pagine studente.
- `app/teacher/*`: area docente (layout con login per corso, `template.tsx` per la transizione di sezione).
- `app/manuali`: manuali per attività.
- `app/api/ai`, `app/api/hmw-stress-test` (Gemini), `app/api/posizione` (città dall'IP).
- `components/`: `PannelliMobile`, `RichiedeCorso`, `Info`, `Sep`, `PillaScorrevole`, `NumeroVivo`, `MetaCaso`, `GestioneTag`, `StellaScelto`, `crazy8/*`, `moiso/*` (componenti del Contest: Moiso.tsx, Proposte, Classifica, DashboardVoto, MappaVoti, Celebrazione, Countdown, CampiProposta, FormProposta, QR).
- `lib/`: `corsi`, `corso-context`, `team-context`, `docente-context`, `attivita`, `contest`, `driver`, `tag`, `testi-piattaforma`, `immagine` (compressione), `cacheCasi`, `conceptRadar`, `realtime`, `useMappaZoom`, `useMobile`, `useContaSu`.
- `app/globals.css` (token ed effetti di tutta la piattaforma), `app/contest.css` (scena del Contest).
- `.claude/skills/design-edu-platform` (pattern generali) e questa skill.

## 2. Database e migrazioni

- Migrazioni in `supabase/migrations/AAAAMMGG_nome.sql`, in ordine; la 20261007 introduce i corsi, la 20261012 il Contest e i team individuali, la 20261013 la mappa del voto.
- Autorizzazione: `richiedi_docente(corso, password)` (password del corso o di amministrazione), `team_verificato(team, password)`; funzioni interne con `revoke execute`.
- Ogni tabella radice ha `corso_id`; lettura pubblica con RLS, scritture solo via RPC `security definer set search_path = public, extensions`.
- Cambiare la firma di una RPC: `drop function if exists f(<firma vecchia>)` e poi `create or replace`, parametri nuovi in fondo con `default`.
- Realtime: tabelle filtrate per `corso_id` con `replica identity full`; i DELETE arrivano da tutti i corsi.

## 3. Il Contest nel database

- `contest` (per corso: titolo, testi, `iscrizione`, `proposte_da`, `fase`, `voto_inizio/fine`, `mostra_classifica`, `live_stato/inizio/fine`, `vincitore_rivelato`).
- `contest_segreti` (sale dell'impronta, codice dal vivo): mai leggibile dal client.
- `contest_proposte` (immagine e galleria come data URL, `team_id` se candidata dagli studenti, `nascosta`).
- `contest_voti` (impronta del votante, fase remoto/live, dispositivo, zona, lat/lon arrotondati): nessun grant al client.
- RPC principali: `docente_*_contest`, `docente_live_contest(id, azione, durata)`, `team_salva_proposta`, `vota_remoto`, `vota_live`, `trova_voto_live(codice)`, `mio_voto_remoto/live`, `contest_statistiche(id, password?)` (punti per la mappa, classifica solo se permesso).

## 4. Posizione del voto

`app/api/posizione` legge `x-vercel-ip-city/country/latitude/longitude` (su Vercel), altrimenti chiede a ipwho.is con timeout; restituisce città e coordinate arrotondate a 0,1°, mai l'IP. Il browser la chiede una volta per sessione (`ottieniPosizione()` in `lib/contest.ts`) e la passa al voto; senza risposta il voto vale ma non va sulla mappa.

## 5. Deploy

1. Eseguire le migrazioni nuove nell'SQL Editor di Supabase, in ordine.
2. Pubblicare il codice (Vercel). Variabili: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GEMINI_API_KEY`.
3. Nel pannello Attività mettere su "Attiva" ciò che deve aprirsi.

## 6. Verifica

- `npx tsc --noEmit -p .` e `npx next build`.
- `bash .claude/skills/design-edu-platform/scripts/avvia_db_test.sh supabase/migrations` (PostgreSQL + PostgREST locali; poi `supabase/seed_demo_data.sql` per i casi studio demo). Rieseguire l'ultima migrazione per l'idempotenza; provare le RPC come `anon`, compresi i casi che devono fallire (password di un altro corso, team sbagliato, attività non attiva, doppio voto).
- Il team non è leggibile da `anon`: per gli id nei test usare il ruolo `postgres`.
- Playwright (preinstallato) con le chiamate a Supabase reindirizzate a PostgREST locale (modello in `design-edu-platform/scripts/e2e_template.mjs`); per simulare la posizione passare gli header `x-vercel-ip-*`. Viewport 1440×900 e 390×844; controllare `scrollWidth > innerWidth` su telefono.
- Fermare i processi: attenzione a `pkill -f` con stringhe che compaiono nel comando stesso (uccide la shell); meglio `kill` dei PID trovati con `ps`.
