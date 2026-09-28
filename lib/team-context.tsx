'use client';
import { createContext, useContext, useEffect, useState } from 'react';

// Identità di team condivisa in tutta l'app (non solo sotto una singola
// area, a differenza di docente-context.tsx che vive sotto /teacher):
// una volta effettuato l'accesso in app/page.tsx, ogni pagina può leggere
// "chi siamo" da qui per non far reinserire nome/numero gruppo a ogni
// attività. La password resta in chiaro in localStorage (stesso livello
// di sicurezza "basso ma sufficiente" già scelto per il passcode docente):
// serve solo a precompilare i campi, non è una vera sessione autenticata
// lato server.

const CHIAVE_SESSIONE = 'design3_team_sessione';

export type TeamInfo = { id: string; numero: number; nome: string; password: string; membri: string[] };

type TeamContextValue = {
  team: TeamInfo | null;
  pronto: boolean;
  accedi: (team: TeamInfo) => void;
  logout: () => void;
};

const TeamContext = createContext<TeamContextValue | null>(null);

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    try {
      const salvato = localStorage.getItem(CHIAVE_SESSIONE);
      if (salvato) setTeam(JSON.parse(salvato));
    } catch {
      // storage non disponibile: si riparte semplicemente senza sessione salvata
    }
    setPronto(true);
  }, []);

  const accedi = (nuovoTeam: TeamInfo) => {
    setTeam(nuovoTeam);
    try { localStorage.setItem(CHIAVE_SESSIONE, JSON.stringify(nuovoTeam)); } catch { /* non bloccante */ }
  };

  const logout = () => {
    setTeam(null);
    try { localStorage.removeItem(CHIAVE_SESSIONE); } catch { /* non bloccante */ }
  };

  return <TeamContext.Provider value={{ team, pronto, accedi, logout }}>{children}</TeamContext.Provider>;
}

export function useTeam(): TeamContextValue {
  const ctx = useContext(TeamContext);
  if (!ctx) {
    throw new Error('useTeam deve essere usato dentro TeamProvider (app/layout.tsx)');
  }
  return ctx;
}
