'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BottomSheet } from '@/components/PannelliMobile';
import { caricaTagCorso, CATEGORIE_ESEMPIO, TAG_VUOTI, type CategoriaTag, type TagCorso } from '@/lib/tag';

// Finestra docente per i tag del passo "Temi": categorie ("layer") con le
// loro voci, regola di selezione (una sola / più voci) e obbligatorietà.
// Quello che si imposta qui compare identico nel form degli studenti.

const classeInput = 'border border-stone-200 rounded-xl p-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-stone-900';

function AggiungiTag({ onAggiungi, disabilitato }: { onAggiungi: (testo: string) => Promise<boolean>; disabilitato: boolean }) {
  const [testo, setTesto] = useState('');
  const invia = async () => {
    if (!testo.trim()) return;
    if (await onAggiungi(testo.trim())) setTesto('');
  };
  return (
    <div className="flex gap-2">
      <input
        value={testo}
        onChange={e => setTesto(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); invia(); } }}
        placeholder="Nuova voce..."
        aria-label="Nuova voce"
        className={`${classeInput} flex-1 min-w-0`}
      />
      <button onClick={invia} disabled={disabilitato || !testo.trim()} className="text-xs bg-stone-900 text-white px-3.5 rounded-xl font-medium hover:bg-stone-800 transition disabled:opacity-40">
        Aggiungi
      </button>
    </div>
  );
}

function Chip({ testo, onElimina }: { testo: string; onElimina: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] bg-white border border-stone-200 rounded-full pl-3 pr-1.5 py-1">
      {testo}
      <button onClick={onElimina} aria-label={`Elimina ${testo}`} className="text-stone-300 hover:text-red-600 w-4 h-4 flex items-center justify-center">✕</button>
    </span>
  );
}

