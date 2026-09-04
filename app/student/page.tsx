'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function StudentPage() {
  const [activeTab, setActiveTab] = useState<'crea' | 'gestisci'>('crea');
  const [casi, setCasi] = useState<any[]>([]);
  
  const [editId, setEditId] = useState<number | null>(null);
  const [gruppoNome, setGruppoNome] = useState('');
  const [gruppoNum, setGruppoNum] = useState('');
  const [titolo, setTitolo] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [immagine, setImmagine] = useState<string>('');
  const [desiderabilita, setDesiderabilita] = useState(50);
  const [fattibilita, setFattibilita] = useState(50);
  const [responsabilita, setResponsabilita] = useState(50);
  const [vitalita, setVitalita] = useState(50);

  const [filtroGruppo, setFiltroGruppo] = useState('');

  useEffect(() => {
    caricaDati();
  }, []);

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
        driver: c.driver,
        x: Number(c.x),
        y: Number(c.y)
      }));
      setCasi(formattati);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImmagine(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const x = fattibilita - desiderabilita; 
    const y = vitalita - responsabilita;

    const payload = {
      id: editId !== null ? editId : Date.now(),
      gruppo_nome: gruppoNome,
      gruppo_num: gruppoNum,
      titolo,
      descrizione,
      immagine,
      driver: { desiderabilita, fattibilita, responsabilita, vitalita },
      x,
      y
    };

    const { error } = await supabase.from('casi_studio').upsert(payload);

    if (error) {
      console.error("Errore nel salvataggio:", error);
      alert("Errore durante il salvataggio della consegna su Supabase.");
      return;
    }

    setGruppoNome(''); setGruppoNum(''); setTitolo(''); setDescrizione(''); setImmagine('');
    setDesiderabilita(50); setFattibilita(50); setResponsabilita(50); setVitalita(50);
    setEditId(null);
    await caricaDati();
    setActiveTab('gestisci');
  };

  const avviaModifica = (c: any) => {
    setEditId(c.id);
    setGruppoNome(c.gruppoNome);
    setGruppoNum(c.gruppoNum);
    setTitolo(c.titolo);
    setDescrizione(c.descrizione);
    setImmagine(c.immagine || '');
    if (c.driver) {
      setDesiderabilita(c.driver.desiderabilita);
      setFattibilita(c.driver.fattibilita);
      setResponsabilita(c.driver.responsabilita);
      setVitalita(c.driver.vitalita);
    }
    setActiveTab('crea');
  };

  const casiFiltrati = filtroGruppo.trim() 
    ? casi.filter(c => String(c.gruppoNum) === String(filtroGruppo.trim()))
    : casi;

  return (
    <main className="min-h-screen px-6 py-10 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-8 border-b border-stone-200 pb-4">
        <a href="/" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium">&larr; Home</a>
        <div className="space-x-2">
          <button onClick={() => setActiveTab('crea')} className={`px-4 py-2 rounded-full text-xs font-medium transition ${activeTab === 'crea' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200'}`}>
            {editId !== null ? 'Modifica Scheda' : '+ Nuova Consegna'}
          </button>
          <button onClick={() => setActiveTab('gestisci')} className={`px-4 py-2 rounded-full text-xs font-medium transition ${activeTab === 'gestisci' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200'}`}>
            Elenco & Modifiche ({casi.length})
          </button>
        </div>
      </div>

      {activeTab === 'crea' ? (
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-serif">{editId !== null ? 'Modifica Caso Studio' : 'Consegna Analitica'}</h1>
            <p className="text-stone-600 text-sm mt-1">Inserisci i dati del gruppo, carica l&apos;immagine e valuta i driver di innovazione.</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl border border-stone-200 shadow-sm space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Nome Gruppo</label>
                <input type="text" required value={gruppoNome} onChange={e => setGruppoNome(e.target.value)} placeholder="Es. Design Studio" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:border-stone-900" />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Numero Gruppo</label>
                <input type="number" required value={gruppoNum} onChange={e => setGruppoNum(e.target.value)} placeholder="Es. 4" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:border-stone-900" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Titolo del Progetto</label>
              <input type="text" required value={titolo} onChange={e => setTitolo(e.target.value)} placeholder="Es. Superleggera" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:border-stone-900" />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Immagine di Copertina / Progetto</label>
              <div className="flex items-center space-x-4 border border-dashed border-stone-300 p-4 rounded-xl bg-stone-50/50">
                <div className="w-20 h-20 rounded-xl bg-stone-100 border border-stone-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                  {immagine ? (
                    <img src={immagine} alt="Preview" className="max-w-full max-h-full object-contain p-1" />
                  ) : (
                    <span className="text-[10px] text-stone-400 font-medium tracking-wide">NO IMG</span>
                  )}
                </div>
                <div className="flex-1">
                  <input type="file" accept="image/*" onChange={handleImageChange} className="w-full text-xs text-stone-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-stone-900 file:text-white cursor-pointer" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase text-stone-500 mb-1">Descrizione Critica</label>
              <textarea rows={4} required value={descrizione} onChange={e => setDescrizione(e.target.value)} placeholder="Analizza il contesto, le leve di cambiamento e il valore generato..." className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50/50 focus:outline-none focus:border-stone-900"></textarea>
            </div>

            <div className="border-t border-stone-100 pt-6 space-y-5">
              <h3 className="font-serif text-sm font-medium">Ponderazione Driver IDEO (0 - 100)</h3>
              
              <div>
                <div className="flex justify-between text-xs text-stone-500 mb-1.5 font-medium"><span>Desiderabilità</span><span>{desiderabilita}</span></div>
                <input type="range" min="0" max="100" value={desiderabilita} onChange={e => setDesiderabilita(Number(e.target.value))} className="w-full accent-stone-900 cursor-pointer" />
              </div>

              <div>
                <div className="flex justify-between text-xs text-stone-500 mb-1.5 font-medium"><span>Fattibilità</span><span>{fattibilita}</span></div>
                <input type="range" min="0" max="100" value={fattibilita} onChange={e => setFattibilita(Number(e.target.value))} className="w-full accent-stone-900 cursor-pointer" />
              </div>

              <div>
                <div className="flex justify-between text-xs text-stone-500 mb-1.5 font-medium"><span>Responsabilità</span><span>{responsabilita}</span></div>
                <input type="range" min="0" max="100" value={responsabilita} onChange={e => setResponsabilita(Number(e.target.value))} className="w-full accent-stone-900 cursor-pointer" />
              </div>

              <div>
                <div className="flex justify-between text-xs text-stone-500 mb-1.5 font-medium"><span>Vitalità</span><span>{vitalita}</span></div>
                <input type="range" min="0" max="100" value={vitalita} onChange={e => setVitalita(Number(e.target.value))} className="w-full accent-stone-900 cursor-pointer" />
              </div>
            </div>

            <button type="submit" className="w-full bg-stone-900 text-white py-3.5 rounded-xl font-medium hover:bg-stone-800 transition shadow-sm">
              {editId !== null ? 'Salva Modifiche' : 'Invia Consegna'}
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
            <div>
              <h1 className="text-2xl font-serif">Elenco Casi Studio</h1>
              <p className="text-stone-500 text-xs mt-0.5">Filtra per numero di gruppo per verificare o modificare la tua scheda.</p>
            </div>
            <div className="w-40">
              <input type="number" value={filtroGruppo} onChange={e => setFiltroGruppo(e.target.value)} placeholder="N. Gruppo..." className="w-full border border-stone-200 rounded-xl p-2.5 text-xs bg-stone-50 focus:outline-none focus:border-stone-900" />
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
                        <img src={c.immagine} alt="" className="max-w-full max-h-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center text-[10px] text-stone-400 font-bold flex-shrink-0">IMG</div>
                    )}
                    <div>
                      <h3 className="font-bold text-sm text-stone-900">{c.titolo}</h3>
                      <p className="text-xs text-stone-500">Gruppo {c.gruppoNum} — {c.gruppoNome}</p>
                    </div>
                  </div>
                  <button onClick={() => avviaModifica(c)} className="text-xs bg-stone-100 hover:bg-stone-900 hover:text-white px-4 py-2 rounded-xl font-medium transition">
                    Modifica
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </main>
  );
}