'use client';
// Pagina di un ateneo (/polito): i contest aperti a tutto l'ateneo, in
// evidenza, e l'indice dei suoi corsi. Nessun corso da scegliere per votare.
import { useEffect, useState } from 'react';
import { caricaAteneoPerCodice, caricaCorsiPubblici, percorsoCorso, type Ateneo, type Corso } from '@/lib/corsi';
import { caricaContestAteneo, useAdesso, type ContestAteneo } from '@/lib/contest';
import { Cornice, Solidi } from '@/components/moiso/Moiso';
import { Countdown } from '@/components/moiso/Countdown';
import { RailVetrina, RigaIndice, due } from '@/components/Vetrina';

function PalcoContest({ c, codiceAteneo, adesso, ritardo }: { c: ContestAteneo; codiceAteneo: string; adesso: number; ritardo: number }) {
  const fine = c.voto_fine ? new Date(c.voto_fine).getTime() : 0;
  const votoAperto = c.stato_attivita === 'attiva' && c.fase === 'voto' && fine > adesso;
  const inArrivo = c.stato_attivita !== 'attiva';
  const stato = inArrivo ? 'In arrivo'
    : votoAperto ? 'Voto aperto'
    : c.fase === 'anteprima' ? 'Anteprima delle proposte'
    : c.live_stato === 'aperto' ? 'Voto dal vivo in aula'
    : 'Votazione conclusa';
  const azione = votoAperto ? 'Entra e vota →' : c.fase === 'anteprima' ? 'Guarda le proposte →' : 'Vedi il risultato →';
  const contenuto = (
    <>
      {c.copertina || c.immagini.length <= 1
        ? <Cornice src={c.copertina || c.immagini[0] || undefined} alt="" etichettaVuota="Proposte in arrivo" />
        : (
          // Senza copertina: un mosaico delle proposte in gara.
          <div className={`mz-mosaico n${Math.min(c.immagini.length, 4)}`}>
            {c.immagini.slice(0, 4).map((src, i) => <Cornice key={i} src={src} alt="" />)}
          </div>
        )}
      <div className="mz-palco-testo">
        <div style={{ display: 'grid', gap: 14 }}>
          <span className="mz-mono" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            {votoAperto && <span className="mz-live-dot" style={{ background: 'var(--scena-testo)' }} />}
            Contest di ateneo — {stato}
          </span>
          <h2 className="mz-display mz-palco-titolo">{c.titolo}<span className="mz-sup" style={{ color: 'inherit' }}>({due(c.proposte)})</span></h2>
          {c.sottotitolo && <p style={{ margin: 0, fontSize: 'clamp(16px, 1.6vw, 21px)', lineHeight: 1.35, maxWidth: 560 }}>{c.sottotitolo}</p>}
        </div>
        <div style={{ display: 'grid', gap: 18 }}>
          {votoAperto && <Countdown fine={c.voto_fine} inizio={c.voto_inizio} adesso={adesso} grande={false} />}
          {!inArrivo && <span className="mz-pill lg" style={{ justifySelf: 'start', background: inArrivo ? undefined : 'var(--scena-testo)', color: 'var(--scena-su-testo)' }}>{azione}</span>}
        </div>
      </div>
    </>
  );
  return inArrivo
    ? <div className="mz-palco attesa mz-in" style={{ animationDelay: `${ritardo}ms` }}>{contenuto}</div>
    : <a href={`/${codiceAteneo}/contest?c=${c.id}`} className="mz-palco mz-in" style={{ animationDelay: `${ritardo}ms` }}>{contenuto}</a>;
}

export default function PaginaAteneo({ codice }: { codice: string }) {
  const [ateneo, setAteneo] = useState<Ateneo | null | undefined>(undefined);
  const [corsi, setCorsi] = useState<Corso[] | null>(null);
  const [contest, setContest] = useState<ContestAteneo[]>([]);
  const adesso = useAdesso(0, 1000);

  useEffect(() => {
    let t: ReturnType<typeof setInterval> | undefined;
    let attivo = true;
    caricaAteneoPerCodice(codice).then(a => {
      if (!attivo) return;
      setAteneo(a);
      if (!a) return;
      caricaCorsiPubblici(a.id).then(setCorsi);
      const carica = () => caricaContestAteneo(a.id).then(setContest);
      carica();
      t = setInterval(carica, 30000);
    });
    return () => { attivo = false; if (t) clearInterval(t); };
  }, [codice]);

  if (ateneo === undefined) return <main className="mz mz-vetrina" />;

  if (!ateneo) {
    return (
      <main className="mz mz-vetrina">
        <RailVetrina />
        <section style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ display: 'grid', gap: 20, justifyItems: 'center' }}>
            <Solidi cadono />
            <h1 className="mz-display" style={{ fontSize: 'clamp(40px, 6vw, 84px)', margin: 0 }}>Ateneo non trovato</h1>
            <a href="/" className="mz-pill lg">Scegli l’ateneo</a>
          </div>
        </section>
      </main>
    );
  }

  const aperti = contest.filter(c => c.stato_attivita === 'attiva').length;
  return (
    <main className="mz mz-vetrina">
      <RailVetrina sinistra={<a href="/" className="mz-mono max-sm:hidden" style={{ textDecoration: 'none' }}>← Atenei</a>} />

      <section className="mz-eroe">
        <h1 className="mz-display mz-eroe-titolo mz-in" style={{ fontSize: 'clamp(50px, 8.4vw, 150px)' }}>
          {ateneo.nome}<span className="mz-sup" style={{ textTransform: 'none' }}>(/{ateneo.codice})</span>
        </h1>
        <div className="mz-eroe-lato mz-in" style={{ animationDelay: '120ms' }}>
          <div className="mz-eroe-cifre">
            <div><strong>{due(corsi?.length || 0)}</strong><span className="mz-mono">Corsi</span></div>
            <div><strong style={{ color: aperti ? 'var(--accento)' : undefined }}>{due(aperti)}</strong><span className="mz-mono">Contest aperti</span></div>
          </div>
          {ateneo.descrizione && <p style={{ margin: 0, maxWidth: 360, fontSize: 15 }} className="mz-muted">{ateneo.descrizione}</p>}
        </div>
      </section>

      {contest.map((c, i) => <PalcoContest key={c.id} c={c} codiceAteneo={ateneo.codice} adesso={adesso} ritardo={180 + i * 80} />)}

      <div className="mz-barra">
        <span className="mz-mono" style={{ color: 'var(--ink)' }}>Corsi</span>
        <span className="mz-mono">{due(corsi?.length || 0)}</span>
      </div>
      <ul className="mz-indice riempi">
        {corsi === null && <li className="mz-riga" style={{ cursor: 'default' }}><span /><span className="mz-muted">Caricamento…</span></li>}
        {corsi?.length === 0 && <li className="mz-riga" style={{ cursor: 'default' }}><span /><span className="mz-muted">Nessun corso in elenco. Chiedete il link al/alla docente.</span></li>}
        {corsi?.map((c, i) => (
          <RigaIndice
            key={c.id}
            indice={i + 1}
            ritardo={240 + i * 70}
            href={percorsoCorso(c)}
            titolo={c.nome}
            meta={<span className="mz-mono" style={{ textTransform: 'none' }}>{c.codice}</span>}
          />
        ))}
      </ul>
    </main>
  );
}
