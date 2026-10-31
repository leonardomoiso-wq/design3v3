# Linguaggio visivo e testi

## Indice
1. Identità
2. Token
3. Effetti condivisi
4. Finestre
5. Il Contest: la versione "di scena"
6. Regole dei testi
7. Trappole già incontrate

## 1. Identità

Un'interfaccia editoriale e calda, riconoscibile ma non clone del Moiso design language: dal Moiso prende il movimento (curve morbide, tendine, pillole che scorrono, numeri che contano, finestre che scivolano), non colori né caratteri. Colori e font sono quelli della piattaforma: carta calda, inchiostro stone, titoli Helvetica, testo Inter, un solo accento ambra (lo stesso del selettore del corso).

## 2. Token (`app/globals.css`, `:root`)

| token | valore | uso |
|---|---|---|
| `--paper` | #FBF9F5 | sfondo delle pagine |
| `--surface` | #ffffff | card, finestre |
| `--ink` | #1c1917 | testo, pulsanti principali |
| `--muted` | #78716c | testo secondario, etichette |
| `--line` | #e7e5e4 | filetti e bordi |
| `--card` | #f5f5f4 | segnaposto immagini |
| `--accent` | #b45309 | accento per il testo (4.8:1) |
| `--accent-vivo` | #f59e0b | superfici, barre, scene (testo scuro sopra) |
| `--accent-tenue` / `--accent-bordo` | #fef3c7 / #fcd34d | elementi selezionati |
| `--f-display` / `--f-text` | Helvetica / Inter | titoli / testo |
| `--ease` `--out` `--spring` | curve | tendine e pannelli / ingressi / pillole e pulsanti |

La variabile del font Inter (`--font-inter`) sta su `<html>`: i token che la usano sono definiti sulla radice.

## 3. Effetti condivisi

- `entra-cascata` (figli che salgono uno dopo l'altro), `card-viva` (card che si solleva), `zoom-cornice` (immagine che si ingrandisce dentro la cornice).
- `components/PillaScorrevole.tsx`: pillola scura (o bianca) che scorre sotto la voce attiva (menu docente, schede di accesso, schede dei casi studio).
- `app/teacher/template.tsx`: filo ambra che attraversa la pagina e dissolvenza al cambio di sezione docente.
- `components/NumeroVivo.tsx` / `lib/useContaSu.ts`: conteggi che contano e scattano quando aumentano (Peer Review, Contest).

## 4. Finestre

- Tutte le modali (`role="dialog"` + fondo `bg-stone-900/60`) entrano con la stessa molla; su telefono diventano pannelli dal basso via CSS, senza toccare il codice delle pagine.
- `BottomSheet` (`components/PannelliMobile.tsx`) con `desktop="lato"`: pannello da destra a tutta altezza per i dettagli lunghi (dettaglio esteso in Cluster e Radar, proposte del Contest).
- `ActionSheet` per menu e scelte, `SlidingPanel` per i dettagli su mobile.

## 5. Il Contest: la versione "di scena"

`app/contest.css` (classi `.mz-*` dentro `.mz`) usa gli stessi token, più:
- titoli grandi con indice in apice `(05)`, etichette maiuscole spaziate;
- tendina d'inchiostro con filo ambra tra le schede;
- forme appese che oscillano (cerchio ambra, quadrato, rombo);
- cifre che ruotano, barre ambra che corrono, onde e "+1" a ogni voto;
- scena ambra con testo scuro per "Voto registrato" e per il vincitore;
- schermo da proiettare in versione scura e calda (`data-theme="dark"`).

## 6. Regole dei testi

- Restano visibili solo i testi che servono per agire: etichette, errori, conferme di azioni irreversibili, guide didattiche del form.
- Niente occhiello sopra il titolo né riga grigia sotto: l'etichetta va in apice (`<span className="apice">(Design 3)</span>`, contatori `(02 / 09)`), la spiegazione dietro `components/Info.tsx` (icona ⓘ, nota piccola agganciata allo schermo, sempre dentro i bordi).
- Niente "·" come separatore: spazio (`components/Sep.tsx`, con virgola per i lettori di schermo), virgola, trattino lungo o parentesi; contatori nel formato `03 / 51`.
- Frasi brevi, voce attiva, italiano piano; i pulsanti dicono cosa succede ("Vota questa proposta", "Proietta in aula").

## 7. Trappole già incontrate

- `animation-fill-mode: both` su un contenitore lascia una trasformazione attiva: gli elementi `position: fixed` dentro di esso si posizionano rispetto al contenitore (proiezione sotto l'intestazione, note fuori posto) e gli hover con `transform` non funzionano. Usare `backwards`.
- Una nota o un popover posizionato in assoluto può allargare la pagina su telefono prima di essere riposizionato: meglio `position: fixed` calcolato dall'ancora.
- Token che dipendono da un'altra variabile vanno definiti dove quella variabile esiste, altrimenti la regola diventa non valida e il valore viene ereditato (es. testo enorme dentro i titoli).
