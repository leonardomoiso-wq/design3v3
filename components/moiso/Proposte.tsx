'use client';
// Le proposte in gara. Tre livelli di lettura, come nel design system:
// la scheda in galleria (immagine grande, titolo, frase-sintesi), il
// dettaglio in uno sheet (problema → proposta → perché votarla), e la
// modalità "Presenta" a copertine in profondità.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Proposta } from '@/lib/contest';
import { pad, riduciMovimento } from '@/lib/contest';
import { Cornice } from './Moiso';

export function StatoVoto({ votata, propria }: { votata: boolean; propria: boolean }) {
  if (propria) return <span className="mz-chip" style={{ cursor: 'default', fontSize: 12 }}>La tua proposta</span>;
  if (votata) return <span className="mz-chip on mz-pop" style={{ cursor: 'default', fontSize: 12 }}>● Il tuo voto</span>;
  return null;
}

export function GalleriaProposte({ proposte, onApri, mioVoto, mioId }: {
  proposte: Proposta[]; onApri: (p: Proposta, el: HTMLElement) => void; mioVoto: number | null; mioId?: string | null;
}) {
  if (proposte.length === 0) {
    return <p className="mz-muted" style={{ fontSize: 17 }}>Le proposte compariranno qui appena verranno candidate.</p>;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 460px), 1fr))', gap: 'clamp(36px, 5vw, 64px) clamp(20px, 3vw, 40px)' }}>
      {proposte.map((p, i) => {
        const larga = proposte.length > 2 && i % 3 === 0;
        return (
          <article
            key={p.id}
            className="mz-in"
            style={{ animationDelay: `${Math.min(i, 12) * 60}ms`, gridColumn: larga ? '1 / -1' : undefined, display: 'grid', gap: 'clamp(16px, 2.4vw, 32px)', gridTemplateColumns: larga ? 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' : '1fr', alignItems: 'end' }}
          >
            <button
              type="button"
              onClick={e => onApri(p, e.currentTarget)}
              aria-label={`Apri la proposta ${p.titolo}`}
              style={{ all: 'unset', cursor: 'pointer', display: 'block', position: 'relative', borderRadius: 18, overflow: 'hidden' }}
            >
              <Cornice src={p.immagine} alt="" style={{ aspectRatio: larga ? '16 / 10' : '4 / 3' }} />
              <span className="mz-mono" style={{ position: 'absolute', left: 14, top: 12, color: '#fff', mixBlendMode: 'difference' }}>({pad(i + 1)})</span>
              {p.galleria?.length > 0 && <span className="mz-mono" style={{ position: 'absolute', right: 14, top: 12, color: '#fff', mixBlendMode: 'difference' }}>+{p.galleria.length} immagini</span>}
            </button>
            <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <span className="mz-mono mz-break">{p.autori || 'Proposta'}</span>
                <StatoVoto votata={mioVoto === p.id} propria={!!mioId && p.team_id === mioId} />
              </div>
              <h3 className="mz-display mz-break" style={{ fontSize: larga ? 'clamp(36px, 5vw, 72px)' : 'clamp(30px, 3.4vw, 46px)' }}>
                <button type="button" onClick={e => onApri(p, e.currentTarget)} style={{ all: 'unset', cursor: 'pointer' }}>{p.titolo}</button>
              </h3>
              {p.sintesi && <p className="mz-break" style={{ margin: 0, fontSize: larga ? 21 : 18, lineHeight: 1.35, maxWidth: 620 }}>{p.sintesi}</p>}
              {p.perche && (
                <div style={{ display: 'grid', gap: 4, borderLeft: '2px solid var(--accento-vivo)', paddingLeft: 12, maxWidth: 620 }}>
                  <span className="mz-mono mz-blue">Perché votarla</span>
                  <p className="mz-muted mz-break" style={{ margin: 0, fontSize: 14.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.perche}</p>
                </div>
              )}
              <button type="button" onClick={e => onApri(p, e.currentTarget)} className="mz-pill sm o" style={{ justifySelf: 'start', marginTop: 4 }}>Apri la proposta →</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Blocco({ n, titolo, testo, blu }: { n: string; titolo: string; testo: string; blu?: boolean }) {
  if (!testo.trim()) return null;
  return (
    <section className="mz-blocco" style={blu ? { borderTopColor: 'var(--accento-vivo)' } : undefined}>
      <span className="mz-mono" style={{ color: blu ? 'var(--accento)' : undefined }}>{n} · {titolo}</span>
      <p className="mz-break" style={{ margin: 0, fontSize: blu ? 19 : 16.5, lineHeight: 1.55, whiteSpace: 'pre-line', color: blu ? 'var(--ink)' : undefined }}>{testo}</p>
    </section>
  );
}

export function DettaglioProposta({ p, indice }: { p: Proposta; indice: number }) {
  const immagini = [p.immagine, ...(p.galleria || [])].filter(Boolean);
  const [grande, setGrande] = useState(0);
  return (
    <article style={{ display: 'grid', gap: 'clamp(22px, 3vw, 36px)', padding: 'clamp(20px, 4vw, 44px)' }}>
      <header className="mz-in" style={{ display: 'grid', gap: 12 }}>
        <span className="mz-mono">({pad(indice + 1)}) · {p.autori || 'Proposta'}</span>
        <h2 className="mz-display mz-break" style={{ fontSize: 'clamp(40px, 6vw, 84px)' }}>{p.titolo}</h2>
        {p.sintesi && <p className="mz-break" style={{ margin: 0, fontSize: 'clamp(19px, 2.2vw, 26px)', lineHeight: 1.3, maxWidth: 700 }}>{p.sintesi}</p>}
      </header>
      {immagini.length > 0 && (
        <div className="mz-in" style={{ animationDelay: '80ms', display: 'grid', gap: 8 }}>
          <Cornice key={grande} src={immagini[grande]} alt={p.titolo} className="mz-fade" style={{ aspectRatio: '16 / 10' }} />
          {immagini.length > 1 && (
            <div className="mz-scroll-x" style={{ display: 'flex', gap: 8 }}>
              {immagini.map((src, i) => (
                <button key={i} type="button" onClick={() => setGrande(i)} aria-label={`Immagine ${i + 1}`}
                  style={{ all: 'unset', cursor: 'pointer', flex: 'none', width: 96, height: 64, borderRadius: 10, overflow: 'hidden', outline: i === grande ? '2px solid var(--accento-vivo)' : 'none', outlineOffset: 2, opacity: i === grande ? 1 : .6, transition: 'opacity .3s' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="mz-in" style={{ animationDelay: '160ms', display: 'grid', gap: 22 }}>
        <Blocco n="01" titolo="Il problema" testo={p.problema} />
        <Blocco n="02" titolo="La proposta" testo={p.proposta} />
        <Blocco n="03" titolo="Perché votarla" testo={p.perche} blu />
      </div>
    </article>
  );
}

// Copertine in piedi che si allontanano in profondità verso destra;
// scorrono da sole (una ogni 7.5 s) con oscillazioni lente.
export function StackProposte({ proposte, onApri, mioVoto }: { proposte: Proposta[]; onApri: (p: Proposta, el: HTMLElement) => void; mioVoto: number | null }) {
  const scena = useRef<HTMLDivElement>(null);
  const cover = useRef<(HTMLButtonElement | null)[]>([]);
  const [indice, setIndice] = useState(0);
  const [inPlay, setInPlay] = useState(true);
  const stato = useRef({ pos: 0, target: 0, clock: 0, mx: 0, tmx: 0, attesa: 0 });
  const N = proposte.length;

  const vai = useCallback((d: number) => {
    const s = stato.current;
    s.target = Math.round(s.target) + d;
    s.attesa = 0;
    setInPlay(false);
  }, []);

  useEffect(() => {
    if (N === 0) return;
    const ridotto = riduciMovimento();
    let raf = 0, last = 0;
    const f = (now: number) => {
      const dt = Math.min(60, now - (last || now));
      last = now;
      const s = stato.current;
      s.clock += dt / 1000;
      // Una copertina ogni 6 s: scivola e si ferma davanti, poi riparte.
      if (inPlay && !ridotto) {
        s.attesa += dt;
        if (s.attesa >= 6000) { s.attesa = 0; s.target = Math.round(s.target) + 1; }
      }
      s.pos += (s.target - s.pos) * (ridotto ? 1 : 0.028);
      s.mx += (s.tmx - s.mx) * 0.05;
      const W = scena.current?.clientWidth || 1000;
      const giro = ((s.pos % N) + N) % N;
      for (let i = 0; i < N; i++) {
        const el = cover.current[i];
        if (!el) continue;
        let k = i - giro;
        if (k < -1) k += N;
        if (k > N - 1.5) k -= N;
        const x = k >= 0 ? k * 0.34 * W : k * 0.7 * W;
        const z = k >= 0 ? -k * 0.6 * W : 0;
        const galleggia = ridotto ? 0 : Math.sin(s.clock * 0.55 + i * 1.7) * 6;
        const ruota = (k >= 0 ? -6 : 10) + s.mx * 4;
        el.style.transform = `translate3d(${x}px, ${galleggia}px, ${z}px) rotateY(${ruota}deg)`;
        el.style.opacity = String(k < -0.6 ? Math.max(0, 1 + (k + 0.6) * 2.5) : Math.max(0, 1 - Math.max(0, k - 3) * 0.6));
        el.style.zIndex = String(100 - Math.round(Math.abs(k) * 10));
        el.style.pointerEvents = Math.abs(k) < 0.5 ? 'auto' : 'none';
      }
      const nuovo = Math.round(giro) % N;
      setIndice(prev => (prev === nuovo ? prev : nuovo));
      const barra = scena.current?.querySelector<HTMLElement>('[data-barra]');
      if (barra) barra.style.transform = `scaleX(${inPlay ? s.attesa / 6000 : 0})`;
      raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [N, inPlay]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, [role="dialog"]')) return;
      if (e.key === 'ArrowRight') vai(1);
      if (e.key === 'ArrowLeft') vai(-1);
      if (e.key === ' ') { e.preventDefault(); setInPlay(p => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [vai]);

  // Trascinare (anche col dito) sposta le copertine.
  const trascina = (e: React.PointerEvent) => {
    const x0 = e.clientX;
    let mosso = false;
    const t0 = stato.current.target;
    const W = scena.current?.clientWidth || 1000;
    const muovi = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (Math.abs(dx) > 6) { mosso = true; setInPlay(false); }
      stato.current.target = t0 - dx / (W * 0.34);
    };
    const fine = () => {
      window.removeEventListener('pointermove', muovi);
      window.removeEventListener('pointerup', fine);
      stato.current.target = Math.round(stato.current.target);
      stato.current.attesa = 0;
      if (mosso) {
        const blocca = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
        window.addEventListener('click', blocca, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', blocca, { capture: true } as any), 50);
      }
    };
    window.addEventListener('pointermove', muovi);
    window.addEventListener('pointerup', fine);
  };

  if (N === 0) return null;
  const corrente = proposte[indice];

  return (
    <div ref={scena} style={{ display: 'grid', gap: 22 }}
      onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); stato.current.tmx = (e.clientX - r.left) / r.width - 0.5; }}>
      <div onPointerDown={trascina} style={{ position: 'relative', height: 'min(64vh, 620px)', perspective: 1100, perspectiveOrigin: '20% 50%', overflow: 'hidden', touchAction: 'pan-y', userSelect: 'none' }}>
        {proposte.map((p, i) => (
          <button
            key={p.id}
            ref={el => { cover.current[i] = el; }}
            type="button"
            onClick={e => onApri(p, e.currentTarget)}
            aria-label={`Apri ${p.titolo}`}
            style={{ all: 'unset', cursor: 'pointer', position: 'absolute', left: 'max(20px, 4%)', top: '4%', height: '88%', aspectRatio: '3 / 4', maxWidth: '78%', willChange: 'transform', transformStyle: 'preserve-3d', boxShadow: '0 40px 80px rgba(28,25,23,.2)', borderRadius: 18, overflow: 'hidden', background: 'var(--card)' }}
          >
            <Cornice src={p.immagine} alt="" style={{ position: 'absolute', inset: 0 }} />
            <span style={{ position: 'absolute', inset: 'auto 0 0 0', padding: '40px 18px 16px', background: 'linear-gradient(transparent, rgba(5,7,15,.78))', color: '#fff', display: 'grid', gap: 4 }}>
              <span className="mz-mono" style={{ color: 'rgba(255,255,255,.8)' }}>({pad(i + 1)}){mioVoto === p.id ? ' · il tuo voto' : ''}</span>
              <span className="mz-display mz-break" style={{ fontSize: 'clamp(24px, 3vw, 40px)' }}>{p.titolo}</span>
            </span>
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 16, alignItems: 'end' }}>
        <div key={corrente.id} className="mz-fade" style={{ display: 'grid', gap: 6, minWidth: 0 }}>
          <span className="mz-mono mz-num">{pad(indice + 1)} / {pad(N)} · {corrente.autori}</span>
          <span className="mz-display mz-break" style={{ fontSize: 'clamp(26px, 3.4vw, 44px)' }}>{corrente.titolo}</span>
          {corrente.sintesi && <span className="mz-muted mz-break" style={{ fontSize: 16, maxWidth: 640 }}>{corrente.sintesi}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="mz-pill o" onClick={() => vai(-1)} aria-label="Proposta precedente">←</button>
          <button type="button" className="mz-pill o" onClick={() => setInPlay(p => !p)} aria-label={inPlay ? 'Metti in pausa' : 'Riprendi lo scorrimento'}>
            {inPlay
              ? <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="1" width="3.5" height="12" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" fill="currentColor" /></svg>
              : <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1l10 6-10 6z" fill="currentColor" /></svg>}
          </button>
          <button type="button" className="mz-pill o" onClick={() => vai(1)} aria-label="Proposta successiva">→</button>
          <button type="button" className="mz-pill b" onClick={e => onApri(corrente, e.currentTarget)}>Apri →</button>
        </div>
      </div>
      <div className="mz-track" style={{ height: 2 }} aria-hidden="true"><div data-barra className="mz-bar" style={{ width: '100%', transform: 'scaleX(0)', transition: 'none' }} /></div>
    </div>
  );
}
