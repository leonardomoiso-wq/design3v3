'use client';
// Indirizzo diretto di un corso (/polito/design-3): il link da condividere
// con gli studenti. Sceglie il corso e apre il suo percorso (presentazione,
// accesso, attività). Se il corso è di un altro ateneo porta all'indirizzo
// giusto; se è uno spazio di ateneo porta alle sue attività.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCorso } from '@/lib/corso-context';
import { caricaCorsoPerCodice, percorsoCorso } from '@/lib/corsi';
import PercorsoStudente from '@/components/Percorso';

export default function IngressoCorso({ ateneo, codice }: { ateneo: string; codice: string }) {
  const { scegliCorso, corso } = useCorso();
  const router = useRouter();
  const [stato, setStato] = useState<'carico' | 'pronto' | 'assente'>('carico');

  useEffect(() => {
    caricaCorsoPerCodice(codice).then(c => {
      if (!c || c.archiviato) { setStato('assente'); return; }
      if (c.spazio_ateneo && c.ateneo_codice) { router.replace(`/${c.ateneo_codice}/contest`); return; }
      if (c.ateneo_codice && c.ateneo_codice.toLowerCase() !== ateneo.toLowerCase()) { router.replace(percorsoCorso(c)); return; }
      scegliCorso(c);
      setStato('pronto');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ateneo, codice]);

  if (stato === 'assente') {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-sm text-center space-y-4">
          <h1 className="text-2xl font-serif">Corso non trovato</h1>
          <a href={`/${ateneo}`} className="inline-block bg-stone-900 text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-stone-800 transition">I corsi dell’ateneo</a>
        </div>
      </main>
    );
  }
  if (stato === 'carico' || corso?.codice.toLowerCase() !== codice.toLowerCase()) return <main className="min-h-screen bg-[#FBF9F5]" />;
  return <PercorsoStudente daIndirizzo />;
}
