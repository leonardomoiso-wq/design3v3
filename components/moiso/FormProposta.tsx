'use client';
// Candidatura di una proposta. I campi seguono l'ordine in cui chi vota
// legge: immagine e titolo → una frase che convince → problema →
// proposta → perché votarla. L'anteprima a destra mostra la scheda
// come apparirà in galleria.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { comprimiImmagine, messaggioErroreContest, type Contest, type Proposta } from '@/lib/contest';
import { GalleriaProposte } from './Proposte';

const LIMITE_SINTESI = 220;

export type DatiProposta = {
  titolo: string; sintesi: string; problema: string; proposta: string; perche: string;
  immagine: string; galleria: string[]; autori?: string;
};

export function CampiProposta({ dati, onCambia, conAutori = false }: {
  dati: DatiProposta; onCambia: (d: DatiProposta) => void; conAutori?: boolean;
}) {
  const [caricando, setCaricando] = useState(false);
  const set = (k: keyof DatiProposta, v: any) => onCambia({ ...dati, [k]: v });

  const copertina = async (f?: File) => {
    if (!f) return;
    setCaricando(true);
    try { set('immagine', await comprimiImmagine(f)); } finally { setCaricando(false); }
  };
  const aggiungi = async (files: FileList | null) => {
    if (!files) return;
    setCaricando(true);
    try {
      const nuove: string[] = [];
      for (const f of Array.from(files).slice(0, 4 - dati.galleria.length)) nuove.push(await comprimiImmagine(f, 1400, 0.78));
      onCambia({ ...dati, galleria: [...dati.galleria, ...nuove] });
    } finally { setCaricando(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {conAutori && (
        <label className="mz-field">
          <span className="mz-mono">Autori</span>
          <input className="mz-input" value={dati.autori || ''} onChange={e => set('autori', e.target.value)} maxLength={160} />
        </label>
      )}
      <div className="mz-field">
        <span className="mz-mono">01 · Immagine di copertina</span>
        <span className="mz-muted" style={{ fontSize: 13.5 }}>È la prima cosa che si vede: scegline una grande e leggibile, orizzontale.</span>
        <label style={{ cursor: 'pointer', display: 'block', borderRadius: 14, overflow: 'hidden', boxShadow: 'inset 0 0 0 1px var(--line)', background: 'var(--surface)', aspectRatio: '16 / 9', position: 'relative' }}>
          {dati.immagine
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={dati.immagine} alt="Copertina" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }} className="mz-mono">{caricando ? 'Carico…' : '+ Scegli un\'immagine'}</span>}
          <input type="file" accept="image/*" onChange={e => copertina(e.target.files?.[0])} style={{ position: 'absolute', opacity: 0, inset: 0, cursor: 'pointer' }} aria-label="Immagine di copertina" />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {dati.galleria.map((g, i) => (
            <span key={i} style={{ position: 'relative', width: 84, height: 56, borderRadius: 6, overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button type="button" aria-label="Togli immagine" onClick={() => set('galleria', dati.galleria.filter((_, j) => j !== i))}
                style={{ all: 'unset', cursor: 'pointer', position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: 99, background: 'rgba(0,0,0,.65)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11 }}>✕</button>
            </span>
          ))}
          {dati.galleria.length < 4 && (
            <label className="mz-pill sm ghost" style={{ position: 'relative' }}>
              + Altre immagini ({dati.galleria.length}/4)
              <input type="file" accept="image/*" multiple onChange={e => aggiungi(e.target.files)} style={{ position: 'absolute', opacity: 0, inset: 0, cursor: 'pointer' }} />
            </label>
          )}
        </div>
      </div>

      <label className="mz-field">
        <span className="mz-mono">02 · Titolo</span>
        <input className="mz-input" value={dati.titolo} onChange={e => set('titolo', e.target.value)} maxLength={90}
          style={{ fontFamily: 'var(--f-display)', fontSize: 24, letterSpacing: '-.02em' }} placeholder="Un nome che si ricorda" />
      </label>

      <label className="mz-field">
        <span className="mz-mono" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>03 · In una frase</span>
          <span className="mz-num" style={{ color: dati.sintesi.length > LIMITE_SINTESI - 20 ? 'var(--blue)' : undefined }}>{dati.sintesi.length}/{LIMITE_SINTESI}</span>
        </span>
        <span className="mz-muted" style={{ fontSize: 13.5 }}>Cosa fa e per chi. È la riga che chi vota legge sotto il titolo.</span>
        <textarea className="mz-input" value={dati.sintesi} onChange={e => set('sintesi', e.target.value.slice(0, LIMITE_SINTESI))} style={{ minHeight: 70 }}
          placeholder="Es. Un sistema di vasi modulari che trasforma i balconi delle scuole in orti didattici." />
      </label>

      <label className="mz-field">
        <span className="mz-mono">04 · Il problema</span>
        <textarea className="mz-input" value={dati.problema} onChange={e => set('problema', e.target.value)} maxLength={1200} placeholder="Quale situazione volete cambiare? Per chi è un problema?" />
      </label>
      <label className="mz-field">
        <span className="mz-mono">05 · La proposta</span>
        <textarea className="mz-input" value={dati.proposta} onChange={e => set('proposta', e.target.value)} maxLength={2000} style={{ minHeight: 130 }} placeholder="Come funziona, con quali materiali o servizi, cosa cambia rispetto a oggi." />
      </label>
      <label className="mz-field">
        <span className="mz-mono mz-blue">06 · Perché votarla</span>
        <textarea className="mz-input" value={dati.perche} onChange={e => set('perche', e.target.value)} maxLength={600} placeholder="Il motivo più forte, in due o tre righe. Comparirà evidenziato in blu." />
      </label>
    </div>
  );
}

export const PROPOSTA_VUOTA: DatiProposta = { titolo: '', sintesi: '', problema: '', proposta: '', perche: '', immagine: '', galleria: [] };

export function FormProposta({ contest, token, esistente, ammesso, onSalvata, onSessioneScaduta }: {
  contest: Contest; token: string; esistente: Proposta | null; ammesso: boolean;
  onSalvata: () => void; onSessioneScaduta: () => void;
}) {
  const [dati, setDati] = useState<DatiProposta>(PROPOSTA_VUOTA);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [ritiro, setRitiro] = useState(false);

  useEffect(() => {
    if (esistente) setDati({ titolo: esistente.titolo, sintesi: esistente.sintesi, problema: esistente.problema, proposta: esistente.proposta, perche: esistente.perche, immagine: esistente.immagine, galleria: esistente.galleria || [] });
  }, [esistente?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const aperte = contest.fase === 'candidature';
  const valida = dati.titolo.trim() && dati.sintesi.trim() && dati.immagine && dati.proposta.trim() && dati.perche.trim();

  const gestisciErrore = (m: string) => {
    if (m === 'sessione_scaduta') onSessioneScaduta();
    setErrore(messaggioErroreContest(m));
  };

  const salva = async () => {
    setErrore('');
    setInvio(true);
    const { error } = await supabase.rpc('partecipante_salva_proposta', {
      p_token: token, p_contest_id: contest.id, p_titolo: dati.titolo, p_sintesi: dati.sintesi, p_problema: dati.problema,
      p_proposta: dati.proposta, p_perche: dati.perche, p_immagine: dati.immagine, p_galleria: dati.galleria,
    });
    setInvio(false);
    if (error) return gestisciErrore(error.message);
    onSalvata();
  };

  const ritira = async () => {
    setInvio(true);
    const { error } = await supabase.rpc('partecipante_ritira_proposta', { p_token: token, p_contest_id: contest.id });
    setInvio(false);
    setRitiro(false);
    if (error) return gestisciErrore(error.message);
    setDati(PROPOSTA_VUOTA);
    onSalvata();
  };

  if (!ammesso) return <p style={{ fontSize: 17 }}>Con questo tipo di accesso non puoi candidare una proposta in questo contest.</p>;
  if (!aperte) {
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <p style={{ fontSize: 18, margin: 0 }}>Le candidature sono chiuse.{esistente ? ' Ecco come appare la tua proposta:' : ''}</p>
        {esistente && <GalleriaProposte proposte={[esistente]} onApri={() => {}} mioVoto={null} />}
      </div>
    );
  }

  const anteprima: Proposta = {
    id: -1, contest_id: contest.id, partecipante_id: null, autori: 'Anteprima', creato_il: '',
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
          <p className="mz-muted" style={{ margin: 0 }}>Una sola proposta per accesso. Puoi modificarla finché le candidature restano aperte.</p>
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
