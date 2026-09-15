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
