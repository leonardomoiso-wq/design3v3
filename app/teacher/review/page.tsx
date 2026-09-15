'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizzaDriver } from '@/lib/driver';

type Caso = {
  id: number;
  gruppoNome: string;
  gruppoNum: number;
  titolo: string;
  descrizione: string;
  immagine: string;
  tags: string[];
  driver: { desiderabilita: number; fattibilita: number; responsabilita: number; vitalita: number };
};

type Voti = { verde: number; giallo: number; rosso: number };

const SFONDO: Record<'nessuno' | 'verde' | 'giallo' | 'rosso', string> = {
  nessuno: '#FBF9F5',
  verde: '#ecfdf5',
  giallo: '#fffbeb',
  rosso: '#fef2f2',
};

export default function ReviewPage() {
  const [casi, setCasi] = useState<Caso[]>([]);
  const [indice, setIndice] = useState(0);
  const [votiPerCaso, setVotiPerCaso] = useState<Record<number, Voti>>({});
  const [esitoPerCaso, setEsitoPerCaso] = useState<Record<number, 'nessuno' | 'verde' | 'giallo' | 'rosso'>>({});
  const [modalitaStampa, setModalitaStampa] = useState(false);

  useEffect(() => {
    const carica = async () => {
      const { data, error } = await supabase.from('casi_studio').select('*');
      if (!error && data) {
        const formattati = data.map((c: any) => ({
          id: Number(c.id),
          gruppoNome: c.gruppo_nome,
          gruppoNum: c.gruppo_num,
          titolo: c.titolo,
          descrizione: c.descrizione,
          immagine: c.immagine,
          tags: c.tags || [],
          driver: normalizzaDriver(c.driver),
        }));
        setCasi(formattati);
      }
    };
    carica();

    const channel = supabase
      .channel('realtime-review')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casi_studio' }, carica)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const casoCorrente = casi[indice];

  const votiCorrente: Voti = (casoCorrente && votiPerCaso[casoCorrente.id]) || { verde: 0, giallo: 0, rosso: 0 };
  const esitoCorrente = (casoCorrente && esitoPerCaso[casoCorrente.id]) || 'nessuno';

  const votaCartellino = (colore: keyof Voti) => {
    if (!casoCorrente) return;
    setVotiPerCaso(prev => ({
      ...prev,
      [casoCorrente.id]: { ...votiCorrente, [colore]: votiCorrente[colore] + 1 },
    }));
  };

  const resettaVoti = () => {
    if (!casoCorrente) return;
    setVotiPerCaso(prev => ({ ...prev, [casoCorrente.id]: { verde: 0, giallo: 0, rosso: 0 } }));
    setEsitoPerCaso(prev => ({ ...prev, [casoCorrente.id]: 'nessuno' }));
  };

  const impostaEsito = (colore: 'nessuno' | 'verde' | 'giallo' | 'rosso') => {
    if (!casoCorrente) return;
    setEsitoPerCaso(prev => ({ ...prev, [casoCorrente.id]: colore }));
  };

  const vai = useCallback((delta: number) => {
    setIndice(prev => Math.max(0, Math.min(casi.length - 1, prev + delta)));
  }, [casi.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalitaStampa) return;
      if (e.key === 'ArrowRight') vai(1);
      if (e.key === 'ArrowLeft') vai(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [vai, modalitaStampa]);

  if (modalitaStampa) {
    return (
      <main className="p-12 bg-stone-200 space-y-12">
        <div className="max-w-4xl mx-auto flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm print:hidden">
          <div>
            <h2 className="text-xl font-serif font-bold">Archivio Peer Review</h2>
            <p className="text-xs text-stone-500 mt-0.5">Esito e conteggio voti per ciascun caso studio discusso in aula.</p>
          </div>
          <div className="space-x-2">
            <button onClick={() => setModalitaStampa(false)} className="bg-stone-100 px-5 py-2.5 rounded-xl text-xs font-medium hover:bg-stone-200 transition">
              &larr; Torna alla presentazione
            </button>
            <button onClick={() => window.print()} className="bg-stone-900 text-white px-6 py-2.5 rounded-xl text-xs font-medium hover:bg-stone-800 transition shadow-sm">
              🖨️ Stampa / Salva PDF
            </button>
          </div>
        </div>

        <div className="space-y-8 max-w-4xl mx-auto">
          {casi.map((c, i) => {
            const voti = votiPerCaso[c.id] || { verde: 0, giallo: 0, rosso: 0 };
            const esito = esitoPerCaso[c.id] || 'nessuno';
            return (
              <div key={c.id} className="bg-white p-10 rounded-2xl shadow-sm border border-stone-300 page-break" style={{ backgroundColor: SFONDO[esito] }}>
                <div className="flex justify-between items-center border-b border-stone-200 pb-4 mb-6">
                  <span className="text-xs uppercase tracking-widest text-stone-400 font-bold">Peer Review &middot; Scheda {i + 1} di {casi.length}</span>
                  <span className="text-xs bg-stone-900 text-white px-3 py-1 rounded-full font-medium">Gruppo {c.gruppoNum} &mdash; {c.gruppoNome}</span>
                </div>
                <div className="grid grid-cols-2 gap-8 items-center">
                  <div className="space-y-3">
                    <h2 className="text-2xl font-serif font-bold">{c.titolo}</h2>
                    <p className="text-sm text-stone-600 leading-relaxed">{c.descrizione}</p>
                  </div>
                  <div className="h-48 bg-stone-100 rounded-xl border border-stone-200 flex items-center justify-center p-3 overflow-hidden">
                    {c.immagine ? (
                      <img src={c.immagine} alt="" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <span className="text-xs text-stone-400">Nessuna immagine</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-6 mt-6 pt-4 border-t border-stone-200 text-sm">
                  <span className="font-medium text-stone-500 text-xs uppercase tracking-widest">Esito Voto</span>
                  <span className="flex items-center space-x-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span><b>{voti.verde}</b></span>
                  <span className="flex items-center space-x-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block"></span><b>{voti.giallo}</b></span>
                  <span className="flex items-center space-x-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span><b>{voti.rosso}</b></span>
                  {esito !== 'nessuno' && (
                    <span className="text-xs px-3 py-1 rounded-full bg-stone-900 text-white font-medium capitalize">Approvato: {esito}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    );
  }

  return (
    <main
      className="h-screen w-screen overflow-hidden flex flex-col transition-colors duration-500"
      style={{ backgroundColor: SFONDO[esitoCorrente] }}
    >
      <header className="px-6 py-3.5 border-b border-stone-200/70 flex justify-between items-center backdrop-blur z-20 flex-shrink-0">
        <div className="flex items-center space-x-4">
          <a href="/teacher" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium">&larr; Dashboard Docente</a>
          <span className="text-stone-300">/</span>
          <h1 className="font-serif text-base font-medium">Peer Review in Aula</h1>
        </div>
        <button onClick={() => setModalitaStampa(true)} className="text-xs bg-white border border-stone-200 px-4 py-1.5 rounded-full font-medium hover:border-stone-400 transition">
          📄 Archivio &amp; Stampa PDF
        </button>
      </header>

      {!casoCorrente ? (
        <div className="flex-1 flex items-center justify-center text-stone-400 text-sm">
          Nessun caso studio disponibile per la revisione.
        </div>
      ) : (
        <>
          <div className="flex-1 flex items-center justify-center p-10 overflow-hidden">
            <div className="w-full max-w-5xl aspect-[16/9] bg-white rounded-2xl shadow-xl border border-stone-200 p-12 flex flex-col justify-between">
              <div className="flex justify-between items-center border-b border-stone-200 pb-4">
                <span className="text-xs uppercase tracking-widest text-stone-400 font-bold">Scheda {indice + 1} di {casi.length}</span>
                <span className="text-xs bg-stone-900 text-white px-3 py-1 rounded-full font-medium">Gruppo {casoCorrente.gruppoNum} &mdash; {casoCorrente.gruppoNome}</span>
              </div>

              <div className="grid grid-cols-2 gap-10 items-center my-auto">
                <div className="space-y-4">
                  <h2 className="text-4xl font-serif font-bold text-stone-900">{casoCorrente.titolo}</h2>
                  <p className="text-sm text-stone-600 leading-relaxed max-h-32 overflow-y-auto">{casoCorrente.descrizione}</p>
                  {casoCorrente.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {casoCorrente.tags.map(tag => (
                        <span key={tag} className="text-[10px] bg-stone-100 border border-stone-200 px-2.5 py-1 rounded-full text-stone-600 font-medium">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="h-64 bg-stone-100 rounded-2xl border border-stone-200 flex items-center justify-center p-4 overflow-hidden">
                  {casoCorrente.immagine ? (
                    <img src={casoCorrente.immagine} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
                  ) : (
                    <span className="text-xs text-stone-400">Nessuna immagine</span>
                  )}
                </div>
              </div>

              <div className="border-t border-stone-200 pt-4 flex justify-between items-center text-[10px] text-stone-400">
                <span>Peer Review &middot; Votazione ad alzata di mano</span>
                <span>Driver medi: D {casoCorrente.driver?.desiderabilita} &middot; F {casoCorrente.driver?.fattibilita} &middot; R {casoCorrente.driver?.responsabilita} &middot; V {casoCorrente.driver?.vitalita}</span>
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 px-10 pb-8 flex items-center justify-between">
            <button
              onClick={() => vai(-1)}
              disabled={indice === 0}
              className="bg-white border border-stone-200 px-5 py-3 rounded-full text-sm font-medium disabled:opacity-30 hover:border-stone-400 transition"
            >
              &larr; Precedente
            </button>

            <div className="flex items-center space-x-4">
              <button onClick={() => votaCartellino('verde')} className="flex flex-col items-center space-y-1 group">
                <span className="w-16 h-16 rounded-2xl bg-emerald-500 shadow-lg group-hover:scale-105 group-active:scale-95 transition flex items-center justify-center text-white text-xl font-bold">{votiCorrente.verde}</span>
                <span className="text-[10px] font-medium text-emerald-800 uppercase tracking-widest">Verde</span>
              </button>
              <button onClick={() => votaCartellino('giallo')} className="flex flex-col items-center space-y-1 group">
                <span className="w-16 h-16 rounded-2xl bg-amber-400 shadow-lg group-hover:scale-105 group-active:scale-95 transition flex items-center justify-center text-white text-xl font-bold">{votiCorrente.giallo}</span>
                <span className="text-[10px] font-medium text-amber-800 uppercase tracking-widest">Giallo</span>
              </button>
              <button onClick={() => votaCartellino('rosso')} className="flex flex-col items-center space-y-1 group">
                <span className="w-16 h-16 rounded-2xl bg-red-500 shadow-lg group-hover:scale-105 group-active:scale-95 transition flex items-center justify-center text-white text-xl font-bold">{votiCorrente.rosso}</span>
                <span className="text-[10px] font-medium text-red-800 uppercase tracking-widest">Rosso</span>
              </button>
              <button onClick={resettaVoti} className="text-[10px] text-stone-400 hover:text-stone-700 underline underline-offset-2 ml-2">
                azzera
              </button>
            </div>

            <button
              onClick={() => vai(1)}
              disabled={indice === casi.length - 1}
              className="bg-stone-900 text-white px-5 py-3 rounded-full text-sm font-medium disabled:opacity-30 hover:bg-stone-800 transition"
            >
              Successivo &rarr;
            </button>
          </div>

          <div className="flex-shrink-0 pb-6 flex justify-center space-x-2">
            {(['nessuno', 'verde', 'giallo', 'rosso'] as const).map(colore => (
              <button
                key={colore}
                onClick={() => impostaEsito(colore)}
                className={`text-[10px] px-3 py-1.5 rounded-full font-medium capitalize border transition ${esitoCorrente === colore ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-400'}`}
              >
                {colore === 'nessuno' ? 'Nessun esito' : `Approva: ${colore}`}
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
