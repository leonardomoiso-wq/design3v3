'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { normalizzaDriver, estraiNote, costruisciDriver, coordinateDaDriver, MAX_DRIVER, type NoteDriver } from '../../lib/driver';
import { comprimiImmagine } from '../../lib/immagine';
import { SfondoCaricamento, ImpulsoCaricamento } from '../../lib/caricamento';
import { useTeam } from '../../lib/team-context';

const DRIVER_DEFAULT = Math.round(MAX_DRIVER / 2);

// Fallback usato solo se la tabella tag_default_caso_studio non è
// ancora raggiungibile (migrazione non eseguita): il/la docente cura
// la lista vera da /teacher.
const TAG_OPTIONS_FALLBACK = [
  'Eco-feedback interfaces',
  'Bio-digital architecture',
  'Non-human interaction design (NHID)',
  'Algorithmic conservation',
  'Multispecies product design',
  'Regenerative urban prototyping',
  'Foraged and bio-based materials',
  'More-than-human service design',
  'Speculative multispecies products',
  'Microbial design',
];

const DRIVER_INFO: Record<string, { etichetta: string; domanda: string }> = {
  desiderabilita: {
    etichetta: 'Desiderabilità',
    domanda: 'Le persone (o le altre specie coinvolte) desiderano davvero questa soluzione? Risponde a un bisogno reale e sentito?',
  },
  fattibilita: {
    etichetta: 'Fattibilità',
    domanda: 'È realizzabile con le tecnologie, i materiali e le competenze che avete a disposizione oggi?',
  },
  responsabilita: {
    etichetta: 'Responsabilità',
    domanda: 'Avete considerato gli impatti etici, sociali e ambientali — anche su chi non ha voce in capitolo?',
  },
  vitalita: {
    etichetta: 'Vitalità',
    domanda: 'Può reggersi nel tempo? È sostenibile a livello economico, ecologico e sociale, non solo nel breve periodo?',
  },
};

type Colore = 'verde' | 'giallo' | 'rosso';
type Step = 'gruppo' | 'contenuti' | 'tag' | 'driver' | 'riepilogo';

const STEPS: { id: Step; label: string; numero: number }[] = [
  { id: 'gruppo', label: 'Il Gruppo', numero: 1 },
  { id: 'contenuti', label: 'Il Progetto', numero: 2 },
  { id: 'tag', label: 'Temi', numero: 3 },
  { id: 'driver', label: 'Valutazione', numero: 4 },
  { id: 'riepilogo', label: 'Riepilogo', numero: 5 },
];

