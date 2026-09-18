'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizzaDriver } from '@/lib/driver';
import { useDocente } from '@/lib/docente-context';

type Caso = {
  id: number;
  gruppoNome: string;
  gruppoNum: number;
  titolo: string;
  descrizione: string;
  immagine: string;
  tags: string[];
  driver: { desiderabilita: number; fattibilita: number; responsabilita: number; vitalita: number };
  esitoRevisione: 'verde' | 'giallo' | 'rosso' | null;
  inclusoRevisione: boolean;
};

type Colore = 'verde' | 'giallo' | 'rosso';
type Voti = Record<Colore, number>;
type DettaglioVoti = Record<Colore, number[]>;

const VOTI_VUOTI: Voti = { verde: 0, giallo: 0, rosso: 0 };
const DETTAGLIO_VUOTO: DettaglioVoti = { verde: [], giallo: [], rosso: [] };

const SFONDO: Record<'nessuno' | Colore, string> = {
  nessuno: '#FBF9F5',
  verde: '#ecfdf5',
  giallo: '#fffbeb',
  rosso: '#fef2f2',
};

export default function ReviewPage() {
  const { passcode } = useDocente();
  const [casi, setCasi] = useState<Caso[]>([]);
  const [votiPerCaso, setVotiPerCaso] = useState<Record<number, Voti>>({});
  const [dettaglioVotiPerCaso, setDettaglioVotiPerCaso] = useState<Record<number, DettaglioVoti>>({});
  const [casoAttivoId, setCasoAttivoId] = useState<number | null>(null);
  const [indice, setIndice] = useState(0);
  const [modalitaStampa, setModalitaStampa] = useState(false);
  const [selezionePannelloAperto, setSelezionePannelloAperto] = useState(false);

  useEffect(() => {
    const caricaCasi = async () => {
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
          esitoRevisione: c.esito_revisione || null,
          inclusoRevisione: c.incluso_revisione ?? true,
        }));
        setCasi(formattati);
      }
    };

    const caricaVoti = async () => {
      const { data, error } = await supabase.from('voti_revisione').select('caso_id, gruppo_num, colore');
      if (!error && data) {
        const aggregati: Record<number, Voti> = {};
        const dettagli: Record<number, DettaglioVoti> = {};
        for (const riga of data as any[]) {
          const id = Number(riga.caso_id);
          if (!aggregati[id]) aggregati[id] = { ...VOTI_VUOTI };
          if (!dettagli[id]) dettagli[id] = { verde: [], giallo: [], rosso: [] };
          aggregati[id][riga.colore as Colore] += 1;
          dettagli[id][riga.colore as Colore].push(Number(riga.gruppo_num));
        }
        setVotiPerCaso(aggregati);
        setDettaglioVotiPerCaso(dettagli);
      }
    };

    const caricaStato = async () => {
      const { data, error } = await supabase.from('revisione_stato').select('caso_attivo_id').eq('id', true).single();
      if (!error && data) {
        setCasoAttivoId(data.caso_attivo_id !== null ? Number(data.caso_attivo_id) : null);
      }
    };

    caricaCasi();
    caricaVoti();
    caricaStato();

    const channel = supabase
      .channel('realtime-review')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casi_studio' }, caricaCasi)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voti_revisione' }, caricaVoti)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revisione_stato' }, caricaStato)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const mappaGruppi = Object.fromEntries(casi.map(c => [c.gruppoNum, c.gruppoNome])) as Record<number, string>;

  const casiInclusi = casi.filter(c => c.inclusoRevisione);
  const casoCorrente = casiInclusi[indice];
  const votiCorrente = (casoCorrente && votiPerCaso[casoCorrente.id]) || VOTI_VUOTI;
  const dettaglioCorrente = (casoCorrente && dettaglioVotiPerCaso[casoCorrente.id]) || DETTAGLIO_VUOTO;
  const esitoCorrente = casoCorrente?.esitoRevisione || 'nessuno';
  const votazioneAperta = casoCorrente != null && casoAttivoId === casoCorrente.id;

  useEffect(() => {
    setIndice(prev => Math.max(0, Math.min(casiInclusi.length - 1, prev)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casiInclusi.length]);

  const impostaCasoAttivo = async (id: number | null) => {
    const { error } = await supabase.rpc('docente_imposta_caso_attivo', { p_caso_id: id, p_passcode: passcode });
    if (error) console.error('Errore nel cambio di stato votazione:', error);
    else setCasoAttivoId(id);
  };

  const toggleInclusione = async (c: Caso) => {
    const nuovoValore = !c.inclusoRevisione;
    setCasi(prev => prev.map(x => (x.id === c.id ? { ...x, inclusoRevisione: nuovoValore } : x)));
    const { error } = await supabase.rpc('docente_imposta_inclusione_revisione', {
      p_caso_id: c.id,
      p_incluso: nuovoValore,
      p_passcode: passcode,
    });
    if (error) {
      console.error('Errore nel salvataggio della selezione:', error);
      setCasi(prev => prev.map(x => (x.id === c.id ? { ...x, inclusoRevisione: !nuovoValore } : x)));
    }
  };

  const vai = useCallback((delta: number) => {
    setIndice(prev => Math.max(0, Math.min(casiInclusi.length - 1, prev + delta)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casiInclusi.length]);

  const vaiEChiudi = (delta: number) => {
    if (votazioneAperta) impostaCasoAttivo(null);
    vai(delta);
  };

  const azzeraVoti = async () => {
    if (!casoCorrente) return;
    const { error } = await supabase.rpc('docente_azzera_voti', { p_caso_id: casoCorrente.id, p_passcode: passcode });
    if (error) {
      console.error('Errore nell\'azzeramento dei voti:', error);
      return;
    }
    setVotiPerCaso(prev => ({ ...prev, [casoCorrente.id]: { ...VOTI_VUOTI } }));
    setDettaglioVotiPerCaso(prev => ({ ...prev, [casoCorrente.id]: { verde: [], giallo: [], rosso: [] } }));
  };

  const impostaEsito = async (colore: 'nessuno' | Colore) => {
    if (!casoCorrente) return;
    const valore = colore === 'nessuno' ? null : colore;
    const { error } = await supabase.rpc('docente_imposta_esito_revisione', {
      p_caso_id: casoCorrente.id,
      p_esito: valore,
      p_passcode: passcode,
    });
    if (error) {
      console.error('Errore nel salvataggio esito:', error);
      return;
    }
    setCasi(prev => prev.map(c => (c.id === casoCorrente.id ? { ...c, esitoRevisione: valore } : c)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalitaStampa) return;
      if (e.key === 'ArrowRight') vaiEChiudi(1);
      if (e.key === 'ArrowLeft') vaiEChiudi(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vai, modalitaStampa, votazioneAperta]);

  if (modalitaStampa) {
    return (
      <div className="flex-1 overflow-y-auto p-12 bg-stone-200 space-y-12">
        <div className="max-w-4xl mx-auto flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm print:hidden">
          <div>
            <h2 className="text-xl font-serif font-bold">Archivio Peer Review</h2>
            <p className="text-xs text-stone-500 mt-0.5">Esito e conteggio voti dei gruppi per ciascun caso studio discusso in aula.</p>
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
            const voti = votiPerCaso[c.id] || VOTI_VUOTI;
            const dettaglio = dettaglioVotiPerCaso[c.id] || DETTAGLIO_VUOTO;
            const esito = c.esitoRevisione || 'nessuno';
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
                      <img src={c.immagine} alt={c.titolo} className="max-w-full max-h-full object-contain" />
                    ) : (
                      <span className="text-xs text-stone-400">Nessuna immagine</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-6 mt-6 pt-4 border-t border-stone-200 text-sm">
                  <span className="font-medium text-stone-500 text-xs uppercase tracking-widest">Voti dei Gruppi</span>
                  <span className="flex items-center space-x-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span><b>{voti.verde}</b></span>
                  <span className="flex items-center space-x-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block"></span><b>{voti.giallo}</b></span>
                  <span className="flex items-center space-x-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span><b>{voti.rosso}</b></span>
                  {esito !== 'nessuno' && (
                    <span className="text-xs px-3 py-1 rounded-full bg-stone-900 text-white font-medium capitalize">Approvato: {esito}</span>
                  )}
                </div>
                {(dettaglio.verde.length + dettaglio.giallo.length + dettaglio.rosso.length) > 0 && (
                  <div className="mt-3 pt-3 border-t border-stone-100 flex flex-wrap gap-1.5 text-[10px]">
                    {dettaglio.verde.map((n, i) => (
                      <span key={`v-${n}-${i}`} className="px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-800 font-medium">G.{n}{mappaGruppi[n] ? ` — ${mappaGruppi[n]}` : ''}</span>
                    ))}
                    {dettaglio.giallo.map((n, i) => (
                      <span key={`g-${n}-${i}`} className="px-2 py-0.5 rounded-full border bg-amber-50 border-amber-200 text-amber-800 font-medium">G.{n}{mappaGruppi[n] ? ` — ${mappaGruppi[n]}` : ''}</span>
                    ))}
                    {dettaglio.rosso.map((n, i) => (
                      <span key={`r-${n}-${i}`} className="px-2 py-0.5 rounded-full border bg-red-50 border-red-200 text-red-800 font-medium">G.{n}{mappaGruppi[n] ? ` — ${mappaGruppi[n]}` : ''}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-hidden flex flex-col transition-colors duration-500"
      style={{ backgroundColor: SFONDO[esitoCorrente] }}
    >
      <div className="px-6 py-2.5 border-b border-stone-200/70 flex justify-between items-center backdrop-blur z-20 flex-shrink-0">
        <h1 className="font-serif text-sm font-medium text-stone-500">Peer Review in Aula</h1>
        <div className="flex items-center space-x-2">
          <button onClick={() => setSelezionePannelloAperto(true)} className="text-xs bg-white border border-stone-200 px-4 py-1.5 rounded-full font-medium hover:border-stone-400 transition">
            🎯 Seleziona Casi ({casiInclusi.length}/{casi.length})
          </button>
          <button onClick={() => setModalitaStampa(true)} className="text-xs bg-white border border-stone-200 px-4 py-1.5 rounded-full font-medium hover:border-stone-400 transition">
            📄 Archivio &amp; Stampa PDF
          </button>
        </div>
      </div>

      {!casoCorrente ? (
        <div className="flex-1 flex flex-col items-center justify-center text-stone-400 text-sm space-y-3">
          <p>{casi.length === 0 ? 'Nessun caso studio disponibile per la revisione.' : 'Nessun caso studio selezionato per questa revisione.'}</p>
          {casi.length > 0 && (
            <button onClick={() => setSelezionePannelloAperto(true)} className="text-xs bg-stone-900 text-white px-4 py-2 rounded-full font-medium hover:bg-stone-800 transition">
              Seleziona i casi da discutere
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex-1 flex items-center justify-center p-10 overflow-hidden">
            <div className="w-full max-w-5xl aspect-[16/9] bg-white rounded-2xl shadow-xl border border-stone-200 p-12 flex flex-col justify-between">
              <div className="flex justify-between items-center border-b border-stone-200 pb-4">
                <span className="text-xs uppercase tracking-widest text-stone-400 font-bold">Scheda {indice + 1} di {casiInclusi.length}</span>
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
                    <img src={casoCorrente.immagine} alt={casoCorrente.titolo} className="max-w-full max-h-full object-contain rounded-lg" />
                  ) : (
                    <span className="text-xs text-stone-400">Nessuna immagine</span>
                  )}
                </div>
              </div>

              <div className="border-t border-stone-200 pt-4 flex justify-between items-center text-[10px] text-stone-400">
                <span>{votazioneAperta ? '🟢 Votazione aperta — i gruppi stanno votando dal proprio dispositivo' : 'Votazione chiusa per questa scheda'}</span>
                <span>Driver medi: D {casoCorrente.driver?.desiderabilita} &middot; F {casoCorrente.driver?.fattibilita} &middot; R {casoCorrente.driver?.responsabilita} &middot; V {casoCorrente.driver?.vitalita}</span>
              </div>
            </div>
          </div>

          {(dettaglioCorrente.verde.length + dettaglioCorrente.giallo.length + dettaglioCorrente.rosso.length) > 0 && (
            <div className="flex-shrink-0 px-10 pb-4">
              <div className="max-w-5xl mx-auto bg-white/70 backdrop-blur border border-stone-200 rounded-2xl p-4 grid grid-cols-3 gap-4">
                {([
                  ['verde', 'Verde', 'text-emerald-800', 'bg-emerald-50 border-emerald-200 text-emerald-800'],
                  ['giallo', 'Giallo', 'text-amber-800', 'bg-amber-50 border-amber-200 text-amber-800'],
                  ['rosso', 'Rosso', 'text-red-800', 'bg-red-50 border-red-200 text-red-800'],
                ] as const).map(([colore, etichetta, titoloClasse, chipClasse]) => (
                  <div key={colore} className="space-y-1.5">
                    <h3 className={`text-[10px] font-bold uppercase tracking-widest ${titoloClasse}`}>
                      {etichetta} &middot; chi ha votato ({dettaglioCorrente[colore].length})
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {dettaglioCorrente[colore].length === 0 ? (
                        <span className="text-[10px] text-stone-400">Nessun voto</span>
                      ) : (
                        dettaglioCorrente[colore].map((numero, i) => (
                          <span key={`${numero}-${i}`} className={`text-[10px] font-medium px-2 py-1 rounded-full border ${chipClasse}`}>
                            G.{numero}{mappaGruppi[numero] ? ` — ${mappaGruppi[numero]}` : ''}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-stone-400 text-center mt-2">Chiedi direttamente a un gruppo perché ha assegnato quel voto, per avviare il confronto in aula.</p>
            </div>
          )}

          <div className="flex-shrink-0 px-10 pb-8 flex items-center justify-between">
            <button
              onClick={() => vaiEChiudi(-1)}
              disabled={indice === 0}
              className="bg-white border border-stone-200 px-5 py-3 rounded-full text-sm font-medium disabled:opacity-30 hover:border-stone-400 transition"
            >
              &larr; Precedente
            </button>

            <div className="flex items-center space-x-5">
              <div className="flex items-center space-x-3">
                <div className="flex flex-col items-center space-y-1">
                  <span className="w-14 h-14 rounded-2xl bg-emerald-500 shadow-lg flex items-center justify-center text-white text-lg font-bold">{votiCorrente.verde}</span>
                  <span className="text-[10px] font-medium text-emerald-800 uppercase tracking-widest">Verde</span>
                </div>
                <div className="flex flex-col items-center space-y-1">
                  <span className="w-14 h-14 rounded-2xl bg-amber-400 shadow-lg flex items-center justify-center text-white text-lg font-bold">{votiCorrente.giallo}</span>
                  <span className="text-[10px] font-medium text-amber-800 uppercase tracking-widest">Giallo</span>
                </div>
                <div className="flex flex-col items-center space-y-1">
                  <span className="w-14 h-14 rounded-2xl bg-red-500 shadow-lg flex items-center justify-center text-white text-lg font-bold">{votiCorrente.rosso}</span>
                  <span className="text-[10px] font-medium text-red-800 uppercase tracking-widest">Rosso</span>
                </div>
              </div>

              <div className="flex flex-col space-y-1.5 pl-2 border-l border-stone-300/60">
                <button
                  onClick={() => impostaCasoAttivo(votazioneAperta ? null : casoCorrente.id)}
                  className={`text-xs px-4 py-2 rounded-full font-medium transition ${votazioneAperta ? 'bg-stone-900 text-white' : 'bg-white border border-stone-300 hover:border-stone-500'}`}
                >
                  {votazioneAperta ? '⏸ Chiudi Votazioni' : '▶ Apri Votazioni'}
                </button>
                <button onClick={azzeraVoti} className="text-[10px] text-stone-400 hover:text-stone-700 underline underline-offset-2">
                  azzera i voti di questa scheda
                </button>
              </div>
            </div>

            <button
              onClick={() => vaiEChiudi(1)}
              disabled={indice === casiInclusi.length - 1}
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

      {selezionePannelloAperto && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Seleziona casi per la Peer Review"
          onClick={() => setSelezionePannelloAperto(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-stone-200 flex justify-between items-start flex-shrink-0">
              <div>
                <h2 className="font-serif font-bold text-lg">Seleziona Casi per la Peer Review</h2>
                <p className="text-xs text-stone-500 mt-1">
                  Scegli quali consegne discutere in aula. Quelli deselezionati restano salvati ma non compaiono nella sequenza delle slide.
                </p>
              </div>
              <button onClick={() => setSelezionePannelloAperto(false)} aria-label="Chiudi" className="text-stone-400 hover:text-stone-900 text-xl leading-none flex-shrink-0 ml-4">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {casi.length === 0 ? (
                <p className="text-xs text-stone-400 text-center py-8">Nessun caso studio disponibile.</p>
              ) : (
                casi.map(c => (
                  <label
                    key={c.id}
                    className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer transition ${c.inclusoRevisione ? 'bg-white border-stone-200' : 'bg-stone-50 border-stone-100 opacity-60'}`}
                  >
                    <input
                      type="checkbox"
                      checked={c.inclusoRevisione}
                      onChange={() => toggleInclusione(c)}
                      className="accent-stone-900 flex-shrink-0"
                    />
                    <div className="w-10 h-10 rounded-lg bg-stone-100 border border-stone-200 overflow-hidden flex items-center justify-center flex-shrink-0 p-0.5">
                      {c.immagine ? (
                        <img src={c.immagine} alt="" className="max-w-full max-h-full object-contain" />
                      ) : (
                        <span className="text-[9px] text-stone-400 font-bold">IMG</span>
                      )}
                    </div>
                    <div className="overflow-hidden flex-1">
                      <p className="text-sm font-medium truncate">{c.titolo}</p>
                      <p className="text-xs text-stone-500 truncate">Gruppo {c.gruppoNum} — {c.gruppoNome}</p>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="p-4 border-t border-stone-200 flex justify-between items-center flex-shrink-0">
              <span className="text-xs text-stone-500">{casiInclusi.length} di {casi.length} selezionati</span>
              <button
                onClick={() => setSelezionePannelloAperto(false)}
                className="bg-stone-900 text-white px-5 py-2.5 rounded-xl text-xs font-medium hover:bg-stone-800 transition"
              >
                Fatto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
