import { ATTIVITA } from '../lib/attivita';

export default function LandingPage() {
  return (
    <main className="min-h-screen px-8 py-12 max-w-5xl mx-auto flex flex-col">
      <nav className="flex justify-between items-center border-b border-stone-200 pb-6">
        <span className="font-serif tracking-tight font-bold text-lg">DESIGN 3</span>
        <a href="/manuali" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 rounded">
          📚 Manuali &amp; Tutorial
        </a>
      </nav>

      <div className="pt-16 pb-10 text-center space-y-5">
        <div className="inline-block text-xs uppercase tracking-widest bg-stone-200/60 px-3 py-1 rounded-full text-stone-600">
          Laboratorio di Design 3
        </div>
        <h1 className="text-5xl md:text-6xl font-serif max-w-3xl mx-auto leading-tight">
          Esplorare per progettare il cambiamento.
        </h1>
        <p className="text-stone-600 max-w-xl mx-auto text-base leading-relaxed">
          Le attività del laboratorio, tutte da qui. Scegli quella a cui vuoi partecipare.
        </p>
      </div>

      <div className="flex-1 grid sm:grid-cols-2 gap-6 pb-16">
        {ATTIVITA.map(attivita => (
          <div
            key={attivita.id}
            className={`rounded-3xl border p-8 flex flex-col justify-between transition ${
              attivita.stato === 'attiva'
                ? 'bg-white border-stone-200 shadow-sm hover:border-stone-300'
                : 'bg-stone-100/60 border-dashed border-stone-300'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-3xl" aria-hidden="true">{attivita.icona}</span>
                {attivita.stato === 'prossimamente' && (
                  <span className="text-[10px] uppercase tracking-widest bg-stone-200 text-stone-500 px-2.5 py-1 rounded-full font-bold">
                    Prossimamente
                  </span>
                )}
              </div>
              <h2 className={`text-xl font-serif font-bold ${attivita.stato === 'prossimamente' ? 'text-stone-400' : 'text-stone-900'}`}>
                {attivita.titolo}
              </h2>
              <p className={`text-sm mt-2 leading-relaxed ${attivita.stato === 'prossimamente' ? 'text-stone-400' : 'text-stone-600'}`}>
                {attivita.descrizione}
              </p>
            </div>

            {attivita.stato === 'attiva' ? (
              <div className="flex space-x-3 mt-6">
                {attivita.hrefStudente && (
                  <a
                    href={attivita.hrefStudente}
                    className="flex-1 text-center bg-stone-900 text-white px-5 py-3 rounded-full font-medium text-sm shadow-sm hover:bg-stone-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
                  >
                    Area Studenti
                  </a>
                )}
                {attivita.hrefDocente && (
                  <a
                    href={attivita.hrefDocente}
                    className="flex-1 text-center bg-white border border-stone-300 text-stone-900 px-5 py-3 rounded-full font-medium text-sm hover:border-stone-400 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
                  >
                    Area Docente
                  </a>
                )}
              </div>
            ) : (
              <div className="mt-6 text-xs text-stone-400 font-medium">In arrivo</div>
            )}
          </div>
        ))}
      </div>

      <footer className="text-center text-xs text-stone-400 border-t border-stone-200 pt-6">
        Design 3
      </footer>
    </main>
  );
}
