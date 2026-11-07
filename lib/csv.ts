// CSV pronti per Excel in italiano: separatore «;», BOM UTF-8 per gli
// accenti, niente formule involontarie nelle celle.

export type TeamCsv = { numero: number; nome: string; membri: string[]; creato_il?: string | null; tipo?: string | null };

const cella = (v: unknown) => {
  let t = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@]/.test(t)) t = "'" + t;
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

const quando = (x?: string | null) => x ? new Date(x).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

export const slugCsv = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'elenco';

export function scaricaCsv(nomeFile: string, intestazione: string[], righe: unknown[][]) {
  const testo = '﻿' + [intestazione, ...righe].map(r => r.map(cella).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([testo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nomeFile}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ordina = (teams: TeamCsv[]) => [...teams].sort((a, b) => a.numero - b.numero);
const tipoDi = (t: TeamCsv) => t.tipo === 'individuale' ? 'individuale' : 'gruppo';

// Una riga per team
export function scaricaCsvTeam(nomeFile: string, teams: TeamCsv[]) {
  scaricaCsv(nomeFile + '-team', ['Numero', 'Team', 'Tipo', 'Numero membri', 'Membri', 'Creato il'],
    ordina(teams).map(t => [t.numero, t.nome, tipoDi(t), t.membri.length, t.membri.join(', '), quando(t.creato_il)]));
}

// Una riga per studente, con il suo team
export function scaricaCsvStudenti(nomeFile: string, teams: TeamCsv[]) {
  const righe: unknown[][] = [];
  for (const t of ordina(teams)) {
    const membri = t.membri.length ? t.membri : (t.tipo === 'individuale' ? [t.nome] : []);
    for (const m of membri) righe.push([m.trim(), t.numero, t.nome, tipoDi(t)]);
  }
  scaricaCsv(nomeFile + '-studenti', ['Studente', 'Numero team', 'Team', 'Tipo'], righe);
}
