'use client';
import { useCorso } from '@/lib/corso-context';
import type { Corso } from '@/lib/corsi';

// Le pagine studente lavorano sempre dentro un corso: senza un corso scelto
// rimandano alla home, dove lo si sceglie. I figli ricevono il corso già
// risolto e vengono rimontati da zero se il corso cambia.
export default function RichiedeCorso({ children }: { children: (corso: Corso) => React.ReactNode }) {
  const { corso, pronto } = useCorso();
  if (!pronto) return <main className="min-h-screen bg-[#FBF9F5]" />;
  if (!corso) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 bg-[#FBF9F5]">
        <div className="max-w-sm text-center space-y-4">
          <h1 className="text-2xl font-serif">Scegliete prima il vostro corso</h1>
          <p className="text-sm text-stone-500">Ogni corso ha i propri team e le proprie attività.</p>
          <a href="/" className="inline-block bg-stone-900 text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-stone-800 transition">
            Vai alla scelta del corso
          </a>
        </div>
      </main>
    );
  }
  return <div key={corso.id} className="contents">{children(corso)}</div>;
}
