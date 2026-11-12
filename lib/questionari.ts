// Questionari anonimi di fine percorso, sul modello dei questionari
// «Feedback Game» e «Territorial Quest»:
// - domande da 1 a 5; se la risposta è estrema (1 o 5) si chiede di
//   spiegare, dove previsto (approfondimento, es. Q2.1);
// - risposte aperte (Q14–Q17).
// Le domande sui team del modello (Q4–Q5, Q8–Q13) qui non ci sono: i team
// cambiano da un'attività all'altra e le risposte sarebbero poco confrontabili.
// Ogni corso compone il suo questionario scegliendo le parti (moduli) e
// le singole domande: non tutte le classi fanno tutte le attività.
// Le domande hanno un id stabile (es. 'casi_scheda'), così i risultati si
// confrontano tra corsi; il numero (Q1, Q2…) dipende da cosa si sceglie.

export type Domanda =
  | { id: string; tipo: 'scala'; testo: string; approfondimento?: string }
  | { id: string; tipo: 'aperta'; testo: string };

export type Modulo = {
  id: string;
  titolo: string;          // come appare allo studente
  descrizione: string;     // per il docente, nel pannello
  attivita?: string;       // tipo di attività a cui si riferisce
  // domande «valuta l'impatto…» raggruppate sotto una frase comune
  gruppo?: string;
  domande: Domanda[];
};

// Apertura di ogni questionario, se il docente non ne scrive una sua
export const INTRO_PREDEFINITA = [
  'Con questo questionario raccogliamo la tua esperienza con le attività del corso: cosa ha funzionato, cosa no, cosa cambieresti.',
  'È anonimo: non chiediamo nome, team né altri dati, e leggiamo le risposte solo tutte insieme. Ci servono per migliorare le attività per le prossime classi e per capire come introdurre al meglio strumenti come l\'AI generativa nella didattica del design.',
  'Le valutazioni da 1 a 5 sono obbligatorie. Le risposte aperte no, ma se riesci a scrivere anche solo qualche riga lo apprezziamo molto: è lì che capiamo meglio. Ci vogliono una decina di minuti.',
];

export const SCALA = [
  { valore: 1, etichetta: 'Per niente' },
  { valore: 2, etichetta: 'Poco' },
  { valore: 3, etichetta: 'Neutro' },
  { valore: 4, etichetta: 'Abbastanza' },
  { valore: 5, etichetta: 'Molto' },
] as const;

export const chiedeApprofondimento = (valore: unknown) => valore === 1 || valore === 5;

