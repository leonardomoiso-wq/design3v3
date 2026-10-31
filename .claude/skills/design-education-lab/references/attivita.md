# Le attività

## Indice
1. Accesso: team e individui
2. Design Case Studies
3. Crazy 8 + co-creazione generativa
4. HMW + role-prompting
5. Contest del progetto migliore
6. Aggiungere una nuova attività

## 1. Accesso: team e individui

- Tabella `team` per corso: `numero` progressivo, `nome` unico nel corso, `password_hash`, domanda segreta + `risposta_hash`, `membri[]`, `tipo` (`gruppo` | `individuale`).
- Un accesso individuale è un team di una persona (`membri = [nome]`). Etichetta comune: `etichettaTeam()` in `lib/team-context.tsx` → "Gruppo 3 — I Funghi" oppure "Giulia Verdi (individuale)".
- RPC: `crea_team(corso, nome, password, domanda, risposta, membri, tipo)`, `login_team`, `recupera_domanda_team`, `reimposta_password_team`, `aggiorna_membri_team`, `docente_lista_team`. La sessione (`TeamInfo` con password) è in `localStorage` per corso.
- Le attività verificano l'identità con `team_verificato(team_id, password)` lato database.

## 2. Design Case Studies (`/student`, `/teacher`)

- Form a passi: Il Caso Studio (titolo, anno, provenienza Italia/Estero, fonte, immagine compressa, descrizione critica "perché è innovazione") → Temi (tag a categorie, singola/multipla, obbligatorie) → Valutazione (4 driver 0–5 con commento) → Riepilogo. Con team loggato il passo "Gruppo" è saltato.
- Modifica ed eliminazione protette dal codice di gruppo; il docente può reimpostarlo.
- Docente: matrice 2×2 (x = d2 − d1, y = d4 − d3) zoomabile e trascinabile, contrassegno a stellina, analisi AI, cluster per quadrante, slide PDF orizzontali, radar fino a N progetti, peer review con voto verde/giallo/rosso e archivio stampabile.
- Cache locale dei casi (IndexedDB, `lib/cacheCasi.ts`) per non riscaricare le immagini.

## 3. Crazy 8 + co-creazione generativa (`/crazy8`, `/teacher/crazy8`)

Nove fasi (`components/crazy8/shared.tsx`, `FASI`):
1. Sotto-ambiti: cosa cambia oggi e come potrebbe essere tra qualche anno (orizzonte).
2. Sketch: 8 idee in 8 minuti su carta, una foto per sketch.
3. Selezione e interpretazione degli sketch.
4. Prompt: configuratore che compone il prompt (parole degli studenti evidenziate) da aprire nel modello preferito; prompt suggeriti dal docente.
5. Risultati: si caricano le immagini generate migliori, legate a sketch e prompt (round).
6. Riflessione e reiterazione.
7. Moodboard del concept (4–5 immagini con didascalia).
8. Valutazione delle immagini finali: nome, tag del corso, 4 driver (le immagini valutate diventano "concept" sul radar, `lib/conceptRadar.ts`).
9. Share: presentazione del concept sotto-ambito per sotto-ambito.
Il docente vede consegne, round, deduzioni, commenti per immagine; l'attività può richiedere log dei prompt e riflessione.

## 4. HMW + role-prompting (`/hmw`, `/teacher/hmw`)

- Versioni successive dell'How Might We con changelog e riflessione.
- Stress test: 2–3 ruoli dalla libreria (proposti dagli studenti, approvati dal docente) rispondono via `/api/hmw-stress-test` con un template fisso: solo domande e obiezioni, mai soluzioni (lo studente controlla solo nome e descrizione del ruolo, mai il vincolo).

## 5. Contest del progetto migliore (`/contest`, `/contest/live`, `/teacher/contest`)

**Fasi** (per contest): `bozza` (solo docente) → `anteprima` (proposte visibili; candidature aperte se `proposte_da = 'studenti'`) → `voto` (da remoto fino a `voto_fine`) → `chiuso`. In parallelo il voto dal vivo: `live_stato` chiuso/aperto/concluso, durata facoltativa, codice a 4 cifre.

**Studenti**: galleria con immagini grandi e gerarchia titolo → frase → problema → proposta → perché votarla (in ambra); modalità "Presenta" a copertine; dettaglio in sheet (da destra su desktop, dal basso su telefono); voto con conferma e scena ambra "Voto registrato"; scheda "Dati" con totale a cifre rotanti, countdown, affluenza, ultimi voti, ritmo minuto per minuto, mappa del voto e provenienza, dispositivi, classifica coperta fino alla scadenza; scheda "La mia" per candidare la propria proposta quando previsto.

**Pubblico** (`/contest/live`): codice o QR, un voto per dispositivo (id casuale nel browser), cambiabile finché il voto è aperto.

**Docente**: elenco contest, stato dell'attività, fasi e scadenza, voto dal vivo (durate 1–5 min o senza limite, nuovo codice, chiudi, azzera, svela/copri il vincitore), testi e regole (chi carica le proposte, chi vota, classifica visibile o no), proposte (aggiungi, modifica, nascondi, elimina), dati completi, chi può votare. "Proietta in aula" apre lo schermo scuro: totale gigante con onde a ogni voto, gara a barre con +1, QR e codice, ultimi voti, comandi che spariscono; tasto R per la rivelazione (tendina ambra, 3-2-1, immagine e titolo del vincitore), C per coprire la classifica, F per lo schermo intero.

**Regole del voto**: un voto per team o individuo per contest (fase remota), filtrato dal tipo ammesso; mai la propria proposta; anonimo (impronta con sale segreto); posizione da IP arrotondata.

## 6. Aggiungere una nuova attività

1. Scegli un `tipo` (es. `nuova_attivita`) e registralo in `MODULI_ATTIVITA` (`lib/attivita.ts`) con icona e pagine.
2. Migrazione: tabelle con `corso_id` (o legate a una riga che ce l'ha), RLS di sola lettura, scritture via RPC; aggiorna `semina_attivita_corso` e inserisci la riga `attivita` nei corsi esistenti in `bozza`.
3. Pagina studente dentro `RichiedeCorso`, identità da `useTeam()`, stato dell'attività letto da `attivita` (aperta solo se `attiva`).
4. Pannello docente sotto `/teacher/<tipo>` e voce in `SEZIONI` di `app/teacher/layout.tsx`.
5. Scheda nel manuale (`app/manuali/page.tsx`), sbloccata quando l'attività è attiva.
6. Linguaggio visivo e regole dei testi come nel resto della piattaforma.
