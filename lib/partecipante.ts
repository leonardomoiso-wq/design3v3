'use client';
// Sessione dello studente per le attività che richiedono un'iscrizione:
// individuale (una persona) o di gruppo (nome del gruppo + membri).
// Il browser conserva solo un token di sessione, mai la password.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type TipoPartecipante = 'individuale' | 'gruppo';

export type Partecipante = {
  id: string;
  tipo: TipoPartecipante;
  nome: string;
  membri: string[];
};

const CHIAVE = 'design3_partecipante_token';

function leggiToken(): string {
  try { return localStorage.getItem(CHIAVE) || ''; } catch { return ''; }
}
function salvaToken(t: string) {
  try { t ? localStorage.setItem(CHIAVE, t) : localStorage.removeItem(CHIAVE); } catch {}
}

export function messaggioErrorePartecipante(codice: string): string {
  switch (codice) {
    case 'nome_gia_usato': return 'Questo nome è già usato. Se è il tuo, accedi; altrimenti scegline un altro.';
    case 'password_troppo_corta': return 'La password deve avere almeno 4 caratteri.';
    case 'nome_non_valido': return 'Il nome deve avere tra 2 e 80 caratteri.';
    case 'credenziali_errate': return 'Nome o password non corretti.';
    case 'tipo_non_valido': return 'Scegli se ti iscrivi da solo/a o come gruppo.';
    default: return 'Errore di connessione. Riprova.';
  }
}

export function usePartecipante() {
  const [pronto, setPronto] = useState(false);
  const [token, setToken] = useState('');
  const [io, setIo] = useState<Partecipante | null>(null);

  useEffect(() => {
    const t = leggiToken();
    if (!t) { setPronto(true); return; }
    supabase.rpc('partecipante_io', { p_token: t }).then(({ data, error }) => {
      if (!error && data) { setToken(t); setIo(data as Partecipante); }
      else if (!error) salvaToken('');
      setPronto(true);
    });
  }, []);

  const applica = (data: any) => {
    salvaToken(data.token);
    setToken(data.token);
    setIo({ id: data.id, tipo: data.tipo, nome: data.nome, membri: data.membri || [] });
  };

  const registra = useCallback(async (tipo: TipoPartecipante, nome: string, password: string, membri: string[]) => {
    const { data, error } = await supabase.rpc('partecipante_registra', {
      p_tipo: tipo, p_nome: nome, p_password: password, p_membri: membri,
    });
    if (error) return messaggioErrorePartecipante(error.message);
    applica(data);
    return '';
  }, []);

  const accedi = useCallback(async (nome: string, password: string) => {
    const { data, error } = await supabase.rpc('partecipante_accedi', { p_nome: nome, p_password: password });
    if (error) return messaggioErrorePartecipante(error.message);
    applica(data);
    return '';
  }, []);

  const esci = useCallback(async () => {
    const t = token;
    salvaToken('');
    setToken('');
    setIo(null);
    if (t) await supabase.rpc('partecipante_esci', { p_token: t });
  }, [token]);

  // Se il token è stato invalidato (es. password reimpostata dal docente).
  const sessioneScaduta = useCallback(() => {
    salvaToken('');
    setToken('');
    setIo(null);
  }, []);

  return { pronto, token, io, registra, accedi, esci, sessioneScaduta };
}
