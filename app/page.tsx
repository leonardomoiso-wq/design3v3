// app/page.tsx
export default function LandingPage() {
  return (
    <main className="min-h-screen px-8 py-12 max-w-5xl mx-auto flex flex-col justify-between">
      <nav className="flex justify-between items-center border-b border-stone-200 pb-6">
        <span className="font-serif tracking-tight font-bold text-lg">DESIGN 3</span>
        <div className="space-x-4">
          <a href="/student" className="text-sm font-medium hover:opacity-60 transition">Area Studenti</a>
          <a href="/teacher" className="text-sm bg-stone-900 text-white px-5 py-2.5 rounded-full hover:bg-stone-800 transition">Dashboard Docente</a>
        </div>
      </nav>

      <div className="py-20 text-center space-y-6">
        <div className="inline-block text-xs uppercase tracking-widest bg-stone-200/60 px-3 py-1 rounded-full text-stone-600 mb-2">
          Laboratorio di Design 3 • Piattaforma Casi Studio
        </div>
        <h1 className="text-5xl md:text-6xl font-serif max-w-3xl mx-auto leading-tight">
          Esplorare per progettare il cambiamento.
        </h1>
        <p className="text-stone-600 max-w-xl mx-auto text-base leading-relaxed">
          Raccolta e mappatura interattiva dei casi studio attraverso i 4 driver di innovazione IDEO - Desiderabilità, Fattibilità, Responsabilità e Vitalità.
        </p>
        <div className="pt-6 flex justify-center space-x-4">
          <a href="/student" className="bg-stone-900 text-white px-8 py-3.5 rounded-full font-medium shadow-sm hover:bg-stone-800 transition">
            Accedi come Studente →
          </a>
          <a href="/teacher" className="bg-white border border-stone-300 text-stone-900 px-8 py-3.5 rounded-full font-medium hover:border-stone-400 transition">
            Area Docente
          </a>
        </div>
      </div>

      <footer className="text-center text-xs text-stone-400 border-t border-stone-200 pt-6">
        Design 3
      </footer>
    </main>
  );
}