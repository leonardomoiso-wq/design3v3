# Architettura dei dati (Supabase / PostgreSQL)

## Indice
1. Modello multi-corso
2. Autenticazione senza account
3. Pattern delle funzioni (RPC)
4. Lettura dal client
5. Realtime
6. Migrazioni: regole e modello
7. Checklist per una nuova tabella o un nuovo campo

## 1. Modello multi-corso

Un **corso** è un ecosistema separato: docenti, team, casi studio, attività, votazioni, tag, prompt, testi.

```
corsi (id uuid, nome, codice univoco leggibile, descrizione, passcode_hash,
       visibile_in_home, archiviato, configurazione jsonb, created_at)
  ├─ team (corso_id, numero per corso, nome unico per corso, password_hash, membri[])
  ├─ casi_studio (corso_id, gruppo_num, titolo, descrizione, immagine, tags text[],
  │               driver jsonb, x, y, anno, provenienza, fonte, scelto, esito…)
  │     └─ voti_revisione (caso_id, gruppo_num, colore)   ← corso via caso
  ├─ revisione_stato (corso_id PK, caso_attivo_id)        ← una votazione per corso
  ├─ attivita (corso_id, tipo, stato, flag)               ← seminate alla creazione
  ├─ categorie_tag (corso_id, nome, ordine, selezione singola|multipla, obbligatoria)
  │     └─ tag_default_caso_studio (corso_id, categoria_id nullable, testo, ordine)
  ├─ contenuto_piattaforma (PK corso_id + chiave)         ← testi personalizzabili
  └─ submission_crazy8, hmw_iterazioni, ruoli_prompt, prompt_suggeriti… (corso_id)
docente_config (password di AMMINISTRAZIONE: apre tutti i corsi)
```

Regole:
- `corso_id ... references corsi(id) on delete cascade` sulle tabelle radice; le tabelle figlie (voti, immagini, commenti) ereditano il corso tramite il genitore.
- Unicità "per corso": `create unique index ... on team (corso_id, lower(nome))`, numerazione `max(numero) where corso_id = ...`.
- Le righe singleton globali (es. stato della votazione) diventano una riga per corso con `corso_id` come chiave primaria; si crea alla creazione del corso e si fa `insert ... on conflict (corso_id) do update`.
- `configurazione jsonb` del corso contiene ciò che il docente personalizza senza schema: nome del framework, i 4 driver (`chiave`, `etichetta`, `domanda`), istruzioni. Il client la normalizza sempre con valori predefiniti (configurazioni vecchie o parziali non devono rompere nulla).
- Portare dati esistenti in un primo corso: crealo nella migrazione, copia l'hash della password esistente, fai `update ... set corso_id = <primo> where corso_id is null`, poi `set not null`.

## 2. Autenticazione senza account

Niente Supabase Auth: le classi cambiano ogni semestre e gli studenti non devono registrarsi.

- **Docente**: password del corso (hash in `corsi.passcode_hash`) o password di amministrazione (`docente_config`). La sessione docente nel browser tiene un *elenco* di password (`sessionStorage`), così chi insegna in più corsi li vede tutti nel selettore in alto. `docente_accedi(p_passcode)` restituisce i corsi che quella password apre (nessuna riga = password errata).
- **Team**: nome + password scelti dagli studenti, unici per corso, con domanda segreta per il recupero. La sessione del team è salvata in `localStorage` *per corso*.
- **Consegne**: protette da un codice di gruppo (hash) verificato da ogni RPC che modifica o cancella.
- **Studente → corso**: elenco dei corsi visibili in home, codice corso, o link `/?corso=<codice>`. Corsi archiviati non accettano nuovi team né consegne.

Limite da dichiarare sempre: con la sola chiave anonima e RLS "lettura pubblica", chi usa direttamente le API può *leggere* dati di altri corsi (non modificarli). L'isolamento in lettura completo richiederebbe account veri (Supabase Auth + RLS per utente).

## 3. Pattern delle funzioni (RPC)

Tre funzioni interne, non eseguibili dal client:

```sql
create or replace function e_amministratore(p_passcode text) returns boolean
language sql security definer set search_path = public, extensions as $$
  select exists (select 1 from docente_config where crypt(coalesce(p_passcode,''), passcode_hash) = passcode_hash);
$$;

create or replace function docente_autorizzato(p_corso_id uuid, p_passcode text) returns boolean
language sql security definer set search_path = public, extensions as $$
  select p_corso_id is not null and (e_amministratore(p_passcode)
    or exists (select 1 from corsi where id = p_corso_id and crypt(coalesce(p_passcode,''), passcode_hash) = passcode_hash));
$$;

create or replace function richiedi_docente(p_corso_id uuid, p_passcode text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not docente_autorizzato(p_corso_id, p_passcode) then raise exception 'passcode_errato'; end if;
end; $$;

revoke execute on function richiedi_docente(uuid, text) from public, anon, authenticated;
-- idem per le altre due (revocare anche da PUBLIC: anon lo eredita)
```

