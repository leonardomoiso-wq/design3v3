export type ChiaveDriver = 'desiderabilita' | 'fattibilita' | 'responsabilita' | 'vitalita';

export type Driver = Record<ChiaveDriver, number>;

const CHIAVI: ChiaveDriver[] = ['desiderabilita', 'fattibilita', 'responsabilita', 'vitalita'];

// Scala di valutazione dei 4 driver: 0-5 (stile Likert), più semplice e
// veloce da assegnare — sia in fase di caricamento sia a voce durante il
// debate in aula — rispetto alla precedente 0-100.
export const MAX_DRIVER = 5;

// I dati salvati in precedenza possono avere ogni driver come numero semplice
// oppure come oggetto { valore, nota } (motivazione testuale). Questa funzione
// normalizza entrambe le forme in numeri semplici, evitando di passare un
// oggetto a React come figlio (causerebbe un crash a runtime).
function estraiValore(v: unknown, fallback: number): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (v && typeof v === 'object' && typeof (v as any).valore === 'number') {
    return (v as any).valore;
  }
  return fallback;
}

export function estraiNota(driver: any, chiave: ChiaveDriver): string {
  const v = driver?.[chiave];
  if (v && typeof v === 'object' && typeof v.nota === 'string') return v.nota;
  return '';
}

export function normalizzaDriver(driver: any, fallback = Math.round(MAX_DRIVER / 2)): Driver {
  const risultato = {} as Driver;
  for (const chiave of CHIAVI) {
    risultato[chiave] = estraiValore(driver?.[chiave], fallback);
  }
  return risultato;
}

export type NoteDriver = Record<ChiaveDriver, string>;

export function estraiNote(driver: any): NoteDriver {
  const risultato = {} as NoteDriver;
  for (const chiave of CHIAVI) {
    risultato[chiave] = estraiNota(driver, chiave);
  }
  return risultato;
}

// Costruisce il payload da salvare: ogni driver diventa { valore, nota },
// così il "perché" scritto dagli studenti resta insieme al punteggio.
export function costruisciDriver(valori: Driver, note: Partial<NoteDriver>): Record<ChiaveDriver, { valore: number; nota: string }> {
  const risultato = {} as Record<ChiaveDriver, { valore: number; nota: string }>;
  for (const chiave of CHIAVI) {
    risultato[chiave] = { valore: valori[chiave], nota: (note[chiave] || '').trim() };
  }
  return risultato;
}

// La matrice globale posiziona le schede su uno spazio schermo fisso
// -100..100, indipendente dalla scala dei driver (MAX_DRIVER). Queste due
// funzioni sono l'unico punto di conversione fra i due, usate sia al primo
// salvataggio (studente) sia quando il docente trascina una scheda (matrice).
export function coordinateDaDriver(desiderabilita: number, fattibilita: number, responsabilita: number, vitalita: number) {
  const fattoreScala = 100 / MAX_DRIVER;
  return {
    x: (fattibilita - desiderabilita) * fattoreScala,
    y: (vitalita - responsabilita) * fattoreScala,
  };
}

export function driverDaCoordinate(x: number, y: number): Driver {
  const meta = MAX_DRIVER / 2;
  const k = MAX_DRIVER / 200;
  const clamp = (v: number) => Math.max(0, Math.min(MAX_DRIVER, Math.round(v)));
  return {
    desiderabilita: clamp(meta - x * k),
    fattibilita: clamp(meta + x * k),
    responsabilita: clamp(meta + y * k),
    vitalita: clamp(meta - y * k),
  };
}
