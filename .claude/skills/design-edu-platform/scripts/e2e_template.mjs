// Prova end-to-end dell'app contro il database locale (PostgREST su
// localhost:3001) invece che contro Supabase. Copia questo file nello
// scratchpad, installa playwright-core accanto (npm i playwright-core),
// avvia l'app (npx next start -p 3123) e lancia:
//   node e2e_template.mjs <cartella-output>
// Gli errori HTTP e JavaScript finiscono in <cartella-output>/log.txt;
// in caso di errore dello scenario si salva uno screenshot di ogni pagina.
import { chromium } from 'playwright-core';
import fs from 'fs';

const out = process.argv[2] || './e2e-out';
fs.mkdirSync(out, { recursive: true });
const APP = process.env.APP_URL || 'http://localhost:3123';
const ENV_FILE = process.env.ENV_FILE || '.env.local';
const env = fs.readFileSync(ENV_FILE, 'utf8');
const host = new URL(env.match(/NEXT_PUBLIC_SUPABASE_URL=(\S+)/)[1]).host;
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const b = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
const log = [];

async function nuovaPagina(opts) {
  const ctx = await b.newContext(opts);
  await ctx.route(`https://${host}/rest/v1/**`, async r => {
    const req = r.request();
    const u = new URL(req.url());
    const target = 'http://localhost:3001' + u.pathname.replace('/rest/v1', '') + u.search;
    const headers = { ...req.headers() };
    delete headers['authorization']; delete headers['apikey'];
    try {
      const resp = await fetch(target, { method: req.method(), headers, body: req.postData() ?? undefined });
      const body = Buffer.from(await resp.arrayBuffer());
      if (resp.status >= 400) log.push(`${req.method()} ${u.pathname}${u.search} -> ${resp.status} ${body.toString().slice(0, 200)}`);
      await r.fulfill({ status: resp.status, headers: Object.fromEntries(resp.headers), body });
    } catch (e) { log.push('ERR ' + e); await r.abort(); }
  });
  await ctx.route(`https://${host}/realtime/**`, r => r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', e => log.push('pageerror ' + e.message));
  return p;
}
const desktop = () => nuovaPagina({ viewport: { width: 1366, height: 768 } });
const mobile = () => nuovaPagina({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const foto = (p, nome, intera = false) => p.screenshot({ path: `${out}/${nome}.png`, fullPage: intera });

try {
  // ===== Scenari: adatta selettori, password e percorsi al progetto =====
  const d = await desktop();
  await d.goto(`${APP}/teacher`);
  await d.fill('#docente-password', process.env.PASSWORD_DOCENTE || 'cambia-mi');
  await d.click('text=Entra nel corso');
  await d.waitForTimeout(2500);
  await foto(d, 'docente-dashboard');

  const s = await mobile();
  await s.goto(`${APP}/`);
  await s.waitForTimeout(1500);
  await foto(s, 'studente-home', true);
  log.push('scroll orizzontale mobile: ' + await s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
  // =====================================================================
} catch (e) {
  log.push('SCENARIO ' + e.message.split('\n')[0]);
  for (const pg of b.contexts().flatMap(c => c.pages())) {
    await pg.screenshot({ path: `${out}/errore-${Math.random().toString(36).slice(2, 6)}.png` });
  }
}
fs.writeFileSync(`${out}/log.txt`, log.join('\n'));
console.log(log.join('\n') || 'nessun errore registrato');
await b.close();
