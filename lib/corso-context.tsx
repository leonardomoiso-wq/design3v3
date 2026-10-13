'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { caricaCorsoPerCodice, caricaCorsoPerId, type Corso } from './corsi';

// Il corso (ecosistema) in cui si trova lo studente: ogni pagina studente
// legge e scrive solo dati di questo corso. La scelta resta salvata nel
// browser; un link con "?corso=<codice>" la imposta direttamente (utile
// per corsi non elencati in home).

const CHIAVE_CORSO = 'edu_corso_id';

type CorsoContextValue = {
  corso: Corso | null;
  pronto: boolean;
  scegliCorso: (corso: Corso) => void;
  lasciaCorso: () => void;
};

const CorsoContext = createContext<CorsoContextValue | null>(null);

export function CorsoProvider({ children }: { children: React.ReactNode }) {
  const [corso, setCorso] = useState<Corso | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const carica = async () => {
      let trovato: Corso | null = null;
      try {
        const codiceUrl = new URLSearchParams(window.location.search).get('corso');
        if (codiceUrl) trovato = await caricaCorsoPerCodice(codiceUrl);
        if (!trovato) {
          const salvato = localStorage.getItem(CHIAVE_CORSO);
          // Si ricarica sempre dal database: nome e configurazione dei
          // driver possono essere cambiati dal/dalla docente nel frattempo.
          if (salvato) trovato = await caricaCorsoPerId(salvato);
        }
      } catch {
        // storage o rete non disponibili: si riparte dalla scelta del corso
      }
      if (trovato?.archiviato) trovato = null;
      if (trovato) {
        try { localStorage.setItem(CHIAVE_CORSO, trovato.id); } catch { /* non bloccante */ }
      }
      setCorso(trovato);
      setPronto(true);
    };
    carica();
  }, []);

  const scegliCorso = useCallback((nuovo: Corso) => {
    setCorso(nuovo);
    try { localStorage.setItem(CHIAVE_CORSO, nuovo.id); } catch { /* non bloccante */ }
  }, []);

  const lasciaCorso = useCallback(() => {
    setCorso(null);
    try { localStorage.removeItem(CHIAVE_CORSO); } catch { /* non bloccante */ }
  }, []);

  return <CorsoContext.Provider value={{ corso, pronto, scegliCorso, lasciaCorso }}>{children}</CorsoContext.Provider>;
}

export function useCorso(): CorsoContextValue {
  const ctx = useContext(CorsoContext);
  if (!ctx) throw new Error('useCorso deve essere usato dentro CorsoProvider (app/layout.tsx)');
  return ctx;
}
