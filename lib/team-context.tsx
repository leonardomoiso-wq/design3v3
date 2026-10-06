'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { useCorso } from './corso-context';

// Identità di team condivisa in tutta l'app (non solo sotto una singola
// area, a differenza di docente-context.tsx che vive sotto /teacher):
// una volta effettuato l'accesso in app/page.tsx, ogni pagina può leggere
// "chi siamo" da qui per non far reinserire nome/numero gruppo a ogni
// attività. La password resta in chiaro in localStorage (stesso livello
// di sicurezza "basso ma sufficiente" già scelto per il passcode docente):
// serve solo a precompilare i campi, non è una vera sessione autenticata
// lato server. Ogni corso ha i propri team: la sessione è salvata per
// corso, così cambiando corso non ci si ritrova "dentro" un team altrui.

const chiaveSessione = (corsoId: string) => `edu_team_sessione_${corsoId}`;

export type TeamInfo = { id: string; numero: number; nome: string; password: string; membri: string[] };

type TeamContextValue = {
  team: TeamInfo | null;
  pronto: boolean;
  accedi: (team: TeamInfo) => void;
  logout: () => void;
};

const TeamContext = createContext<TeamContextValue | null>(null);

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const { corso, pronto: corsoPronto } = useCorso();
  const corsoId = corso?.id ?? null;
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    if (!corsoPronto) return;
    setTeam(null);
    if (corsoId) {
      try {
        const salvato = localStorage.getItem(chiaveSessione(corsoId));
        if (salvato) setTeam(JSON.parse(salvato));
      } catch {
        // storage non disponibile: si riparte semplicemente senza sessione salvata
      }
    }
    setPronto(true);
  }, [corsoId, corsoPronto]);

  const accedi = (nuovoTeam: TeamInfo) => {
    setTeam(nuovoTeam);
    if (!corsoId) return;
    try { localStorage.setItem(chiaveSessione(corsoId), JSON.stringify(nuovoTeam)); } catch { /* non bloccante */ }
  };

  const logout = () => {
    setTeam(null);
    if (!corsoId) return;
    try { localStorage.removeItem(chiaveSessione(corsoId)); } catch { /* non bloccante */ }
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
