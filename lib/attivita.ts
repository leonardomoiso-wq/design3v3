// Le attività del laboratorio sono ora gestite dal/dalla docente a runtime
// (tabella `attivita` su Supabase, pannello in app/teacher/attivita) invece
// che da un array statico: titolo, descrizione, stato e obbligatorietà dei
// campi possono cambiare senza toccare il codice.
//
// Questo file resta comunque il punto in cui si registra un nuovo MODULO di
// pagine: uno "stato" o un "titolo" si possono cambiare dal pannello, ma una
// pagina sotto app/<...> va comunque scritta e agganciata qui tramite il suo
// "tipo". Un'attività può esistere ed essere visibile prima che il suo
// modulo esista (stato 'prossimamente'): diventa avviabile solo da quando
// compare qui.

export type StatoAttivita = 'bozza' | 'prossimamente' | 'attiva' | 'archiviata';

// Forma della riga così come arriva da Supabase (select * from attivita).
export type AttivitaRow = {
  id: string;
  titolo: string;
  descrizione: string | null;
  tipo: string;
  ordine: number;
  stato: StatoAttivita;
  richiedi_log_prompt: boolean;
  richiedi_riflessione: boolean;
};

export const MODULI_ATTIVITA: Record<string, { icona: string; hrefStudente?: string; hrefDocente?: string }> = {
  design_case_studies: { icona: '🗂️', hrefStudente: '/student', hrefDocente: '/teacher' },
  crazy8_ai: { icona: '🎨', hrefStudente: '/crazy8', hrefDocente: '/teacher/crazy8' },
  hmw_role_prompting: { icona: '🎭', hrefStudente: '/hmw', hrefDocente: '/teacher/hmw' },
};

export function moduloDi(tipo: string) {
  return MODULI_ATTIVITA[tipo] || { icona: '✨' };
}
