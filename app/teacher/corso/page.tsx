'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useDocente, aggiungiPasswordSessione } from '@/lib/docente-context';
import { MAX_DRIVER } from '@/lib/driver';
import { MODELLI_DRIVER, messaggioErroreCorso, type ConfigurazioneCorso } from '@/lib/corsi';

const POSIZIONI = ['In alto a sinistra', 'In alto a destra', 'In basso a sinistra', 'In basso a destra'];

function Sezione({ titolo, sottotitolo, children }: { titolo: string; sottotitolo?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 md:p-6 space-y-4">
      <div>
        <h2 className="text-lg font-serif font-bold">{titolo}</h2>
        {sottotitolo && <p className="text-xs text-stone-500 mt-1">{sottotitolo}</p>}
      </div>
      {children}
    </section>
  );
}

function Campo({ etichetta, aiuto, children }: { etichetta: string; aiuto?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">{etichetta}</span>
      {children}
      {aiuto && <span className="block text-[10px] text-stone-400 mt-1">{aiuto}</span>}
    </label>
  );
}

const classeInput = 'w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-900';

export default function CorsoPage() {
  const { corso, passcode, ricaricaCorsi, corsi, cambiaCorso } = useDocente();

  const [nome, setNome] = useState(corso.nome);
  const [codice, setCodice] = useState(corso.codice);
  const [descrizione, setDescrizione] = useState(corso.descrizione);
  const [visibile, setVisibile] = useState(corso.visibile_in_home);
  const [archiviato, setArchiviato] = useState(corso.archiviato);
  const [config, setConfig] = useState<ConfigurazioneCorso>(corso.configurazione);

  const [esito, setEsito] = useState<{ sezione: string; ok: boolean; testo: string } | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [linkCopiato, setLinkCopiato] = useState(false);
  const [origine, setOrigine] = useState('');

  const [nuovaPassword, setNuovaPassword] = useState('');
  const [confermaPassword, setConfermaPassword] = useState('');
  const [confermaElimina, setConfermaElimina] = useState('');

  useEffect(() => { setOrigine(window.location.origin); }, []);

  const linkStudenti = `${origine}/?corso=${encodeURIComponent(corso.codice)}`;

  const salvaCorso = async (sezione: string, override?: { archiviato?: boolean }) => {
    setEsito(null);
    setInCorso(sezione);
    const { error } = await supabase.rpc('docente_aggiorna_corso', {
      p_corso_id: corso.id,
      p_passcode: passcode,
      p_nome: nome,
      p_codice: codice,
      p_descrizione: descrizione,
      p_visibile_in_home: visibile,
      p_archiviato: override?.archiviato ?? archiviato,
      p_configurazione: config,
    });
    setInCorso(null);
    if (error) { setEsito({ sezione, ok: false, testo: messaggioErroreCorso(error.message) }); return; }
    setEsito({ sezione, ok: true, testo: 'Salvato ✓' });
    await ricaricaCorsi(corso.id);
  };

  const cambiaPassword = async () => {
    setEsito(null);
    if (nuovaPassword !== confermaPassword) { setEsito({ sezione: 'password', ok: false, testo: 'Le due password non coincidono.' }); return; }
    setInCorso('password');
    const { error } = await supabase.rpc('docente_cambia_password_corso', { p_corso_id: corso.id, p_passcode: passcode, p_nuova_password: nuovaPassword });
    setInCorso(null);
    if (error) { setEsito({ sezione: 'password', ok: false, testo: messaggioErroreCorso(error.message) }); return; }
    // La sessione deve conoscere la nuova password per continuare a lavorare sul corso.
    aggiungiPasswordSessione(nuovaPassword);
    setNuovaPassword(''); setConfermaPassword('');
    setEsito({ sezione: 'password', ok: true, testo: 'Password aggiornata: comunicala agli altri docenti del corso.' });
    await ricaricaCorsi(corso.id);
  };

  const eliminaCorso = async () => {
    setEsito(null);
    setInCorso('elimina');
    const { error } = await supabase.rpc('docente_elimina_corso', { p_corso_id: corso.id, p_passcode: passcode, p_conferma_nome: confermaElimina });
    setInCorso(null);
    if (error) { setEsito({ sezione: 'elimina', ok: false, testo: messaggioErroreCorso(error.message) }); return; }
    const altro = corsi.find(c => c.id !== corso.id);
    await ricaricaCorsi(altro?.id);
    if (altro) cambiaCorso(altro.id);
  };

  const applicaModello = (indice: number) => {
    const m = MODELLI_DRIVER[indice];
    setConfig(prev => ({
      ...prev,
      framework: m.framework,
      driver: prev.driver.map((d, i) => ({ ...d, etichetta: m.driver[i][0], domanda: m.driver[i][1] })),
    }));
  };

  const modificaDriver = (i: number, campo: 'etichetta' | 'domanda', valore: string) =>
    setConfig(prev => ({ ...prev, driver: prev.driver.map((d, j) => (j === i ? { ...d, [campo]: valore } : d)) }));

  const messaggio = (sezione: string) =>
    esito?.sezione === sezione && (
      <p role={esito.ok ? 'status' : 'alert'} className={`text-xs font-medium ${esito.ok ? 'text-emerald-700' : 'text-red-600'}`}>{esito.testo}</p>
    );

  const pulsanteSalva = (sezione: string, etichetta = 'Salva') => (
    <div className="flex items-center gap-3">
      <button onClick={() => salvaCorso(sezione)} disabled={inCorso !== null} className="bg-stone-900 text-white px-5 py-2.5 rounded-full text-xs font-medium hover:bg-stone-800 transition disabled:opacity-50">
        {inCorso === sezione ? 'Salvataggio...' : etichetta}
      </button>
      {messaggio(sezione)}
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <span className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">Ecosistema del corso</span>
          <h1 className="text-2xl font-serif font-bold mt-1">{corso.nome}</h1>
          <p className="text-sm text-stone-500 mt-1">
            Studenti, team, consegne, attività e votazioni di questo corso sono separati da quelli degli altri corsi.
          </p>
        </div>

        <Sezione titolo="Corso e accesso studenti" sottotitolo="Come gli studenti trovano ed entrano in questo corso.">
          <div className="grid md:grid-cols-2 gap-3">
            <Campo etichetta="Nome del corso">
              <input value={nome} onChange={e => setNome(e.target.value)} className={classeInput} />
            </Campo>
            <Campo etichetta="Codice corso" aiuto="Lettere, numeri e trattini.">
              <input value={codice} onChange={e => setCodice(e.target.value)} className={`${classeInput} font-mono`} />
            </Campo>
          </div>
          <Campo etichetta="Descrizione">
            <input value={descrizione} onChange={e => setDescrizione(e.target.value)} placeholder="Es. Laboratorio del secondo anno" className={classeInput} />
          </Campo>
          <label className="flex items-start gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={visibile} onChange={e => setVisibile(e.target.checked)} className="accent-stone-900 mt-1" />
            <span>
              Mostra il corso nell&apos;elenco della home
              <span className="block text-xs text-stone-400">Se lo nascondi, gli studenti entrano solo con il codice o con il link qui sotto.</span>
            </span>
          </label>
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
            <code className="text-xs text-stone-700 break-all flex-1 min-w-0">{linkStudenti}</code>
            <button
              onClick={async () => { try { await navigator.clipboard.writeText(linkStudenti); setLinkCopiato(true); setTimeout(() => setLinkCopiato(false), 2000); } catch { /* */ } }}
              className="text-xs bg-white border border-stone-300 px-3 py-1.5 rounded-full font-medium hover:border-stone-500 flex-shrink-0"
            >
              {linkCopiato ? 'Copiato ✓' : 'Copia link per gli studenti'}
            </button>
          </div>
          {pulsanteSalva('corso')}
        </Sezione>

        <Sezione
          titolo="Form dei casi studio: i 4 driver"
          sottotitolo={`Il sistema di classificazione usato dagli studenti nel passo "Valutazione" (scala 0-${MAX_DRIVER}), sulla matrice, nel radar e nella peer review.`}
        >
          <div className="flex flex-wrap gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400 self-center mr-1">Parti da un modello</span>
            {MODELLI_DRIVER.map((m, i) => (
              <button key={m.nome} onClick={() => applicaModello(i)} className="text-xs bg-white border border-stone-200 px-3 py-1.5 rounded-full hover:border-stone-400">
                {m.nome}
              </button>
            ))}
          </div>

          <Campo etichetta="Nome del framework" aiuto="Compare nelle intestazioni (es. &quot;Driver IDEO 4-Driver&quot;).">
            <input value={config.framework} onChange={e => setConfig(prev => ({ ...prev, framework: e.target.value }))} className={classeInput} />
          </Campo>

          <div className="grid md:grid-cols-2 gap-3">
            {config.driver.map((d, i) => (
              <div key={d.chiave} className="border border-stone-200 rounded-2xl p-4 space-y-2 bg-stone-50/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Driver {i + 1}</span>
                  <span className="text-[10px] text-stone-400">Matrice: {POSIZIONI[i].toLowerCase()}</span>
                </div>
                <input
                  value={d.etichetta}
                  onChange={e => modificaDriver(i, 'etichetta', e.target.value)}
                  placeholder="Nome del driver"
                  aria-label={`Nome del driver ${i + 1}`}
                  className={`${classeInput} font-medium`}
                />
                <textarea
                  rows={3}
                  value={d.domanda}
                  onChange={e => modificaDriver(i, 'domanda', e.target.value)}
                  placeholder="Domanda guida mostrata agli studenti"
                  aria-label={`Domanda guida del driver ${i + 1}`}
                  className={`${classeInput} text-xs`}
                />
              </div>
            ))}
          </div>

          {/* Anteprima della matrice con le etichette scelte. */}
          <div className="grid grid-cols-2 gap-px bg-stone-200 rounded-2xl overflow-hidden border border-stone-200 text-[10px] font-bold uppercase tracking-widest text-stone-500" aria-label="Anteprima della matrice">
            {config.driver.map((d, i) => (
              <div key={d.chiave} className={`bg-[#FCFBF9] p-3 h-16 flex ${i < 2 ? 'items-start' : 'items-end'} ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                {i + 1}. {d.etichetta || '—'}
              </div>
            ))}
          </div>

          <Campo etichetta="Istruzioni per gli studenti (facoltative)" aiuto="Mostrate in cima al passo &quot;Valutazione&quot; del form.">
            <textarea rows={3} value={config.istruzioni} onChange={e => setConfig(prev => ({ ...prev, istruzioni: e.target.value }))} className={classeInput} />
          </Campo>

          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
            Cambiare i nomi dei driver non modifica i punteggi già dati: il driver 1 resta il driver 1. Se il corso ha già consegne, meglio decidere i driver prima di aprire il form agli studenti.
          </p>
          {pulsanteSalva('form', 'Salva il form')}
        </Sezione>

        <Sezione titolo="Password del corso" sottotitolo="Chi conosce questa password entra nell'area docente di questo corso (e solo di questo).">
          <div className="grid md:grid-cols-2 gap-3">
            <input type="password" value={nuovaPassword} onChange={e => setNuovaPassword(e.target.value)} placeholder="Nuova password (min. 6 caratteri)" aria-label="Nuova password" className={classeInput} />
            <input type="password" value={confermaPassword} onChange={e => setConfermaPassword(e.target.value)} placeholder="Ripeti la nuova password" aria-label="Ripeti la nuova password" className={classeInput} />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={cambiaPassword} disabled={inCorso !== null || !nuovaPassword} className="bg-stone-900 text-white px-5 py-2.5 rounded-full text-xs font-medium hover:bg-stone-800 transition disabled:opacity-50">
              {inCorso === 'password' ? 'Salvataggio...' : 'Cambia password'}
            </button>
            {messaggio('password')}
          </div>
        </Sezione>

        <Sezione titolo="Archivio ed eliminazione">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-stone-600 flex-1 min-w-[12rem]">
              {archiviato
                ? 'Il corso è archiviato: non compare agli studenti, che non possono più creare team né consegne. I dati restano consultabili qui.'
                : 'Archivia il corso a fine semestre: sparisce per gli studenti, ma i dati restano consultabili.'}
            </p>
            <button
              onClick={() => { const nuovo = !archiviato; setArchiviato(nuovo); salvaCorso('archivio', { archiviato: nuovo }); }}
              disabled={inCorso !== null}
              className="text-xs bg-white border border-stone-300 px-4 py-2 rounded-full font-medium hover:border-stone-500 disabled:opacity-50"
            >
              {archiviato ? 'Riattiva il corso' : 'Archivia il corso'}
            </button>
          </div>
          {messaggio('archivio')}

          <div className="border-t border-stone-100 pt-4 space-y-2">
            <p className="text-sm text-red-700 font-medium">Elimina definitivamente</p>
            <p className="text-xs text-stone-500">Cancella il corso e tutto il suo contenuto (team, casi studio, voti, attività, consegne). Non si può annullare. Scrivi il nome esatto del corso per confermare.</p>
            <div className="flex flex-wrap gap-2">
              <input value={confermaElimina} onChange={e => setConfermaElimina(e.target.value)} placeholder={corso.nome} aria-label="Nome del corso per confermare" className={`${classeInput} flex-1 min-w-[12rem]`} />
              <button onClick={eliminaCorso} disabled={inCorso !== null || confermaElimina !== corso.nome} className="bg-red-600 text-white px-5 py-2.5 rounded-xl text-xs font-medium hover:bg-red-700 transition disabled:opacity-40">
                {inCorso === 'elimina' ? 'Eliminazione...' : 'Elimina il corso'}
              </button>
            </div>
            {messaggio('elimina')}
          </div>
        </Sezione>
      </div>
    </div>
  );
}
