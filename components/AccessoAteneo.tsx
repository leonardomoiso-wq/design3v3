'use client';
// Accesso a un contest aperto all'ateneo: iscrizione solo per il contest
// (spazio di ateneo) oppure con l'accesso di un corso dell'ateneo. Usato
// dalla pagina del contest e dal voto in aula.
import { useEffect, useState } from 'react';
import AccessoTeam from '@/components/AccessoTeam';
import type { TeamInfo } from '@/lib/team-context';
import { Segmentato } from '@/components/moiso/Moiso';

// Accesso al Contest di ateneo: con l'accesso di un corso dell'ateneo,
// oppure iscrivendosi solo al contest (nessun corso da frequentare).
export default function AccessoAteneo({ corsi, spazioId, corsoScelto, onScegli, onAccesso, conMatricola = false, contestId }: {
  corsi: { id: string; nome: string }[]; spazioId: string | null; corsoScelto: string | null;
  onScegli: (id: string | null) => void; onAccesso: (t: TeamInfo) => void; conMatricola?: boolean; contestId?: string;
}) {
  const [modo, setModo] = useState<'contest' | 'corso'>(spazioId && corsoScelto !== null && corsoScelto !== spazioId ? 'corso' : spazioId ? 'contest' : 'corso');
  useEffect(() => {
    if (modo === 'contest' && spazioId && corsoScelto !== spazioId) onScegli(spazioId);
    if (modo === 'corso' && corsoScelto === spazioId) onScegli(null);
  }, [modo, spazioId, corsoScelto, onScegli]);
  const ordinati = [...corsi].sort((a, b) => a.nome.localeCompare(b.nome));
  return (
    <div style={{ width: '100%', maxWidth: 460, textAlign: 'left', display: 'grid', gap: 18 }}>
      {spazioId && corsi.length > 0 && (
        <Segmentato
          etichetta="Come entri"
          valore={modo}
          onCambia={setModo}
          opzioni={[{ id: 'contest', label: 'Solo per il contest' }, { id: 'corso', label: 'Con il mio corso' }]}
        />
      )}
      {modo === 'corso' && (
        <label className="mz-field">
          <span className="mz-mono">Il tuo corso</span>
          <select className="mz-input" value={corsoScelto || ''} onChange={e => onScegli(e.target.value || null)}>
            <option value="">Scegli il corso…</option>
            {ordinati.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
      )}
      {corsoScelto && (
        <AccessoTeam key={corsoScelto} corsoId={corsoScelto} onAccesso={onAccesso} soloIndividuale conMatricola={conMatricola} contestId={contestId} schedaIniziale={modo === 'contest' ? 'crea' : 'accedi'} conTitolo={false} />
      )}
    </div>
  );
}
