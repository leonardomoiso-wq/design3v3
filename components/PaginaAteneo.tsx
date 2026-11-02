'use client';
// Pagina di un ateneo (/polito): i suoi corsi e le attività aperte a tutto
// l'ateneo (es. il Contest), che non richiedono di scegliere un corso.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { moduloDi, type AttivitaRow } from '@/lib/attivita';
import { caricaAteneoPerCodice, caricaCorsiPubblici, caricaSpazioAteneo, percorsoCorso, NOME_PIATTAFORMA, type Ateneo, type Corso } from '@/lib/corsi';

// Pagine delle attività di ateneo (relative a /<ateneo>).
const PAGINE_ATENEO: Record<string, string> = { contest_voto: 'contest' };

export default function PaginaAteneo({ codice }: { codice: string }) {
  const [ateneo, setAteneo] = useState<Ateneo | null | undefined>(undefined);
  const [corsi, setCorsi] = useState<Corso[] | null>(null);
  const [attivita, setAttivita] = useState<AttivitaRow[]>([]);

  useEffect(() => {
    caricaAteneoPerCodice(codice).then(async a => {
      setAteneo(a);
      if (!a) return;
      caricaCorsiPubblici(a.id).then(setCorsi);
      const spazio = await caricaSpazioAteneo(a.id);
      if (spazio) {
        const { data } = await supabase.from('attivita').select('*').eq('corso_id', spazio.id)
          .in('stato', ['attiva', 'prossimamente']).order('ordine', { ascending: true });
        setAttivita((data || []) as AttivitaRow[]);
      }
    });
  }, [codice]);

  if (ateneo === undefined) return <main className="min-h-screen bg-[#FBF9F5]" />;

  if (!ateneo) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-sm text-center space-y-4">
          <h1 className="text-2xl font-serif">Ateneo non trovato</h1>
          <a href="/" className="inline-block bg-stone-900 text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-stone-800 transition">Scegli l’ateneo</a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 sm:px-8 py-8 sm:py-12 max-w-5xl mx-auto flex flex-col">
      <nav className="flex flex-wrap justify-between items-center gap-3 border-b border-stone-200 pb-6">
        <a href="/" className="font-serif tracking-tight font-bold text-lg">{NOME_PIATTAFORMA}</a>
        <a href="/teacher" className="text-[11px] uppercase tracking-widest text-stone-400 hover:text-stone-900 font-medium px-3 py-1.5 rounded-full border border-stone-200 hover:border-stone-400 transition">
          🔐 Accesso Docente
        </a>
      </nav>

      <div className="pt-14 pb-10 text-center animate-fade-in-up">
        <h1 className="text-4xl md:text-5xl font-serif max-w-3xl mx-auto leading-tight">
          {ateneo.nome}
          <span className="apice">(/{ateneo.codice})</span>
        </h1>
        {ateneo.descrizione && <p className="text-stone-600 max-w-xl mx-auto mt-4">{ateneo.descrizione}</p>}
      </div>

      {attivita.length > 0 && (
        <section className="pb-10 space-y-4">
          <h2 className="text-[11px] uppercase tracking-widest text-stone-500 font-bold">Attività di ateneo</h2>
          <div className="grid sm:grid-cols-2 gap-6 entra-cascata">
            {attivita.map(a => {
              const avviabile = a.stato === 'attiva' && PAGINE_ATENEO[a.tipo];
              const contenuto = (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-3xl" aria-hidden="true">{moduloDi(a.tipo).icona}</span>
                    {!avviabile && <span className="text-[10px] uppercase tracking-widest bg-stone-200 text-stone-500 px-2.5 py-1 rounded-full font-bold">Prossimamente</span>}
                  </div>
                  <h3 className={`text-xl font-serif font-bold ${avviabile ? 'text-stone-900' : 'text-stone-400'}`}>{a.titolo}</h3>
                  {a.descrizione && <p className={`text-sm mt-2 leading-relaxed ${avviabile ? 'text-stone-600' : 'text-stone-400'}`}>{a.descrizione}</p>}
                  {avviabile && <span className="inline-block mt-6 bg-stone-900 text-white px-5 py-3 rounded-full font-medium text-sm">Entra →</span>}
                </>
              );
              return avviabile ? (
                <a key={a.id} href={`/${ateneo.codice}/${PAGINE_ATENEO[a.tipo]}`} className="card-viva rounded-3xl border p-8 bg-white border-stone-200 shadow-sm hover:border-stone-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900">{contenuto}</a>
              ) : (
                <div key={a.id} className="rounded-3xl border p-8 bg-stone-100/60 border-dashed border-stone-300">{contenuto}</div>
              );
            })}
          </div>
        </section>
      )}

      <section className="pb-16 space-y-4">
        <h2 className="text-[11px] uppercase tracking-widest text-stone-500 font-bold">Corsi</h2>
        <div className="grid sm:grid-cols-2 gap-4 entra-cascata">
          {corsi === null && <p className="text-sm text-stone-400">Caricamento...</p>}
          {corsi?.length === 0 && <p className="text-sm text-stone-400">Nessun corso in elenco. Chiedete il link al/alla docente.</p>}
          {corsi?.map(c => (
            <a key={c.id} href={percorsoCorso(c)} className="card-viva text-left bg-white border border-stone-200 hover:border-stone-400 rounded-3xl p-6 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900">
              <span className="text-[10px] uppercase tracking-widest text-stone-400 font-bold font-mono">{c.codice}</span>
              <h3 className="text-xl font-serif font-bold mt-1">{c.nome}</h3>
              {c.descrizione && <p className="text-sm text-stone-500 mt-1">{c.descrizione}</p>}
              <span className="inline-block mt-4 text-xs font-medium text-stone-900">Entra nel corso →</span>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