export const MODULI: Modulo[] = [
  {
    id: 'generale',
    titolo: 'Il corso',
    descrizione: 'L\'approccio del corso nel suo insieme.',
    domande: [
      {
        id: 'gen_concreto', tipo: 'scala',
        testo: 'Ritieni che l\'approccio adottato nel corso abbia reso l\'apprendimento più concreto e direttamente applicabile alle sfide del design nella vita reale?',
        approfondimento: 'Spiega quali aspetti hanno influenzato la tua esperienza di apprendimento, positivamente o negativamente.',
      },
      {
        id: 'gen_piattaforma', tipo: 'scala',
        testo: 'Credi che usare la piattaforma per raccogliere, condividere e rivedere il lavoro abbia contribuito a migliorare il tuo coinvolgimento nel corso?',
        approfondimento: 'Specifica cosa ha reso la piattaforma particolarmente utile o inadeguata per te.',
      },
    ],
  },
  {
    id: 'casi_raccolta',
    titolo: 'Casi studio: raccogliere e classificare',
    descrizione: 'Prima parte dei casi studio: scheda del caso, temi (tag), valutazione sui 4 driver.',
    attivita: 'design_case_studies',
    domande: [
      {
        id: 'casi_scheda', tipo: 'scala',
        testo: 'Credi che compilare la scheda di ogni caso studio (dati, fonte, immagine, descrizione) ti abbia aiutato a leggere i progetti con più attenzione?',
        approfondimento: 'Specifica cosa ha reso la scheda del caso studio particolarmente utile o inadeguata per te.',
      },
      {
        id: 'casi_classifica', tipo: 'scala',
        testo: 'Credi che classificare i casi con i temi (tag) e valutarli sui 4 driver abbia contribuito a migliorare la tua comprensione dell\'innovazione?',
        approfondimento: 'Specifica come tag e driver hanno influenzato positivamente o negativamente la tua analisi.',
      },
    ],
  },
  {
    id: 'casi_confronto',
    titolo: 'Casi studio: confrontare e discutere',
    descrizione: 'Seconda parte dei casi studio: revisione tra pari e voto in aula.',
    attivita: 'design_case_studies',
    domande: [
      {
        id: 'casi_revisione', tipo: 'scala',
        testo: 'Quanto sei stato soddisfatto, a livello personale, della revisione tra pari e del voto in aula sui casi studio?',
        approfondimento: 'Quali aspetti della revisione e del voto in aula ti hanno soddisfatto o deluso, e perché?',
      },
    ],
  },
  {
    id: 'hmw',
    titolo: 'Le domande «Come potremmo…»',
    descrizione: 'HMW: formula a spazi, contesti, lettura insieme sul wall.',
    attivita: 'crazy8_ai',
    domande: [
      {
        id: 'hmw_formula', tipo: 'scala',
        testo: 'Credi che comporre le domande con la formula «Come potremmo … per … così che …?» ti abbia aiutato a definire meglio il problema?',
        approfondimento: 'Specifica cosa ha reso la formula particolarmente utile o inadeguata per te.',
      },
      {
        id: 'hmw_wall', tipo: 'scala',
        testo: 'Credi che leggere insieme le domande sul wall, ritoccarle e chiederne una nuova lettura abbia migliorato la qualità delle vostre domande?',
        approfondimento: 'Specifica come il wall e il confronto in aula hanno influenzato positivamente o negativamente le vostre domande.',
      },
    ],
  },
  {
    id: 'crazy8',
    titolo: 'Crazy 8: gli sketch',
    descrizione: 'Sketch a mano, a tempo.',
    attivita: 'crazy8_ai',
    domande: [
      {
        id: 'c8_sketch', tipo: 'scala',
        testo: 'Credi che disegnare da 5 a 8 sketch a tempo ti abbia aiutato a generare idee diverse e a superare la prima idea?',
        approfondimento: 'Specifica cosa ti ha aiutato o ostacolato nel disegnare gli sketch a tempo.',
      },
    ],
  },
  {
    id: 'ai',
    titolo: 'AI generativa: dallo sketch all\'immagine',
    descrizione: 'Image-to-image, configuratore del prompt, risultati rispetto agli sketch, uso consapevole dell\'AI e suo posto nella didattica.',
    attivita: 'crazy8_ai',
    domande: [
      {
        id: 'ai_img2img', tipo: 'scala',
        testo: 'Credi che la tecnica image-to-image (generare l\'immagine partendo dal tuo sketch) ti abbia permesso di mantenere il controllo sull\'idea, rispetto a generare un\'immagine solo da un testo?',
        approfondimento: 'Spiega in che modo partire dallo sketch ha guidato, o limitato, il risultato dell\'AI.',
      },
      {
        id: 'ai_prompt', tipo: 'scala',
        testo: 'Credi che il configuratore del prompt ti abbia aiutato a capire come scrivere un prompt efficace?',
        approfondimento: 'Specifica cosa del configuratore ti è stato utile, o cosa ti è mancato.',
      },
      {
        id: 'ai_fedelta', tipo: 'scala',
        testo: 'Quanto le immagini generate dall\'AI sono rimaste fedeli alle idee dei vostri sketch?',
        approfondimento: 'Descrivi cosa l\'AI ha aggiunto, perso o cambiato rispetto agli sketch.',
      },
      {
        id: 'ai_valore', tipo: 'scala',
        testo: 'Quanto le immagini generate hanno aggiunto valore agli sketch (comunicare meglio l\'idea, scoprire varianti, rendere il concept più credibile)?',
        approfondimento: 'Fai un esempio di un\'immagine generata che ha migliorato, o peggiorato, uno sketch.',
      },
      {
        id: 'ai_consapevole', tipo: 'scala',
        testo: 'Ritieni che l\'approccio adottato (prima lo sketch a mano, poi il prompt costruito passo per passo, poi l\'AI) abbia migliorato e reso più consapevole il tuo utilizzo dell\'AI generativa?',
        approfondimento: 'Spiega cosa è cambiato nel tuo modo di usare l\'AI, o perché non è cambiato.',
      },
      {
        id: 'ai_introdurre', tipo: 'scala',
        testo: 'Credi che l\'AI generativa sia uno strumento da introdurre maggiormente nei corsi di design?',
        approfondimento: 'Spiega perché, e in quali momenti del progetto la useresti.',
      },
      {
        id: 'ai_modo', tipo: 'scala',
        testo: 'Ritieni che questo approccio (l\'AI come passo dopo lo sketch a mano, non al suo posto) sia un modo corretto di introdurla nella didattica del design?',
        approfondimento: 'Spiega cosa cambieresti nel modo in cui l\'abbiamo introdotta.',
      },
      { id: 'ai_futuro', tipo: 'aperta', testo: 'Come pensi di usare l\'AI generativa nei tuoi prossimi progetti?' },
    ],
  },
  {
    id: 'aperte',
    titolo: 'Le tue parole',
    descrizione: 'Risposte aperte, come Q14–Q17 nel modello.',
    domande: [
      { id: 'ap_obiettivo', tipo: 'aperta', testo: 'Come hai interpretato l\'obiettivo delle attività quando le abbiamo presentate all\'inizio?' },
      { id: 'ap_esempi', tipo: 'aperta', testo: 'Potresti fornire esempi di come le attività hanno influenzato, positivamente o negativamente, il vostro progetto e il tuo apprendimento?' },
      { id: 'ap_positivo', tipo: 'aperta', testo: 'Quali elementi del corso ti hanno lasciato una sensazione positiva, e perché?' },
      { id: 'ap_migliorare', tipo: 'aperta', testo: 'Quali aspetti andrebbero migliorati per rendere l\'esperienza più coinvolgente e soddisfacente?' },
    ],
  },
];

