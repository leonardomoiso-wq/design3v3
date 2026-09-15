'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DocenteContext } from '@/lib/docente-context';

const CHIAVE_SESSIONE = 'design3_docente_passcode';

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pronto, setPronto] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [passLogin, setPassLogin] = useState('');
  const [erroreLogin, setErroreLogin] = useState(false);

  useEffect(() => {
    const salvato = sessionStorage.getItem(CHIAVE_SESSIONE);
    if (salvato) setPasscode(salvato);
    setPronto(true);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passLogin === 'admin2026') {
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
              <label htmlFor="docente-password" className="block text-xs font-medium uppercase text-stone-500 mb-1">Password (admin2026)</label>
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
      <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#FBF9F5] text-stone-950">
        <header className="px-6 py-3.5 border-b border-stone-200 flex justify-between items-center bg-[#FBF9F5]/90 backdrop-blur z-30 flex-shrink-0">
          <div className="flex items-center space-x-4">
            <a href="/" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium">&larr; Home</a>
            <span className="text-stone-300">/</span>
            <h1 className="font-serif text-base font-medium">Area Docente</h1>
          </div>

          <div className="flex items-center space-x-2">
            <Link href="/teacher" className={linkClasse('/teacher')}>Dashboard &amp; Matrice</Link>
            <Link href="/teacher/radar" className={linkClasse('/teacher/radar')}>🕸️ Radar Multicriterio</Link>
            <Link href="/teacher/review" className={linkClasse('/teacher/review')}>🗳️ Peer Review in Aula</Link>
            <button onClick={logout} className="px-4 py-1.5 rounded-full text-xs font-medium transition bg-white border border-stone-200 text-stone-500 hover:border-red-300 hover:text-red-600">
              Esci
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden flex flex-col">
          {children}
        </div>
      </div>
    </DocenteContext.Provider>
  );
}
