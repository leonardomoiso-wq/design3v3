// Registro delle "attività" del laboratorio mostrate in home page.
// Per aggiungere una nuova attività in futuro: costruisci le sue pagine
// sotto app/<nuova-attivita>/ e aggiungi qui una nuova voce — la home
// page la mostra automaticamente, attiva o "in arrivo" a seconda dello
// stato.
export type Attivita = {
  id: string;
  titolo: string;
  descrizione: string;
  icona: string;
  hrefStudente?: string;
  hrefDocente?: string;
  stato: 'attiva' | 'prossimamente';
};

export const ATTIVITA: Attivita[] = [
  {
    id: 'case-studies',
    titolo: 'Design Case Studies',
    descrizione: 'Sottomissione dei progetti, matrice IDEO, radar multicriterio e peer review con voto di gruppo in tempo reale.',
    icona: '🗂️',
    hrefStudente: '/student',
    hrefDocente: '/teacher',
    stato: 'attiva',
  },
  {
    id: 'prossima-attivita',
    titolo: 'Prossima Attività',
    descrizione: 'Un nuovo modulo del laboratorio arriverà qui, con lo stesso accesso studenti/docente.',
    icona: '✨',
    stato: 'prossimamente',
  },
];
