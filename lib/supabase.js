import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// I contenuti gestiti dai pannelli docente (testi della piattaforma, tag,
// prompt suggeriti, attività...) cambiano a runtime e devono comparire
// subito a chi ricarica la pagina: senza "no-store" alcuni browser possono
// riservire una risposta GET già in cache invece di richiederla di nuovo.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
});