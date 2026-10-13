'use client';
import { createContext, useContext } from 'react';
import type { Corso } from './corsi';

export type CorsoDocente = Corso & { passcode: string; amministratore: boolean };

export type DocenteContextValue = {
  // Password che apre il corso selezionato: è quella da passare alle
  // funzioni docente_* del database.
  passcode: string;
  corso: CorsoDocente;
  corsi: CorsoDocente[];
  amministratore: boolean;
  cambiaCorso: (id: string) => void;
  ricaricaCorsi: (idDaSelezionare?: string) => Promise<void>;
  logout: () => void;
};

export const DocenteContext = createContext<DocenteContextValue | null>(null);

export function useDocente(): DocenteContextValue {
  const ctx = useContext(DocenteContext);
  if (!ctx) {
    throw new Error('useDocente deve essere usato dentro app/teacher/layout.tsx');
  }
  return ctx;
}

// La sessione docente può contenere più password (una per corso, o quella
// di amministrazione che li apre tutti). Resta solo per la durata della scheda.
export const CHIAVE_PASSWORD_DOCENTE = 'edu_docente_passwords';

export function leggiPasswordSessione(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(CHIAVE_PASSWORD_DOCENTE) || '[]');
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function aggiungiPasswordSessione(pw: string): string[] {
  const passwords = Array.from(new Set([...leggiPasswordSessione(), pw]));
  try { sessionStorage.setItem(CHIAVE_PASSWORD_DOCENTE, JSON.stringify(passwords)); } catch { /* non bloccante */ }
  return passwords;
}
