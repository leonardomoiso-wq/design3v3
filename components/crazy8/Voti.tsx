'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { hmwCompleta, nomeContesto, testoHmw, type Contesto, type Hmw } from './shared';

// Le domande degli altri team: ogni team può mettere una stella alle
// domande che trova più interessanti (non alle proprie). Le stelle
// compaiono anche sul wall del docente.

type Altra = { id: string; team_attivita_id: string | null; gruppo_nome: string; hmw: Hmw[]; hmw_inviate: boolean };
export type Voto = { submission_id: string; indice: number; team_attivita_id: string };

export function useVotiCrazy8(attivitaId: string | null) {
  const [voti, setVoti] = useState<Voto[]>([]);
  const carica = async () => {
    if (!attivitaId) return;
    const { data } = await supabase.from('voti_hmw_crazy8').select('submission_id, indice, team_attivita_id, submission_crazy8!inner(attivita_id)').eq('submission_crazy8.attivita_id', attivitaId);
    setVoti(((data || []) as any[]).map(v => ({ submission_id: v.submission_id, indice: v.indice, team_attivita_id: v.team_attivita_id })));
  };
  useEffect(() => {
    carica();
    if (!attivitaId) return;
    const ch = supabase.channel(`voti-crazy8-${attivitaId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'voti_hmw_crazy8' }, carica).subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attivitaId]);
  const conta = (submissionId: string, indice: number) => voti.filter(v => v.submission_id === submissionId && v.indice === indice).length;
  return { voti, conta, ricarica: carica };
}

export default function AltreDomande({ attivitaId, mioTeam, password, mioId, contesti }: {
  attivitaId: string; mioTeam: string; password: string; mioId: string; contesti: Contesto[];
}) {
  const [altre, setAltre] = useState<Altra[]>([]);
  const { voti, conta, ricarica } = useVotiCrazy8(attivitaId);
  const [errore, setErrore] = useState('');

  useEffect(() => {
    const carica = async () => {
      const { data } = await supabase.from('submission_crazy8').select('id, team_attivita_id, gruppo_nome, hmw, hmw_inviate').eq('attivita_id', attivitaId).eq('hmw_inviate', true);
      setAltre(((data || []) as Altra[]).filter(a => a.id !== mioId && Array.isArray(a.hmw)));
    };
    carica();
    const ch = supabase.channel(`altre-hmw-${attivitaId}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'submission_crazy8' }, carica).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [attivitaId, mioId]);

  const votato = (s: string, i: number) => voti.some(v => v.submission_id === s && v.indice === i && v.team_attivita_id === mioTeam);
  const vota = async (s: string, i: number) => {
    setErrore('');
    const { error } = await supabase.rpc('vota_hmw_crazy8', { p_team_attivita_id: mioTeam, p_password: password, p_submission_id: s, p_indice: i, p_valore: !votato(s, i) });
    if (error) setErrore('Stella non salvata. Riprovate.');
    ricarica();
  };

  const domande = altre.flatMap(a => (a.hmw || []).map((h, i) => ({ s: a.id, i, h }))).filter(d => hmwCompleta(d.h));
  if (domande.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="mz-mono" style={{ color: 'var(--ink)' }}>Le domande degli altri team ({String(domande.length).padStart(2, '0')})</span>
        <span className="text-sm text-stone-500">Mettete una stella a quelle che trovate più interessanti.</span>
      </div>
      <div className="c8-altre entra-cascata">
        {domande.map(d => {
          const mia = votato(d.s, d.i);
          return (
            <article key={`${d.s}:${d.i}`} className={`c8-altra ${mia ? 'votata' : ''}`}>
              <span className="mz-mono" style={{ color: 'var(--accento)' }}>{nomeContesto(d.h.contesto, contesti)}</span>
              <p className="c8-altra-testo">{testoHmw(d.h)}</p>
              <button type="button" className="c8-stella" aria-pressed={mia} onClick={() => vota(d.s, d.i)} aria-label={mia ? 'Togli la stella' : 'Metti una stella'}>
                <span aria-hidden="true">{mia ? '★' : '☆'}</span> {conta(d.s, d.i)}
              </button>
            </article>
          );
        })}
      </div>
      {errore && <p role="alert" className="text-sm text-red-700 m-0">{errore}</p>}
    </section>
  );
}
