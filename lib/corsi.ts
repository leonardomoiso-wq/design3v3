import { supabase } from './supabase';
import type { ChiaveDriver } from './driver';

export { NOME_PIATTAFORMA } from './brand';

export type DriverConfig = { chiave: ChiaveDriver; etichetta: string; domanda: string };

export type ConfigurazioneCorso = {
  framework: string;
  istruzioni: string;
  driver: DriverConfig[];
};

export type Corso = {
  id: string;
  nome: string;
  codice: string;
  descrizione: string;
  visibile_in_home: boolean;
  archiviato: boolean;
  configurazione: ConfigurazioneCorso;
  created_at?: string;
};

// La tabella corsi contiene anche l'hash della password, non leggibile dal
// client: le colonne vanno sempre elencate esplicitamente (mai "*").
export const COLONNE_CORSO = 'id, nome, codice, descrizione, visibile_in_home, archiviato, configurazione, created_at';

export const CHIAVI_DRIVER: ChiaveDriver[] = ['desiderabilita', 'fattibilita', 'responsabilita', 'vitalita'];

// I 4 driver restano salvati con le chiavi storiche usate come "slot":
// ogni corso ne cambia etichetta e domanda guida. Sulla matrice lo slot 1
// è in alto a sinistra, il 2 in alto a destra, il 3 in basso a sinistra,
// il 4 in basso a destra.
export const DRIVER_IDEO: DriverConfig[] = [
  { chiave: 'desiderabilita', etichetta: 'Desiderabilità', domanda: 'Le persone (o le altre specie coinvolte) desiderano davvero questa soluzione? Risponde a un bisogno reale e sentito?' },
  { chiave: 'fattibilita', etichetta: 'Fattibilità', domanda: 'È realizzabile con le tecnologie, i materiali e le competenze che avete a disposizione oggi?' },
  { chiave: 'responsabilita', etichetta: 'Responsabilità', domanda: 'Avete considerato gli impatti etici, sociali e ambientali — anche su chi non ha voce in capitolo?' },
  { chiave: 'vitalita', etichetta: 'Vitalità', domanda: 'Può reggersi nel tempo? È sostenibile a livello economico, ecologico e sociale, non solo nel breve periodo?' },
];

export const CONFIGURAZIONE_PREDEFINITA: ConfigurazioneCorso = {
  framework: 'IDEO 4-Driver',
  istruzioni: '',
  driver: DRIVER_IDEO,
};

// Modelli pronti da cui partire nel pannello del corso.
export const MODELLI_DRIVER: { nome: string; framework: string; driver: [string, string][] }[] = [
  { nome: 'IDEO (predefinito)', framework: 'IDEO 4-Driver', driver: DRIVER_IDEO.map(d => [d.etichetta, d.domanda]) },
  {
    nome: 'Sostenibilità',
    framework: 'Quattro pilastri della sostenibilità',
    driver: [
      ['Ambientale', 'Quanto riduce l’impatto su risorse, ecosistemi e clima lungo tutto il ciclo di vita?'],
      ['Sociale', 'Migliora la vita delle persone e delle comunità coinvolte, in modo equo e inclusivo?'],
      ['Economica', 'Sta in piedi economicamente, per chi la produce e per chi la usa?'],
      ['Culturale', 'Valorizza saperi, identità e pratiche locali invece di cancellarli?'],
    ],
  },
  {
    nome: 'Esperienza d’uso',
    framework: 'UX 4 qualità',
    driver: [
      ['Utilità', 'Risolve un problema concreto delle persone a cui si rivolge?'],
      ['Usabilità', 'È facile da capire e usare al primo tentativo, senza istruzioni?'],
      ['Accessibilità', 'Funziona anche per chi ha disabilità o contesti d’uso diversi?'],
      ['Piacevolezza', 'Suscita emozioni positive, fiducia, voglia di tornare a usarla?'],
    ],
  },
];

// Unisce la configurazione salvata con quella predefinita: un corso con
// configurazione parziale o vecchia non deve mai rompere le pagine.
export function normalizzaConfigurazione(config: any): ConfigurazioneCorso {
  const driverSalvati: any[] = Array.isArray(config?.driver) ? config.driver : [];
  return {
    framework: typeof config?.framework === 'string' && config.framework.trim() ? config.framework : CONFIGURAZIONE_PREDEFINITA.framework,
    istruzioni: typeof config?.istruzioni === 'string' ? config.istruzioni : '',
    driver: CHIAVI_DRIVER.map((chiave, i) => {
      const salvato = driverSalvati.find(d => d?.chiave === chiave) || driverSalvati[i];
      const base = DRIVER_IDEO[i];
      return {
        chiave,
        etichetta: (typeof salvato?.etichetta === 'string' && salvato.etichetta.trim()) || base.etichetta,
        domanda: typeof salvato?.domanda === 'string' ? salvato.domanda : base.domanda,
      };
    }),
  };
}

export function normalizzaCorso(riga: any): Corso {
  return {
    id: riga.id,
    nome: riga.nome,
    codice: riga.codice,
    descrizione: riga.descrizione || '',
    visibile_in_home: riga.visibile_in_home ?? true,
    archiviato: riga.archiviato ?? false,
    configurazione: normalizzaConfigurazione(riga.configurazione),
    created_at: riga.created_at,
  };
}

// Etichetta di un driver nella configurazione del corso.
export function etichettaDriver(config: ConfigurazioneCorso, chiave: ChiaveDriver): string {
  return config.driver.find(d => d.chiave === chiave)?.etichetta || chiave;
}

export async function caricaCorsoPerId(id: string): Promise<Corso | null> {
  const { data } = await supabase.from('corsi').select(COLONNE_CORSO).eq('id', id).maybeSingle();
  return data ? normalizzaCorso(data) : null;
}

export async function caricaCorsoPerCodice(codice: string): Promise<Corso | null> {
  const { data } = await supabase.from('corsi').select(COLONNE_CORSO).ilike('codice', codice.trim()).maybeSingle();
  return data ? normalizzaCorso(data) : null;
}

export async function caricaCorsiPubblici(): Promise<Corso[]> {
  const { data } = await supabase
    .from('corsi')
    .select(COLONNE_CORSO)
    .eq('visibile_in_home', true)
    .eq('archiviato', false)
    .order('created_at', { ascending: true });
  return (data || []).map(normalizzaCorso);
}

export function messaggioErroreCorso(codice: string): string {
  switch (codice) {
    case 'nome_troppo_corto': return 'Il nome del corso deve avere almeno 2 caratteri.';
    case 'codice_troppo_corto': return 'Il codice del corso deve avere almeno 3 caratteri (lettere o numeri).';
    case 'codice_gia_usato': return 'Questo codice è già usato da un altro corso: scegline un altro.';
    case 'password_troppo_corta': return 'La password del corso deve avere almeno 6 caratteri.';
    case 'driver_non_validi': return 'Servono 4 driver, ognuno con un nome.';
    case 'conferma_errata': return 'Il nome scritto non corrisponde a quello del corso.';
    case 'passcode_errato': return 'Password non valida per questa operazione.';
    default: return 'Qualcosa è andato storto. Riprova.';
  }
}
