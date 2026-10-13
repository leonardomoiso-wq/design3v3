import { supabase } from './supabase';
import { normalizzaDriver, estraiNote, type Driver, type NoteDriver } from './driver';
import { CHIAVI_DRIVER_C8, risolviVoceMoodboard, visioneDi, type Submission, type VoceMoodboard } from '@/components/crazy8/shared';

// Le immagini finali di Crazy 8 (moodboard), una volta descritte,
// classificate con i tag e valutate sui 4 driver dai team, diventano
// "elementi" confrontabili sul radar accanto ai casi studio.

export type ElementoConcept = {
  id: number;            // negativo: non collide mai con gli id dei casi studio
  chiave: string;
  gruppoNome: string;
  gruppoNum: number;
  titolo: string;
  descrizione: string;
  immagine: string;
  tags: string[];
  driver: Driver;
  driverNote: NoteDriver;
  anno: number | null;   // l'orizzonte scelto dal team in fase 1
  conceptTitolo: string;
};

// id numerico stabile da una stringa (hash), sempre negativo
function idDaChiave(chiave: string): number {
  let h = 0;
  for (let i = 0; i < chiave.length; i++) h = (h * 31 + chiave.charCodeAt(i)) | 0;
  return -(Math.abs(h) % 1_000_000_000) - 1;
}

const valutata = (v: VoceMoodboard) => CHIAVI_DRIVER_C8.every(k => typeof v.driver?.[k]?.valore === 'number');

export function elementiDaSubmission(riga: any): ElementoConcept[] {
  const s = {
    ...riga,
    moodboard: Array.isArray(riga.moodboard) ? riga.moodboard : [],
    immagini: (riga.immagini || []).map((i: any) => ({ ...i, generazioni_crazy8: i.generazioni_crazy8 || [] })),
  } as Submission;
  const scenario = (riga.scenario || {}) as Record<string, string>;
  const anno = Number(scenario.orizzonte) || null;
  return (s.moodboard || []).flatMap((voce, i) => {
    if (!valutata(voce)) return [];
    const img = risolviVoceMoodboard(s, voce);
    if (!img) return [];
    const chiave = `${s.id}:${voce.tipo}:${voce.id}`;
    const conceptTitolo = (riga.concept_titolo || '').trim();
    const descrizione = [
      voce.didascalia?.trim(),
      conceptTitolo && `Concept: ${conceptTitolo}${riga.concept_descrizione ? ` — ${riga.concept_descrizione.trim()}` : ''}`,
      (() => {
        const v = visioneDi(s, img.sottoAmbito);
        return v?.visione ? `${v.sottoAmbito || 'Sotto-ambito'}: ${v.visione}` : '';
      })(),
    ].filter(Boolean).join('\n\n');
    return [{
      id: idDaChiave(chiave),
      chiave,
      gruppoNome: s.gruppo_nome,
      gruppoNum: s.gruppo_num,
      titolo: voce.titolo?.trim() || `${conceptTitolo || 'Concept'} · immagine ${i + 1}`,
      descrizione,
      immagine: img.url,
      tags: voce.tags || [],
      driver: normalizzaDriver(voce.driver),
      driverNote: estraiNote(voce.driver),
      anno,
      conceptTitolo,
    }];
  });
}

export async function caricaElementiConcept(corsoId: string): Promise<{ elementi: ElementoConcept[]; errore: string }> {
  const { data, error } = await supabase
    .from('submission_crazy8')
    .select('id, gruppo_nome, gruppo_num, concept_titolo, concept_descrizione, scenario, moodboard, immagini(id, ordine, url_file, sotto_ambito, generazioni_crazy8(id, ordine, url_immagine))')
    .eq('corso_id', corsoId);
  if (error) return { elementi: [], errore: error.message };
  return { elementi: (data || []).flatMap(elementiDaSubmission), errore: '' };
}
