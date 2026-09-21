'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type IdAttivita = 'design_case_studies' | 'crazy8_ai' | 'hmw_role_prompting' | 'teambuilding';

const SCHEDE: { id: IdAttivita; etichetta: string; icona: string }[] = [
  { id: 'teambuilding', etichetta: 'Il Team', icona: '👥' },
  { id: 'design_case_studies', etichetta: 'Casi Studio', icona: '🗂️' },
  { id: 'crazy8_ai', etichetta: 'Crazy 8', icona: '🎨' },
  { id: 'hmw_role_prompting', etichetta: 'HMW', icona: '🎭' },
];

function ManualiContenuto() {
  const params = useSearchParams();
  const dallUrl = params.get('attivita') as IdAttivita | null;
  const [scheda, setScheda] = useState<IdAttivita>(dallUrl && SCHEDE.some(s => s.id === dallUrl) ? dallUrl : 'teambuilding');

  return (
    <main className="min-h-screen px-6 py-10 max-w-4xl mx-auto space-y-8">
      <div className="flex justify-between items-center border-b border-stone-200 pb-4">
        <a href="/" className="text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 rounded">&larr; Home</a>
        <span className="font-serif tracking-tight font-bold text-lg">Design 3</span>
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-serif">Manuali &amp; Tutorial</h1>
        <p className="text-stone-600 text-sm">Una guida per ciascuna attività: apri quella che ti serve adesso.</p>
      </div>

      <nav aria-label="Scegli il manuale" className="flex flex-wrap gap-2">
        {SCHEDE.map(s => (
          <button
            key={s.id}
            onClick={() => setScheda(s.id)}
            className={`px-4 py-2 rounded-full text-xs font-medium transition ${scheda === s.id ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-700 hover:border-stone-400'}`}
          >
            {s.icona} {s.etichetta}
          </button>
        ))}
      </nav>

      {scheda === 'teambuilding' && (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm p-8 space-y-8">
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <span className="w-8 h-8 rounded-full bg-stone-800 text-white flex items-center justify-center font-serif font-bold text-sm flex-shrink-0">A</span>
              <h2 className="text-lg font-serif font-bold">Formare il team</h2>
            </div>
            <p className="text-sm text-stone-600">
              Alla prima visita, prima di vedere le attività, scegliete un <b>nome team</b> e una <b>password</b>: sono i vostri, decideteli
              voi. Impostate anche una domanda segreta (e la sua risposta), da usare in caso dimentichiate la password. Da lì in poi il
              team resta riconosciuto sullo stesso browser: non dovrete rifare l&apos;accesso a ogni visita.
            </p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <span className="w-8 h-8 rounded-full bg-stone-800 text-white flex items-center justify-center font-serif font-bold text-sm flex-shrink-0">B</span>
              <h2 className="text-lg font-serif font-bold">Più postazioni, stesso team</h2>
            </div>
            <p className="text-sm text-stone-600">
              L&apos;accesso è condiviso: chiunque nel team può entrare da un altro computer con lo stesso nome e la stessa password, e
              lavorare sulle stesse consegne. Non serve creare un account per ogni persona.
            </p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <span className="w-8 h-8 rounded-full bg-stone-800 text-white flex items-center justify-center font-serif font-bold text-sm flex-shrink-0">C</span>
              <h2 className="text-lg font-serif font-bold">Membri e password dimenticata</h2>
            </div>
            <p className="text-sm text-stone-600">
              Dalla home, il pulsante <b>&quot;👥 Membri&quot;</b> apre l&apos;elenco degli studenti del team: aggiungeteli o correggeteli quando
              serve. Se dimenticate la password, il link <b>&quot;Password dimenticata?&quot;</b> nella schermata di accesso vi chiede la
              risposta alla domanda segreta e vi lascia sceglierne una nuova.
            </p>
          </div>
        </div>
      )}

      {scheda === 'design_case_studies' && (
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
                Con il team già loggato, il passo &quot;Il Gruppo&quot; è già compilato: si parte direttamente da <b>Il Progetto</b> (titolo,
                immagine, descrizione), poi <b>Temi</b> (i tag pertinenti, curati dal/dalla docente), <b>Valutazione</b> (i 4 driver IDEO da
                0 a 5, ciascuno con una motivazione scritta) e <b>Riepilogo</b> prima dell&apos;invio definitivo. La scheda resta modificabile
                o cancellabile in seguito dalla sezione &quot;Elenco &amp; Modifiche&quot; — riaprendola col vostro team non vi verrà richiesto
                nessun codice.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <figure className="rounded-2xl border border-stone-200 overflow-hidden bg-stone-50">
                  <img src="/manuali/img/passo-gruppo.png" alt="Primo passaggio del wizard: nome gruppo, numero e codice" loading="lazy" decoding="async" className="w-full" />
                  <figcaption className="text-[11px] text-stone-500 italic px-3 py-2">Passo 1 — Il Gruppo</figcaption>
                </figure>
                <figure className="rounded-2xl border border-stone-200 overflow-hidden bg-stone-50">
                  <img src="/manuali/img/passo-valutazione.png" alt="Passaggio di valutazione dei 4 driver con motivazione" loading="lazy" decoding="async" className="w-full" />
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
                  <img src="/manuali/img/voto-dettagli.png" alt="Pannello con i dettagli del caso in votazione" loading="lazy" decoding="async" className="w-full" />
                  <figcaption className="text-[11px] text-stone-500 italic px-3 py-2">Dettagli e motivazioni prima del voto</figcaption>
                </figure>
                <figure className="rounded-2xl border border-stone-200 overflow-hidden bg-stone-50">
                  <img src="/manuali/img/voto-registrato.png" alt="Conferma del voto registrato" loading="lazy" decoding="async" className="w-full" />
                  <figcaption className="text-[11px] text-stone-500 italic px-3 py-2">Voto registrato</figcaption>
                </figure>
              </div>
            </section>
          </div>
        </div>
      )}

      {scheda === 'crazy8_ai' && (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm p-8 space-y-8">
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <span className="w-8 h-8 rounded-full bg-orange-700 text-white flex items-center justify-center font-serif font-bold text-sm flex-shrink-0">A</span>
              <h2 className="text-lg font-serif font-bold">Dallo sketch alla catena di iterazioni</h2>
            </div>
            <p className="text-sm text-stone-600">
              Aprite &quot;+ Nuova Consegna&quot;: col team già loggato basta indicare uno o più <b>sotto-ambiti progettuali</b> su cui state
              lavorando. Nel canvas caricate uno o più sketch; per ciascuno costruite una catena di round — scrivete un <b>prompt</b>
              (ambientazione, rendering, varianti di forma...), caricate l&apos;immagine generata, annotate cosa ne <b>deducete</b>: quella
              deduzione informa il prompt del round successivo. Potete tornare e aggiungere round quando volete.
            </p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <span className="w-8 h-8 rounded-full bg-orange-700 text-white flex items-center justify-center font-serif font-bold text-sm flex-shrink-0">B</span>
              <h2 className="text-lg font-serif font-bold">Prompt suggeriti</h2>
            </div>
            <p className="text-sm text-stone-600">
              Mentre scrivete il prompt di un nuovo round, alcune direzioni suggerite dal/dalla docente compaiono come chip cliccabili
              (es. ambientazione, gamme cromatiche, close up, raggi X dei componenti interni): un clic le aggiunge al vostro testo.
            </p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <span className="w-8 h-8 rounded-full bg-orange-700 text-white flex items-center justify-center font-serif font-bold text-sm flex-shrink-0">C</span>
              <h2 className="text-lg font-serif font-bold">Chiudere la consegna</h2>
            </div>
            <p className="text-sm text-stone-600">
              Quando siete soddisfatti, compilate motore usato, log prompt e riflessione finale (se richiesti) e premete &quot;Segna come
              consegnata&quot;: potete comunque continuare ad aggiungere round anche dopo.
            </p>
          </div>
        </div>
      )}

      {scheda === 'hmw_role_prompting' && (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm p-8 space-y-8">
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <span className="w-8 h-8 rounded-full bg-stone-800 text-white flex items-center justify-center font-serif font-bold text-sm flex-shrink-0">A</span>
              <h2 className="text-lg font-serif font-bold">Scrivere e far evolvere il vostro HMW</h2>
            </div>
            <p className="text-sm text-stone-600">
              Scrivete la vostra prima versione di &quot;How Might We...&quot;. Ogni volta che la riscrivete si crea una nuova versione,
              conservando la cronologia (changelog) di tutte le precedenti con le relative note.
            </p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <span className="w-8 h-8 rounded-full bg-stone-800 text-white flex items-center justify-center font-serif font-bold text-sm flex-shrink-0">B</span>
              <h2 className="text-lg font-serif font-bold">Metterlo alla prova con un ruolo</h2>
            </div>
            <p className="text-sm text-stone-600">
              Scegliete fino a 3 ruoli (stakeholder simulati dall&apos;AI) tra quelli approvati dal/dalla docente, o proponetene uno nuovo.
              Lo stress test genera, per ciascun ruolo, una reazione al vostro HMW più recente: usatela per capire punti deboli e
              prospettive che non avevate considerato.
            </p>
          </div>
        </div>
      )}

      <footer className="text-center text-xs text-stone-400 border-t border-stone-200 pt-6">
        Design 3
      </footer>
    </main>
  );
}

export default function ManualiPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <ManualiContenuto />
    </Suspense>
  );
}
