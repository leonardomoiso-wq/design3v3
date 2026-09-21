'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTeam } from '../../lib/team-context';

const messaggioErrore = (codice: string) => {
  switch (codice) {
    case 'codice_errato':
      return 'Codice di gruppo errato. Inserisci il codice scelto alla prima versione.';
    case 'codice_troppo_corto':
      return 'Il codice di gruppo deve avere almeno 4 caratteri.';
    default:
      return 'Errore durante il salvataggio. Riprova.';
  }
};

export default function HmwPage() {
  const { team } = useTeam();
  const [attivitaInfo, setAttivitaInfo] = useState<{ id: string; stato: string; richiediLogPrompt: boolean; richiediRiflessione: boolean } | null | undefined>(undefined);
  const [iterazioni, setIterazioni] = useState<any[]>([]);
  const [ruoli, setRuoli] = useState<any[]>([]);
  const [stressTest, setStressTest] = useState<any[]>([]);

  const [gruppoNome, setGruppoNome] = useState('');
  const [gruppoNum, setGruppoNum] = useState('');
  const [testo, setTesto] = useState('');
  const [notePrompt, setNotePrompt] = useState('');
  const [riflessione, setRiflessione] = useState('');
  const [codiceGruppo, setCodiceGruppo] = useState('');
  const [erroreSalvataggio, setErroreSalvataggio] = useState('');
  const [salvataggioInCorso, setSalvataggioInCorso] = useState(false);

  // Con un team già loggato, non serve reinserire nome/numero né inventare
  // un codice: si precompila con l'identità del team.
  useEffect(() => {
    if (!team) return;
    setGruppoNome(prev => prev || team.nome);
    setGruppoNum(prev => prev || String(team.numero));
    setCodiceGruppo(prev => prev || team.password);
  }, [team]);

  const [ruoliSelezionati, setRuoliSelezionati] = useState<string[]>([]);
  const [codiceStressTest, setCodiceStressTest] = useState('');
  const [stressTestInCorso, setStressTestInCorso] = useState(false);
  const [erroreStressTest, setErroreStressTest] = useState('');

  const [nomeRuoloProposto, setNomeRuoloProposto] = useState('');
  const [descrizioneRuoloProposto, setDescrizioneRuoloProposto] = useState('');
  const [condividiClasse, setCondividiClasse] = useState(false);
  const [ruoloInCorso, setRuoloInCorso] = useState(false);
  const [erroreRuolo, setErroreRuolo] = useState('');
  const [ruoloProposto, setRuoloProposto] = useState(false);

  const caricaTutto = async () => {
    const [{ data: iter }, { data: r }, { data: st }] = await Promise.all([
      supabase.from('hmw_iterazioni').select('*').order('versione', { ascending: true }),
      supabase.from('ruoli_prompt').select('*'),
      supabase.from('hmw_stress_test').select('*'),
    ]);
    if (iter) setIterazioni(iter);
    if (r) setRuoli(r);
    if (st) setStressTest(st);
  };

  useEffect(() => {
    const caricaAttivita = async () => {
      const { data } = await supabase.from('attivita').select('*').eq('tipo', 'hmw_role_prompting').maybeSingle();
      if (data) {
        setAttivitaInfo({ id: data.id, stato: data.stato, richiediLogPrompt: data.richiedi_log_prompt, richiediRiflessione: data.richiedi_riflessione });
      } else {
        setAttivitaInfo(null);
      }
    };

    caricaAttivita();
    caricaTutto();

    const channel = supabase
      .channel('realtime-hmw-studenti')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hmw_iterazioni' }, caricaTutto)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ruoli_prompt' }, caricaTutto)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hmw_stress_test' }, caricaTutto)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const numeroValido = gruppoNum.trim() !== '' && !Number.isNaN(Number(gruppoNum));
  const iterazioniDelTeam = numeroValido ? iterazioni.filter(i => i.gruppo_num === Number(gruppoNum)) : [];
  const prossimaVersione = iterazioniDelTeam.length + 1;
  const ultimaIterazione = iterazioniDelTeam[iterazioniDelTeam.length - 1] || null;

  const ruoliDisponibili = ruoli.filter(r => r.stato === 'approvato' && (r.visibilita === 'condiviso_classe' || r.gruppo_proponente_num === Number(gruppoNum)));

  const formValido =
    gruppoNome.trim() !== '' &&
    numeroValido &&
    testo.trim() !== '' &&
    codiceGruppo.trim().length >= 4 &&
    (!attivitaInfo?.richiediLogPrompt || notePrompt.trim() !== '') &&
    (!attivitaInfo?.richiediRiflessione || riflessione.trim() !== '');

  const inviaVersione = async () => {
    setErroreSalvataggio('');
    setSalvataggioInCorso(true);

    const { error } = await supabase.rpc('crea_hmw_iterazione', {
      p_attivita_id: attivitaInfo?.id ?? null,
      p_gruppo_nome: gruppoNome,
      p_gruppo_num: Number(gruppoNum),
      p_testo: testo,
      p_note_prompt: notePrompt,
      p_riflessione: riflessione,
      p_codice: codiceGruppo,
    });

    setSalvataggioInCorso(false);

    if (error) {
      setErroreSalvataggio(messaggioErrore(error.message));
      return;
    }

    setTesto('');
    setNotePrompt('');
    setRiflessione('');
    setCodiceStressTest(codiceGruppo);
    await caricaTutto();
  };

  const toggleRuolo = (id: string) => {
    setRuoliSelezionati(prev => {
      if (prev.includes(id)) return prev.filter(r => r !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const lanciaStressTest = async () => {
    if (!ultimaIterazione || ruoliSelezionati.length === 0 || !codiceStressTest.trim()) return;
    setErroreStressTest('');
    setStressTestInCorso(true);

    for (const ruoloId of ruoliSelezionati) {
      const ruolo = ruoli.find(r => r.id === ruoloId);
      if (!ruolo) continue;
      try {
        const res = await fetch('/api/hmw-stress-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hmwTesto: ultimaIterazione.testo, ruoloNome: ruolo.nome, ruoloDescrizione: ruolo.descrizione }),
        });
        const data = await res.json();
        if (data.text) {
          const { error } = await supabase.rpc('salva_stress_test', {
            p_hmw_iterazione_id: ultimaIterazione.id,
            p_ruolo_id: ruoloId,
            p_risposta_llm: data.text,
            p_codice: codiceStressTest,
          });
          if (error) setErroreStressTest(messaggioErrore(error.message));
        }
      } catch {
        setErroreStressTest('Errore di connessione al server AI.');
      }
    }

    setStressTestInCorso(false);
    await caricaTutto();
  };

  const proponiRuolo = async () => {
    setErroreRuolo('');
    if (!nomeRuoloProposto.trim() || !descrizioneRuoloProposto.trim()) {
      setErroreRuolo('Nome e descrizione del ruolo sono obbligatori.');
      return;
    }
    setRuoloInCorso(true);
    const { error } = await supabase.rpc('proponi_ruolo', {
      p_nome: nomeRuoloProposto,
      p_descrizione: descrizioneRuoloProposto,
      p_gruppo_nome: gruppoNome || null,
      p_gruppo_num: numeroValido ? Number(gruppoNum) : null,
      p_visibilita: condividiClasse ? 'condiviso_classe' : 'privato_team',
    });
    setRuoloInCorso(false);
    if (error) {
      setErroreRuolo('Errore durante l\'invio. Riprova.');
      return;
    }
    setNomeRuoloProposto('');
    setDescrizioneRuoloProposto('');
    setCondividiClasse(false);
    setRuoloProposto(true);
    setTimeout(() => setRuoloProposto(false), 4000);
    await caricaTutto();
  };

  if (attivitaInfo === undefined) {
    return <main className="min-h-screen flex items-center justify-center text-sm text-stone-400">Caricamento...</main>;
  }

  if (attivitaInfo === null || attivitaInfo.stato !== 'attiva') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center px-6 space-y-3">
        <span className="text-3xl" aria-hidden="true">🎭</span>
        <h1 className="text-xl font-serif">Questa attività non è ancora disponibile</h1>
        <p className="text-sm text-stone-500 max-w-sm">Il/la docente non l&apos;ha ancora attivata. Torna più tardi o chiedi in aula.</p>
        <a href="/" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium mt-4">&larr; Torna alla Home</a>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-8 border-b border-stone-200 pb-4">
        <a href="/" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium">&larr; Home</a>
      </div>

      <h1 className="text-2xl font-serif mb-1">🎭 HMW + Role-Prompting</h1>
      <p className="text-sm text-stone-500 mb-6">Scrivete il vostro How Might We, fatelo evolvere da v1 a v2, e mettetelo alla prova con punti di vista diversi.</p>

      <div className="space-y-5">
        <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">Il Gruppo</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Nome Gruppo</label>
              <input type="text" value={gruppoNome} onChange={e => setGruppoNome(e.target.value)} placeholder="Es. Design Studio" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Numero Gruppo</label>
              <input type="number" value={gruppoNum} onChange={e => setGruppoNum(e.target.value)} placeholder="Es. 4" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
            </div>
          </div>
        </div>

        {iterazioniDelTeam.length > 0 && (
          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">Cronologia (changelog)</h2>
            {iterazioniDelTeam.map(it => (
              <div key={it.id} className="bg-stone-50 p-3 rounded-xl border border-stone-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="font-bold">Versione {it.versione}</span>
                </div>
                <p className="text-stone-700">{it.testo}</p>
                {it.note_prompt && <p className="text-stone-500 italic">Log prompt: &ldquo;{it.note_prompt}&rdquo;</p>}
                {it.riflessione && <p className="text-stone-500 italic">Riflessione: &ldquo;{it.riflessione}&rdquo;</p>}
              </div>
            ))}
          </div>
        )}

        <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">
            {iterazioniDelTeam.length === 0 ? 'Scrivi il tuo HMW (versione 1)' : `Nuova versione (v${prossimaVersione})`}
          </h2>
          <div>
            <label className="block text-xs font-medium uppercase text-stone-500 mb-1">How Might We</label>
            <textarea rows={3} value={testo} onChange={e => setTesto(e.target.value)} placeholder="Come potremmo..." className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase text-stone-500 mb-1">
              Log Prompt {attivitaInfo.richiediLogPrompt ? '(obbligatorio)' : '(facoltativo)'}
            </label>
            <textarea rows={2} value={notePrompt} onChange={e => setNotePrompt(e.target.value)} placeholder="Che prompt/strumenti avete usato per arrivare qui?" className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase text-stone-500 mb-1">
              Riflessione {attivitaInfo.richiediRiflessione ? '(obbligatoria)' : '(facoltativa)'}
            </label>
            <textarea rows={2} value={riflessione} onChange={e => setRiflessione(e.target.value)} placeholder="Cosa è cambiato rispetto alla versione precedente e perché?" className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Codice di Gruppo</label>
            <input type="password" minLength={4} value={codiceGruppo} onChange={e => setCodiceGruppo(e.target.value)} placeholder={iterazioniDelTeam.length === 0 ? 'Scegli un codice (min. 4 caratteri)...' : 'Il codice scelto alla v1...'} className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
            {iterazioniDelTeam.length === 0 && <p className="text-[11px] text-stone-400 mt-1">Vi servirà per salvare le versioni successive: conservatelo, non è recuperabile.</p>}
          </div>

          {erroreSalvataggio && <p className="text-xs text-red-600 font-medium text-center bg-red-50 border border-red-200 rounded-xl p-3">{erroreSalvataggio}</p>}

          <button onClick={inviaVersione} disabled={!formValido || salvataggioInCorso} className="w-full bg-stone-900 text-white py-3 rounded-xl text-sm font-medium hover:bg-stone-800 transition disabled:opacity-40 disabled:cursor-not-allowed">
            {salvataggioInCorso ? 'Salvataggio...' : `Salva versione ${prossimaVersione}`}
          </button>
        </div>

        {ultimaIterazione && (
          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">Stress Test Multi-Ruolo (sulla v{ultimaIterazione.versione})</h2>
            <p className="text-xs text-stone-500">Scegliete 2-3 ruoli: risponderanno solo con domande e obiezioni, mai soluzioni.</p>
            <div className="grid grid-cols-2 gap-2">
              {ruoliDisponibili.length === 0 && <p className="text-xs text-stone-400 col-span-2">Nessun ruolo approvato disponibile ancora.</p>}
              {ruoliDisponibili.map(r => (
                <label key={r.id} className={`flex items-start gap-2 text-xs p-2.5 rounded-xl border cursor-pointer transition ${ruoliSelezionati.includes(r.id) ? 'bg-stone-900 text-white border-stone-900' : 'bg-stone-50/50 border-stone-200 text-stone-700 hover:border-stone-400'}`}>
                  <input type="checkbox" checked={ruoliSelezionati.includes(r.id)} onChange={() => toggleRuolo(r.id)} className="mt-0.5 accent-stone-900" />
                  <span><b>{r.nome}</b> — {r.descrizione}</span>
                </label>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Codice di Gruppo (per confermare)</label>
              <input type="password" value={codiceStressTest} onChange={e => setCodiceStressTest(e.target.value)} placeholder="Il codice del vostro team..." className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
            </div>
            {erroreStressTest && <p className="text-xs text-red-600 font-medium text-center bg-red-50 border border-red-200 rounded-xl p-3">{erroreStressTest}</p>}
            <button onClick={lanciaStressTest} disabled={ruoliSelezionati.length === 0 || !codiceStressTest.trim() || stressTestInCorso} className="w-full bg-stone-900 text-white py-3 rounded-xl text-sm font-medium hover:bg-stone-800 transition disabled:opacity-40 disabled:cursor-not-allowed">
              {stressTestInCorso ? 'Interrogazione in corso...' : 'Lancia Stress Test ✨'}
            </button>

            {stressTest.filter(st => st.hmw_iterazione_id === ultimaIterazione.id).map(st => {
              const ruolo = ruoli.find(r => r.id === st.ruolo_id);
              return (
                <div key={st.id} className="bg-stone-50 p-3 rounded-xl border border-stone-200 text-xs space-y-1">
                  <span className="font-bold">{ruolo?.nome || 'Ruolo'}</span>
                  <p className="text-stone-700 leading-relaxed">{st.risposta_llm}</p>
                </div>
              );
            })}
          </div>
        )}

        <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">Proponi un Ruolo per la Libreria</h2>
          <p className="text-xs text-stone-500">Ogni ruolo passa da un template fisso: voi scegliete solo chi è, il/la docente lo approva prima che si possa usare.</p>
          <div>
            <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Nome Ruolo</label>
            <input type="text" value={nomeRuoloProposto} onChange={e => setNomeRuoloProposto(e.target.value)} placeholder="Es. Ingegnere dei materiali" className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Descrizione</label>
            <textarea rows={2} value={descrizioneRuoloProposto} onChange={e => setDescrizioneRuoloProposto(e.target.value)} placeholder="Chi è, cosa gli sta a cuore, che tipo di obiezioni farebbe..." className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
          </div>
          <label className="flex items-center gap-2 text-xs text-stone-600">
            <input type="checkbox" checked={condividiClasse} onChange={e => setCondividiClasse(e.target.checked)} className="accent-stone-900" />
            Condividi con tutta la classe (altrimenti resta riservato al vostro team)
          </label>
          {erroreRuolo && <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl p-2.5">{erroreRuolo}</p>}
          {ruoloProposto && <p className="text-xs text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">Ruolo proposto! In attesa di approvazione del/della docente.</p>}
          <button onClick={proponiRuolo} disabled={ruoloInCorso} className="w-full bg-stone-100 hover:bg-stone-200 transition text-xs font-medium py-2.5 rounded-xl disabled:opacity-50">
            {ruoloInCorso ? 'Invio...' : 'Proponi Ruolo'}
          </button>
        </div>
      </div>
    </main>
  );
}
