import { raggruppaTag, type TagCorso } from '@/lib/tag';

// Tag di un caso studio divisi per categoria (layer), come nel form.
export default function TagRaggruppati({ tags, tagCorso, className = '' }: { tags: string[]; tagCorso: TagCorso; className?: string }) {
  const gruppi = raggruppaTag(tags || [], tagCorso);
  if (gruppi.length === 0) return null;
  return (
    <div className={`space-y-1.5 ${className}`}>
      {gruppi.map(g => (
        <div key={g.nome} className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-stone-400 mr-0.5">{g.nome}</span>
          {g.tag.map(t => (
            <span key={t} className="text-[10px] bg-white border border-stone-200 px-2.5 py-1 rounded-full text-stone-600 font-medium">{t}</span>
          ))}
        </div>
      ))}
    </div>
  );
}