export const TUTTE_LE_DOMANDE = MODULI.flatMap(m => m.domande);

// Proposta iniziale in base alle attività del corso: le parti generali
// sempre, quelle delle attività solo se il corso le ha.
export function domandePredefinite(tipiAttivita: string[]): string[] {
  return MODULI.filter(m => !m.attivita || tipiAttivita.includes(m.attivita)).flatMap(m => m.domande.map(d => d.id));
}

export type Voce = { modulo: Modulo; domande: { domanda: Domanda; numero: string }[] };

// Il questionario così come lo vede lo studente: solo le domande scelte,
// nell'ordine dei moduli, numerate Q1, Q2…
export function componi(scelte: string[]): Voce[] {
  const set = new Set(scelte);
  let n = 0;
  return MODULI
    .map(modulo => ({ modulo, domande: modulo.domande.filter(d => set.has(d.id)).map(domanda => ({ domanda, numero: `Q${++n}` })) }))
    .filter(v => v.domande.length > 0);
}

// Colonne per risultati e CSV: domanda e, se c'è, il suo approfondimento
export function colonne(scelte: string[]): { chiave: string; numero: string; testo: string; tipo: 'scala' | 'testo' }[] {
  return componi(scelte).flatMap(v => v.domande.flatMap(({ domanda, numero }) => [
    { chiave: domanda.id, numero, testo: domanda.testo, tipo: domanda.tipo === 'scala' ? 'scala' as const : 'testo' as const },
    ...(domanda.tipo === 'scala' && domanda.approfondimento ? [{ chiave: `${domanda.id}__perche`, numero: `${numero}.1`, testo: domanda.approfondimento, tipo: 'testo' as const }] : []),
  ]));
}

export type Risposte = Record<string, number | string>;
