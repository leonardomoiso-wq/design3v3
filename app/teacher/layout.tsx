'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { DocenteContext, CHIAVE_PASSWORD_DOCENTE, leggiPasswordSessione, aggiungiPasswordSessione, type CorsoDocente } from '@/lib/docente-context';
import { normalizzaCorso, messaggioErroreCorso, NOME_PIATTAFORMA } from '@/lib/corsi';
import { ActionSheet, BottomSheet } from '@/components/PannelliMobile';

// L'elenco dei corsi del docente è l'unione dei corsi aperti da ciascuna
// password della sessione (vedi lib/docente-context.tsx).
const CHIAVE_CORSO = 'edu_docente_corso';

const SEZIONI = [
  { href: '/teacher', etichetta: 'Dashboard & Matrice' },
  { href: '/teacher/radar', etichetta: '🕸️ Radar Multicriterio' },
  { href: '/teacher/review', etichetta: '🗳️ Peer Review in Aula' },
  { href: '/teacher/attivita', etichetta: '⚙️ Attività' },
  { href: '/teacher/team', etichetta: '👥 Team' },
  { href: '/teacher/crazy8', etichetta: '🎨 Crazy 8' },
  { href: '/teacher/hmw', etichetta: '🎭 HMW' },
  { href: '/teacher/testi', etichetta: '📝 Testi' },
  { href: '/teacher/corso', etichetta: '🧭 Corso & Form' },
];

async function corsiPerPassword(passwords: string[]): Promise<CorsoDocente[]> {
  const mappa = new Map<string, CorsoDocente>();
  for (const pw of passwords) {
    const { data, error } = await supabase.rpc('docente_accedi', { p_passcode: pw });
    if (error || !data) continue;
    for (const riga of data as any[]) {
      const esistente = mappa.get(riga.id);
      // Se più password aprono lo stesso corso si preferisce quella di
      // amministrazione (può fare tutto, anche creare corsi).
      if (!esistente || (!esistente.amministratore && riga.amministratore)) {
        mappa.set(riga.id, { ...normalizzaCorso(riga), passcode: pw, amministratore: !!riga.amministratore });
      }
    }
  }
  return Array.from(mappa.values()).sort((a, b) => Number(a.archiviato) - Number(b.archiviato) || (a.created_at || '').localeCompare(b.created_at || ''));
}

function FormPassword({ onEntra, errore, inCorso, etichettaPulsante }: { onEntra: (pw: string) => void; errore: string; inCorso: boolean; etichettaPulsante: string }) {
  const [pw, setPw] = useState('');
  return (
    <form onSubmit={e => { e.preventDefault(); if (pw) onEntra(pw); }} className="space-y-4">
      <div>
        <label htmlFor="docente-password" className="block text-xs font-medium uppercase text-stone-500 mb-1">Password del corso</label>
        <input
          id="docente-password"
          type="password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          placeholder="Password..."
          className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900"
          required
          autoFocus
        />
      </div>
      {errore && <p role="alert" className="text-xs text-red-600 font-medium text-center">{errore}</p>}
      <button type="submit" disabled={inCorso} className="w-full bg-stone-900 text-white py-3 rounded-xl font-medium hover:bg-stone-800 transition text-xs disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900">
        {inCorso ? 'Verifica...' : etichettaPulsante}
      </button>
    </form>
  );
}

