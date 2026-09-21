// Testi di storytelling e introduzione alla piattaforma, editabili dal
// pannello docente (tabella contenuto_piattaforma). Questi valori sono
// il fallback usato finché il/la docente non li personalizza.

export const TESTI_DEFAULT = {
  incipit_badge: 'Laboratorio di Design 3',
  incipit_titolo: 'Prima di entrare, formate il vostro team.',
  incipit_testo:
    "Ogni attività del laboratorio — casi studio, Crazy 8, HMW — si costruisce insieme, come team. " +
    "Bastano un nome e una password scelti da voi: da qui in poi l'app vi riconoscerà, senza doverli reinserire ogni volta.",
  incipit_nota:
    'O saltate il login con "Accesso Studente diretto" qui sopra: potrete comunque partecipare alle attività, inserendo nome e codice di gruppo a mano quando richiesto.',
  home_badge: 'Laboratorio di Design 3',
  home_titolo: 'Esplorare per progettare il cambiamento.',
  home_sottotitolo: 'Le attività del laboratorio, tutte da qui. Scegli quella a cui vuoi partecipare.',
} as const;

export type ChiaveTestoPiattaforma = keyof typeof TESTI_DEFAULT;

export const CAMPI_TESTI: { chiave: ChiaveTestoPiattaforma; etichetta: string; righe: number }[] = [
  { chiave: 'incipit_badge', etichetta: 'Schermata iniziale — Badge', righe: 1 },
  { chiave: 'incipit_titolo', etichetta: 'Schermata iniziale — Titolo', righe: 2 },
  { chiave: 'incipit_testo', etichetta: 'Schermata iniziale — Testo', righe: 4 },
  { chiave: 'incipit_nota', etichetta: 'Schermata iniziale — Nota sotto il pulsante', righe: 3 },
  { chiave: 'home_badge', etichetta: 'Home — Badge', righe: 1 },
  { chiave: 'home_titolo', etichetta: 'Home — Titolo', righe: 2 },
  { chiave: 'home_sottotitolo', etichetta: 'Home — Sottotitolo', righe: 2 },
];

export function unisciTestiPiattaforma(righe: { chiave: string; valore: string }[] | null | undefined) {
  const testi = { ...TESTI_DEFAULT };
  (righe || []).forEach(r => {
    if (r.chiave in testi) {
      (testi as any)[r.chiave] = r.valore;
    }
  });
  return testi;
}
