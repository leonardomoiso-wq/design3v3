'use client';
import { useEffect } from 'react';

// Regia degli effetti continui (forme appese, nastri, carte che fluttuano):
// girano solo quando sono sullo schermo e la scheda è visibile. Il CSS li
// mette in pausa quando manca la classe .mz-vede o quando <html> ha
// .mz-nascosta: qui si aggiornano quelle classi. Non tocca le animazioni
// brevi di ingresso, che finiscono da sole.
const SELETTORE = '.mz-solids, .mz-ticker, .c8-fluttua, .mz-float, .mz-breathe';

export default function Effetti() {
  useEffect(() => {
    const osservatore = new IntersectionObserver(voci => {
      for (const v of voci) v.target.classList.toggle('mz-vede', v.isIntersecting);
    }, { rootMargin: '80px' });
    const visti = new WeakSet<Element>();
    const aggiungi = (radice: ParentNode) => {
      radice.querySelectorAll(SELETTORE).forEach(el => { if (!visti.has(el)) { visti.add(el); osservatore.observe(el); } });
    };
    aggiungi(document);
    // gli elementi arrivano e se ne vanno con le pagine: si osservano man mano
    const mutazioni = new MutationObserver(ms => {
      for (const m of ms) m.addedNodes.forEach(n => { if (n instanceof Element) { if (n.matches(SELETTORE)) { if (!visti.has(n)) { visti.add(n); osservatore.observe(n); } } aggiungi(n); } });
    });
    mutazioni.observe(document.body, { childList: true, subtree: true });

    const visibilita = () => document.documentElement.classList.toggle('mz-nascosta', document.visibilityState !== 'visible');
    visibilita();
    document.addEventListener('visibilitychange', visibilita);
    return () => { osservatore.disconnect(); mutazioni.disconnect(); document.removeEventListener('visibilitychange', visibilita); };
  }, []);
  return null;
}
