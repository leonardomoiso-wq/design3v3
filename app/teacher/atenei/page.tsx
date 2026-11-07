'use client';
// Atenei (solo amministrazione): ogni ateneo raccoglie i suoi corsi e ha
// uno spazio per le attività di ateneo (es. il Contest). Qui si creano e
// si rinominano, e si copiano gli indirizzi da condividere.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useDocente } from '@/lib/docente-context';
import { caricaAtenei, messaggioErroreCorso, percorsoCorso, type Ateneo } from '@/lib/corsi';
import Info from '@/components/Info';

const classeInput = 'w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900';

function Link({ percorso }: { percorso: string }) {
  const [copiato, setCopiato] = useState(false);
  const [origine, setOrigine] = useState('');
  useEffect(() => { setOrigine(window.location.origin); }, []);
  return (
    <span className="inline-flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-full pl-3 pr-1 py-1 max-w-full">
      <a href={percorso} target="_blank" rel="noreferrer" className="text-xs font-mono text-stone-700 truncate hover:underline">{percorso}</a>
      <button
        type="button"
        onClick={async () => { try { await navigator.clipboard.writeText(origine + percorso); setCopiato(true); setTimeout(() => setCopiato(false), 1800); } catch { /* */ } }}
        className="text-[11px] bg-white border border-stone-300 px-2.5 py-1 rounded-full font-medium hover:border-stone-500 flex-shrink-0"
      >
        {copiato ? 'Copiato ✓' : 'Copia'}
      </button>
    </span>
  );
}

export default function AteneiPage() {
  const { corsi, amministratore, ricaricaCorsi, corso } = useDocente();
  const passcodeAdmin = corsi.find(c => c.amministratore)?.passcode || '';
  const [atenei, setAtenei] = useState<Ateneo[]>([]);
  const [modifica, setModifica] = useState<{ id: string | null; nome: string; codice: string; descrizione: string; password: string } | null>(null);
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);

  const carica = () => caricaAtenei().then(setAtenei);
  useEffect(() => { carica(); }, []);

  if (!amministratore) {
    return <div className="p-8 text-sm text-stone-500">Questa sezione richiede la password di amministrazione.</div>;
  }

  const salva = async () => {
    if (!modifica) return;
    setErrore('');
    setInCorso(true);
    const { error } = modifica.id
      ? await supabase.rpc('docente_aggiorna_ateneo', { p_id: modifica.id, p_passcode: passcodeAdmin, p_nome: modifica.nome, p_codice: modifica.codice, p_descrizione: modifica.descrizione })
      : await supabase.rpc('docente_crea_ateneo', { p_passcode: passcodeAdmin, p_nome: modifica.nome, p_codice: modifica.codice, p_password_spazio: modifica.password || null });
    setInCorso(false);
    if (error) { setErrore(messaggioErroreCorso(error.message)); return; }
    setModifica(null);
    await carica();
    await ricaricaCorsi(corso.id);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 space-y-6">
        <div className="flex justify-between items-center gap-4 flex-wrap">
          <h1 className="text-2xl font-serif">
            Atenei
            <Info>Ogni ateneo ha la sua pagina con i corsi e uno spazio per le attività di ateneo, come il Contest, che non richiedono di scegliere un corso. Lo spazio si apre dal selettore del corso in alto.</Info>
          </h1>
          <button onClick={() => { setErrore(''); setModifica({ id: null, nome: '', codice: '', descrizione: '', password: '' }); }} className="bg-stone-900 text-white px-5 py-2.5 rounded-xl text-xs font-medium hover:bg-stone-800 transition">
            + Nuovo ateneo
          </button>
        </div>

        <ul className="space-y-4 entra-cascata">
          {atenei.map(a => {
            const corsiAteneo = corsi.filter(c => c.ateneo_id === a.id && !c.spazio_ateneo);
            return (
              <li key={a.id} className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div className="min-w-0">
                    <h2 className="font-serif font-bold text-lg">{a.nome}<span className="apice">(/{a.codice})</span></h2>
                    {a.descrizione && <p className="text-xs text-stone-500 mt-1">{a.descrizione}</p>}
                  </div>
                  <button onClick={() => { setErrore(''); setModifica({ id: a.id, nome: a.nome, codice: a.codice, descrizione: a.descrizione, password: '' }); }} className="text-xs bg-stone-100 hover:bg-stone-200 px-3 py-1.5 rounded-full font-medium transition">Modifica</button>
                </div>
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] uppercase tracking-widest text-stone-400 font-bold w-28">Pagina ateneo</span><Link percorso={`/${a.codice}`} /></div>
                  <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] uppercase tracking-widest text-stone-400 font-bold w-28">Contest</span><Link percorso={`/${a.codice}/contest`} /></div>
                </div>
                <div className="border-t border-stone-100 pt-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">Corsi ({corsiAteneo.length})</p>
                  {corsiAteneo.length === 0 && <p className="text-xs text-stone-400">Nessun corso. Si assegna da Corso &amp; Form.</p>}
                  {corsiAteneo.map(c => (
                    <div key={c.id} className="flex flex-wrap items-center gap-2">
                      <span className="text-sm w-56 truncate">{c.nome}</span>
                      <Link percorso={percorsoCorso(c)} />
                    </div>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {modifica && (
        <div className="fixed inset-0 z-40 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label={modifica.id ? 'Modifica ateneo' : 'Nuovo ateneo'} onClick={() => setModifica(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="font-serif font-bold text-lg">{modifica.id ? 'Modifica ateneo' : 'Nuovo ateneo'}</h2>
            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Nome</span>
              <input value={modifica.nome} onChange={e => setModifica({ ...modifica, nome: e.target.value })} placeholder="Es. Politecnico di Torino" className={classeInput} autoFocus />
            </label>
            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Codice nell’indirizzo</span>
              <input value={modifica.codice} onChange={e => setModifica({ ...modifica, codice: e.target.value })} placeholder="es. polito" className={`${classeInput} font-mono`} />
            </label>
            {modifica.id ? (
              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Descrizione (facoltativa)</span>
                <input value={modifica.descrizione} onChange={e => setModifica({ ...modifica, descrizione: e.target.value })} className={classeInput} />
              </label>
            ) : (
              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">
                  Password dello spazio di ateneo
                  <Info lato="destra">Chi la conosce gestisce le attività di ateneo (es. il Contest). Lasciala vuota per usare la password di amministrazione.</Info>
                </span>
                <input type="password" value={modifica.password} onChange={e => setModifica({ ...modifica, password: e.target.value })} placeholder="Facoltativa, min. 6 caratteri" className={classeInput} />
              </label>
            )}
            {errore && <p role="alert" className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl p-2.5">{errore}</p>}
            <div className="flex gap-2">
              <button onClick={() => setModifica(null)} className="flex-1 bg-stone-100 hover:bg-stone-200 transition text-xs font-medium py-3 rounded-xl">Annulla</button>
              <button onClick={salva} disabled={inCorso || !modifica.nome.trim() || !modifica.codice.trim()} className="flex-1 bg-stone-900 text-white hover:bg-stone-800 transition text-xs font-medium py-3 rounded-xl disabled:opacity-50">
                {inCorso ? 'Salvo...' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
