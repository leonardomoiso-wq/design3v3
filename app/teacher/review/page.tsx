'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizzaDriver, estraiNote, MAX_DRIVER, type NoteDriver } from '@/lib/driver';
import { useDocente } from '@/lib/docente-context';
import { caricaCasiConCache, aggiornaCacheCaso, rimuoviCasoDallaCache } from '@/lib/cacheCasi';
import StellaScelto from '@/components/StellaScelto';
import { BottomSheet, ActionSheet, SlidingPanel, type StatoPannello } from '@/components/PannelliMobile';
import { useMobile } from '@/lib/useMobile';

type Caso = {
  id: number;
  gruppoNome: string;
  gruppoNum: number;
  titolo: string;
  descrizione: string;
  immagine: string;
  tags: string[];
  driver: { desiderabilita: number; fattibilita: number; responsabilita: number; vitalita: number };
  driverNote: NoteDriver;
  esitoRevisione: 'verde' | 'giallo' | 'rosso' | null;
  inclusoRevisione: boolean;
  scelto: number;
};

const ETICHETTE_DRIVER = [
  ['desiderabilita', 'Desiderabilità'],
  ['fattibilita', 'Fattibilità'],
  ['responsabilita', 'Responsabilità'],
  ['vitalita', 'Vitalità'],
] as const;

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
  const [inCorsoSelezioneScelti, setInCorsoSelezioneScelti] = useState(false);
  const [erroreSelezioneScelti, setErroreSelezioneScelti] = useState('');
  const [erroreCasi, setErroreCasi] = useState('');

  // Da smartphone: driver, voti e chi ha votato stanno in un pannello
  // scorrevole dal basso (con i comandi di votazione sempre visibili
  // nell'intestazione), mentre esito e azioni secondarie si scelgono da
  // action sheet.
  const mobile = useMobile();
  const [statoPannello, setStatoPannello] = useState<StatoPannello>('peek');
  const [menuAzioniAperto, setMenuAzioniAperto] = useState(false);
  const [menuEsitoAperto, setMenuEsitoAperto] = useState(false);
  const ALTEZZA_PEEK = 112;

  useEffect(() => {
    const formattaCaso = (c: any) => ({
      id: Number(c.id),
      gruppoNome: c.gruppo_nome,
      gruppoNum: c.gruppo_num,
      titolo: c.titolo,
      descrizione: c.descrizione,
      immagine: c.immagine,
      tags: c.tags || [],
      driver: normalizzaDriver(c.driver),
      driverNote: estraiNote(c.driver),
      esitoRevisione: c.esito_revisione || null,
      inclusoRevisione: c.incluso_revisione ?? true,
      scelto: Number(c.scelto) || 0,
    });

    const caricaCasi = async () => {
      // Usa la cache locale del browser: riscarica solo i casi studio nuovi
      // o modificati dall'ultima visita, e a piccoli blocchi (non tutti
      // insieme) così anche una connessione lenta vede i casi studio
      // comparire man mano invece di aspettare tutto o niente.
      const { righe, errore } = await caricaCasiConCache(correnti => {
        setErroreCasi('');
        setCasi(correnti.map(formattaCaso));
      });
      if (errore) {
        setErroreCasi(`Errore nel caricamento dei casi studio: ${errore}`);
        return;
      }
      setErroreCasi('');
      setCasi(righe.map(formattaCaso));
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casi_studio' }, (payload: any) => {
        if (payload.eventType === 'DELETE') {
          const idEliminato = Number(payload.old?.id);
          setCasi(prev => prev.filter(c => c.id !== idEliminato));
          rimuoviCasoDallaCache(idEliminato);
          return;
        }
        const aggiornato = formattaCaso(payload.new);
        setCasi(prev => {
          const esistente = prev.find(c => c.id === aggiornato.id);
          // Un aggiornamento che non tocca l'immagine può arrivare via
          // realtime senza quel valore: si preserva quella già mostrata
          // invece di farla sparire.
          const finale = esistente && !aggiornato.immagine && esistente.immagine
            ? { ...aggiornato, immagine: esistente.immagine }
            : aggiornato;
          return esistente ? prev.map(c => (c.id === finale.id ? finale : c)) : [...prev, finale];
        });
        aggiornaCacheCaso(payload.new);
      })
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

  const selezionaDaScelti = async () => {
    setInCorsoSelezioneScelti(true);
    setErroreSelezioneScelti('');
    const { error } = await supabase.rpc('docente_seleziona_revisione_da_scelti', { p_passcode: passcode });
    setInCorsoSelezioneScelti(false);
    if (error) {
      console.error('Errore nella selezione dai casi scelti:', error);
      setErroreSelezioneScelti('Errore durante il salvataggio. Riprova.');
      return;
    }
    setCasi(prev => prev.map(c => ({ ...c, inclusoRevisione: c.scelto > 0 })));
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
      <div className="printable-area flex-1 overflow-y-auto p-4 md:p-12 bg-stone-200 space-y-6 md:space-y-12">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-4 md:justify-between md:items-center bg-white p-5 md:p-6 rounded-2xl shadow-sm print:hidden">
          <div>
            <h2 className="text-xl font-serif font-bold">Archivio Peer Review</h2>
            <p className="text-xs text-stone-500 mt-0.5">Esito e conteggio voti dei gruppi per ciascun caso studio discusso in aula.</p>
          </div>
          <div className="flex flex-wrap gap-2">
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
              <div key={c.id} className="bg-white p-5 md:p-10 print:p-10 rounded-2xl shadow-sm border border-stone-300 page-break" style={{ backgroundColor: SFONDO[esito] }}>
                <div className="flex flex-wrap gap-2 justify-between items-center border-b border-stone-200 pb-4 mb-6">
                  <span className="text-xs uppercase tracking-widest text-stone-400 font-bold">Peer Review &middot; Scheda {i + 1} di {casi.length}</span>
                  <span className="text-xs bg-stone-900 text-white px-3 py-1 rounded-full font-medium">Gruppo {c.gruppoNum} &mdash; {c.gruppoNome}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-5 md:gap-8 items-start">
                  <div className="space-y-3">
                    <h2 className="text-2xl font-serif font-bold">{c.titolo}</h2>
                    <p className="text-sm text-stone-600 leading-relaxed">{c.descrizione}</p>
                  </div>
                  <div className="h-48 bg-stone-100 rounded-xl border border-stone-200 flex items-center justify-center p-3 overflow-hidden">
                    {c.immagine ? (
                      <img src={c.immagine} alt={c.titolo} loading="lazy" decoding="async" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <span className="text-xs text-stone-400">Nessuna immagine</span>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-stone-200">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Ponderazione Driver IDEO (scala 0-{MAX_DRIVER})</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-2">
                    {ETICHETTE_DRIVER.map(([chiave, etichetta]) => {
                      const nota = c.driverNote?.[chiave];
                      return (
                        <div key={chiave} className="bg-stone-50 p-2.5 rounded-lg border border-stone-200 text-xs">
                          <div className="flex justify-between">
                            <span className="font-medium text-stone-600">{etichetta}</span>
                            <b>{c.driver?.[chiave]}/{MAX_DRIVER}</b>
                          </div>
                          {nota && (
                            <p className="text-[11px] text-stone-500 italic mt-1 border-t border-stone-200 pt-1">&ldquo;{nota}&rdquo;</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-6 pt-4 border-t border-stone-200 text-sm">
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

  const totaleVoti = dettaglioCorrente.verde.length + dettaglioCorrente.giallo.length + dettaglioCorrente.rosso.length;

  const ESITI = [
    ['nessuno', 'Nessun esito'],
    ['verde', 'Approva: verde'],
    ['giallo', 'Approva: giallo'],
    ['rosso', 'Approva: rosso'],
  ] as const;

  // Chi ha votato cosa: elenco verticale per colore, mostrato accanto alla
  // scheda (desktop) o nel pannello dal basso (mobile), mai sopra la
  // scheda stessa.
  const chiHaVotato = (
    <div className="space-y-3">
      {([
        ['verde', 'Verde', 'text-emerald-800', 'bg-emerald-50 border-emerald-200 text-emerald-800'],
        ['giallo', 'Giallo', 'text-amber-800', 'bg-amber-50 border-amber-200 text-amber-800'],
        ['rosso', 'Rosso', 'text-red-800', 'bg-red-50 border-red-200 text-red-800'],
      ] as const).map(([colore, etichetta, titoloClasse, chipClasse]) => (
        <div key={colore} className="space-y-1.5">
          <h4 className={`text-[10px] font-bold uppercase tracking-widest ${titoloClasse}`}>
            {etichetta} ({dettaglioCorrente[colore].length})
          </h4>
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
      {totaleVoti > 0 && (
        <p className="text-[10px] text-stone-400 pt-1">Chiedi direttamente a un gruppo perché ha assegnato quel voto, per avviare il confronto in aula.</p>
      )}
    </div>
  );

  const barreDriver = casoCorrente && (
    <div className="space-y-4">
      {ETICHETTE_DRIVER.map(([chiave, etichetta]) => {
        const valore = casoCorrente.driver?.[chiave] ?? 0;
        const nota = casoCorrente.driverNote?.[chiave];
        return (
          <div key={chiave}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-stone-600 font-medium">{etichetta}</span>
              <span className="font-bold">{valore}</span>
            </div>
            <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-stone-900 transition-all duration-500"
                style={{ width: `${(valore / MAX_DRIVER) * 100}%` }}
              />
            </div>
            {nota && (
              <p className="text-[11px] text-stone-500 italic mt-1.5">&ldquo;{nota}&rdquo;</p>
            )}
          </div>
        );
      })}
    </div>
  );

  const contatoreVoti = (grande: boolean) => (
    <div className={`flex items-center ${grande ? 'space-x-3' : 'space-x-1.5'}`} aria-label={`Voti: ${votiCorrente.verde} verdi, ${votiCorrente.giallo} gialli, ${votiCorrente.rosso} rossi`}>
      {([
        ['verde', 'Verde', 'bg-emerald-500', 'text-emerald-800'],
        ['giallo', 'Giallo', 'bg-amber-400', 'text-amber-800'],
        ['rosso', 'Rosso', 'bg-red-500', 'text-red-800'],
      ] as const).map(([colore, etichetta, sfondo, testo]) => (
        <div key={colore} className="flex flex-col items-center space-y-1">
          <span className={`${grande ? 'w-14 h-14 rounded-2xl text-lg' : 'w-9 h-9 rounded-xl text-sm'} ${sfondo} shadow-lg flex items-center justify-center text-white font-bold`}>{votiCorrente[colore]}</span>
          {grande && <span className={`text-[10px] font-medium ${testo} uppercase tracking-widest`}>{etichetta}</span>}
        </div>
      ))}
    </div>
  );

  const flashcard = casoCorrente && (
    <div className={`bg-white rounded-2xl shadow-xl border border-stone-200 flex flex-col ${mobile ? 'p-5 space-y-4' : 'max-w-4xl w-full aspect-[16/9] max-h-full min-h-0 overflow-y-auto p-8 xl:p-12 justify-between'}`}>
      <div className="flex flex-wrap gap-2 justify-between items-center border-b border-stone-200 pb-4">
        <span className="text-xs uppercase tracking-widest text-stone-400 font-bold">Scheda {indice + 1} di {casiInclusi.length}</span>
        <span className="text-xs bg-stone-900 text-white px-3 py-1 rounded-full font-medium">Gruppo {casoCorrente.gruppoNum} &mdash; {casoCorrente.gruppoNome}</span>
      </div>

      <div className={mobile ? 'space-y-4' : 'grid grid-cols-2 gap-8 xl:gap-10 items-center my-auto py-4'}>
        <div className={`${mobile ? 'h-52' : 'h-48 xl:h-64'} bg-stone-100 rounded-2xl border border-stone-200 flex items-center justify-center p-4 overflow-hidden ${mobile ? '' : 'order-last'}`}>
          {casoCorrente.immagine ? (
            <img src={casoCorrente.immagine} alt={casoCorrente.titolo} className="max-w-full max-h-full object-contain rounded-lg" />
          ) : (
            <span className="text-xs text-stone-400">Nessuna immagine</span>
          )}
        </div>
        <div className="space-y-4 min-w-0">
          <h2 className={`${mobile ? 'text-2xl' : 'text-3xl xl:text-4xl'} font-serif font-bold text-stone-900`}>{casoCorrente.titolo}</h2>
          <p className={`text-sm text-stone-600 leading-relaxed ${mobile ? '' : 'max-h-32 overflow-y-auto'}`}>{casoCorrente.descrizione}</p>
          {casoCorrente.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {casoCorrente.tags.map(tag => (
                <span key={tag} className="text-[10px] bg-stone-100 border border-stone-200 px-2.5 py-1 rounded-full text-stone-600 font-medium">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-stone-200 pt-4 text-[10px] text-stone-400">
        {votazioneAperta ? '🟢 Votazione aperta — i gruppi stanno votando dal proprio dispositivo' : 'Votazione chiusa per questa scheda'}
      </div>
    </div>
  );

  return (
    <div
      className="flex-1 overflow-hidden flex flex-col transition-colors duration-500"
      style={{ backgroundColor: SFONDO[esitoCorrente] }}
    >
      <div className="px-4 md:px-6 py-2.5 border-b border-stone-200/70 flex justify-between items-center gap-2 backdrop-blur z-20 flex-shrink-0">
        <div className="flex items-center space-x-3 min-w-0">
          <h1 className="font-serif text-sm font-medium text-stone-500 flex-shrink-0 max-md:hidden">Peer Review in Aula</h1>
          {erroreCasi && (
            <p role="alert" className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl px-3 py-1.5 truncate">{erroreCasi}</p>
          )}
        </div>
        {mobile ? (
          <div className="flex items-center gap-2 w-full justify-between">
            <button onClick={() => setSelezionePannelloAperto(true)} className="text-xs bg-white border border-stone-200 px-3.5 py-2 rounded-full font-medium">
              🎯 Casi ({casiInclusi.length}/{casi.length})
            </button>
            <button onClick={() => setMenuAzioniAperto(true)} aria-haspopup="dialog" aria-label="Altre azioni" className="text-sm bg-white border border-stone-200 w-9 h-9 rounded-full font-bold flex items-center justify-center">
              ⋯
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <button onClick={() => setSelezionePannelloAperto(true)} className="text-xs bg-white border border-stone-200 px-4 py-1.5 rounded-full font-medium hover:border-stone-400 transition">
              🎯 Seleziona Casi ({casiInclusi.length}/{casi.length})
            </button>
            <button onClick={() => setModalitaStampa(true)} className="text-xs bg-white border border-stone-200 px-4 py-1.5 rounded-full font-medium hover:border-stone-400 transition">
              📄 Archivio &amp; Stampa PDF
            </button>
          </div>
        )}
      </div>

      {!casoCorrente ? (
        <div className="flex-1 flex flex-col items-center justify-center text-stone-400 text-sm space-y-3 px-6 text-center">
          <p>{erroreCasi ? erroreCasi : casi.length === 0 ? 'Nessun caso studio disponibile per la revisione.' : 'Nessun caso studio selezionato per questa revisione.'}</p>
          {casi.length > 0 && (
            <button onClick={() => setSelezionePannelloAperto(true)} className="text-xs bg-stone-900 text-white px-4 py-2 rounded-full font-medium hover:bg-stone-800 transition">
              Seleziona i casi da discutere
            </button>
          )}
        </div>
      ) : mobile ? (
        <>
          <div className="flex-1 overflow-y-auto p-4" style={{ paddingBottom: ALTEZZA_PEEK + 16 }}>
            {flashcard}
          </div>

          <SlidingPanel
            stato={statoPannello}
            onCambiaStato={setStatoPannello}
            etichetta="Voti e driver della scheda"
            altezzaPeek={ALTEZZA_PEEK}
            intestazione={
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => vaiEChiudi(-1)} disabled={indice === 0} aria-label="Scheda precedente" className="w-10 h-10 rounded-full bg-white border border-stone-200 disabled:opacity-30 flex-shrink-0">&larr;</button>
                {contatoreVoti(false)}
                <button
                  onClick={() => impostaCasoAttivo(votazioneAperta ? null : casoCorrente.id)}
                  className={`text-xs px-3 py-2.5 rounded-full font-medium transition flex-shrink-0 ${votazioneAperta ? 'bg-stone-900 text-white' : 'bg-white border border-stone-300'}`}
                >
                  {votazioneAperta ? '⏸ Chiudi' : '▶ Apri'}
                </button>
                <button onClick={() => vaiEChiudi(1)} disabled={indice === casiInclusi.length - 1} aria-label="Scheda successiva" className="w-10 h-10 rounded-full bg-stone-900 text-white disabled:opacity-30 flex-shrink-0">&rarr;</button>
              </div>
            }
          >
            <div className="space-y-5 pt-2">
              <button onClick={() => setMenuEsitoAperto(true)} aria-haspopup="dialog" className="w-full flex items-center justify-between bg-white border border-stone-200 rounded-2xl px-4 py-3 text-sm">
                <span className="text-stone-500">Esito</span>
                <span className="font-medium">{ESITI.find(([c]) => c === esitoCorrente)?.[1]} ▾</span>
              </button>
              <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Chi ha votato ({totaleVoti})</h3>
                {chiHaVotato}
              </div>
              <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Driver IDEO (scala 0-{MAX_DRIVER})</h3>
                {barreDriver}
              </div>
            </div>
          </SlidingPanel>
        </>
      ) : (
        <>
          {/* min-h-0 su tutta la catena: la scheda si adatta allo spazio
              rimasto (e scorre al suo interno) invece di traboccare sotto i
              comandi; chi ha votato è nella colonna laterale, non sopra. */}
          <div className="flex-1 min-h-0 flex gap-6 px-6 xl:px-10 pt-6 xl:pt-10 pb-4 overflow-hidden">
            <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center">
              {flashcard}
            </div>

            <aside className="w-72 xl:w-80 flex-shrink-0 min-h-0 flex flex-col gap-4 overflow-y-auto">
              <div className="bg-white rounded-2xl shadow-xl border border-stone-200 p-6">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-4">Driver IDEO (scala 0-{MAX_DRIVER})</h3>
                {barreDriver}
              </div>
              <div className="bg-white rounded-2xl shadow-xl border border-stone-200 p-6">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-4">Chi ha votato ({totaleVoti})</h3>
                {chiHaVotato}
              </div>
            </aside>
          </div>

          <div className="flex-shrink-0 px-6 xl:px-10 pb-3 flex items-center justify-between gap-4">
            <button
              onClick={() => vaiEChiudi(-1)}
              disabled={indice === 0}
              className="bg-white border border-stone-200 px-5 py-3 rounded-full text-sm font-medium disabled:opacity-30 hover:border-stone-400 transition"
            >
              &larr; Precedente
            </button>

            <div className="flex items-center space-x-5">
              {contatoreVoti(true)}

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

          <div className="flex-shrink-0 pb-5 flex justify-center space-x-2">
            {ESITI.map(([colore, etichetta]) => (
              <button
                key={colore}
                onClick={() => impostaEsito(colore)}
                className={`text-[10px] px-3 py-1.5 rounded-full font-medium border transition ${esitoCorrente === colore ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-400'}`}
              >
                {etichetta}
              </button>
            ))}
          </div>
        </>
      )}

      <ActionSheet
        aperto={mobile && menuAzioniAperto}
        onChiudi={() => setMenuAzioniAperto(false)}
        titolo="Peer Review"
        azioni={[
          { chiave: 'seleziona', etichetta: '🎯 Seleziona i casi', descrizione: `${casiInclusi.length} di ${casi.length} inclusi`, onSeleziona: () => setSelezionePannelloAperto(true) },
          { chiave: 'archivio', etichetta: '📄 Archivio & Stampa PDF', onSeleziona: () => setModalitaStampa(true) },
          ...(casoCorrente ? [{ chiave: 'azzera', etichetta: 'Azzera i voti di questa scheda', pericolo: true, onSeleziona: azzeraVoti }] : []),
        ]}
      />

      <ActionSheet
        aperto={mobile && menuEsitoAperto}
        onChiudi={() => setMenuEsitoAperto(false)}
        titolo="Esito della scheda"
        azioni={ESITI.map(([colore, etichetta]) => ({ chiave: colore, etichetta, attiva: esitoCorrente === colore, onSeleziona: () => impostaEsito(colore) }))}
      />

      <BottomSheet
        aperto={selezionePannelloAperto}
        onChiudi={() => setSelezionePannelloAperto(false)}
        etichetta="Seleziona casi per la Peer Review"
        titolo="Seleziona Casi per la Peer Review"
        larghezzaDesktop="md:max-w-2xl md:rounded-3xl"
      >
        <p className="text-xs text-stone-500">
          Scegli quali consegne discutere in aula. Quelli deselezionati restano salvati ma non compaiono nella sequenza delle slide.
        </p>
            {casi.some(c => c.scelto > 0) && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-stone-500 flex items-center gap-1">
                  {casi.filter(c => c.scelto > 0).length} casi contrassegnati con
                  <StellaScelto valore={1} />
                  nella Modalità Slide PDF.
                </p>
                <button
                  onClick={selezionaDaScelti}
                  disabled={inCorsoSelezioneScelti}
                  className="text-xs bg-amber-400 text-amber-950 px-4 py-2 rounded-full font-medium hover:bg-amber-300 transition disabled:opacity-50 flex-shrink-0"
                >
                  {inCorsoSelezioneScelti ? 'Applico...' : 'Includi solo i marcati'}
                </button>
              </div>
            )}
            {erroreSelezioneScelti && (
              <p role="alert" className="text-xs text-red-600 font-medium">{erroreSelezioneScelti}</p>
            )}

            <div className="space-y-2">
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
                        <img src={c.immagine} alt="" loading="lazy" decoding="async" className="max-w-full max-h-full object-contain" />
                      ) : (
                        <span className="text-[9px] text-stone-400 font-bold">IMG</span>
                      )}
                    </div>
                    <div className="overflow-hidden flex-1">
                      <p className="text-sm font-medium truncate flex items-center gap-1">
                        <StellaScelto valore={c.scelto} />
                        <span className="truncate">{c.titolo}</span>
                      </p>
                      <p className="text-xs text-stone-500 truncate">Gruppo {c.gruppoNum} — {c.gruppoNome}</p>
                    </div>
                  </label>
                ))
              )}
            </div>

        <div className="sticky -bottom-6 -mx-6 -mb-6 px-6 py-4 bg-white border-t border-stone-200 flex justify-between items-center">
          <span className="text-xs text-stone-500">{casiInclusi.length} di {casi.length} selezionati</span>
          <button
            onClick={() => setSelezionePannelloAperto(false)}
            className="bg-stone-900 text-white px-5 py-2.5 rounded-xl text-xs font-medium hover:bg-stone-800 transition"
          >
            Fatto
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