Funzioni docente:
- **Su una riga**: ricava il corso dalla riga, così la firma per il client non cambia e una password non può toccare righe di altri corsi:
  ```sql
  perform richiedi_docente((select corso_id from casi_studio where id = p_id), p_passcode);
  ```
  Per righe figlie, risali con join (`commenti → immagini → submission_crazy8.corso_id`).
- **Sull'intero corso** (reset, liste, creazione): ricevono `p_corso_id` e filtrano *sempre* con `where corso_id = p_corso_id`.
- Validazioni con eccezioni dal nome leggibile (`'codice_troppo_corto'`, `'provenienza_non_valida'`): il client le traduce in messaggi per l'utente.
- Grant esplicito per firma: `grant execute on function f(uuid, text, …) to anon;`.
- Quando cambi i parametri: `drop function if exists f(<firma vecchia esatta>)` e poi `create or replace` con la nuova; metti i nuovi parametri in fondo con `default null` se il client vecchio deve continuare a funzionare.

Funzioni studente: verificano che il corso esista e non sia archiviato, o ricavano il corso da una riga già legata (es. `crea_submission(p_attivita_id…)` legge `attivita.corso_id`).

Creazione corso (`docente_crea_corso`): richiede una password docente valida; crea la riga di stato, semina le attività standard e, se richiesto, copia dal corso di partenza configurazione dei driver, categorie di tag con i loro tag, prompt e ruoli docente (mai studenti o consegne).

## 4. Lettura dal client

- Filtra sempre: `.eq('corso_id', corso.id)`.
- Tabelle figlie senza `corso_id`: filtra con join embedded di PostgREST:
  ```ts
  supabase.from('voti_revisione').select('caso_id, gruppo_num, colore, casi_studio!inner(corso_id)').eq('casi_studio.corso_id', corsoId)
  ```
- Tabelle con hash: elenca le colonne (`COLONNE_CORSO = 'id, nome, codice, …'`), mai `*`.
- Cache locale (IndexedDB) di righe pesanti con immagini: lista leggera `id, updated_at` filtrata per corso, scarica solo le righe cambiate a piccoli blocchi; nella cache tieni righe di più corsi e considera solo quelle del corso richiesto. Trigger `updated_at` sulla tabella.

## 5. Realtime

Usa l'helper `assets/lib/realtime.ts`:
```ts
ascoltaCorso(supabase.channel(`casi-${corso.id}`), 'casi_studio', corso.id, onCambio).subscribe();
```
INSERT/UPDATE filtrati per `corso_id`, DELETE non filtrabili (arrivano da tutti i corsi): gestiscili in modo innocuo. Nome del canale con l'id del corso. Aggiungi la tabella alla publication `supabase_realtime` in un blocco `do $$ … if not exists (select 1 from pg_publication_tables …)`. Sul client, rimonta la pagina quando cambia il corso (`key={corso.id}`) così nessuna sottoscrizione resta appesa al corso precedente.

## 6. Migrazioni: regole e modello

Intestazione con: cosa fa, perché, da quale migrazione dipende, che va eseguita insieme al deploy del codice, che è idempotente.

```sql
-- =============================================================
-- <Cosa cambia per docenti e studenti, in due righe>
-- Da eseguire nel SQL editor di Supabase DOPO <migrazione precedente>,
-- insieme al deploy del codice aggiornato. Idempotente.
-- =============================================================
alter table casi_studio add column if not exists anno int;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'casi_studio_anno_valido') then
    alter table casi_studio add constraint casi_studio_anno_valido check (anno is null or anno between 1000 and 2100);
  end if;
end $$;
drop function if exists crea_caso_studio(<firma vecchia>);
create or replace function crea_caso_studio(..., p_anno int default null) ...;
grant execute on function crea_caso_studio(<firma nuova>) to anon;
notify pgrst, 'reload schema';
```

I campi nuovi sono `null` sulle righe esistenti: rendili obbligatori nel form (per nuove consegne e modifiche), non con `not null` nel database.

`assets/sql/esempio_multi_corso.sql` è un esempio completo e testato di tutte queste regole.

## 7. Checklist per una nuova tabella o un nuovo campo

- [ ] `corso_id` (o legame a una riga che ce l'ha) + indice
- [ ] RLS attiva + policy di sola lettura + `grant select` (o per colonna)
- [ ] scritture solo via RPC con `richiedi_docente` / verifica codice
- [ ] copia nella creazione corso, se è configurazione e non dato degli studenti
- [ ] realtime se serve vedere i cambi live
- [ ] tutti i `formattaCaso`/letture del client aggiornati
- [ ] provata due volte sul database locale, anche con i casi che devono fallire
