---
name: design-edu-platform
description: Progettare, costruire ed estendere piattaforme web per la design education (laboratori, corsi universitari, workshop) in Next.js + Supabase — più corsi isolati con password docente per corso, team di studenti, caricamento di casi studio con form a passi, valutazione su 4 driver configurabili, tag a categorie, matrice 2x2 navigabile come una mappa, radar multicriterio, peer review con voto in aula, slide PDF, attività come Crazy 8 o HMW, e interfaccia mobile con bottom sheet, action sheet e sliding panel. Usa questa skill ogni volta che l'utente vuole creare o modificare una piattaforma didattica di questo tipo, aggiungere un corso/classe/coorte, un campo al form dei casi studio, un sistema di classificazione o di tag, una sezione docente o studente, una votazione tra gruppi, o rendere mobile un'area di una web app educativa — anche se non nomina Supabase o Next.js, e anche per richieste brevi come "aggiungi un campo al modulo 1" o "la card viene coperta dai voti".
---

# Piattaforme di design education (Next.js + Supabase)

Questa skill raccoglie l'architettura, le scelte e gli errori già risolti costruendo una piattaforma reale per laboratori di design: casi studio caricati dai gruppi, valutati su 4 driver, discussi in aula con matrice, radar e peer review. Serve sia per partire da zero sia per estendere una piattaforma esistente dello stesso tipo.

Chi la usa di solito è un/una docente, non uno sviluppatore: scrive in italiano, descrive il risultato didattico ("gli studenti devono spiegare perché è innovazione"), non la tecnica. Traduci la richiesta in scelte tecniche, falle tu con default sensati, e spiega il risultato in termini di cosa vedono docenti e studenti.

## Mappa dei riferimenti

Leggi solo quello che serve per il compito:

| Se il compito riguarda... | Leggi |
|---|---|
| database, corsi, password, permessi, migrazioni, nuove tabelle o funzioni | `references/architettura-dati.md` |
| form dei casi studio, driver, tag, matrice, radar, peer review, slide, cluster, attività | `references/moduli-didattici.md` |
| mobile, bottom/action sheet, sliding panel, zoom, layout che si rompono, testi che escono | `references/ui-mobile.md` |
| verificare il lavoro (database locale, PostgREST, Playwright) | `references/verifica.md` |

File pronti da copiare e adattare, in `assets/`:
- `components/PannelliMobile.tsx` — `BottomSheet`, `ActionSheet`, `SlidingPanel` senza librerie esterne.
- `lib/useMappaZoom.ts` — zoom/pan stile mappa (rotella, pizzico, doppio tocco, tastiera) per matrici e canvas.
- `lib/realtime.ts` — sottoscrizioni Supabase Realtime filtrate per corso.
- `lib/corso-context.tsx`, `components/RichiedeCorso.tsx` — corso corrente lato studente.
- `components/MetaCaso.tsx` — esempio di campi aggiuntivi (anno, provenienza, fonte) mostrati in modo coerente.
- `lib/useMobile.ts` — breakpoint mobile lato client.
- `sql/esempio_multi_corso.sql` — migrazione completa che porta una piattaforma mono-corso a multi-corso: usala come modello di stile e di sicurezza.

Script in `scripts/`: `avvia_db_test.sh` (PostgreSQL + PostgREST locali con tutte le migrazioni) e `e2e_template.mjs` (Playwright che parla con il database locale invece che con Supabase).

## Principi che tengono in piedi tutto

1. **Il corso è il confine di tutto.** Ogni tabella "radice" ha `corso_id`; ogni lettura del client filtra per corso; ogni funzione che scrive verifica che la password apra il corso della riga toccata. Un dato senza corso è un bug.
2. **Il client non scrive mai direttamente.** RLS con sola lettura pubblica, tutte le scritture via funzioni `security definer` con `search_path = public, extensions` (serve per `crypt`/`gen_salt` di pgcrypto su Supabase). Le password stanno solo come hash bcrypt; dove la riga contiene un hash, le colonne leggibili si concedono una per una (`grant select (col1, col2…)`) e il client non usa mai `select *` su quella tabella.
3. **Le migrazioni sono idempotenti e cumulative.** Un nuovo file datato per ogni cambiamento (`supabase/migrations/AAAAMMGG_nome.sql`), rieseguibile senza danni (`if not exists`, controlli su `pg_constraint`, `create or replace`, `drop function if exists` con firma esatta quando cambiano i parametri). I nuovi parametri delle RPC hanno un `default` quando possibile, così un client vecchio continua a funzionare durante il deploy.
4. **Configurare invece di cablare.** Etichette dei driver, domande guida, categorie di tag, testi di presentazione: tutto per corso, nel database, con un pannello docente. Le chiavi interne restano stabili (es. i 4 driver sono "slot" con chiavi storiche) così cambiare un nome non richiede di convertire i dati.
5. **Mobile come vista, non come seconda app.** Stessi dati e stessi componenti di contenuto; cambia il contenitore: pannello laterale → sliding panel, finestra centrata → bottom sheet, fila di pulsanti → action sheet. Il desktop resta com'è.
6. **Gli studenti scrivono di tutto.** Parole lunghissime, link enormi, campi vuoti, consegne vecchie senza i campi nuovi: ogni card deve reggere (vedi `ui-mobile.md`, "Testi che escono").

