export default function ManualiPage() {
  return (
    <main className="min-h-screen px-6 py-10 max-w-4xl mx-auto space-y-10">
      <div className="flex justify-between items-center border-b border-stone-200 pb-4">
        <a href="/" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 rounded">&larr; Home</a>
        <span className="font-serif tracking-tight font-bold text-lg">DESIGN 3</span>
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-serif">Manuali &amp; Tutorial</h1>
        <p className="text-stone-600 text-sm">Le guide passo-passo per usare la piattaforma, sempre disponibili qui.</p>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-stone-200">
          <div>
            <h2 className="text-xl font-serif font-bold">Manuale per Studenti</h2>
            <p className="text-stone-600 text-sm mt-1 max-w-xl">
              Come caricare un caso studio (i 5 passaggi della consegna) e come votare in aula durante la peer review.
              16 slide, con schermate reali della piattaforma.
            </p>
          </div>
          <a
            href="/manuali/manuale-design-case-studies.pptx"
            download
            className="flex-shrink-0 text-center bg-stone-900 text-white px-6 py-3 rounded-full font-medium text-sm shadow-sm hover:bg-stone-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900"
          >
            ⬇ Scarica il manuale (.pptx, 16:9)
          </a>
        </div>

        <div className="p-8 space-y-10">
          <section className="space-y-4">
            <div className="flex items-center space-x-3">
              <span className="w-8 h-8 rounded-full bg-orange-700 text-white flex items-center justify-center font-serif font-bold text-sm flex-shrink-0">A</span>
              <h3 className="text-lg font-serif font-bold">Caricare un caso studio</h3>
            </div>
            <p className="text-sm text-stone-600">
              Il percorso guidato in 5 passaggi: <b>Il Gruppo</b> (nome, numero e un codice segreto per poter modificare la scheda in futuro),
              <b> Il Progetto</b> (titolo, immagine, descrizione), <b>Temi</b> (i tag pertinenti), <b>Valutazione</b> (i 4 driver IDEO da 0 a 5,
              ciascuno con una motivazione scritta) e <b>Riepilogo</b> prima dell&apos;invio definitivo. Dopo l&apos;invio, la scheda resta modificabile
              o cancellabile dalla sezione &quot;Elenco &amp; Modifiche&quot;, inserendo di nuovo il codice di gruppo.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <figure className="rounded-2xl border border-stone-200 overflow-hidden bg-stone-50">
                <img src="/manuali/img/passo-gruppo.png" alt="Primo passaggio del wizard: nome gruppo, numero e codice" className="w-full" />
                <figcaption className="text-[11px] text-stone-500 italic px-3 py-2">Passo 1 — Il Gruppo</figcaption>
              </figure>
              <figure className="rounded-2xl border border-stone-200 overflow-hidden bg-stone-50">
                <img src="/manuali/img/passo-valutazione.png" alt="Passaggio di valutazione dei 4 driver con motivazione" className="w-full" />
                <figcaption className="text-[11px] text-stone-500 italic px-3 py-2">Passo 4 — Valutazione (0-5, con motivazione)</figcaption>
              </figure>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center space-x-3">
              <span className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-serif font-bold text-sm flex-shrink-0">B</span>
              <h3 className="text-lg font-serif font-bold">Votare in aula</h3>
            </div>
            <p className="text-sm text-stone-600">
              Quando il/la docente apre la votazione su un caso studio, inserite il numero del vostro gruppo nella scheda &quot;Vota in Aula&quot;.
              Prima di votare, leggete il pannello <b>&quot;Maggiori dettagli&quot;</b>: descrizione, tag e — per ciascun driver — il valore assegnato
              e la motivazione scritta dal gruppo che ha proposto il progetto. Poi assegnate il vostro cartellino: <b>Verde</b>, <b>Giallo</b> o <b>Rosso</b>.
              Potete cambiarlo finché la votazione resta aperta.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <figure className="rounded-2xl border border-stone-200 overflow-hidden bg-stone-50">
                <img src="/manuali/img/voto-dettagli.png" alt="Pannello con i dettagli del caso in votazione" className="w-full" />
                <figcaption className="text-[11px] text-stone-500 italic px-3 py-2">Dettagli e motivazioni prima del voto</figcaption>
              </figure>
              <figure className="rounded-2xl border border-stone-200 overflow-hidden bg-stone-50">
                <img src="/manuali/img/voto-registrato.png" alt="Conferma del voto registrato" className="w-full" />
                <figcaption className="text-[11px] text-stone-500 italic px-3 py-2">Voto registrato</figcaption>
              </figure>
            </div>
          </section>
        </div>
      </div>

      <footer className="text-center text-xs text-stone-400 border-t border-stone-200 pt-6">
        Design 3
      </footer>
    </main>
  );
}
