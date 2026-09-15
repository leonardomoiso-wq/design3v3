'use client';
import { createContext, useContext } from 'react';

export type DocenteContextValue = {
  passcode: string;
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
