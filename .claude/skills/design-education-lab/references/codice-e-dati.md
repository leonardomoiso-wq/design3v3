# Codice, dati, deploy e verifica

## Indice
1. Mappa del repository
2. Database e migrazioni
3. Il Contest nel database
4. Posizione del voto
5. Deploy
6. Verifica

## 1. Mappa del repository (`leonardomoiso-wq/design3v3`, branch `leonardomoiso-wq/patch-70977`)

- `app/page.tsx` → `components/Percorso.tsx`: scelta dell'ateneo, presentazione del corso, accesso, elenco attività.
- `app/[ateneo]` (pagina dell'ateneo, `components/PaginaAteneo.tsx`), `app/[ateneo]/[corso]` (`components/IngressoCorso.tsx`), `app/[ateneo]/contest` (Contest di ateneo).
- `components/AccessoTeam.tsx`: accesso e iscrizione (in team o da soli), riusato dal percorso e dal Contest di ateneo.
- `app/student`, `app/crazy8`, `app/hmw`, `app/contest` (+ `live`): pagine studente.
- `app/teacher/*`: area docente (layout con login per corso, `template.tsx` per la transizione di sezione).
- `app/manuali`: manuali per attività.
- `app/api/ai`, `app/api/hmw-stress-test` (Gemini), `app/api/posizione` (città dall'IP).
- `components/`: `PannelliMobile`, `RichiedeCorso`, `Info`, `Sep`, `PillaScorrevole`, `NumeroVivo`, `MetaCaso`, `GestioneTag`, `StellaScelto`, `crazy8/*`, `moiso/*` (componenti del Contest: Moiso.tsx, Proposte, Classifica, DashboardVoto, MappaVoti, Celebrazione, Countdown, CampiProposta, FormProposta, QR).
- `lib/`: `corsi`, `corso-context`, `team-context`, `docente-context`, `attivita`, `contest`, `driver`, `tag`, `testi-piattaforma`, `immagine` (compressione), `cacheCasi`, `conceptRadar`, `realtime`, `useMappaZoom`, `useMobile`, `useContaSu`, `storageCrazy8`, `csv`.
- Regola del docente: **ogni elenco di team o studenti nell'area docente deve avere il suo CSV scaricabile** (`lib/csv.ts`: `scaricaCsvTeam` una riga per team, `scaricaCsvStudenti` una riga per studente; «;» e BOM UTF-8 per Excel in italiano). Oggi: Team formati (`/teacher/team`), team di ogni attività nel pannello attività, menu «CSV ↓» nel pannello Crazy 8, votanti del Contest. Una nuova pagina con un elenco di team va dotata degli stessi due pulsanti.
- `app/globals.css` (token ed effetti di tutta la piattaforma), `app/contest.css` (scena del Contest).
- `.claude/skills/design-edu-platform` (pattern generali) e questa skill.

## 2. Database e migrazioni

- Migrazioni in `supabase/migrations/AAAAMMGG_nome.sql`, in ordine; la 20261007 introduce i corsi, la 20261012 il Contest e i team individuali, la 20261013 la mappa del voto, la 20261014 gli atenei, la 20261015 i contest aperti a tutto l'ateneo, la 20261016 copertina e voto solo individuale, la 20261017 lo stato del contest nell'ateneo, la 20261018 riallinea le funzioni del Contest, la 20261019 l'elenco di chi vota, la 20261020 pesi, voti che non contano e nome e cognome obbligatori (ed è il nuovo riallineamento: riesegue l'ultima versione di tutte le funzioni del Contest). Per Crazy 8 la 20261021 è il riallineamento (colonne e funzioni delle 20261010/20261011 nell'ultima versione, rieseguibile sempre); `crazy8_controlla_database()` elenca cosa manca e il pannello Crazy 8 lo mostra come avviso. La 20261022 porta team per attività, bacheca contesti, HMW e sblocco degli sketch; la 20261023 bucket Storage `crazy8`, voti tra team sulle HMW e driver sulle immagini generate; la 20261024 HMW in numero variabile (indici 0–3), sblocco degli sketch coerente con la regia e password del team reimpostabile; la 20261025 confronta i nomi dei team con `chiave_nome_team()` (ignora maiuscole, spazi doppi, apostrofi e virgolette tipografiche): ogni nuova funzione che cerca un team per nome deve usarla; la 20261026 aggiunge la richiesta di rivalutazione delle domande HMW; la 20261027 i questionari anonimi (tabelle `questionari` e `risposte_questionario`, pagina pubblica `/questionario?q=<id>` senza accesso al corso, pannello `/teacher/questionari`, banca di domande in `lib/questionari.ts` componibile per corso, niente domande sui team). Le migrazioni che toccano funzioni già esistenti in produzione non devono cambiarne il tipo di ritorno (in produzione possono essere in una versione diversa da quella del repository): meglio funzioni nuove o modifiche mirate alla definizione esistente.
- Autorizzazione: `richiedi_docente(corso, password)` (password del corso o di amministrazione), `team_verificato(team, password)`; funzioni interne con `revoke execute`.
- Ogni tabella radice ha `corso_id`; lettura pubblica con RLS, scritture solo via RPC `security definer set search_path = public, extensions`.
- Rieseguire una migrazione vecchia dopo quelle nuove rimette versioni superate delle funzioni (es. il voto torna a rifiutare gli iscritti di ateneo con «proposta non disponibile»). Rimedio: rieseguire l'ultima migrazione del Contest (oggi `20261020_contest_pesi_esclusioni.sql`, prima `20261018_riallinea_funzioni_contest.sql`) (toglie tutte le versioni, anche doppie, e rimette l'ultima; si può eseguire sempre). `contest_controlla_database()` elenca i problemi e il pannello Contest lo mostra come avviso. Quando si ridefinisce una funzione del Contest, aggiornarla anche nella 20261018 e nel controllo.
- Cambiare la firma di una RPC: `drop function if exists f(<firma vecchia>)` e poi `create or replace`, parametri nuovi in fondo con `default`.
- Realtime: tabelle filtrate per `corso_id` con `replica identity full`; i DELETE arrivano da tutti i corsi.

## 2b. Atenei e indirizzi

- `atenei` (nome, `codice` nell'indirizzo, descrizione); `corsi.ateneo_id`; `corsi.spazio_ateneo` = corso nascosto che ospita le attività di ateneo (il Contest) con team e password docente propri, codice `<ateneo>-ateneo`.
- Indirizzi: `/` scelta dell'ateneo, `/polito` corsi e attività di ateneo, `/polito/design-3` corso, `/polito/contest` Contest di ateneo senza scegliere un corso. `percorsoCorso(corso)` in `lib/corsi.ts` costruisce il link; un corso aperto dall'ateneo sbagliato reindirizza a quello giusto.
- Codici riservati (`codice_ateneo_riservato`): student, teacher, crazy8, hmw, contest, manuali, api, corsi, atenei.
- RPC: `docente_crea_ateneo` (solo amministrazione, crea anche lo spazio), `docente_aggiorna_ateneo`, `docente_assegna_ateneo(corso, ateneo, password)`; `docente_accedi` restituisce ateneo e `spazio_ateneo`.
- Contest di ateneo (20261015): `contest.ambito` = `corso` | `ateneo`. Un contest di ateneo resta gestito dal corso che lo crea, ma vota (e candida) chi ha un accesso in qualsiasi corso dell'ateneo (`contest_ammette`) oppure chi si iscrive solo al contest nello spazio di ateneo. `contest_di_ateneo(ateneo)` elenca quelli da mostrare in `/polito`. Nella pagina `/polito/contest` lo studente sceglie «Solo per il contest» o «Con il mio corso»; un accesso già salvato in un corso dell'ateneo viene riconosciuto.
- Stato nell'ateneo (20261017): `contest.stato_ateneo` (bozza = non visibile, prossimamente, attiva), indipendente dall'attività Contest del corso; `contest_aperto(contest, corso del votante)` decide se si può votare o candidare. `docente_stato_ateneo_contest` lo imposta e sincronizza `ambito`.
- Area docente: sezione Atenei per l'amministrazione; nello spazio di ateneo il menu mostra solo Contest, Attività, Team, Testi.

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
