# Verificare il lavoro

L'obiettivo è provare l'app contro un database vero, non contro mock: è così che sono emersi i problemi reali (permessi sulle colonne, filtri con join, firme delle funzioni, layout con dati estremi).

## 1. Typecheck, lint, build

```bash
npx tsc --noEmit -p .
npx next lint            # distingui gli errori nuovi da quelli già presenti
npx next build
```

## 2. Database locale con tutte le migrazioni

Se nel container c'è PostgreSQL (es. `/usr/lib/postgresql/16/bin`), usa `scripts/avvia_db_test.sh`:

```bash
bash .claude/skills/design-edu-platform/scripts/avvia_db_test.sh <cartella-migrazioni> [file-seed.sql]
```

Lo script crea un cluster in `/var/tmp/pgtest` (porta 5499), simula l'ambiente Supabase (schema `extensions` con pgcrypto, ruoli `anon`/`authenticated`, publication `supabase_realtime`, `search_path`), crea la tabella di partenza se le migrazioni non la creano (vedi la variabile `BASE_SQL` nello script, da adattare), applica tutte le migrazioni in ordine segnalando quelle che falliscono, e avvia PostgREST sulla porta 3001 con ruolo anonimo `anon`.

Poi prova le funzioni *come l'app*:

```sql
set role anon;
select nome, amministratore from docente_accedi('password');      -- accesso
select docente_resetta_tutto('<id altro corso>', 'password-di-un-corso');  -- deve fallire: passcode_errato
select passcode_hash from corsi;                                   -- deve fallire: permission denied
```

Riesegui l'ultima migrazione una seconda volta: deve passare (idempotenza).

## 3. Browser contro il database locale

`scripts/e2e_template.mjs` lancia Chromium con Playwright e reindirizza le chiamate `https://<progetto>.supabase.co/rest/v1/*` a PostgREST locale (togliendo l'header Authorization, che PostgREST locale non saprebbe verificare); il realtime viene bloccato. Copialo nello scratchpad, installa `playwright-core` lì (`npm i playwright-core`), avvia l'app (`npx next start -p 3123`), scrivi gli scenari nel blocco indicato e lancia:

```bash
node e2e_template.mjs <cartella-output-screenshot>
```

Scenari minimi per una modifica al form o alle viste:
- docente: password errata → messaggio; password giusta → corso corretto; azione nuova; screenshot desktop 1366×768 e 1440×900.
- studente mobile 390×844: scelta corso (anche via `?corso=codice`), accesso team, compilazione del passo modificato con controllo che "Avanti" sia disabilitato finché manca qualcosa, invio, verifica nel database della riga salvata.
- dato estremo: testi con parole lunghissime, molti voti, nessuna immagine.
- `document.documentElement.scrollWidth > window.innerWidth` deve essere `false` su mobile.

Guarda davvero gli screenshot. Dopo i test ferma i server (PostgREST, `next start`, `pg_ctl stop`).

## 4. Cosa dire se non hai potuto provare

Realtime, il progetto Supabase reale e i gesti multi-touch su un telefono vero non sono verificabili così: dichiaralo nella risposta finale.
