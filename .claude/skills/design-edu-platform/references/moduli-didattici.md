# Moduli didattici

## Indice
1. Flusso studente
2. Form dei casi studio (wizard)
3. I 4 driver configurabili
4. Tag a categorie (layer)
5. Viste docente: matrice, dettaglio, cluster, slide, radar
6. Peer review in aula
7. Pannello "Corso & Form" e testi
8. Aggiungere un'attività o un campo

## 1. Flusso studente

Scelta del corso → presentazione (testi del corso) → team (crea o accedi) → elenco attività del corso → attività. Ogni pagina studente è avvolta in `RichiedeCorso` (assets): senza corso rimanda alla home; con corso rimonta la pagina se cambia. Un'"area diretta" senza team può esistere ma va disattivabile dal docente.

## 2. Form dei casi studio (wizard)

Passi tipici: (Il Gruppo, saltato se il team è loggato) → **Il Caso Studio** → **Temi** → **Valutazione** → **Riepilogo**. Il pulsante "Avanti" è disabilitato finché il passo non è valido: è più chiaro di un errore alla fine.

Passo "Il Caso Studio":
- Titolo; **Anno** (4 cifre, ≤ anno corrente + 1, `inputMode="numeric"`); **Provenienza** (Italia/Estero come due pulsanti-radio); **Sito web / Fonte** (testo libero: link o riferimento bibliografico; nelle viste diventa link solo se sembra un URL, aggiungendo `https://` ai domini nudi); immagine compressa lato client; **Descrizione critica** con guida esplicita sopra il campo (es. "Descrivete il caso studio e spiegate perché è (o non è) innovazione: cosa cambia, per chi, con quali limiti") e placeholder che suggerisce le due parti.
- Il testo guida spiega allo studente *cosa* deve pensare, non solo cosa scrivere: è il punto in cui la piattaforma fa didattica.

Riepilogo: mostra tutto come apparirà (meta, fonte, tag raggruppati, driver con motivazioni).

Modifica di una consegna: si sblocca con il codice di gruppo, ricarica tutti i campi (compresi quelli nuovi, che sulle consegne vecchie sono vuoti e vanno compilati).

## 3. I 4 driver configurabili

- Sempre 4 driver, scala 0–5, ognuno con punteggio + motivazione obbligatoria (`driver: { chiave: { valore, nota } }`).
- Le chiavi interne sono 4 slot stabili; il corso definisce `etichetta` e `domanda` per ciascuno, il nome del framework e istruzioni facoltative. Offri modelli pronti (IDEO: Desiderabilità/Fattibilità/Responsabilità/Vitalità; Sostenibilità; UX).
- Matrice: `x = (d2 − d1) · 100/5`, `y = (d4 − d3) · 100/5`, spazio −100…100; etichette agli angoli: 1 alto-sinistra, 2 alto-destra, 3 basso-sinistra, 4 basso-destra. Un'unica funzione converte driver↔coordinate (anche quando il docente trascina una scheda).
- Tutte le viste e i prompt AI leggono le etichette dal corso: mai nomi dei driver scritti nel codice. Cambiare un nome non cambia i punteggi già dati: avvisalo nel pannello.

## 4. Tag a categorie (layer)

- `categorie_tag` per corso con `selezione` (`singola` = una voce, radio; `multipla` = checkbox) e `obbligatoria`; i tag predefiniti hanno `categoria_id` facoltativo; quelli senza categoria formano "Altri temi" (sempre facoltativo, nascosto se vuoto). Più un campo "tag personalizzato".
- Sul caso studio i tag restano un semplice `text[]`: filtri, ricerche e consegne vecchie continuano a funzionare; il raggruppamento si ricostruisce in visualizzazione (`raggruppaTag`).
- Validazione: ogni categoria obbligatoria con almeno una voce scelta; in una categoria singola, scegliere una voce sostituisce la precedente (e un secondo clic la deseleziona).
- Finestra docente: categorie con nome modificabile, regola di selezione, obbligatoria, ordine ↑↓, voci come chip, eliminazione con conferma, e un pulsante "parti dall'esempio" che crea un set di categorie realistico. Ricarica i dati dopo ogni operazione (sono pochi).
- Esempio di categorie per l'innovazione: Natura dell'Innovazione (Prodotto, Servizio, Processo) · Tipologia (Packaging, Prodotto Edibile, Spazio) · Ampiezza (Modulare, Architetturale, Incrementale, Dirompente).