## Come lavorare su una richiesta

1. **Capisci dove tocca.** Database (nuova colonna/tabella/RPC)? Form studente? Viste docente (matrice, dettaglio, slide, cluster, radar, peer review)? Mobile? Una richiesta piccola ("aggiungi Anno al modulo 1") di solito tocca tutti e quattro: colonna + RPC, campo nel form con validazione, visualizzazione in tutte le card, manuale/aiuto.
2. **Cerca tutti i punti di visualizzazione.** Gli stessi dati compaiono in molte pagine con funzioni `formattaCaso` locali: cercale tutte (`grep -rn "formattaCaso\|gruppoNum" app`) e aggiornale insieme, altrimenti il dato appare in una vista e manca nelle altre.
3. **Interpreta le richieste ambigue e dichiaralo.** Messaggi troncati o vaghi ("devono…", "assegnazione slide") sono frequenti: scegli l'interpretazione più utile, fai una cosa che copra anche l'interpretazione alternativa se costa poco, e scrivilo chiaramente nella risposta finale.
4. **Scrivi la migrazione e provala sul serio.** Non basta che il TypeScript compili: esegui la catena di migrazioni su un PostgreSQL locale, due volte (idempotenza), e prova le funzioni come ruolo `anon`, compresi i tentativi che devono fallire (password di un altro corso, valori non validi). Ricetta in `references/verifica.md`.
5. **Verifica nel browser.** Build, server locale, Playwright su viewport desktop (1366×768 e 1440×900 sono quelli che rompono le cose) e mobile (390×844). Guarda gli screenshot: molti difetti (card coperte, header schiacciati, testo fuori) si vedono solo lì.
6. **Commit con messaggio in italiano che spiega il perché**, un commit per richiesta.
7. **Rispondi al/alla docente** con: cosa è cambiato in termini d'uso, cosa va fatto per il deploy (quale migrazione eseguire e in che ordine rispetto al codice), cosa hai interpretato, cosa non hai potuto provare.

## Deploy: l'ordine conta

Ogni volta che una migrazione cambia la firma di una funzione o aggiunge colonne lette dal codice, dillo esplicitamente: "esegui `supabase/migrations/X.sql` nell'SQL Editor, poi pubblica il codice". Se il codice nuovo arriva prima della migrazione, le chiamate falliscono; con i `default` sui nuovi parametri, migrazione prima e codice dopo funziona sempre. Ricorda anche che il file "setup completo" del progetto, se esiste, può essere rimasto indietro: per un database nuovo valgono le migrazioni in ordine.

## Errori già commessi (non ripeterli)

- Password docente controllata solo nel client (`if (pass === '...')`): va verificata dal database e mai scritta nel codice.
- `delete from tabella` senza `where`: Supabase lo blocca; usa sempre un filtro (per corso) o `where true` consapevole.
- Realtime: i filtri per colonna non valgono per i `DELETE`; gestiscili in modo innocuo (rimuovere un id se presente, ricaricare dati già filtrati). Le tabelle con filtri realtime vogliono `replica identity full`.
- Immagini che "spariscono" dopo un aggiornamento via realtime: le colonne grandi possono arrivare vuote; conserva il valore già mostrato.
- Flashcard con `aspect-ratio` fisso dentro una colonna flex: se compare altro contenuto sotto, viene coperta. Catena `min-h-0` + contenuto che scorre all'interno; i dettagli secondari (chi ha votato) in una colonna laterale, non sotto.
- Header con troppe voci: passa al menu compatto (action sheet) ben prima che vadano a capo; misuralo ai breakpoint reali.
- `onWheel` di React è passivo: per bloccare lo scroll della pagina durante lo zoom serve `addEventListener('wheel', fn, { passive: false })`.
- `setPointerCapture` sul contenitore rompe i `click` sulle schede figlie: ascolta i movimenti su `window`.
