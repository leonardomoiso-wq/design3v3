export type ChiaveDriver = 'desiderabilita' | 'fattibilita' | 'responsabilita' | 'vitalita';

export type Driver = Record<ChiaveDriver, number>;

const CHIAVI: ChiaveDriver[] = ['desiderabilita', 'fattibilita', 'responsabilita', 'vitalita'];

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

export function normalizzaDriver(driver: any, fallback = 50): Driver {
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
