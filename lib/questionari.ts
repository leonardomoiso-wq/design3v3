// Questionari anonimi di fine percorso, sul modello dei questionari
// «Feedback Game» e «Territorial Quest»:
// - domande da 1 a 5; se la risposta è estrema (1 o 5) si chiede di
//   spiegare, dove previsto (approfondimento, es. Q2.1);
// - l'impatto dentro il team (Q9–Q11 nel modello) e tra i team (Q12–Q13);
// - risposte aperte (Q14–Q17).
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
    descrizione: 'Seconda parte dei casi studio: matrice 2×2, radar multicriterio, revisione tra pari e voto in aula.',
    attivita: 'design_case_studies',
    domande: [
      {
        id: 'casi_matrice', tipo: 'scala',
        testo: 'Credi che la matrice 2×2 e il radar multicriterio ti abbiano aiutato a confrontare i casi e a riconoscere spazi di opportunità?',
        approfondimento: 'Specifica cosa ti è servito (o non ti è servito) nel vedere i casi sulla matrice e sul radar.',
      },
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
        testo: 'Credi che leggere insieme le domande sul wall (stelle, domande da ritoccare, nuova lettura) abbia migliorato la qualità delle vostre domande?',
        approfondimento: 'Specifica come il wall e il confronto in aula hanno influenzato positivamente o negativamente le vostre domande.',
      },
    ],
  },
  {
    id: 'crazy8',
    titolo: 'Crazy 8 e AI generativa',
    descrizione: 'Sketch a tempo e miglioramento con l\'AI generativa.',
    attivita: 'crazy8_ai',
    domande: [
      {
        id: 'c8_sketch', tipo: 'scala',
        testo: 'Credi che disegnare da 5 a 8 sketch a tempo ti abbia aiutato a generare idee diverse e a superare la prima idea?',
        approfondimento: 'Specifica cosa ti ha aiutato o ostacolato nel disegnare gli sketch a tempo.',
      },
      {
        id: 'c8_ai', tipo: 'scala',
        testo: 'Quanto sei stato soddisfatto, a livello personale, nel migliorare gli sketch con l\'AI generativa (configuratore del prompt, immagini generate)?',
        approfondimento: 'Quali aspetti del lavoro con l\'AI generativa ti hanno soddisfatto o deluso, e perché?',
      },
    ],
  },
  {
    id: 'team',
    titolo: 'Il team',
    descrizione: 'Collaborazione, competenze e motivazione nel confronto tra team.',
    domande: [
      { id: 'team_collaborazione', tipo: 'scala', testo: 'Come valuti la collaborazione e la comunicazione all\'interno del tuo team?' },
      { id: 'team_competenze', tipo: 'scala', testo: 'In che misura le competenze individuali dei membri del tuo team si sono completate tra loro?' },
      {
        id: 'team_motivazione', tipo: 'scala',
        testo: 'Quanto il confronto con gli altri team (voti, stelle, classifiche, presentazioni) ha influenzato la tua motivazione?',
        approfondimento: 'Puoi condividere esperienze in cui il confronto con gli altri team ha avuto un impatto sulla tua motivazione, positivo o negativo?',
      },
    ],
  },
  {
    id: 'impatto_team',
    titolo: 'Dentro il tuo team',
    descrizione: 'Valuta l\'impatto delle attività all\'interno del team (Q9–Q11 nel modello).',
    gruppo: 'Valuta l\'impatto delle attività all\'interno del tuo team.',
    domande: [
      { id: 'imp_competizione_team', tipo: 'scala', testo: 'Livello di competizione nel team' },
      { id: 'imp_collaborazione_team', tipo: 'scala', testo: 'Collaborazione nel team' },
      { id: 'imp_produttivita_team', tipo: 'scala', testo: 'Produttività del team' },
    ],
  },
  {
    id: 'impatto_corso',
    titolo: 'Tra i team del corso',
    descrizione: 'Valuta l\'impatto delle attività tra il proprio team e gli altri (Q12–Q13 nel modello).',
    gruppo: 'Valuta l\'impatto delle attività tra il tuo team e gli altri team del corso.',
    domande: [
      { id: 'imp_competizione_corso', tipo: 'scala', testo: 'Livello di competizione tra i team' },
      { id: 'imp_collaborazione_corso', tipo: 'scala', testo: 'Collaborazione tra i team del corso' },
    ],
  },
  {
    id: 'aperte',
    titolo: 'Le tue parole',
    descrizione: 'Risposte aperte (Q14–Q17 nel modello).',
    domande: [
      { id: 'ap_obiettivo', tipo: 'aperta', testo: 'Come hai interpretato l\'obiettivo delle attività quando le abbiamo presentate all\'inizio?' },
      { id: 'ap_esempi', tipo: 'aperta', testo: 'Potresti fornire esempi di come le attività hanno influenzato, positivamente o negativamente, il progetto e l\'apprendimento del team?' },
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
