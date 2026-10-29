# Interfaccia e mobile

## Indice
1. I tre pannelli dal basso
2. Da desktop a mobile: tabella di conversione
3. Header e navigazione
4. Mappe e canvas (zoom/pan)
5. Layout che non si rompono
6. Testi che escono dalle card
7. Stile

## 1. I tre pannelli dal basso (`assets/components/PannelliMobile.tsx`)

- **BottomSheet** — modale. Su mobile sale dal fondo con maniglia, si chiude trascinando giù, toccando fuori o con Esc; da `md` in su è la classica finestra centrata (`larghezzaDesktop="md:max-w-2xl"`). Usalo per tutte le finestre (conferme, dettagli estesi, form brevi, selezioni multiple con barra "Fatto" `sticky -bottom-6`).
- **ActionSheet** — elenco di scelte su un BottomSheet, voce attiva evidenziata, voci "pericolo" in rosso, Annulla. Per: menu di sezioni, cambio vista/scheda, ordinamenti, esiti, azioni secondarie ("⋯").
- **SlidingPanel** — non modale, ancorato al fondo, tre altezze (peek / medio 50% / pieno 88%), trascinabile o toccabile; l'intestazione resta sempre visibile e può contenere comandi (i pulsanti dentro non avviano il trascinamento). Sostituisce i pannelli laterali di dettaglio. Il contenuto sopra deve lasciare spazio: `marginBottom`/`paddingBottom` pari all'altezza di peek.

Quando un tocco su un elemento deve aprire il pannello, portalo a "medio".

## 2. Da desktop a mobile

| Desktop | Mobile |
|---|---|
| pannello laterale di dettaglio | SlidingPanel con titolo/meta in intestazione |
| fila di pulsanti-scheda | pulsante con la scheda corrente ▾ → ActionSheet |
| select di filtro/ordinamento in toolbar | pulsanti → ActionSheet (scelta singola) o BottomSheet (più campi) |
| elenco laterale con selezione multipla | BottomSheet con ricerca + "Mostra (n)" |
| finestra centrata | BottomSheet |
| comandi in fondo alla pagina | intestazione dello SlidingPanel |

Usa `useMobile()` (`max-width: 767px`) per scegliere il contenitore; parte da `false`, quindi il primo render è il desktop. I componenti di *contenuto* sono condivisi: definiscili una volta (`const corpoDettaglio = …`) e mettili nell'uno o nell'altro contenitore.

## 3. Header e navigazione

- Con molte sezioni, mostra la nav completa solo quando ci sta davvero (misura: con 10+ voci serviva `min-[1680px]`), sotto un solo pulsante con la sezione corrente ☰ → ActionSheet.
- Il selettore del contesto principale (il corso) va a sinistra, ben visibile, e non deve restringersi fino a sparire.
- Sullo smartphone: `flex-wrap` sulle nav, gutter 16–20px, niente scroll orizzontale (verificalo: `document.documentElement.scrollWidth > innerWidth`).

## 4. Mappe e canvas (`assets/lib/useMappaZoom.ts`)

- Vista salvata in frazioni del riquadro (`zoom`, `x`, `y`), quindi indipendente dalle dimensioni della finestra; il "mondo" è un div posizionato con `left/top/width/height` in %, le schede dentro restano di dimensione fissa.
- Vincola la vista perché il mondo copra sempre il riquadro; aggiorna il ref della vista subito (più eventi arrivano prima del re-render).
- Rotella con listener non passivo; pinch del trackpad = rotella con `ctrlKey`; pizzico a due dita con pointer events; doppio tocco; tastiera `+ − 0` e frecce; contenitore `touch-none`.
- Distingui tocco e trascinamento (soglia ~6px) e ignora il click dopo uno spostamento.
- Col mouse il pan parte solo dallo sfondo (le schede hanno `data-caso` e restano trascinabili); da touch parte ovunque.

## 5. Layout che non si rompono

- Colonna flex che deve riempire lo spazio rimasto: `flex-1 min-h-0` su *tutta* la catena, contenuto con `overflow-y-auto`. Senza `min-h-0` il contenuto spinge fuori i fratelli o viene coperto.
- `aspect-ratio` + `max-h-full` + `overflow-y-auto` per flashcard "slide-like" che devono comunque adattarsi.
- Righe con testo + pulsanti in card strette: `flex-col sm:flex-row`, `min-w-0` sul blocco di testo, pulsanti a tutta larghezza su mobile.
- Header 100vh su mobile: `height: 100vh; height: 100dvh;` sull'app shell.
- Stampa: rimetti ad altezza naturale i contenitori `h-screen overflow-hidden`, niente altezze in `vh`.

## 6. Testi che escono dalle card

Gli studenti incollano link lunghissimi o scrivono parole senza spazi. Imposta una volta sul body:

```css
body { overflow-wrap: anywhere; }
```

`anywhere` (a differenza di `break-word`) riduce anche la larghezza minima dei figli flex/grid, quindi le colonne non vengono allargate da una parola. Badge e titoli troncati usano `whitespace-nowrap`/`truncate`, che non ne sono toccati. Verifica sempre con un caso di prova pieno di parole da 300 caratteri in descrizione, fonte e motivazioni.

## 7. Stile

Tailwind, palette neutra calda (`stone`, sfondo `#FBF9F5`), titoli in `font-serif` rimappato a una sans tipo Helvetica, card bianche `rounded-2xl border-stone-200`, accento ambra per il contesto (corso) e per i contrassegni, verde/giallo/rosso solo per i voti. Etichette di sezione: `text-[10px] font-bold uppercase tracking-widest text-stone-400`. Animazioni leggere in CSS (`fade-in-up`, `sheet-up`) con `prefers-reduced-motion`. Testi dell'interfaccia in italiano, tono diretto, rivolti al "voi" del gruppo per gli studenti.

## Linguaggio visivo comune (token ed effetti)

- Token in `app/globals.css` (`:root`): `--paper`, `--surface`, `--ink`, `--muted`, `--line`, un solo accento ambra (`--accent` per il testo, `--accent-vivo` per superfici e barre, `--accent-tenue`/`--accent-bordo` per i selezionati), font `--f-display` (Helvetica) e `--f-text` (Inter), curve `--ease`, `--out`, `--spring`. Nuove pagine: usare questi, non colori nuovi.
- Effetti condivisi (classi globali): `entra-cascata` (figli che salgono uno dopo l'altro), `card-viva` (card che si solleva), `zoom-cornice` (immagine che si ingrandisce nella cornice), `filo-sezione`/`entra-sezione` (cambio di sezione docente, in `app/teacher/template.tsx`), `components/PillaScorrevole.tsx` (pillola sotto la voce attiva), `components/NumeroVivo.tsx` (conteggi in diretta).
- Finestre: le modali scritte a mano (`role="dialog"` + `bg-stone-900/60`) entrano con la stessa molla e su telefono diventano pannelli dal basso, senza toccarne il codice. `BottomSheet` ha `desktop="lato"` per i dettagli lunghi (pannello da destra a tutta altezza).
- Animazioni di ingresso con `animation-fill-mode: backwards`, mai `both`: un'animazione che resta "attiva" crea un contesto di sovrapposizione e intrappola i pannelli `position: fixed` (la proiezione finiva sotto l'intestazione) e blocca le trasformazioni in hover.
- Il Contest (`app/contest.css`, classi `.mz-*`) usa gli stessi token, più gli effetti di scena: tendina, forme appese, contatori a cifre rotanti, scena ambra per voto e vincitore.
