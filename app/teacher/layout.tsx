'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DocenteContext } from '@/lib/docente-context';
import { ActionSheet } from '@/components/PannelliMobile';

const CHIAVE_SESSIONE = 'design3_docente_passcode';

const SEZIONI = [
  { href: '/teacher', etichetta: 'Dashboard & Matrice' },
  { href: '/teacher/radar', etichetta: '🕸️ Radar Multicriterio' },
  { href: '/teacher/review', etichetta: '🗳️ Peer Review in Aula' },
  { href: '/teacher/attivita', etichetta: '⚙️ Attività' },
  { href: '/teacher/team', etichetta: '👥 Team' },
  { href: '/teacher/crazy8', etichetta: '🎨 Crazy 8' },
  { href: '/teacher/hmw', etichetta: '🎭 HMW' },
  { href: '/teacher/testi', etichetta: '📝 Testi' },
];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pronto, setPronto] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [passLogin, setPassLogin] = useState('');
  const [erroreLogin, setErroreLogin] = useState(false);
  const [menuAperto, setMenuAperto] = useState(false);

  useEffect(() => {
    const salvato = sessionStorage.getItem(CHIAVE_SESSIONE);
    if (salvato) setPasscode(salvato);
    setPronto(true);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passLogin === 'polito27') {
      sessionStorage.setItem(CHIAVE_SESSIONE, passLogin);
      setPasscode(passLogin);
      setErroreLogin(false);
      setPassLogin('');
    } else {
      setErroreLogin(true);
    }
  };

  const logout = () => {
    sessionStorage.removeItem(CHIAVE_SESSIONE);
    setPasscode('');
  };

  if (!pronto) {
    return <main className="h-screen w-screen bg-[#FBF9F5]" />;
  }

  if (!passcode) {
    return (
      <main className="h-screen w-screen flex items-center justify-center bg-[#FBF9F5] px-4">
        <div className="bg-white p-8 rounded-2xl border border-stone-200 shadow-sm max-w-md w-full space-y-6">
          <div className="text-center space-y-2">
            <a href="/" className="text-xs uppercase tracking-widest text-stone-400 font-medium hover:text-stone-900">&larr; Home</a>
            <h1 className="text-2xl font-serif">Area Riservata Docente</h1>
            <p className="text-stone-500 text-xs">Inserisci la password amministrativa per accedere alla dashboard, al radar e alla peer review.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="docente-password" className="block text-xs font-medium uppercase text-stone-500 mb-1">Password</label>
              <input
                id="docente-password"
                type="password"
                value={passLogin}
                onChange={e => setPassLogin(e.target.value)}
                placeholder="Password..."
                className="w-full border border-stone-200 rounded-xl p-3 text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900"
                required
                autoFocus
              />
            </div>

            {erroreLogin && (
              <p role="alert" className="text-xs text-red-600 font-medium text-center">Password errata. Riprova.</p>
            )}

            <button type="submit" className="w-full bg-stone-900 text-white py-3 rounded-xl font-medium hover:bg-stone-800 transition text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900">
              Sblocca Area Docente
            </button>
          </form>
        </div>
      </main>
    );
  }

  const linkClasse = (href: string) =>
    `px-4 py-1.5 rounded-full text-xs font-medium transition ${pathname === href ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-700 hover:border-stone-400'}`;

  return (
    <DocenteContext.Provider value={{ passcode, logout }}>
      <div className="app-shell h-screen w-screen overflow-hidden flex flex-col bg-[#FBF9F5] text-stone-950">
        <header className="px-4 md:px-6 py-3 md:py-3.5 border-b border-stone-200 flex justify-between items-center gap-3 bg-[#FBF9F5]/90 backdrop-blur z-30 flex-shrink-0">
          <div className="flex items-center space-x-3 md:space-x-4 min-w-0">
            <a href="/" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium flex-shrink-0">&larr; Home</a>
            <span className="text-stone-300">/</span>
            <h1 className="font-serif text-base font-medium truncate">Area Docente</h1>
          </div>

          <nav className="hidden xl:flex items-center space-x-2">
            {SEZIONI.map(s => (
              <Link key={s.href} href={s.href} className={linkClasse(s.href)}>{s.etichetta}</Link>
            ))}
            <a href="/manuali" className="px-4 py-1.5 rounded-full text-xs font-medium transition bg-white border border-stone-200 text-stone-700 hover:border-stone-400">📚 Manuali</a>
            <button onClick={logout} className="px-4 py-1.5 rounded-full text-xs font-medium transition bg-white border border-stone-200 text-stone-500 hover:border-red-300 hover:text-red-600">
              Esci
            </button>
          </nav>

          {/* Da smartphone e tablet le otto sezioni non stanno in una riga: un solo
              pulsante con la sezione corrente apre l'elenco dal basso. */}
          <button
            onClick={() => setMenuAperto(true)}
            aria-haspopup="dialog"
            className="xl:hidden flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium bg-stone-900 text-white min-w-0"
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

        <div className="app-shell-body flex-1 overflow-hidden flex flex-col">
          {children}
        </div>
      </div>
    </DocenteContext.Provider>
  );
}