const slug = (testo: string) => testo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function NuovoCorso({ corsoAttuale, onCreato, onChiudi }: { corsoAttuale: CorsoDocente; onCreato: (id: string, password: string) => void; onChiudi: () => void }) {
  const [nome, setNome] = useState('');
  const [codice, setCodice] = useState('');
  const [codiceToccato, setCodiceToccato] = useState(false);
  const [descrizione, setDescrizione] = useState('');
  const [stessaPassword, setStessaPassword] = useState(!corsoAttuale.amministratore);
  const [password, setPassword] = useState('');
  const [copia, setCopia] = useState(true);
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);

  const crea = async () => {
    setErrore('');
    const passwordCorso = stessaPassword ? corsoAttuale.passcode : password;
    setInCorso(true);
    const { data, error } = await supabase.rpc('docente_crea_corso', {
      p_passcode: corsoAttuale.passcode,
      p_nome: nome,
      p_codice: codice || slug(nome),
      p_descrizione: descrizione,
      p_password_corso: passwordCorso,
      p_copia_da: copia ? corsoAttuale.id : null,
    });
    setInCorso(false);
    if (error || !data) { setErrore(messaggioErroreCorso(error?.message || '')); return; }
    onCreato(data as string, passwordCorso);
  };

  return (
    <BottomSheet aperto onChiudi={onChiudi} etichetta="Aggiungi corso" titolo="Aggiungi un corso">
      <p className="text-xs text-stone-500">
        Ogni corso è uno spazio separato: studenti, team, casi studio, attività e votazioni non si mescolano con quelli degli altri corsi.
      </p>
      <div className="space-y-3">
        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Nome del corso</span>
          <input value={nome} onChange={e => { setNome(e.target.value); if (!codiceToccato) setCodice(slug(e.target.value)); }} placeholder="Es. Interaction Design 2026" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900" autoFocus />
        </label>
        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Codice per gli studenti</span>
          <input value={codice} onChange={e => { setCodice(e.target.value); setCodiceToccato(true); }} placeholder="es. ixd-2026" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50 font-mono focus:outline-none focus:ring-2 focus:ring-stone-900" />
          <span className="block text-[10px] text-stone-400 mt-1">Gli studenti lo usano per trovare il corso (anche con un link diretto).</span>
        </label>
        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Descrizione (facoltativa)</span>
          <input value={descrizione} onChange={e => setDescrizione(e.target.value)} placeholder="Es. Laboratorio del secondo anno" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900" />
        </label>

        <div className="space-y-2 bg-stone-50 border border-stone-200 rounded-2xl p-3">
          <label className="flex items-start gap-2 text-xs text-stone-700">
            <input type="checkbox" checked={stessaPassword} onChange={e => setStessaPassword(e.target.checked)} className="accent-stone-900 mt-0.5" />
            <span>Usa la stessa password di &ldquo;{corsoAttuale.nome}&rdquo;</span>
          </label>
          {!stessaPassword && (
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password docente del nuovo corso (min. 6 caratteri)" className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900" />
          )}
          <label className="flex items-start gap-2 text-xs text-stone-700">
            <input type="checkbox" checked={copia} onChange={e => setCopia(e.target.checked)} className="accent-stone-900 mt-0.5" />
            <span>Copia da &ldquo;{corsoAttuale.nome}&rdquo; i 4 driver del form, i tag predefiniti, i prompt suggeriti e i ruoli del docente (non studenti né consegne)</span>
          </label>
        </div>
      </div>
      {errore && <p role="alert" className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl p-2.5">{errore}</p>}
      <div className="flex gap-2">
        <button onClick={onChiudi} className="flex-1 bg-stone-100 hover:bg-stone-200 transition text-xs font-medium py-3 rounded-xl">Annulla</button>
        <button onClick={crea} disabled={inCorso || !nome.trim()} className="flex-1 bg-stone-900 text-white hover:bg-stone-800 transition text-xs font-medium py-3 rounded-xl disabled:opacity-50">
          {inCorso ? 'Creazione...' : 'Crea il corso'}
        </button>
      </div>
    </BottomSheet>
  );
}

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pronto, setPronto] = useState(false);
  const [corsi, setCorsi] = useState<CorsoDocente[]>([]);
  const [corsoId, setCorsoId] = useState<string | null>(null);
  const [erroreLogin, setErroreLogin] = useState('');
  const [loginInCorso, setLoginInCorso] = useState(false);
  const [menuAperto, setMenuAperto] = useState(false);
  const [menuCorsiAperto, setMenuCorsiAperto] = useState(false);
  const [nuovoCorsoAperto, setNuovoCorsoAperto] = useState(false);
  const [altraPasswordAperta, setAltraPasswordAperta] = useState(false);

  const applicaCorsi = useCallback((elenco: CorsoDocente[], preferito?: string | null) => {
    setCorsi(elenco);
    let salvato: string | null = null;
    try { salvato = sessionStorage.getItem(CHIAVE_CORSO); } catch { /* */ }
    const scelto =
      elenco.find(c => c.id === preferito) ||
      elenco.find(c => c.id === salvato) ||
      elenco.find(c => !c.archiviato) ||
      elenco[0];
    setCorsoId(scelto?.id ?? null);
    if (scelto) { try { sessionStorage.setItem(CHIAVE_CORSO, scelto.id); } catch { /* */ } }
  }, []);

  const ricaricaCorsi = useCallback(async (idDaSelezionare?: string) => {
    const elenco = await corsiPerPassword(leggiPasswordSessione());
    applicaCorsi(elenco, idDaSelezionare);
  }, [applicaCorsi]);

  useEffect(() => {
    const avvia = async () => {
      const passwords = leggiPasswordSessione();
      if (passwords.length > 0) {
        const elenco = await corsiPerPassword(passwords);
        applicaCorsi(elenco);
      }
      setPronto(true);
    };
    avvia();
  }, [applicaCorsi]);

  const entra = async (pw: string, onFatto?: () => void) => {
    setErroreLogin('');
    setLoginInCorso(true);
    const nuovi = await corsiPerPassword([pw]);
    if (nuovi.length === 0) {
      setLoginInCorso(false);
      setErroreLogin('Password errata: non apre nessun corso.');
      return;
    }
    const passwords = aggiungiPasswordSessione(pw);
    const elenco = await corsiPerPassword(passwords);
    setLoginInCorso(false);
    applicaCorsi(elenco, nuovi[0].id);
    onFatto?.();
  };

  const logout = () => {
    try {
      sessionStorage.removeItem(CHIAVE_PASSWORD_DOCENTE);
      sessionStorage.removeItem(CHIAVE_CORSO);
    } catch { /* */ }
    setCorsi([]);
    setCorsoId(null);
  };

  const cambiaCorso = (id: string) => {
    setCorsoId(id);
    try { sessionStorage.setItem(CHIAVE_CORSO, id); } catch { /* */ }
  };

  const corso = corsi.find(c => c.id === corsoId) || null;

  if (!pronto) {
    return <main className="h-screen w-screen bg-[#FBF9F5]" />;
  }

  if (!corso) {
    return (
      <main className="h-screen w-screen flex items-center justify-center bg-[#FBF9F5] px-4">
        <div className="bg-white p-8 rounded-2xl border border-stone-200 shadow-sm max-w-md w-full space-y-6">
          <div className="text-center space-y-2">
            <a href="/" className="text-xs uppercase tracking-widest text-stone-400 font-medium hover:text-stone-900">&larr; {NOME_PIATTAFORMA}</a>
            <h1 className="text-2xl font-serif">Area Riservata Docente</h1>
            <p className="text-stone-500 text-xs">Inserisci la password del tuo corso: entrerai nel suo spazio di lavoro, con la sua coorte di studenti. Con la password di amministrazione vedi tutti i corsi.</p>
          </div>
          <FormPassword onEntra={pw => entra(pw)} errore={erroreLogin} inCorso={loginInCorso} etichettaPulsante="Entra nel corso" />
        </div>
      </main>
    );
  }

  const linkClasse = (href: string) =>
    `px-4 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap ${pathname === href ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-700 hover:border-stone-400'}`;

  const amministratore = corsi.some(c => c.amministratore);

  return (
    <DocenteContext.Provider value={{ passcode: corso.passcode, corso, corsi, amministratore, cambiaCorso, ricaricaCorsi, logout }}>
      <div className="app-shell h-screen w-screen overflow-hidden flex flex-col bg-[#FBF9F5] text-stone-950">
        <header className="px-4 md:px-6 py-3 md:py-3.5 border-b border-stone-200 flex justify-between items-center gap-3 bg-[#FBF9F5]/90 backdrop-blur z-30 flex-shrink-0">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <a href="/" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium flex-shrink-0 max-md:hidden">&larr; Home</a>
            <span className="text-stone-300 max-md:hidden">/</span>
            {/* Selettore dell'ecosistema: tutto ciò che c'è sotto riguarda
                solo il corso scelto qui. */}
            <button
              onClick={() => setMenuCorsiAperto(true)}
              aria-haspopup="dialog"
              className="flex items-center gap-2 min-w-0 pl-3 pr-2.5 py-1.5 rounded-full bg-amber-50 border border-amber-200 hover:border-amber-400 transition"
              title="Cambia corso"
            >
              <span className="text-[10px] uppercase tracking-widest text-amber-700 font-bold flex-shrink-0 max-sm:hidden">Corso</span>
              <span className="font-serif text-sm font-medium truncate max-w-[10rem] md:max-w-[16rem]">{corso.nome}</span>
              {corso.archiviato && <span className="text-[9px] uppercase bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded-full">archiviato</span>}
              <span aria-hidden="true" className="text-amber-700 text-xs">▾</span>
            </button>
          </div>

          <nav className="hidden min-[1680px]:flex items-center space-x-2">
            {SEZIONI.map(s => (
              <Link key={s.href} href={s.href} className={linkClasse(s.href)}>{s.etichetta}</Link>
            ))}
            <a href="/manuali" className="px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition bg-white border border-stone-200 text-stone-700 hover:border-stone-400">📚 Manuali</a>
            <button onClick={logout} className="px-4 py-1.5 rounded-full text-xs font-medium transition bg-white border border-stone-200 text-stone-500 hover:border-red-300 hover:text-red-600">
              Esci
            </button>
          </nav>

          {/* Su schermi più stretti le sezioni non stanno in una riga: un
              solo pulsante con la sezione corrente apre l'elenco dal basso. */}
          <button
            onClick={() => setMenuAperto(true)}
            aria-haspopup="dialog"
            className="min-[1680px]:hidden flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium bg-stone-900 text-white min-w-0"
          >
            <span className="truncate max-w-[9rem]">{SEZIONI.find(s => s.href === pathname)?.etichetta ?? 'Menu'}</span>
            <span aria-hidden="true">☰</span>
          </button>
        </header>

        <ActionSheet
          aperto={menuAperto}
          onChiudi={() => setMenuAperto(false)}
          titolo="Sezioni dell'area docente"
          azioni={[
            ...SEZIONI.map(s => ({ chiave: s.href, etichetta: s.etichetta, href: s.href, attiva: pathname === s.href })),
            { chiave: 'manuali', etichetta: '📚 Manuali', href: '/manuali' },
            { chiave: 'esci', etichetta: 'Esci', pericolo: true, onSeleziona: logout },
          ]}
        />

        <ActionSheet
          aperto={menuCorsiAperto}
          onChiudi={() => setMenuCorsiAperto(false)}
          titolo={amministratore ? 'Corsi della piattaforma (amministrazione)' : 'I tuoi corsi'}
          azioni={[
            ...corsi.map(c => ({
              chiave: c.id,
              etichetta: c.nome,
              descrizione: `codice ${c.codice}${c.archiviato ? ' · archiviato' : ''}`,
              attiva: c.id === corso.id,
              onSeleziona: () => cambiaCorso(c.id),
            })),
            { chiave: 'nuovo', etichetta: '＋ Aggiungi corso', descrizione: 'Un nuovo spazio con studenti e attività propri', onSeleziona: () => setNuovoCorsoAperto(true) },
            { chiave: 'altra', etichetta: '🔑 Entra in un altro corso', descrizione: 'Con la password di quel corso', onSeleziona: () => { setErroreLogin(''); setAltraPasswordAperta(true); } },
          ]}
        />

        {nuovoCorsoAperto && (
          <NuovoCorso
            corsoAttuale={corso}
            onChiudi={() => setNuovoCorsoAperto(false)}
            onCreato={async (id, pw) => {
              aggiungiPasswordSessione(pw);
              setNuovoCorsoAperto(false);
              await ricaricaCorsi(id);
            }}
          />
        )}

        <BottomSheet aperto={altraPasswordAperta} onChiudi={() => setAltraPasswordAperta(false)} etichetta="Entra in un altro corso" titolo="Entra in un altro corso" larghezzaDesktop="md:max-w-sm">
          <p className="text-xs text-stone-500">Il corso si aggiungerà al selettore in alto, insieme a quelli già aperti.</p>
          <FormPassword onEntra={pw => entra(pw, () => setAltraPasswordAperta(false))} errore={erroreLogin} inCorso={loginInCorso} etichettaPulsante="Aggiungi accesso" />
        </BottomSheet>

        {/* key: cambiando corso ogni pagina riparte da zero, senza stati o
            sottoscrizioni realtime rimasti dal corso precedente. */}
        <div key={corso.id} className="app-shell-body flex-1 overflow-hidden flex flex-col">
          {children}
        </div>
      </div>
    </DocenteContext.Provider>
  );
}
