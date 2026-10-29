'use client';
// Candidatura della propria proposta (team o individuo), nei contest in
// cui le proposte le caricano anche gli studenti. Una proposta per
// accesso, modificabile finché il contest resta in anteprima. A destra,
// l'anteprima di come apparirà in galleria.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { messaggioErroreContest, type Contest, type Proposta } from '@/lib/contest';
import type { TeamInfo } from '@/lib/team-context';
import { GalleriaProposte } from './Proposte';
import { CampiProposta, PROPOSTA_VUOTA, type DatiProposta } from './CampiProposta';

export function FormProposta({ contest, team, esistente, ammesso, onSalvata }: {
  contest: Contest; team: TeamInfo; esistente: Proposta | null; ammesso: boolean; onSalvata: () => void;
}) {
  const [dati, setDati] = useState<DatiProposta>(PROPOSTA_VUOTA);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [ritiro, setRitiro] = useState(false);

  useEffect(() => {
    if (esistente) setDati({ titolo: esistente.titolo, sintesi: esistente.sintesi, problema: esistente.problema, proposta: esistente.proposta, perche: esistente.perche, immagine: esistente.immagine, galleria: esistente.galleria || [] });
  }, [esistente?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const aperte = contest.proposte_da === 'studenti' && contest.fase === 'anteprima';
  const valida = dati.titolo.trim() && dati.sintesi.trim() && dati.immagine && dati.proposta.trim() && dati.perche.trim();

  const salva = async () => {
    setErrore('');
    setInvio(true);
    const { error } = await supabase.rpc('team_salva_proposta', {
      p_team_id: team.id, p_password: team.password, p_contest_id: contest.id, p_titolo: dati.titolo, p_sintesi: dati.sintesi,
      p_problema: dati.problema, p_proposta: dati.proposta, p_perche: dati.perche, p_immagine: dati.immagine, p_galleria: dati.galleria,
    });
    setInvio(false);
    if (error) return setErrore(messaggioErroreContest(error.message));
    onSalvata();
  };

  const ritira = async () => {
    setInvio(true);
    const { error } = await supabase.rpc('team_ritira_proposta', { p_team_id: team.id, p_password: team.password, p_contest_id: contest.id });
    setInvio(false);
    setRitiro(false);
    if (error) return setErrore(messaggioErroreContest(error.message));
    setDati(PROPOSTA_VUOTA);
    onSalvata();
  };

  if (!ammesso) {
    return <p style={{ fontSize: 17 }}>In questo contest candidano proposte solo {contest.iscrizione === 'gruppo' ? 'i team' : 'gli iscritti individuali'}.</p>;
  }
  if (!aperte) {
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <p style={{ fontSize: 18, margin: 0 }}>Le candidature sono chiuse.{esistente ? ' Ecco come appare la tua proposta:' : ''}</p>
        {esistente && <GalleriaProposte proposte={[esistente]} onApri={() => {}} mioVoto={null} />}
      </div>
    );
  }

  const anteprima: Proposta = {
    id: -1, contest_id: contest.id, team_id: null, autori: team.nome, creato_il: '',
    titolo: dati.titolo || 'Il titolo della proposta', sintesi: dati.sintesi || 'La frase che la riassume comparirà qui.',
    problema: dati.problema, proposta: dati.proposta, perche: dati.perche || 'Il motivo per votarla, evidenziato.',
    immagine: dati.immagine, galleria: dati.galleria,
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 'clamp(28px, 5vw, 72px)', alignItems: 'start' }}>
      <div className="mz-in" style={{ display: 'grid', gap: 24 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <span className="mz-mono">{esistente ? 'Modifica la candidatura' : 'Nuova candidatura'}</span>
          <h2 className="mz-display" style={{ fontSize: 'clamp(36px, 5vw, 64px)' }}>La tua proposta, <span className="mz-blue">pronta da votare</span>.</h2>
          <p className="mz-muted" style={{ margin: 0 }}>{team.tipo === 'individuale' ? 'Una proposta a testa' : 'Una proposta per team'}: si può modificare finché il voto non si apre.</p>
        </div>
        <CampiProposta dati={dati} onCambia={setDati} />
        {errore && <p role="alert" style={{ margin: 0, color: '#d22' }}>{errore}</p>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="mz-pill b lg" disabled={!valida || invio} onClick={salva}>{invio ? 'Salvo…' : esistente ? 'Salva le modifiche' : 'Candida la proposta →'}</button>
          {!valida && <span className="mz-mono">Servono immagine, titolo, frase, proposta e perché votarla</span>}
          {esistente && !ritiro && <button type="button" className="mz-pill ghost danger" onClick={() => setRitiro(true)}>Ritira la proposta</button>}
          {esistente && ritiro && (
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 14 }}>Sicuro/a?</span>
              <button type="button" className="mz-pill sm" style={{ background: '#d22', color: '#fff' }} onClick={ritira}>Sì, ritira</button>
              <button type="button" className="mz-pill sm o" onClick={() => setRitiro(false)}>No</button>
            </span>
          )}
        </div>
      </div>
      <aside style={{ position: 'sticky', top: 80, display: 'grid', gap: 12 }}>
        <span className="mz-mono">Anteprima in galleria</span>
        <div style={{ pointerEvents: 'none' }}><GalleriaProposte proposte={[anteprima]} onApri={() => {}} mioVoto={null} /></div>
      </aside>
    </div>
  );
}