## 5. Viste docente

Dashboard con schede: **Matrice**, **Cluster**, **Slide PDF**, **Controllo & Reset**, più finestra **Tag**.

- **Matrice**: navigabile come una mappa (`useMappaZoom`): zoom con rotella/pizzico/doppio clic/pulsanti, pan trascinando lo sfondo, minimappa quando ingrandita, pulsanti "vista intera" e "centra il selezionato". Le schede restano della stessa dimensione mentre il mondo si ingrandisce; i casi sovrapposti si dispongono a corona con soglia che si riduce con lo zoom. Col mouse le schede si trascinano per riposizionarle (aggiornando i driver); da touch si spostano con frecce nel pannello. Scheda in matrice: miniatura, titolo, gruppo, anno · provenienza; su mobile solo la miniatura.
- **Dettaglio** (pannello laterale ridimensionabile su desktop, sliding panel su mobile): titolo, gruppo, meta, contrassegno di interesse (stellina intera/mezza), immagine, descrizione, fonte, tag raggruppati, driver con motivazioni, analisi AI con "personaggi".
- **Cluster**: quadranti della matrice con titoli derivati dai due driver prevalenti (o nomi storici per il framework predefinito); clic → dettaglio in bottom sheet.
- **Slide PDF**: una scheda per caso, `@page { size: landscape }`, nessuna altezza fissa (il testo deve vedersi tutto), griglia a due colonne anche in stampa (`print:grid-cols-2`), container `h-screen/overflow-hidden` rimessi ad altezza naturale in `@media print`.
- **Radar**: fino a N progetti sovrapposti su 4 assi, colori da una palette categorica validata legati all'id (non alla posizione nell'elenco), elenco progetti e progetti attivi ai lati (su mobile: bottom sheet di selezione + sliding panel), ordinamento "Top 5 per driver" in action sheet.

## 6. Peer review in aula

- Il docente seleziona i casi da discutere (anche "solo i contrassegnati"), scorre le flashcard con frecce, apre/chiude la votazione per la scheda corrente; i gruppi votano verde/giallo/rosso dal proprio dispositivo (un voto per gruppo, modificabile finché è aperta); il docente imposta l'esito, che colora lo sfondo.
- Layout desktop: flashcard al centro che si adatta allo spazio (catena `min-h-0`, contenuto che scorre dentro) + colonna laterale con driver e **chi ha votato**; comandi e conteggi sotto. Mai mettere l'elenco dei votanti sotto la flashcard: crescendo la copre.
- Mobile: flashcard a una colonna; sliding panel con nell'intestazione sempre visibile ← conteggi ▶/⏸ →; nel corpo esito (action sheet), chi ha votato, driver.
- Archivio stampabile con esito e voti per scheda.

## 7. Pannello "Corso & Form" e testi

Sezioni: nome, codice, visibilità in home, link per gli studenti (copiabile); i 4 driver con anteprima della matrice e modelli; istruzioni; cambio password; archiviazione ed eliminazione (con conferma scrivendo il nome). Pagina "Testi": titoli e paragrafi di presentazione per corso, con il nome del corso come badge predefinito.

## 8. Aggiungere un'attività o un campo

Attività nuova: tipo registrato in `MODULI_ATTIVITA` (icona, pagine studente/docente), riga seminata in `semina_attivita_corso`, pagine avvolte in `RichiedeCorso`, tabelle con `corso_id` (o ricavato dall'attività), stato bozza/prossimamente/attiva/archiviata dal pannello Attività.

Campo nuovo sul caso studio: colonna + vincolo → parametri `default null` in `crea_`/`aggiorna_` → stato, validazione, reset e modifica nel form → riepilogo → tutte le viste (cerca ogni `formattaCaso`) → manuale studenti. Usa un componente condiviso per mostrarlo (come `MetaCaso`), così resta coerente ovunque.
