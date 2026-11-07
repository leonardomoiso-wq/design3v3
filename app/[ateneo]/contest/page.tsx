'use client';
// Contest di ateneo (/polito/contest): non serve scegliere un corso.
import { useEffect, useState } from 'react';
import { caricaAteneoPerCodice, caricaSpazioAteneo, type Ateneo, type Corso } from '@/lib/corsi';
import ContestStudente from '@/components/moiso/ContestStudente';

export default function ContestAteneoPage({ params }: { params: { ateneo: string } }) {
  const codice = decodeURIComponent(params.ateneo);
  const [dati, setDati] = useState<{ ateneo: Ateneo; spazio: Corso | null } | null | undefined>(undefined);
  useEffect(() => {
    caricaAteneoPerCodice(codice).then(async a => setDati(a ? { ateneo: a, spazio: await caricaSpazioAteneo(a.id) } : null));
  }, [codice]);
  if (dati === undefined) return <main style={{ minHeight: '100vh' }} />;
  if (!dati) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ display: 'grid', gap: 16, justifyItems: 'center' }}>
          <h1 className="mz-display" style={{ fontSize: 40 }}>Ateneo non trovato</h1>
          <a href="/" className="mz-pill">Scegli l’ateneo</a>
        </div>
      </main>
    );
  }
  return <ContestStudente ateneo={dati.ateneo} spazio={dati.spazio} />;
}
