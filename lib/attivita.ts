// Registro delle "attività" del laboratorio mostrate in home page.
// Per aggiungere una nuova attività: costruisci le sue pagine sotto
// app/<nuova-attivita>/ e aggiungi qui una voce. Lo stato (attiva /
// prossimamente / nascosta) si decide dal pannello docente "Attività"
// (tabella attivita_stato); `stato` qui è solo il valore di partenza.
'use client';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type StatoAttivita = 'attiva' | 'prossimamente' | 'nascosta';

export type Attivita = {
  id: string;
  titolo: string;
  descrizione: string;
  icona: string;
  hrefStudente?: string;
  hrefDocente?: string;
  etichettaStudente?: string;
  accesso?: string;
  stato: StatoAttivita;
};

export const ATTIVITA: Attivita[] = [
  {
    id: 'case-studies',
    titolo: 'Design Case Studies',
    descrizione: 'Sottomissione dei progetti, matrice IDEO, radar multicriterio e peer review con voto di gruppo in tempo reale.',
    icona: '🗂️',
    hrefStudente: '/student',
    hrefDocente: '/teacher',
    accesso: 'Di gruppo',
    stato: 'attiva',
  },
  {
    id: 'contest',
    titolo: 'Contest · Il progetto migliore',
    descrizione: 'Le proposte in gara, il voto anonimo da remoto con countdown e il voto dal vivo del pubblico, con il vincitore svelato in aula.',
    icona: '🏆',
    hrefStudente: '/contest',
    hrefDocente: '/teacher/contest',
    accesso: 'Individuale o di gruppo',
    stato: 'prossimamente',
  },
];

export const ETICHETTA_STATO: Record<StatoAttivita, string> = {
  attiva: 'Attiva',
  prossimamente: 'In arrivo',
  nascosta: 'Nascosta',
};

// Stati salvati dal docente, con il registro come valore di partenza.
export function useStatiAttivita() {
  const [stati, setStati] = useState<Record<string, StatoAttivita>>({});
  const [pronto, setPronto] = useState(false);

  const carica = async () => {
    const { data, error } = await supabase.from('attivita_stato').select('id, stato');
    if (!error && data) {
      const m: Record<string, StatoAttivita> = {};
      for (const r of data as any[]) m[r.id] = r.stato;
      setStati(m);
    }
    setPronto(true);
  };

  useEffect(() => {
    carica();
    const ch = supabase
      .channel('attivita-stato')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attivita_stato' }, carica)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const statoDi = (a: Attivita): StatoAttivita => stati[a.id] || a.stato;
  return { statoDi, pronto, ricarica: carica };
}
