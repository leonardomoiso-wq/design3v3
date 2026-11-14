# Il progetto: Design Education Lab

## Indice
1. Cos'è e perché esiste
2. Chi lo usa
3. Il percorso dello studente
4. Il percorso del docente
5. Le attività in breve
6. Principi che lo tengono insieme
7. Stato attuale e limiti noti

## 1. Cos'è e perché esiste

Il Design Education Lab è una piattaforma web per i laboratori di design universitari. Nasce per il Laboratorio di Design 3 di Leonardo Moiso e oggi ospita più corsi indipendenti. Fa una cosa precisa: trasforma le attività che in un laboratorio si fanno su carta, a voce o con strumenti sparsi (raccogliere casi studio, valutarli, discuterli in aula, generare idee, votare il progetto migliore) in un unico ambiente condiviso, dove gli studenti producono e il docente vede, ordina, proietta e restituisce.

L'idea didattica di fondo: far ragionare gli studenti con strumenti del design (matrici, driver di valutazione, peer review, prototipazione con l'AI, voto argomentato), lasciando traccia del percorso e rendendo il confronto in aula immediato.

## 2. Chi lo usa

- **Studenti**, da telefono o computer, in aula o da casa. Entrano in un corso, poi in team (accesso condiviso del gruppo) o da soli (accesso individuale, per le attività in cui l'impegno è personale).
- **Docenti**, con la password del proprio corso. Una password di amministrazione apre tutti i corsi. Gestiscono attività, team, testi, configurazione dei driver, e conducono le sessioni in aula proiettando dalla piattaforma.
- **Pubblico in aula** (solo nel Contest): chiunque inquadri il QR proiettato può votare dal vivo, senza iscriversi.

## 3. Il percorso dello studente

1. **Scelta del corso** dalla home (corsi elencati, oppure codice corso o link `/?corso=<codice>`).
2. **Presentazione** del corso (titolo e testo personalizzabili dal docente).
3. **Accesso**: «Accedi» oppure «Iscriviti» scegliendo «In team» o «Da solo/a»; nome e password scelti dagli studenti, domanda segreta per recuperare la password. L'accesso resta salvato nel browser, per corso.
4. **Elenco delle attività** del corso: quelle attive si aprono, quelle in arrivo si vedono come anteprima.
5. **Attività**: ognuna con il proprio flusso (vedi `attivita.md`), manuale consultabile da «Manuali & Tutorial».

## 4. Il percorso del docente

Area docente (`/teacher`): selettore del corso in alto (più corsi per sessione), menu a pillola (a schede compatte su schermi stretti) con:
- **Dashboard & Matrice**: casi studio sulla matrice 2×2 navigabile come una mappa, cluster analitici, slide PDF stampabili, controllo e reset, tag.
- **Radar multicriterio**: confronto dei casi (e dei concept di Crazy 8) sui 4 driver.
- **Peer Review in aula**: flashcard proiettate, voto verde/giallo/rosso dei gruppi in tempo reale, esito.
- **Attività**: stato di ogni attività (bozza, in arrivo, attiva, archiviata) e obblighi (log dei prompt, riflessione).
- **Team**: elenco di team e accessi individuali, esportazione CSV, eliminazione.
- **Crazy 8**, **HMW**, **Contest**: pannelli delle singole attività.
- **Testi**: i testi di presentazione del corso.
- **Corso & Form**: nome, codice, visibilità, i 4 driver (con modelli pronti), password, archiviazione.

## 5. Le attività in breve

- **Design Case Studies**: i gruppi caricano casi studio con un form a passi (caso, temi a categorie, valutazione sui 4 driver con motivazione, riepilogo); il docente li vede su matrice, radar, cluster, slide, e li discute in peer review.
- **Crazy 8 + co-creazione generativa**: nove fasi, dai sotto-ambiti agli sketch su carta, alla generazione di immagini con l'AI partendo dagli sketch, fino a moodboard, valutazione e presentazione del concept.
- **HMW + role-prompting**: gli How Might We evolvono da v1 a v2 con changelog, e vengono messi alla prova da ruoli simulati dall'AI che fanno solo domande, mai proposte.
- **Contest del progetto migliore**: proposte caricate dai docenti (o anche dagli studenti), voto anonimo da remoto con countdown, dati del voto in diretta con mappa, voto dal vivo del pubblico, schermo da proiettare con la gara e la rivelazione del vincitore.

## 6. Principi che lo tengono insieme

- **Il corso è il confine di tutto**: dati, team, attività e voti non si mescolano tra corsi.
- **Il client non scrive mai direttamente**: ogni scrittura passa da funzioni del database che verificano password o team; le password stanno solo come hash.
- **Configurare invece di cablare**: driver, tag, testi, stato delle attività si cambiano dai pannelli, non dal codice.
- **Mobile come vista**: stessi contenuti, contenitori diversi (pannelli dal basso, menu a schede, pannelli scorrevoli).
- **Un linguaggio visivo solo**: carta calda, inchiostro, ambra; movimenti morbidi; testi essenziali con approfondimenti a richiesta.
- **Anonimato dove serve**: nel Contest nessuno, nemmeno il docente, può vedere chi ha votato cosa.

## 7. Stato attuale e limiti noti

- Stack: Next.js 13 (app router), React 18, Tailwind, Supabase (PostgreSQL + RLS + Realtime), Gemini per le funzioni AI, deploy pensato per Vercel.
- Accessi senza account veri (niente Supabase Auth): chi usa direttamente le API può leggere dati non sensibili di altri corsi, non modificarli.
- La password del team resta nel browser per precompilare le consegne: livello di sicurezza "basso ma sufficiente" scelto consapevolmente.
- La geolocalizzazione del voto è affidabile su Vercel (header della richiesta); altrove dipende da un servizio pubblico.
- Il file `supabase/setup_completo.sql` può essere indietro: per un database nuovo valgono le migrazioni in ordine.
