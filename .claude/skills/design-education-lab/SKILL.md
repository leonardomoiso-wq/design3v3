---
name: design-education-lab
description: "Conoscenza completa del Design Education Lab di Leonardo Moiso (repository leonardomoiso-wq/design3v3): piattaforma Next.js + Supabase per laboratori di design con più corsi, team e accessi individuali, attività Design Case Studies, Crazy 8 + co-creazione generativa, HMW + role-prompting e Contest con voto anonimo da remoto e dal vivo, area docente, proiezione in aula e un linguaggio visivo proprio (carta calda, ambra, effetti ispirati al Moiso design language). Usa questa skill ogni volta che si lavora su questa piattaforma o se ne parla: aggiungere o modificare un'attività, una pagina studente o docente, il login, una migrazione, la grafica, i testi, il deploy, oppure descrivere il progetto, scriverne la documentazione, prepararne una presentazione o progettare una nuova attività didattica da inserirvi — anche quando l'utente dice solo \"la piattaforma\", \"il lab\", \"design3\", \"il contest\" o \"l'area docente\"."
---

# Design Education Lab

La piattaforma con cui Leonardo Moiso gestisce i suoi laboratori di design (primo corso: Design 3). Ogni corso è uno spazio separato; dentro, gli studenti entrano in team o da soli e svolgono attività che il/la docente apre, mette in arrivo o archivia. Questa skill è la memoria del progetto: cosa fa, come è fatto, quali decisioni sono già state prese e perché.

Chi chiede di solito è Leonardo stesso: designer e docente, scrive in italiano, ragiona per esperienza d'uso e didattica più che per tecnica, e tiene molto alla qualità visiva. Traduci le richieste in scelte tecniche, falle con default sensati e spiega il risultato in termini di cosa vedono studenti e docenti.

## Dove guardare

| Se il compito riguarda... | Leggi |
|---|---|
| raccontare il progetto, documentarlo, presentarlo, capirne lo scopo | `references/progetto.md` |
| una delle attività (casi studio, Crazy 8, HMW, Contest) o l'accesso team/individuale | `references/attivita.md` |
| grafica, colori, animazioni, finestre, testi e microcopy | `references/linguaggio-visivo.md` |
| codice, database, migrazioni, deploy, verifica | `references/codice-e-dati.md` |

Per i pattern generali (multi-corso, RPC con password, mobile, verifica con PostgreSQL locale e Playwright) c'è anche la skill di progetto `.claude/skills/design-edu-platform/`, che questa skill dà per buona e non ripete. Per gli effetti di movimento originali c'è `moiso-design-language`: qui si usano adattati, mai copiati.

## Come lavorare

1. **Parti dal branch giusto.** Il lavoro attuale vive su `leonardomoiso-wq/patch-70977` (è lì che Leonardo chiede di lavorare); `main` e i branch `claude/*` possono essere indietro. Prima di scrivere codice controlla `git log` di quel branch: se la versione locale è vecchia, ripartire costa meno che integrare dopo.
2. **Inserisciti nell'architettura esistente, non accanto.** Un dato nuovo appartiene a un corso; una scrittura passa da una funzione `security definer` che verifica la password (`richiedi_docente`) o il team (`team_verificato`); una nuova attività è un `tipo` in `lib/attivita.ts` + una riga seminata in `attivita`; l'accesso studenti è il team della home (anche individuale), non un secondo sistema.
3. **Migrazione nuova, mai riscrivere quelle già pubblicate.** File datato e idempotente in `supabase/migrations/`, parametri nuovi con `default`, e nella risposta l'ordine di deploy: prima la migrazione nell'SQL Editor di Supabase, poi il codice.
4. **Rispetta il linguaggio visivo e le regole dei testi** (vedi riferimento): token di `app/globals.css`, ambra come unico accento, niente "·" come separatore, niente occhiello + titolo + paragrafo grigio, approfondimenti dietro l'icona ⓘ.
5. **Verifica davvero**: `npx tsc --noEmit`, `npx next build`, catena completa delle migrazioni su PostgreSQL locale (due volte), funzioni provate come `anon` anche nei casi che devono fallire, Playwright su 1440×900 e 390×844, e guarda gli screenshot.
6. **Commit in italiano che spiega il perché**, push sul branch di lavoro.
7. **Rispondi in italiano semplice**: cosa cambia per studenti e docenti, cosa fare per il deploy, cosa hai interpretato, cosa non hai potuto provare.

## Decisioni già prese (non riaprirle senza motivo)

- Un "team individuale" (`team.tipo = 'individuale'`) è la risposta all'impegno individuale: stesso login, stesso recupero password, stesso pannello Team.
- Ogni contest sceglie chi carica le proposte (docenti, oppure anche gli studenti in anteprima) e chi candida e vota (individui, team, entrambi).
- I voti del Contest non sono mai leggibili dal client: solo aggregati da `contest_statistiche`; la posizione arriva dall'IP lato server, arrotondata a ~10 km, e l'IP non si salva.
- Il voto dal vivo non richiede corso né login: il contest si trova dal codice a 4 cifre (o dal QR).
- Animazioni di ingresso con `animation-fill-mode: backwards`: con `both` intrappolano i pannelli `position: fixed` (proiezione sotto l'intestazione, note ⓘ fuori posto) e bloccano gli hover.