export default function StudentPage() {
  const { team } = useTeam();
  const [activeTab, setActiveTab] = useState<'crea' | 'gestisci' | 'vota'>('crea');
  const [casi, setCasi] = useState<any[]>([]);
  const [step, setStep] = useState<Step>('gruppo');
  const [maxStepRaggiunto, setMaxStepRaggiunto] = useState(0);

  const [editId, setEditId] = useState<number | null>(null);
  const [gruppoNome, setGruppoNome] = useState('');
  const [gruppoNum, setGruppoNum] = useState('');
  const [titolo, setTitolo] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [immagine, setImmagine] = useState<string>('');
  const [comprimendoImmagine, setComprimendoImmagine] = useState(false);
  const [tagsSelezionati, setTagsSelezionati] = useState<string[]>([]);
  const [tagPersonalizzato, setTagPersonalizzato] = useState('');
  const [tagOptions, setTagOptions] = useState<string[]>(TAG_OPTIONS_FALLBACK);
  const [desiderabilita, setDesiderabilita] = useState(DRIVER_DEFAULT);
  const [fattibilita, setFattibilita] = useState(DRIVER_DEFAULT);
  const [responsabilita, setResponsabilita] = useState(DRIVER_DEFAULT);
  const [vitalita, setVitalita] = useState(DRIVER_DEFAULT);
  const [note, setNote] = useState<NoteDriver>({ desiderabilita: '', fattibilita: '', responsabilita: '', vitalita: '' });
  const [codiceGruppo, setCodiceGruppo] = useState('');
  const [codiceGiaVerificato, setCodiceGiaVerificato] = useState(false);
  const [erroreSalvataggio, setErroreSalvataggio] = useState('');
  const [salvataggioInCorso, setSalvataggioInCorso] = useState(false);

  // Con un team già loggato, la nuova consegna parte già con nome/numero
  // gruppo e codice compilati: solo per una consegna nuova, non quando si
  // sta modificando una scheda esistente (già sbloccata col suo codice).
  useEffect(() => {
    if (!team || editId !== null) return;
    setGruppoNome(prev => prev || team.nome);
    setGruppoNum(prev => prev || String(team.numero));
    setCodiceGruppo(prev => prev || team.password);
  }, [team, editId]);

  useEffect(() => {
    const caricaTag = async () => {
      const { data } = await supabase.from('tag_default_caso_studio').select('*').order('ordine', { ascending: true });
      if (data && data.length > 0) setTagOptions((data as any[]).map(t => t.testo));
    };
    caricaTag();
  }, []);

  const [filtroGruppo, setFiltroGruppo] = useState('');

  const [casoDaSbloccare, setCasoDaSbloccare] = useState<any | null>(null);
  const [codiceSblocco, setCodiceSblocco] = useState('');
  const [erroreSblocco, setErroreSblocco] = useState('');
  const [verificaInCorso, setVerificaInCorso] = useState(false);

  const [casoDaEliminare, setCasoDaEliminare] = useState<any | null>(null);
  const [codiceEliminazione, setCodiceEliminazione] = useState('');
  const [erroreEliminazione, setErroreEliminazione] = useState('');
  const [eliminazioneInCorso, setEliminazioneInCorso] = useState(false);

  const [numeroGruppoVoto, setNumeroGruppoVoto] = useState('');
  const [casoAttivoId, setCasoAttivoId] = useState<number | null>(null);
  const [mioVoto, setMioVoto] = useState<Colore | null>(null);
  const [erroreVoto, setErroreVoto] = useState('');
  const [votoInCorso, setVotoInCorso] = useState(false);

  useEffect(() => {
    caricaDati();
    caricaStatoRevisione();

    const channel = supabase
      .channel('realtime-casi-studio-studenti')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casi_studio' }, caricaDati)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revisione_stato' }, caricaStatoRevisione)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const caricaStatoRevisione = async () => {
    const { data, error } = await supabase.from('revisione_stato').select('caso_attivo_id').eq('id', true).single();
    if (!error && data) {
      setCasoAttivoId(data.caso_attivo_id !== null ? Number(data.caso_attivo_id) : null);
    }
  };

  const caricaDati = async () => {
    const { data, error } = await supabase.from('casi_studio').select('*');
    if (!error && data) {
      const formattati = data.map(c => ({
        id: Number(c.id),
        gruppoNome: c.gruppo_nome,
        gruppoNum: c.gruppo_num,
        titolo: c.titolo,
        descrizione: c.descrizione,
        immagine: c.immagine,
        tags: c.tags || [],
        driver: normalizzaDriver(c.driver),
        driverNote: estraiNote(c.driver),
        x: Number(c.x),
        y: Number(c.y)
      }));
      setCasi(formattati);
    }
  };

  const toggleTag = (tag: string) => {
    setTagsSelezionati(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Compattata prima di finire nello stato/DB: le foto di copertina
    // arrivano spesso a piena risoluzione dalla fotocamera.
    setComprimendoImmagine(true);
    try {
      const dataUrl = await comprimiImmagine(file);
      setImmagine(dataUrl);
    } finally {
      setComprimendoImmagine(false);
    }
  };

  const messaggioErrore = (codice: string) => {
    switch (codice) {
      case 'codice_errato':
        return 'Codice di gruppo errato. Inserisci il codice scelto quando hai creato questa scheda.';
      case 'codice_troppo_corto':
        return 'Il codice di gruppo deve avere almeno 4 caratteri.';
      case 'caso_non_trovato':
        return 'Questo caso studio non esiste più (forse è stato cancellato).';
      default:
        return 'Errore durante il salvataggio. Riprova.';
    }
  };

  const resetForm = () => {
    setGruppoNome(''); setGruppoNum(''); setTitolo(''); setDescrizione(''); setImmagine('');
    setTagsSelezionati([]); setTagPersonalizzato(''); setCodiceGruppo('');
    setCodiceGiaVerificato(false);
    setDesiderabilita(DRIVER_DEFAULT); setFattibilita(DRIVER_DEFAULT); setResponsabilita(DRIVER_DEFAULT); setVitalita(DRIVER_DEFAULT);
    setNote({ desiderabilita: '', fattibilita: '', responsabilita: '', vitalita: '' });
    setEditId(null);
    setStep('gruppo');
    setMaxStepRaggiunto(0);
  };

  const inviaConsegna = async () => {
    setErroreSalvataggio('');
    setSalvataggioInCorso(true);

    const { x, y } = coordinateDaDriver(desiderabilita, fattibilita, responsabilita, vitalita);

    const tagPersonalizzatoTrim = tagPersonalizzato.trim();
    const tagsFinali = tagPersonalizzatoTrim
      ? [...tagsSelezionati, tagPersonalizzatoTrim]
      : tagsSelezionati;

    const driver = costruisciDriver({ desiderabilita, fattibilita, responsabilita, vitalita }, note);

    const { error } = editId !== null
      ? await supabase.rpc('aggiorna_caso_studio', {
          p_id: editId,
          p_codice: codiceGruppo,
          p_gruppo_nome: gruppoNome,
          p_gruppo_num: Number(gruppoNum),
          p_titolo: titolo,
          p_descrizione: descrizione,
          p_immagine: immagine,
          p_tags: tagsFinali,
          p_driver: driver,
          p_x: x,
          p_y: y,
        })
      : await supabase.rpc('crea_caso_studio', {
          p_gruppo_nome: gruppoNome,
          p_gruppo_num: Number(gruppoNum),
          p_titolo: titolo,
          p_descrizione: descrizione,
          p_immagine: immagine,
          p_tags: tagsFinali,
          p_driver: driver,
          p_x: x,
          p_y: y,
          p_codice: codiceGruppo,
        });

    setSalvataggioInCorso(false);

    if (error) {
      console.error('Errore nel salvataggio:', error);
      setErroreSalvataggio(messaggioErrore(error.message));
      return;
    }

    resetForm();
    await caricaDati();
    setActiveTab('gestisci');
  };

  const avviaModifica = (c: any, codiceVerificato: string) => {
    setEditId(c.id);
    setGruppoNome(c.gruppoNome);
    setGruppoNum(c.gruppoNum);
    setTitolo(c.titolo);
    setDescrizione(c.descrizione);
    setImmagine(c.immagine || '');
    setCodiceGruppo(codiceVerificato);
    setCodiceGiaVerificato(true);
    setErroreSalvataggio('');
    const tagsEsistenti: string[] = c.tags || [];
    setTagsSelezionati(tagsEsistenti.filter(t => tagOptions.includes(t)));
    setTagPersonalizzato(tagsEsistenti.find(t => !tagOptions.includes(t)) || '');
    if (c.driver) {
      setDesiderabilita(c.driver.desiderabilita);
      setFattibilita(c.driver.fattibilita);
      setResponsabilita(c.driver.responsabilita);
      setVitalita(c.driver.vitalita);
    }
    setNote(c.driverNote || { desiderabilita: '', fattibilita: '', responsabilita: '', vitalita: '' });
    setStep('gruppo');
    setMaxStepRaggiunto(0);
    setActiveTab('crea');
  };

  const chiediSblocco = async (c: any) => {
    // Con un team già loggato proviamo prima la sua password: se è quella
    // usata alla creazione, si continua subito senza reinserire nulla.
    if (team) {
      const { data, error } = await supabase.rpc('verifica_codice_caso_studio', { p_id: c.id, p_codice: team.password });
      if (!error && data) {
        avviaModifica(c, team.password);
        return;
      }
    }
    setCasoDaSbloccare(c);
    setCodiceSblocco('');
    setErroreSblocco('');
  };

  const confermaSblocco = async () => {
    if (!casoDaSbloccare) return;
    setVerificaInCorso(true);
    setErroreSblocco('');

    const { data, error } = await supabase.rpc('verifica_codice_caso_studio', {
      p_id: casoDaSbloccare.id,
      p_codice: codiceSblocco,
    });

    setVerificaInCorso(false);

    if (error) {
      setErroreSblocco('Errore di connessione. Riprova.');
      return;
    }
    if (!data) {
      setErroreSblocco('Codice errato. Controlla di aver scritto quello scelto alla creazione.');
      return;
    }

    const caso = casoDaSbloccare;
    setCasoDaSbloccare(null);
    avviaModifica(caso, codiceSblocco);
  };

  const chiediEliminazione = (c: any) => {
    setCasoDaEliminare(c);
    setCodiceEliminazione(team?.password || '');
    setErroreEliminazione('');
  };

  const confermaEliminazione = async () => {
    if (!casoDaEliminare) return;
    setEliminazioneInCorso(true);
    setErroreEliminazione('');

    const { error } = await supabase.rpc('elimina_caso_studio', {
      p_id: casoDaEliminare.id,
      p_codice: codiceEliminazione,
    });

    setEliminazioneInCorso(false);

    if (error) {
      setErroreEliminazione(
        error.message === 'codice_errato'
          ? 'Codice errato. Controlla di aver scritto quello scelto alla creazione.'
          : 'Errore durante la cancellazione. Riprova.'
      );
      return;
    }

    setCasoDaEliminare(null);
    if (editId === casoDaEliminare.id) resetForm();
    await caricaDati();
  };

  const gruppoValido = gruppoNome.trim() !== '' && String(gruppoNum).trim() !== '' && (codiceGiaVerificato || codiceGruppo.trim().length >= 4);
  const contenutiValidi = titolo.trim() !== '' && descrizione.trim() !== '';

  const stepValido = (s: Step) => {
    if (s === 'gruppo') return gruppoValido;
    if (s === 'contenuti') return contenutiValidi;
    return true;
  };

  const indiceCorrente = STEPS.findIndex(s => s.id === step);

  const vaiAStep = (nuovo: Step) => {
    const indiceNuovo = STEPS.findIndex(s => s.id === nuovo);
    if (indiceNuovo <= maxStepRaggiunto) setStep(nuovo);
  };

  const avanti = () => {
    if (!stepValido(step)) return;
    const prossimo = STEPS[indiceCorrente + 1];
    if (prossimo) {
      setStep(prossimo.id);
      setMaxStepRaggiunto(prev => Math.max(prev, indiceCorrente + 1));
    }
  };

  const indietro = () => {
    const precedente = STEPS[indiceCorrente - 1];
    if (precedente) setStep(precedente.id);
  };

  const casiFiltrati = filtroGruppo.trim()
    ? casi.filter(c => String(c.gruppoNum) === String(filtroGruppo.trim()))
    : casi;

  const casoInVotazione = casoAttivoId !== null ? casi.find(c => c.id === casoAttivoId) || null : null;

  useEffect(() => {
    setMioVoto(null);
    setErroreVoto('');
    if (casoAttivoId === null || !numeroGruppoVoto.trim()) return;

    const caricaMioVoto = async () => {
      const { data } = await supabase
        .from('voti_revisione')
        .select('colore')
        .eq('caso_id', casoAttivoId)
        .eq('gruppo_num', Number(numeroGruppoVoto.trim()))
        .maybeSingle();
      if (data) setMioVoto(data.colore as Colore);
    };
    caricaMioVoto();
  }, [casoAttivoId, numeroGruppoVoto]);

  const votaCartellino = async (colore: Colore) => {
    if (casoAttivoId === null) return;
    const numero = numeroGruppoVoto.trim();
    if (!numero) {
      setErroreVoto('Inserisci il numero del tuo gruppo prima di votare.');
      return;
    }

    setVotoInCorso(true);
    setErroreVoto('');
    const { error } = await supabase.rpc('vota_caso_studio', {
      p_caso_id: casoAttivoId,
      p_gruppo_num: Number(numero),
      p_colore: colore,
    });
    setVotoInCorso(false);

    if (error) {
      setErroreVoto(
        error.message === 'votazione_non_attiva'
          ? 'La votazione per questo caso studio si è chiusa proprio ora. Attendi che il/la docente ne apra una nuova.'
          : 'Errore durante il voto. Riprova.'
      );
      return;
    }
    setMioVoto(colore);
  };

  return (
    <main className="min-h-screen px-6 py-10 max-w-2xl mx-auto">
      {comprimendoImmagine && <SfondoCaricamento />}
      <div className="flex justify-between items-center mb-8 border-b border-stone-200 pb-4">
        <div className="flex items-center space-x-4">
          <a href="/" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 rounded">&larr; Home</a>
          {team && (
            <span className="text-xs uppercase tracking-widest bg-stone-100 border border-stone-200 px-3 py-1.5 rounded-full text-stone-600 font-medium">
              Gruppo {team.numero} — {team.nome}
            </span>
          )}
          <a href="/manuali?attivita=design_case_studies" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 rounded">📚 Manuale</a>
        </div>
        <div className="space-x-2">
          <button onClick={() => setActiveTab('crea')} className={`px-4 py-2 rounded-full text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 ${activeTab === 'crea' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200'}`}>
            {editId !== null ? 'Modifica Scheda' : '+ Nuova Consegna'}
          </button>
          <button onClick={() => setActiveTab('gestisci')} className={`px-4 py-2 rounded-full text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 ${activeTab === 'gestisci' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200'}`}>
            Elenco & Modifiche ({casi.length})
          </button>
          <button onClick={() => setActiveTab('vota')} className={`px-4 py-2 rounded-full text-xs font-medium transition relative focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 ${activeTab === 'vota' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200'}`}>
            🗳️ Vota in Aula
            {casoInVotazione && activeTab !== 'vota' && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white" aria-hidden="true"></span>
            )}
            {casoInVotazione && activeTab !== 'vota' && <span className="sr-only"> (votazione attiva)</span>}
          </button>
        </div>
      </div>

      {activeTab === 'crea' ? (
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-serif">{editId !== null ? 'Modifica Caso Studio' : 'Raccontaci il vostro progetto'}</h1>
            <p className="text-stone-600 text-sm mt-1">Cinque passaggi brevi: gruppo, progetto, temi, valutazione e un riepilogo finale prima di inviare.</p>
          </div>

          <nav aria-label="Passaggi della consegna" className="flex items-center justify-between bg-white p-3 rounded-2xl border border-stone-200 shadow-sm">
            {STEPS.map((s, i) => {
              const raggiungibile = i <= maxStepRaggiunto;
              const attivo = s.id === step;
              const completato = i < maxStepRaggiunto || (i === maxStepRaggiunto && stepValido(s.id) && i < indiceCorrente);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => vaiAStep(s.id)}
                  disabled={!raggiungibile}
                  aria-current={attivo ? 'step' : undefined}
                  className={`flex-1 flex flex-col items-center space-y-1.5 py-1.5 rounded-xl transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 ${raggiungibile ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition ${
                      attivo ? 'bg-stone-900 text-white' : completato ? 'bg-emerald-100 text-emerald-700' : raggiungibile ? 'bg-stone-100 text-stone-600' : 'bg-stone-50 text-stone-300'
                    }`}
                  >
                    {completato && !attivo ? '✓' : s.numero}
                  </span>
                  <span className={`text-[10px] font-medium ${attivo ? 'text-stone-900' : 'text-stone-400'}`}>{s.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="bg-white p-8 rounded-2xl border border-stone-200 shadow-sm space-y-6">
            {step === 'gruppo' && (
              <div className="space-y-5">
                {team && editId === null ? (
                  <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-3 text-xs font-medium">
                    <span aria-hidden="true">✓</span>
                    <span>Gruppo {team.numero} — {team.nome}. Userete il codice del vostro team per modificare questa scheda in futuro.</span>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-stone-500">Chi siete, e come farete a dimostrare in futuro che questa scheda è vostra.</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="gruppo-nome" className="block text-xs font-medium uppercase text-stone-500 mb-1">Nome Gruppo</label>
                        <input id="gruppo-nome" type="text" required value={gruppoNome} onChange={e => setGruppoNome(e.target.value)} placeholder="Es. Design Studio" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
                      </div>
                      <div>
                        <label htmlFor="gruppo-num" className="block text-xs font-medium uppercase text-stone-500 mb-1">Numero Gruppo</label>
                        <input id="gruppo-num" type="number" required value={gruppoNum} onChange={e => setGruppoNum(e.target.value)} placeholder="Es. 4" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
                      </div>
                    </div>

                    {codiceGiaVerificato ? (
                      <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-3 text-xs font-medium">
                        <span aria-hidden="true">✓</span>
                        <span>Codice di gruppo verificato — potete modificare questa scheda.</span>
                      </div>
                    ) : (
                      <div>
                        <label htmlFor="codice-gruppo" className="block text-xs font-medium uppercase text-stone-500 mb-1">Codice di Gruppo</label>
                        <input
                          id="codice-gruppo"
                          type="password"
                          required
                          minLength={4}
                          value={codiceGruppo}
                          onChange={e => setCodiceGruppo(e.target.value)}
                          placeholder="Scegli un codice (min. 4 caratteri)..."
                          className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900"
                        />
                        <p className="text-[11px] text-stone-400 mt-1">
                          Vi servirà per modificare questa scheda in futuro: conservatelo, non è recuperabile.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {step === 'contenuti' && (
              <div className="space-y-5">
                <p className="text-sm text-stone-500">Il cuore della consegna: cosa avete progettato e perché.</p>
                <div>
                  <label htmlFor="titolo" className="block text-xs font-medium uppercase text-stone-500 mb-1">Titolo del Progetto</label>
                  <input id="titolo" type="text" required value={titolo} onChange={e => setTitolo(e.target.value)} placeholder="Es. Superleggera" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
                </div>

                <div>
                  <span className="block text-xs font-medium uppercase text-stone-500 mb-1">Immagine di Copertina / Progetto</span>
                  <div className="flex items-center space-x-4 border border-dashed border-stone-300 p-4 rounded-xl bg-stone-50/50">
                    <div className="w-20 h-20 rounded-xl bg-stone-100 border border-stone-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                      {immagine ? (
                        <img src={immagine} alt="Anteprima dell'immagine caricata" className="max-w-full max-h-full object-contain p-1 animate-scale-in" />
                      ) : (
                        <span className="text-[10px] text-stone-400 font-medium tracking-wide">NO IMG</span>
                      )}
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <label htmlFor="immagine-upload" className="sr-only">Carica un'immagine di copertina</label>
                      <input id="immagine-upload" type="file" accept="image/*" onChange={handleImageChange} disabled={comprimendoImmagine} className="w-full text-xs text-stone-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-stone-900 file:text-white cursor-pointer disabled:opacity-60" />
                      {comprimendoImmagine && <ImpulsoCaricamento etichetta="Comprimo l'immagine..." />}
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="descrizione" className="block text-xs font-medium uppercase text-stone-500 mb-1">Descrizione Critica</label>
                  <textarea id="descrizione" rows={4} required value={descrizione} onChange={e => setDescrizione(e.target.value)} placeholder="Analizza il contesto, le leve di cambiamento e il valore generato..." className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900"></textarea>
                </div>
              </div>
            )}

            {step === 'tag' && (
              <div className="space-y-4">
                <p className="text-sm text-stone-500">A quali temi si collega il vostro progetto? Sceglietene quanti ne servono, o aggiungetene uno vostro.</p>
                <div className="grid grid-cols-2 gap-2">
                  {tagOptions.map(tag => (
                    <label key={tag} className={`flex items-center space-x-2 text-xs p-2.5 rounded-xl border cursor-pointer transition ${tagsSelezionati.includes(tag) ? 'bg-stone-900 text-white border-stone-900' : 'bg-stone-50/50 border-stone-200 text-stone-700 hover:border-stone-400'}`}>
                      <input
                        type="checkbox"
                        checked={tagsSelezionati.includes(tag)}
                        onChange={() => toggleTag(tag)}
                        className="accent-stone-900"
                      />
                      <span>{tag}</span>
                    </label>
                  ))}
                </div>
                <div>
                  <label htmlFor="tag-personalizzato" className="sr-only">Tag personalizzato</label>
                  <input
                    id="tag-personalizzato"
                    type="text"
                    value={tagPersonalizzato}
                    onChange={e => setTagPersonalizzato(e.target.value)}
                    placeholder="Altro (tag personalizzato)..."
                    className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900"
                  />
                </div>
              </div>
            )}

            {step === 'driver' && (
              <div className="space-y-6">
                <p className="text-sm text-stone-500">Ponderate il vostro progetto sui 4 driver di innovazione, da 0 a {MAX_DRIVER}. Non esiste una combinazione "giusta": riflettete onestamente su ciascuna domanda.</p>
                {([
                  ['desiderabilita', desiderabilita, setDesiderabilita],
                  ['fattibilita', fattibilita, setFattibilita],
                  ['responsabilita', responsabilita, setResponsabilita],
                  ['vitalita', vitalita, setVitalita],
                ] as const).map(([chiave, valore, setValore]) => (
                  <div key={chiave}>
                    <div className="flex justify-between text-sm mb-1 font-medium">
                      <label htmlFor={`driver-${chiave}`}>{DRIVER_INFO[chiave].etichetta}</label>
                      <span className="text-stone-500">{valore}</span>
                    </div>
                    <p className="text-[11px] text-stone-400 mb-2">{DRIVER_INFO[chiave].domanda}</p>
                    <div
                      role="radiogroup"
                      id={`driver-${chiave}`}
                      aria-label={`${DRIVER_INFO[chiave].etichetta}, da 0 a ${MAX_DRIVER}`}
                      className="flex gap-1.5"
                    >
                      {Array.from({ length: MAX_DRIVER + 1 }, (_, n) => n).map(n => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={valore === n}
                          onClick={() => (setValore as (n: number) => void)(n)}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 ${
                            valore === n ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-200 text-stone-600 hover:border-stone-400'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <label htmlFor={`nota-${chiave}`} className="sr-only">Motivazione per {DRIVER_INFO[chiave].etichetta}</label>
                    <textarea
                      id={`nota-${chiave}`}
                      rows={2}
                      value={note[chiave]}
                      onChange={e => setNote(prev => ({ ...prev, [chiave]: e.target.value }))}
                      placeholder="Perché questo punteggio? Motivate brevemente la scelta (facoltativo)..."
                      className="w-full mt-2 border border-stone-200 rounded-xl p-2.5 text-xs bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900"
                    />
                  </div>
                ))}
              </div>
            )}

            {step === 'riepilogo' && (
              <div className="space-y-5">
                <p className="text-sm text-stone-500">Ultimo sguardo prima di inviare. Potete tornare indietro a qualsiasi passaggio per correggere.</p>

                <div className="flex items-start space-x-4 p-4 bg-stone-50 rounded-xl border border-stone-200">
                  <div className="w-16 h-16 rounded-xl bg-white border border-stone-200 overflow-hidden flex items-center justify-center flex-shrink-0 p-1">
                    {immagine ? (
                      <img src={immagine} alt="" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-stone-400 font-bold">NO IMG</span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-base">{titolo || 'Senza titolo'}</h3>
                    <p className="text-xs text-stone-500">Gruppo {gruppoNum || '—'} — {gruppoNome || '—'}</p>
                  </div>
                </div>

                <p className="text-xs text-stone-600 leading-relaxed bg-stone-50 p-4 rounded-xl border border-stone-200 max-h-28 overflow-y-auto">
                  {descrizione || 'Nessuna descrizione inserita.'}
                </p>

                {(tagsSelezionati.length > 0 || tagPersonalizzato.trim()) && (
                  <div className="flex flex-wrap gap-1.5">
                    {[...tagsSelezionati, ...(tagPersonalizzato.trim() ? [tagPersonalizzato.trim()] : [])].map(tag => (
                      <span key={tag} className="text-[10px] bg-stone-100 border border-stone-200 px-2.5 py-1 rounded-full text-stone-600 font-medium">{tag}</span>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  {([
                    ['desiderabilita', desiderabilita],
                    ['fattibilita', fattibilita],
                    ['responsabilita', responsabilita],
                    ['vitalita', vitalita],
                  ] as const).map(([chiave, valore]) => (
                    <div key={chiave} className="bg-stone-50 p-2.5 rounded-xl border border-stone-200 text-xs">
                      <div className="flex justify-between"><span className="text-stone-500">{DRIVER_INFO[chiave].etichetta}</span><b>{valore}</b></div>
                      {note[chiave].trim() && (
                        <p className="text-[11px] text-stone-500 italic mt-1 border-t border-stone-200 pt-1">&ldquo;{note[chiave]}&rdquo;</p>
                      )}
                    </div>
                  ))}
                </div>

                {erroreSalvataggio && (
                  <p className="text-xs text-red-600 font-medium text-center bg-red-50 border border-red-200 rounded-xl p-3">{erroreSalvataggio}</p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-stone-100 pt-5">
              <button
                type="button"
                onClick={indietro}
                disabled={indiceCorrente === 0}
                className="px-5 py-2.5 rounded-xl text-xs font-medium bg-stone-100 hover:bg-stone-200 transition disabled:opacity-0 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
              >
                &larr; Indietro
              </button>

              {step !== 'riepilogo' ? (
                <button
                  type="button"
                  onClick={avanti}
                  disabled={!stepValido(step)}
                  className="px-6 py-2.5 rounded-xl text-xs font-medium bg-stone-900 text-white hover:bg-stone-800 transition disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
                >
                  Avanti &rarr;
                </button>
              ) : (
                <button
                  type="button"
                  onClick={inviaConsegna}
                  disabled={salvataggioInCorso}
                  className="px-6 py-2.5 rounded-xl text-xs font-medium bg-stone-900 text-white hover:bg-stone-800 transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
                >
                  {salvataggioInCorso ? 'Salvataggio...' : editId !== null ? 'Salva Modifiche' : 'Invia Consegna'}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === 'gestisci' ? (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
            <div>
              <h1 className="text-2xl font-serif">Elenco Casi Studio</h1>
              <p className="text-stone-500 text-xs mt-0.5">Filtra per numero di gruppo per verificare o modificare la tua scheda.</p>
            </div>
            <div className="w-40">
              <label htmlFor="filtro-gruppo" className="sr-only">Filtra per numero di gruppo</label>
              <input id="filtro-gruppo" type="number" value={filtroGruppo} onChange={e => setFiltroGruppo(e.target.value)} placeholder="N. Gruppo..." className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
            </div>
          </div>

          <div className="space-y-3">
            {casiFiltrati.length === 0 ? (
              <div className="bg-white p-12 rounded-2xl border border-stone-200 text-center text-stone-400 text-sm">
                Nessun caso studio trovato.
              </div>
            ) : (
              casiFiltrati.map(c => (
                <div key={c.id} className="bg-white p-4 rounded-2xl border border-stone-200 flex items-center justify-between shadow-sm hover:border-stone-300 transition">
                  <div className="flex items-center space-x-4">
                    {c.immagine ? (
                      <div className="w-12 h-12 rounded-xl bg-stone-100 border border-stone-200 overflow-hidden flex items-center justify-center flex-shrink-0 p-1">
                        <img src={c.immagine} alt="" loading="lazy" decoding="async" className="max-w-full max-h-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center text-[10px] text-stone-400 font-bold flex-shrink-0">IMG</div>
                    )}
                    <div>
                      <h3 className="font-bold text-sm text-stone-900">{c.titolo}</h3>
                      <p className="text-xs text-stone-500">Gruppo {c.gruppoNum} — {c.gruppoNome}</p>
                    </div>
                  </div>
                  <div className="flex space-x-2 flex-shrink-0">
                    <button onClick={() => chiediSblocco(c)} className="text-xs bg-stone-100 hover:bg-stone-900 hover:text-white px-4 py-2 rounded-xl font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900">
                      Modifica
                    </button>
                    <button onClick={() => chiediEliminazione(c)} className="text-xs bg-stone-100 hover:bg-red-600 hover:text-white px-4 py-2 rounded-xl font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900">
                      Elimina
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-serif">Vota in Aula</h1>
            <p className="text-stone-500 text-xs mt-1">Quando il/la docente apre la votazione su un caso studio, esprimete il vostro cartellino come gruppo.</p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
            <div>
              <label htmlFor="numero-gruppo-voto" className="block text-xs font-medium uppercase text-stone-500 mb-1">Il vostro Numero Gruppo</label>
              <input
                id="numero-gruppo-voto"
                type="number"
                value={numeroGruppoVoto}
                onChange={e => setNumeroGruppoVoto(e.target.value)}
                placeholder="Es. 4"
                className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900"
              />
            </div>

            {!casoInVotazione ? (
              <div className="text-center text-stone-400 text-sm py-8">
                Nessuna votazione attiva al momento. Attendi che il/la docente apra il voto su un caso studio.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center space-x-4 p-4 bg-stone-50 rounded-xl border border-stone-200">
                  {casoInVotazione.immagine ? (
                    <div className="w-16 h-16 rounded-xl bg-white border border-stone-200 overflow-hidden flex items-center justify-center flex-shrink-0 p-1">
                      <img src={casoInVotazione.immagine} alt="" className="max-w-full max-h-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-[10px] text-stone-400 font-bold flex-shrink-0">IMG</div>
                  )}
                  <div>
                    <span className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold">🟢 In votazione ora</span>
                    <h3 className="font-serif font-bold text-base text-stone-900">{casoInVotazione.titolo}</h3>
                    <p className="text-xs text-stone-500">Gruppo {casoInVotazione.gruppoNum} — {casoInVotazione.gruppoNome}</p>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Maggiori dettagli, per votare con consapevolezza</h4>

                  {casoInVotazione.descrizione && (
                    <p className="text-xs text-stone-600 leading-relaxed">{casoInVotazione.descrizione}</p>
                  )}

                  {casoInVotazione.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {casoInVotazione.tags.map((tag: string) => (
                        <span key={tag} className="text-[10px] bg-stone-100 border border-stone-200 px-2.5 py-1 rounded-full text-stone-600 font-medium">{tag}</span>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2 pt-1">
                    <p className="text-[10px] text-stone-400">Come si sono autovalutati (scala 0-{MAX_DRIVER}) e perché:</p>
                    {(['desiderabilita', 'fattibilita', 'responsabilita', 'vitalita'] as const).map(chiave => {
                      const valore = casoInVotazione.driver?.[chiave] ?? 0;
                      const nota = casoInVotazione.driverNote?.[chiave];
                      return (
                        <div key={chiave} className="text-xs">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-medium text-stone-700">{DRIVER_INFO[chiave].etichetta}</span>
                            <b>{valore}/{MAX_DRIVER}</b>
                          </div>
                          <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                            <div className="h-full bg-stone-900 rounded-full" style={{ width: `${(valore / MAX_DRIVER) * 100}%` }} />
                          </div>
                          {nota && (
                            <p className="text-[11px] text-stone-500 italic mt-1">&ldquo;{nota}&rdquo;</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Il vostro voto">
                  {(['verde', 'giallo', 'rosso'] as Colore[]).map(colore => {
                    const stile = {
                      verde: 'bg-emerald-500',
                      giallo: 'bg-amber-400',
                      rosso: 'bg-red-500',
                    }[colore];
                    const selezionato = mioVoto === colore;
                    return (
                      <button
                        key={colore}
                        role="radio"
                        aria-checked={selezionato}
                        onClick={() => votaCartellino(colore)}
                        disabled={votoInCorso}
                        className={`flex flex-col items-center space-y-2 p-4 rounded-2xl border-2 transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 ${selezionato ? 'border-stone-900' : 'border-transparent hover:border-stone-300'}`}
                      >
                        <span className={`w-14 h-14 rounded-2xl ${stile} shadow-md flex items-center justify-center text-white text-xl`} aria-hidden="true">
                          {selezionato ? '✓' : ''}
                        </span>
                        <span className="text-xs font-medium capitalize text-stone-700">{colore}</span>
                      </button>
                    );
                  })}
                </div>

                {mioVoto && (
                  <p className="text-xs text-emerald-700 text-center font-medium" role="status">Voto registrato: {mioVoto}. Puoi cambiarlo finché la votazione resta aperta.</p>
                )}
                {erroreVoto && (
                  <p className="text-xs text-red-600 font-medium text-center bg-red-50 border border-red-200 rounded-xl p-3" role="alert">{erroreVoto}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {casoDaSbloccare && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Sblocca modifica: ${casoDaSbloccare.titolo}`}
          onClick={() => setCasoDaSbloccare(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div>
              <h2 className="font-serif font-bold text-lg">Sblocca modifica</h2>
              <p className="text-xs text-stone-500 mt-1">
                Inserisci il codice di gruppo scelto quando avete creato &ldquo;{casoDaSbloccare.titolo}&rdquo;.
              </p>
            </div>

            <form onSubmit={e => { e.preventDefault(); confermaSblocco(); }}>
              <label htmlFor="codice-sblocco" className="sr-only">Codice di gruppo</label>
              <input
                id="codice-sblocco"
                type="password"
                autoFocus
                value={codiceSblocco}
                onChange={e => setCodiceSblocco(e.target.value)}
                placeholder="Codice di gruppo..."
                className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900"
              />

              {erroreSblocco && (
                <p role="alert" className="text-xs text-red-600 font-medium mt-2 bg-red-50 border border-red-200 rounded-xl p-2.5">{erroreSblocco}</p>
              )}

              <div className="flex space-x-2 mt-4">
                <button
                  type="button"
                  onClick={() => setCasoDaSbloccare(null)}
                  className="flex-1 bg-stone-100 hover:bg-stone-200 transition text-xs font-medium py-2.5 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={verificaInCorso || !codiceSblocco.trim()}
                  className="flex-1 bg-stone-900 text-white hover:bg-stone-800 transition text-xs font-medium py-2.5 rounded-xl disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
                >
                  {verificaInCorso ? 'Verifica...' : 'Sblocca'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {casoDaEliminare && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Elimina: ${casoDaEliminare.titolo}`}
          onClick={() => setCasoDaEliminare(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div>
              <h2 className="font-serif font-bold text-lg text-red-700">Elimina definitivamente</h2>
              <p className="text-xs text-stone-500 mt-1">
                Stai per cancellare &ldquo;{casoDaEliminare.titolo}&rdquo; e tutti i voti ricevuti. Questa azione non si può annullare. Inserisci il codice di gruppo per confermare.
              </p>
            </div>

            <form onSubmit={e => { e.preventDefault(); confermaEliminazione(); }}>
              <label htmlFor="codice-eliminazione" className="sr-only">Codice di gruppo</label>
              <input
                id="codice-eliminazione"
                type="password"
                autoFocus
                value={codiceEliminazione}
                onChange={e => setCodiceEliminazione(e.target.value)}
                placeholder="Codice di gruppo..."
                className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-red-600"
              />

              {erroreEliminazione && (
                <p role="alert" className="text-xs text-red-600 font-medium mt-2 bg-red-50 border border-red-200 rounded-xl p-2.5">{erroreEliminazione}</p>
              )}

              <div className="flex space-x-2 mt-4">
                <button
                  type="button"
                  onClick={() => setCasoDaEliminare(null)}
                  className="flex-1 bg-stone-100 hover:bg-stone-200 transition text-xs font-medium py-2.5 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={eliminazioneInCorso || !codiceEliminazione.trim()}
                  className="flex-1 bg-red-600 text-white hover:bg-red-700 transition text-xs font-medium py-2.5 rounded-xl disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                >
                  {eliminazioneInCorso ? 'Eliminazione...' : 'Elimina'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
