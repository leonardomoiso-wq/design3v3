// Anno, provenienza (Italia/Estero) e fonte di un caso studio: campi del
// passo 1 del form, mostrati in modo coerente in card, schede e slide.

export type Provenienza = 'italia' | 'estero';

export const ETICHETTA_PROVENIENZA: Record<Provenienza, string> = {
  italia: 'Italia',
  estero: 'Estero',
};

// Dati del db (snake_case o già formattati) → valori puliti.
export function metaDaRiga(c: any): { anno: number | null; provenienza: Provenienza | null; fonte: string } {
  const anno = c?.anno === null || c?.anno === undefined || c?.anno === '' ? null : Number(c.anno);
  const provenienza = c?.provenienza === 'italia' || c?.provenienza === 'estero' ? c.provenienza : null;
  return { anno: Number.isFinite(anno) ? anno : null, provenienza, fonte: typeof c?.fonte === 'string' ? c.fonte : '' };
}

// Se la fonte è un indirizzo web (anche senza "https://") diventa un link.
export function hrefFonte(fonte: string | null | undefined): string | null {
  const f = (fonte || '').trim();
  if (!f) return null;
  if (/^https?:\/\//i.test(f)) return f;
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(f)) return `https://${f}`;
  return null;
}

// Versione compatta per le card: "2021 · Italia" (niente se i campi sono vuoti).
export function testoMeta(anno: number | null | undefined, provenienza: Provenienza | null | undefined): string {
  return [anno ?? null, provenienza ? ETICHETTA_PROVENIENZA[provenienza] : null].filter(Boolean).join(' · ');
}

export function MetaCaso({
  anno,
  provenienza,
  className = '',
}: {
  anno: number | null | undefined;
  provenienza: Provenienza | null | undefined;
  className?: string;
}) {
  if (!anno && !provenienza) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      {anno ? (
        <span className="text-[10px] font-medium bg-stone-100 border border-stone-200 text-stone-600 px-2 py-0.5 rounded-full tabular-nums">{anno}</span>
      ) : null}
      {provenienza && (
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${provenienza === 'italia' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-sky-50 border-sky-200 text-sky-800'}`}>
          {ETICHETTA_PROVENIENZA[provenienza]}
        </span>
      )}
    </span>
  );
}

export function FonteCaso({ fonte, className = '' }: { fonte: string | null | undefined; className?: string }) {
  const f = (fonte || '').trim();
  if (!f) return null;
  const href = hrefFonte(f);
  return (
    <p className={`text-[11px] text-stone-500 break-all ${className}`}>
      <span className="font-bold uppercase tracking-widest text-[9px] text-stone-400 mr-1.5">Fonte</span>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-stone-900">{f}</a>
      ) : (
        f
      )}
    </p>
  );
}