function SchedaCategoria({
  categoria, primo, ultimo, inCorso, onSalva, onSposta, onElimina, onAggiungiTag, onEliminaTag,
}: {
  categoria: CategoriaTag;
  primo: boolean;
  ultimo: boolean;
  inCorso: boolean;
  onSalva: (nome: string, selezione: 'singola' | 'multipla', obbligatoria: boolean) => void;
  onSposta: (direzione: number) => void;
  onElimina: () => void;
  onAggiungiTag: (testo: string) => Promise<boolean>;
  onEliminaTag: (id: string) => void;
}) {
  const [nome, setNome] = useState(categoria.nome);
  const [confermaElimina, setConfermaElimina] = useState(false);
  useEffect(() => setNome(categoria.nome), [categoria.nome]);

  return (
    <div className="border border-stone-200 rounded-2xl p-4 space-y-3 bg-stone-50/60">
      <div className="flex items-center gap-2">
        <input
          value={nome}
          onChange={e => setNome(e.target.value)}
          onBlur={() => { if (nome.trim() && nome.trim() !== categoria.nome) onSalva(nome, categoria.selezione, categoria.obbligatoria); }}
          aria-label="Nome della categoria"
          className={`${classeInput} flex-1 min-w-0 text-sm font-medium`}
        />
        <button onClick={() => onSposta(-1)} disabled={primo || inCorso} aria-label="Sposta su" className="w-8 h-8 rounded-lg border border-stone-200 bg-white text-stone-500 disabled:opacity-30">↑</button>
        <button onClick={() => onSposta(1)} disabled={ultimo || inCorso} aria-label="Sposta giù" className="w-8 h-8 rounded-lg border border-stone-200 bg-white text-stone-500 disabled:opacity-30">↓</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex bg-white border border-stone-200 rounded-full p-0.5" role="radiogroup" aria-label="Regola di selezione">
          {([['singola', 'Una sola voce'], ['multipla', 'Più voci']] as const).map(([valore, etichetta]) => (
            <button
              key={valore}
              role="radio"
              aria-checked={categoria.selezione === valore}
              onClick={() => onSalva(nome || categoria.nome, valore, categoria.obbligatoria)}
              className={`px-3 py-1 rounded-full transition ${categoria.selezione === valore ? 'bg-stone-900 text-white' : 'text-stone-600'}`}
            >
              {etichetta}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-stone-700">
          <input type="checkbox" checked={categoria.obbligatoria} onChange={e => onSalva(nome || categoria.nome, categoria.selezione, e.target.checked)} className="accent-stone-900" />
          Obbligatoria
        </label>
        <span className="flex-1" />
        {confermaElimina ? (
          <span className="flex items-center gap-2">
            <span className="text-red-700">Eliminare categoria e voci?</span>
            <button onClick={onElimina} className="text-red-600 font-medium">Sì</button>
            <button onClick={() => setConfermaElimina(false)} className="text-stone-500">No</button>
          </span>
        ) : (
          <button onClick={() => setConfermaElimina(true)} className="text-stone-400 hover:text-red-600">Elimina categoria</button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {categoria.tag.map(t => <Chip key={t.id} testo={t.testo} onElimina={() => onEliminaTag(t.id)} />)}
        {categoria.tag.length === 0 && <span className="text-[11px] text-stone-400">Nessuna voce: aggiungine almeno una.</span>}
      </div>
      <AggiungiTag onAggiungi={onAggiungiTag} disabilitato={inCorso} />
    </div>
  );
}

export default function GestioneTag({ passcode, corsoId, onChiudi }: { passcode: string; corsoId: string; onChiudi: () => void }) {
  const [dati, setDati] = useState<TagCorso>(TAG_VUOTI);
  const [caricato, setCaricato] = useState(false);
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [nuovaCategoria, setNuovaCategoria] = useState('');

  const carica = async () => {
    const { dati: nuovi, errore: e } = await caricaTagCorso(corsoId);
    if (e) setErrore('Errore nel caricamento dei tag.');
    setDati(nuovi);
    setCaricato(true);
  };

  useEffect(() => { carica(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [corsoId]);

  // Esegue una chiamata al database e ricarica tutto (pochi dati: va bene).
  const esegui = async (rpc: string, argomenti: Record<string, unknown>): Promise<boolean> => {
    setErrore('');
    setInCorso(true);
    const { error } = await supabase.rpc(rpc, { ...argomenti, p_passcode: passcode });
    await carica();
    setInCorso(false);
    if (error) {
      setErrore(error.message === 'passcode_errato' ? 'Password docente non valida: esci e rientra.' : 'Errore durante il salvataggio. Riprova.');
      return false;
    }
    return true;
  };

  const aggiungiTag = (testo: string, categoriaId: string | null) =>
    esegui('docente_aggiungi_tag_default', { p_corso_id: corsoId, p_testo: testo, p_categoria_id: categoriaId });

  const creaCategoria = async () => {
    if (!nuovaCategoria.trim()) return;
    if (await esegui('docente_crea_categoria_tag', { p_corso_id: corsoId, p_nome: nuovaCategoria.trim(), p_selezione: 'multipla', p_obbligatoria: false })) {
      setNuovaCategoria('');
    }
  };

  const inserisciEsempio = async () => {
    setInCorso(true);
    for (const c of CATEGORIE_ESEMPIO) {
      const { data: id, error } = await supabase.rpc('docente_crea_categoria_tag', {
        p_corso_id: corsoId, p_nome: c.nome, p_selezione: c.selezione, p_obbligatoria: c.obbligatoria, p_passcode: passcode,
      });
      if (error || !id) { setErrore('Errore durante il salvataggio. Riprova.'); break; }
      for (const t of c.tag) {
        await supabase.rpc('docente_aggiungi_tag_default', { p_corso_id: corsoId, p_testo: t, p_categoria_id: id, p_passcode: passcode });
      }
    }
    await carica();
    setInCorso(false);
  };

  return (
    <BottomSheet aperto onChiudi={onChiudi} etichetta="Tag dei casi studio" titolo="Tag dei casi studio" larghezzaDesktop="md:max-w-2xl">
      <p className="text-xs text-stone-500">
        Le voci che gli studenti scelgono nel passo &quot;Temi&quot; della consegna, organizzate per categoria. Per ogni categoria decidi se si può scegliere una sola voce o più voci, e se è obbligatoria.
      </p>

      {!caricato ? (
        <p className="text-xs text-stone-400">Caricamento...</p>
      ) : (
        <div className="space-y-3">
          {dati.categorie.map((c, i) => (
            <SchedaCategoria
              key={c.id}
              categoria={c}
              primo={i === 0}
              ultimo={i === dati.categorie.length - 1}
              inCorso={inCorso}
              onSalva={(nome, selezione, obbligatoria) => esegui('docente_aggiorna_categoria_tag', { p_id: c.id, p_nome: nome.trim(), p_selezione: selezione, p_obbligatoria: obbligatoria })}
              onSposta={direzione => esegui('docente_sposta_categoria_tag', { p_id: c.id, p_direzione: direzione })}
              onElimina={() => esegui('docente_elimina_categoria_tag', { p_id: c.id })}
              onAggiungiTag={testo => aggiungiTag(testo, c.id)}
              onEliminaTag={id => esegui('docente_elimina_tag_default', { p_id: id })}
            />
          ))}

          <div className="border border-dashed border-stone-300 rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Nuova categoria</p>
            <div className="flex gap-2">
              <input
                value={nuovaCategoria}
                onChange={e => setNuovaCategoria(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') creaCategoria(); }}
                placeholder="Es. Natura dell'Innovazione"
                aria-label="Nome della nuova categoria"
                className={`${classeInput} flex-1 min-w-0 text-sm`}
              />
              <button onClick={creaCategoria} disabled={inCorso || !nuovaCategoria.trim()} className="text-xs bg-stone-900 text-white px-4 rounded-xl font-medium hover:bg-stone-800 transition disabled:opacity-40">
                Crea
              </button>
            </div>
            {dati.categorie.length === 0 && (
              <button onClick={inserisciEsempio} disabled={inCorso} className="text-xs text-stone-600 underline underline-offset-2 hover:text-stone-900 disabled:opacity-50">
                Parti dall&apos;esempio: Natura dell&apos;Innovazione, Tipologia, Ampiezza
              </button>
            )}
          </div>

          <div className="border border-stone-200 rounded-2xl p-4 space-y-3">
            <div>
              <p className="text-sm font-medium">Altri temi <span className="text-stone-400 font-normal">(senza categoria, sempre facoltativi)</span></p>
              <p className="text-[11px] text-stone-400">Se non ci sono voci qui, il gruppo non compare agli studenti.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dati.senzaCategoria.map(t => <Chip key={t.id} testo={t.testo} onElimina={() => esegui('docente_elimina_tag_default', { p_id: t.id })} />)}
              {dati.senzaCategoria.length === 0 && <span className="text-[11px] text-stone-400">Nessuna voce.</span>}
            </div>
            <AggiungiTag onAggiungi={testo => aggiungiTag(testo, null)} disabilitato={inCorso} />
          </div>
        </div>
      )}

      {errore && <p role="alert" className="text-[11px] text-red-600 font-medium">{errore}</p>}
    </BottomSheet>
  );
}
