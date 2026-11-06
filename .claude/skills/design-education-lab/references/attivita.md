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

Prima di tutto il **team dell'attività** (`team_attivita`, una composizione per ogni attività, visibile nel pannello attività): uno studente lo crea (nome, membri, password), gli altri entrano; la consegna del team usa la password del team come codice (stesso hash, `crea_submission_crazy8_team`).

Sette fasi (`components/crazy8/shared.tsx`, `FASI`):
1. Su cosa lavorate: il sotto-ambito (primo contesto del team).
2. Bacheca dei contesti curata dal docente (`contesti_crazy8`); `attivita.config.contesti_per_team` = quanti ne sceglie ogni team (0 = nessun limite).
3. Due HMW a spazi vuoti «Come potremmo [azione] per [utente] così che [risultato]?», ciascuna legata a un contesto; invio al docente (`hmw_inviate`), revisione per domanda (`hmw_revisione`: ok / rivedere) dal wall da proiettare (`components/crazy8/Docente.tsx`), sblocco degli sketch per team o per tutti (`sketch_sbloccato`, controllato anche lato server).
4. Sketch: 8 per ciascuna domanda (`immagini.domanda` 0/1), foto dal telefono.
5. Il migliore per ogni domanda (★) con interpretazione.
6. Prompt: configuratore che include la domanda HMW e il contesto dello sketch.
7. Immagini generate e consegna.
Il docente vede consegne, domande, round e commenti; può eliminare una consegna o un team. Moodboard, valutazione e share non fanno più parte del percorso (componenti rimasti per le consegne vecchie).

## 4. HMW + role-prompting (`/hmw`, `/teacher/hmw`)

- Versioni successive dell'How Might We con changelog e riflessione.
- Stress test: 2–3 ruoli dalla libreria (proposti dagli studenti, approvati dal docente) rispondono via `/api/hmw-stress-test` con un template fisso: solo domande e obiezioni, mai soluzioni (lo studente controlla solo nome e descrizione del ruolo, mai il vincolo).

## 5. Contest del progetto migliore (`/contest`, `/contest/live`, `/teacher/contest`)

**Fasi** (per contest): `bozza` (solo docente) → `anteprima` (proposte visibili; candidature aperte se `proposte_da = 'studenti'`) → `voto` (da remoto fino a `voto_fine`) → `chiuso`. In parallelo il voto dal vivo: `live_stato` chiuso/aperto/concluso, durata facoltativa, codice a 4 cifre.

**Studenti**: galleria con immagini grandi e gerarchia titolo → frase → problema → proposta → perché votarla (in ambra); modalità "Presenta" a copertine; dettaglio in sheet (da destra su desktop, dal basso su telefono); voto con conferma e scena ambra "Voto registrato"; scheda "Dati" con totale a cifre rotanti, countdown, affluenza, ultimi voti, ritmo minuto per minuto, mappa del voto e provenienza, dispositivi, classifica coperta fino alla scadenza; scheda "La mia" per candidare la propria proposta quando previsto.

**Di corso o di ateneo**: ogni contest sceglie «Aperto a: il corso / tutto l'ateneo». Quelli di ateneo compaiono in evidenza nella pagina dell'ateneo e si aprono da `/<ateneo>/contest`: nessuno deve iscriversi a un corso che non frequenta.

**Pubblico** (`/contest/live`): codice o QR, un voto per dispositivo (id casuale nel browser), cambiabile finché il voto è aperto.

**Docente**: elenco contest, copertina (pagina dell'ateneo e testa del contest; senza copertina un mosaico delle proposte), stato dell'attività, fasi e scadenza, voto dal vivo (durate 1–5 min o senza limite, nuovo codice, chiudi, azzera, svela/copri il vincitore), testi e regole (chi carica le proposte, chi vota, classifica visibile o no), proposte (aggiungi, modifica, nascondi, elimina), dati completi, chi può votare. "Proietta in aula" apre lo schermo scuro: totale gigante con onde a ogni voto, gara a barre con +1, QR e codice, ultimi voti, comandi che spariscono; tasto R per la rivelazione (tendina ambra, 3-2-1, immagine e titolo del vincitore), C per coprire la classifica, F per lo schermo intero.

**Conteggio**: pesi interi 0–10 per remoto e aula (classifica, vincitore e proiezione «Tutti» in punti); voti che non contano senza cancellarli: esclusi a mano, iscritti con il solo nome, senza posizione, zone escluse sulla mappa (`contest_voti_valutati`). Il docente elimina solo accessi individuali iscritti al contest o nel proprio corso. Iscrizione individuale con Nome e Cognome separati, obbligatori (`nome_completo`). Interruttore «Un voto a matricola» (`contest.richiedi_matricola`): matricola unica nell'ateneo (`team.matricola`, non modificabile), obbligatoria per votare da remoto e in aula; con la matricola richiesta il QR apre prima l'accesso e il voto in aula è legato alla persona (`vota_live` con `p_team_id`), altrimenti per dispositivo. Elenco delle matricole ammesse per contest (`contest_matricole`, CSV caricato dal docente): se c'è, la matricola deve esserci e il cognome, se presente, deve corrispondere (`contest_matricola_ammessa`); verificato prima dell'iscrizione (`contest_verifica_matricola`) e al voto; i voti fuori elenco non contano.

**Regole del voto**: da remoto si vota solo con un accesso individuale, un voto a testa per contest (`iscrizione` regola solo chi candida proposte); nel contest di ateneo login e iscrizione sono solo individuali; mai la propria proposta; anonimo (impronta con sale segreto); posizione da IP arrotondata.

## 6. Aggiungere una nuova attività

1. Scegli un `tipo` (es. `nuova_attivita`) e registralo in `MODULI_ATTIVITA` (`lib/attivita.ts`) con icona e pagine.
2. Migrazione: tabelle con `corso_id` (o legate a una riga che ce l'ha), RLS di sola lettura, scritture via RPC; aggiorna `semina_attivita_corso` e inserisci la riga `attivita` nei corsi esistenti in `bozza`.
3. Pagina studente dentro `RichiedeCorso`, identità da `useTeam()`, stato dell'attività letto da `attivita` (aperta solo se `attiva`).
4. Pannello docente sotto `/teacher/<tipo>` e voce in `SEZIONI` di `app/teacher/layout.tsx`.
5. Scheda nel manuale (`app/manuali/page.tsx`), sbloccata quando l'attività è attiva.
6. Linguaggio visivo e regole dei testi come nel resto della piattaforma.
