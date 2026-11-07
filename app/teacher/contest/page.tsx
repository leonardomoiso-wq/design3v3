'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Sep from '@/components/Sep';
import { supabase } from '@/lib/supabase';
import { useDocente } from '@/lib/docente-context';
import type { StatoAttivita } from '@/lib/attivita';
import { ascoltaCorso } from '@/lib/realtime';
import {
  ETICHETTA_DISPOSITIVO, ETICHETTA_FASE, MOTIVO_ESCLUSIONE, comprimiImmagine, messaggioErroreContest, pad, useAdesso, useStatistiche,
  type Contest, type FaseContest, type Iscrizione, type Proposta,
} from '@/lib/contest';
import { Segmentato, Sheet, Cornice } from '@/components/moiso/Moiso';
import { DashboardVoto } from '@/components/moiso/DashboardVoto';
import { Countdown } from '@/components/moiso/Countdown';
import { CampiProposta, PROPOSTA_VUOTA, type DatiProposta } from '@/components/moiso/CampiProposta';
import { QR } from '@/components/moiso/QR';
import Info from '@/components/Info';

type Sezione = 'gestione' | 'proposte' | 'dati' | 'iscritti';
type Iscritto = { numero: number; tipo?: 'individuale' | 'gruppo'; nome: string; membri: string[]; creato_il: string; team_id?: string; corso_nome?: string; spazio?: boolean; ha_votato?: boolean; conta?: boolean; motivo?: string | null; escluso?: boolean; nome_completo?: boolean; eliminabile?: boolean; voto_zona?: string | null; voto_dispositivo?: string | null; voto_il?: string | null; matricola?: string | null; ha_votato_live?: boolean; live_conta?: boolean; voto_live_il?: string | null; in_elenco?: boolean | null };
const STATI_ATTIVITA: { id: StatoAttivita; label: string }[] = [
  { id: 'bozza', label: 'Bozza' }, { id: 'prossimamente', label: 'In arrivo' }, { id: 'attiva', label: 'Attiva' }, { id: 'archiviata', label: 'Archiviata' },
];

const STATI_ATENEO: { id: 'bozza' | 'prossimamente' | 'attiva'; label: string }[] = [
  { id: 'bozza', label: 'Non visibile' }, { id: 'prossimamente', label: 'In arrivo' }, { id: 'attiva', label: 'Attiva' },
];

const FASI: FaseContest[] = ['bozza', 'anteprima', 'voto', 'chiuso'];
const DESCR_FASE: Record<FaseContest, string> = {
  bozza: 'Visibile solo a te.',
  anteprima: 'Proposte visibili, voto chiuso.',
  voto: 'Voto aperto fino alla scadenza.',
  chiuso: 'Risultati visibili a tutti.',
};
const DURATE = [{ s: 60, l: '1 min' }, { s: 120, l: '2 min' }, { s: 180, l: '3 min' }, { s: 300, l: '5 min' }, { s: 0, l: 'Senza limite' }];

const inLocale = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function Riquadro({ n, titolo, children, azioni, info }: { n: string; titolo: string; children: React.ReactNode; azioni?: React.ReactNode; info?: React.ReactNode }) {
  return (
    <section className="mz-in" style={{ display: 'grid', gap: 18, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 24, padding: 'clamp(18px, 2.4vw, 28px)', boxShadow: '0 1px 2px rgba(28,25,23,.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span className="mz-mono" style={{ color: 'var(--ink-2)' }}>{titolo}<span className="mz-blue" style={{ marginLeft: 6 }}>({n})</span>{info && <Info lato="destra">{info}</Info>}</span>
        {azioni}
      </div>
      {children}
    </section>
  );
}


// Legge un CSV (o testo copiato da Excel) con le matricole ammesse.
// Con intestazione: colonne «matricola», «nome», «cognome». Senza: la
// colonna fatta di codici è la matricola; delle altre, la prima è il
// cognome e la seconda il nome.
function leggiElencoMatricole(testo: string): { matricola: string; nome: string; cognome: string }[] {
  const righe = testo.replace(/^﻿/, '').split(/\r?\n/).map(r => r.trim()).filter(Boolean);
  if (!righe.length) return [];
  const prima = righe[0];
  const sep = [';', '\t', ','].sort((a, b) => prima.split(b).length - prima.split(a).length)[0];
  const celle = (r: string) => r.split(sep).map(c => c.trim().replace(/^"(.*)"$/, '$1').trim());
  const testa = celle(prima).map(c => c.toLowerCase());
  const conTesta = testa.some(c => c.includes('matricol'));
  const dati = (conTesta ? righe.slice(1) : righe).map(celle);
  let iM = -1, iN = -1, iC = -1;
  if (conTesta) {
    iM = testa.findIndex(c => c.includes('matricol'));
    iC = testa.findIndex(c => c.includes('cognom') || c.includes('surname'));
    iN = testa.findIndex((c, i) => i !== iC && (c === 'nome' || c.startsWith('nome') || c.includes('name')) && !c.includes('cognom') && !c.includes('surname'));
  } else {
    const colonne = Math.max(...dati.map(r => r.length));
    const codici = (i: number) => dati.filter(r => /^[A-Za-z]*\d[A-Za-z0-9]*$/.test((r[i] || '').replace(/\s+/g, ''))).length;
    iM = Array.from({ length: colonne }, (_, i) => i).sort((a, b) => codici(b) - codici(a))[0] ?? 0;
    const altre = Array.from({ length: colonne }, (_, i) => i).filter(i => i !== iM);
    iC = altre[0] ?? -1; iN = altre[1] ?? -1;
  }
  return dati
    .map(r => ({ matricola: (r[iM] || '').replace(/\s+/g, '').toUpperCase(), cognome: iC >= 0 ? r[iC] || '' : '', nome: iN >= 0 ? r[iN] || '' : '' }))
    .filter(r => /^[A-Z0-9]{4,12}$/.test(r.matricola));
}

function ElencoMatricole({ contestId, passcode, onAvviso }: { contestId: string; passcode: string; onAvviso: (t: string, errore?: boolean) => void }) {
  const [info, setInfo] = useState<{ totale: number; con_cognome: number } | null>(null);
  const [anteprima, setAnteprima] = useState<{ righe: ReturnType<typeof leggiElencoMatricole>; file: string } | null>(null);
  const [svuota, setSvuota] = useState(false);
  const carica = useCallback(async () => {
    const { data } = await supabase.rpc('docente_info_matricole', { p_contest_id: contestId, p_passcode: passcode });
    setInfo((data as any) || null);
  }, [contestId, passcode]);
  useEffect(() => { carica(); }, [carica]);
  const invia = async (righe: ReturnType<typeof leggiElencoMatricole>) => {
    const { data, error } = await supabase.rpc('docente_carica_matricole', { p_contest_id: contestId, p_righe: righe, p_passcode: passcode });
    if (error) { onAvviso(messaggioErroreContest(error.message), true); return; }
    onAvviso(righe.length ? `Elenco caricato: ${data} matricole` : 'Elenco svuotato');
    setAnteprima(null); setSvuota(false); carica();
  };
  return (
    <div style={{ display: 'grid', gap: 10, paddingTop: 12, borderTop: '1px solid var(--accento-bordo)' }}>
      <span style={{ fontSize: 14 }}>
        <strong>Elenco delle matricole ammesse</strong>{' '}
        <Info lato="destra">Carica un CSV (anche esportato da Excel) con la colonna «matricola» e, se li hai, «cognome» e «nome». Se c’è un elenco, ci si iscrive e si vota solo con una matricola presente; se c’è il cognome, deve corrispondere. I voti fuori elenco non contano.</Info>
      </span>
      <span className="mz-muted" style={{ fontSize: 13.5 }}>
        {info && info.totale > 0 ? `${info.totale} matricole caricate${info.con_cognome ? `, ${info.con_cognome} con il cognome` : ''}. Si vota solo con queste.` : 'Nessun elenco: vale qualsiasi matricola, purché unica.'}
      </span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="mz-pill sm" style={{ cursor: 'pointer' }}>
          {info && info.totale > 0 ? 'Sostituisci l’elenco (CSV)' : 'Carica l’elenco (CSV)'}
          <input type="file" accept=".csv,.txt,text/csv,text/plain" style={{ display: 'none' }} aria-label="File CSV delle matricole" onChange={async e => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            const righe = leggiElencoMatricole(await f.text());
            if (!righe.length) { onAvviso('Nel file non ho trovato matricole valide (da 4 a 12 lettere o cifre).', true); return; }
            setAnteprima({ righe, file: f.name });
          }} />
        </label>
        {info && info.totale > 0 && (svuota
          ? <button type="button" className="mz-pill sm" style={{ background: '#dc2626', color: '#fff' }} onClick={() => invia([])}>Sicuro? Svuota l’elenco</button>
          : <button type="button" className="mz-pill sm ghost danger" onClick={() => setSvuota(true)}>Svuota l’elenco</button>)}
      </div>
      {anteprima && (
        <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 12, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
          <span style={{ fontSize: 14 }}>{anteprima.file}: <strong>{anteprima.righe.length}</strong> matricole valide. Prime righe:</span>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }} className="mz-muted">
            {anteprima.righe.slice(0, 3).map(r => <li key={r.matricola}><span style={{ fontFamily: 'monospace' }}>{r.matricola}</span>{r.cognome || r.nome ? ` — ${[r.cognome, r.nome].filter(Boolean).join(' ')}` : ''}</li>)}
          </ul>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="mz-pill sm b" onClick={() => invia(anteprima.righe)}>Carica {anteprima.righe.length} matricole</button>
            <button type="button" className="mz-pill sm ghost" onClick={() => setAnteprima(null)}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ContestDocentePage() {
  const { passcode, corso } = useDocente();
  const [attivitaContest, setAttivitaContest] = useState<{ id: string; stato: StatoAttivita } | null>(null);
  const [lista, setLista] = useState<Contest[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [proposte, setProposte] = useState<Proposta[]>([]);
  const [iscritti, setIscritti] = useState<Iscritto[]>([]);
  const [sezione, setSezione] = useState<Sezione>('gestione');
  const [messaggio, setMessaggio] = useState<{ testo: string; errore?: boolean } | null>(null);
  const [bozza, setBozza] = useState({ titolo: '', sottotitolo: '', descrizione: '', iscrizione: 'individuale' as Iscrizione, mostra_classifica: false, proposte_da: 'docente' as Contest['proposte_da'], ambito: 'corso' as Contest['ambito'] });
  const [scadenza, setScadenza] = useState('');
  const [caricaCopertina, setCaricaCopertina] = useState(false);
  // Regole del conteggio (pesi, voti che non contano), salvate a parte.
  type Regole = { peso_remoto: number; peso_live: number; nome_singolo: boolean; senza_posizione: boolean; zone: string[]; senza_matricola: boolean };
  const regoleDi = (c: Contest | null): Regole => ({ peso_remoto: c?.peso_remoto ?? 1, peso_live: c?.peso_live ?? 1, nome_singolo: !!c?.escludi_nome_singolo, senza_posizione: !!c?.escludi_senza_posizione, zone: c?.zone_escluse || [], senza_matricola: !!c?.escludi_senza_matricola });
  const [regole, setRegole] = useState<Regole>(regoleDi(null));
  const [confermaElimina, setConfermaElimina] = useState<string | null>(null);
  // Controllo del database: avvisa se le funzioni del Contest non sono allineate
  // (es. dopo aver rieseguito una migrazione vecchia).
  const [problemiDb, setProblemiDb] = useState<string[]>([]);
  useEffect(() => {
    supabase.rpc('contest_controlla_database').then(({ data, error }) => {
      if (error) setProblemiDb(/could not find the function|schema cache|PGRST20/i.test(`${error.code} ${error.message}`) ? ['controllo non presente'] : []);
      else setProblemiDb((data as string[]) || []);
    });
  }, []);
  const [durata, setDurata] = useState(120);
  const [codiceLive, setCodiceLive] = useState<string | null>(null);
  const [modifica, setModifica] = useState<{ id: number | null; dati: DatiProposta } | null>(null);
  const [conferma, setConferma] = useState<string | null>(null);
  const [origine, setOrigine] = useState('');

  const sel = lista.find(c => c.id === selId) || null;
  const { stat, scarto } = useStatistiche(sel?.id || null, 2500, passcode);
  const adesso = useAdesso(scarto, 1000);

  useEffect(() => { setOrigine(window.location.origin); }, []);

  const avvisa = (testo: string, errore = false) => {
    setMessaggio({ testo, errore });
    setTimeout(() => setMessaggio(m => (m?.testo === testo ? null : m)), 3500);
  };

  const caricaLista = useCallback(async () => {
    const { data, error } = await supabase.rpc('docente_lista_contest', { p_corso_id: corso.id, p_passcode: passcode });
    if (error) { avvisa(messaggioErroreContest(error.message), true); return; }
    const l = (data || []) as Contest[];
    setLista(l);
    setSelId(prev => (prev && l.some(c => c.id === prev) ? prev : l[0]?.id || null));
  }, [passcode, corso.id]);

  const caricaProposte = useCallback(async () => {
    if (!selId) { setProposte([]); return; }
    const { data } = await supabase.rpc('docente_lista_proposte', { p_contest_id: selId, p_passcode: passcode });
    setProposte(((data || []) as any[]).map(p => ({ ...p, id: Number(p.id), galleria: p.galleria || [] })));
  }, [selId, passcode]);

  // Chi può votare il contest scelto: per un contest di ateneo anche gli
  // iscritti solo al contest e gli accessi degli altri corsi. Se il database
  // non ha ancora la migrazione 20261019 si ricade sui team del corso.
  const [elencoCompleto, setElencoCompleto] = useState(true);
  const caricaIscritti = useCallback(async () => {
    if (selId) {
      const { data, error } = await supabase.rpc('docente_lista_votanti_contest', { p_contest_id: selId, p_passcode: passcode });
      if (!error) { setIscritti((data || []) as Iscritto[]); setElencoCompleto(true); return; }
    }
    const { data } = await supabase.rpc('docente_lista_team', { p_corso_id: corso.id, p_passcode: passcode });
    setIscritti((data || []) as Iscritto[]);
    setElencoCompleto(!selId);
  }, [corso.id, passcode, selId]);
  const [filtroIscritti, setFiltroIscritti] = useState('');

  // Lo stato dell'attività è quello del pannello Attività (tabella attivita).
  const caricaAttivita = useCallback(async () => {
    const { data } = await supabase.from('attivita').select('id, stato').eq('corso_id', corso.id).eq('tipo', 'contest_voto').maybeSingle();
    setAttivitaContest(data ? (data as any) : null);
  }, [corso.id]);

  useEffect(() => {
    caricaLista(); caricaIscritti(); caricaAttivita();
    const ch = ascoltaCorso(supabase.channel(`contest-docente-attivita-${corso.id}`), 'attivita', corso.id, caricaAttivita).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [caricaLista, caricaIscritti, caricaAttivita, corso.id]);
  useEffect(() => {
    if (sezione !== 'iscritti') return;
    caricaIscritti();
    const t = setInterval(caricaIscritti, 15000);
    return () => clearInterval(t);
  }, [sezione, caricaIscritti]);

  useEffect(() => {
    caricaProposte();
    const t = setInterval(caricaProposte, 15000);
    return () => clearInterval(t);
  }, [caricaProposte]);

  useEffect(() => { setRegole(regoleDi(sel)); }, [sel?.id, sel?.peso_remoto, sel?.peso_live, sel?.escludi_nome_singolo, sel?.escludi_senza_posizione, (sel?.zone_escluse || []).join('|'), sel?.escludi_senza_matricola]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sel) return;
    setBozza({ titolo: sel.titolo, sottotitolo: sel.sottotitolo, descrizione: sel.descrizione, iscrizione: sel.iscrizione, mostra_classifica: sel.mostra_classifica, proposte_da: sel.proposte_da || 'docente', ambito: sel.ambito || 'corso' });
    setScadenza(inLocale(sel.voto_fine && new Date(sel.voto_fine).getTime() > Date.now() ? sel.voto_fine : new Date(Date.now() + 86400000).toISOString()));
    supabase.rpc('docente_codice_live', { p_id: sel.id, p_passcode: passcode }).then(({ data }) => setCodiceLive((data as string) || null));
  }, [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rpc = async (nome: string, args: Record<string, any>, ok?: string) => {
    const { data, error } = await supabase.rpc(nome, { ...args, p_passcode: passcode });
    if (error) { avvisa(messaggioErroreContest(error.message), true); return { ok: false, data: null }; }
    if (ok) avvisa(ok);
    await caricaLista();
    return { ok: true, data };
  };

  const nuovo = async () => {
    const r = await rpc('docente_salva_contest', { p_corso_id: corso.id, p_id: null, p_titolo: 'Il progetto migliore', p_sottotitolo: 'Votate la proposta che cambierebbe di più le cose.', p_descrizione: '', p_iscrizione: 'entrambe', p_mostra_classifica: false }, 'Contest creato in bozza');
    if (r.ok && r.data) { setSelId(r.data as string); setSezione('proposte'); }
  };

  const modificato = !!sel && (bozza.titolo !== sel.titolo || bozza.sottotitolo !== sel.sottotitolo || bozza.descrizione !== sel.descrizione
    || bozza.iscrizione !== sel.iscrizione || bozza.mostra_classifica !== sel.mostra_classifica
    || bozza.proposte_da !== (sel.proposte_da || 'docente'));
  const regoleModificate = !!sel && JSON.stringify(regole) !== JSON.stringify(regoleDi(sel));
  const salvaRegole = () => sel && rpc('docente_regole_conteggio', {
    p_id: sel.id, p_peso_remoto: regole.peso_remoto, p_peso_live: regole.peso_live,
    p_escludi_nome_singolo: regole.nome_singolo, p_escludi_senza_posizione: regole.senza_posizione, p_zone_escluse: regole.zone,
    p_escludi_senza_matricola: regole.senza_matricola,
  }, 'Conteggio aggiornato');
  const escludiVoto = async (teamId: string, escluso: boolean) => { if (sel) { await rpc('docente_escludi_voto', { p_contest_id: sel.id, p_team_id: teamId, p_escluso: escluso }, escluso ? 'Voto escluso dal conteggio' : 'Voto riammesso'); caricaIscritti(); } };
  const eliminaVotante = async (teamId: string) => { if (sel) { await rpc('docente_elimina_votante', { p_contest_id: sel.id, p_team_id: teamId }, 'Utenza eliminata'); setConfermaElimina(null); caricaIscritti(); } };
  // CSV di tutti i votanti (per Excel in italiano: «;» e BOM UTF-8).
  const scaricaCsv = async () => {
    if (!sel) return;
    await caricaIscritti();
    const { data, error } = await supabase.rpc('docente_lista_votanti_contest', { p_contest_id: sel.id, p_passcode: passcode });
    const righe = (error ? iscritti : ((data || []) as Iscritto[]));
    const data_ = (x?: string | null) => x ? new Date(x).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const cella = (v: unknown) => {
      let t = v === null || v === undefined ? '' : String(v);
      if (/^[=+\-@]/.test(t)) t = "'" + t; // niente formule involontarie in Excel
      return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const intestazione = ['Nome', 'Matricola', 'Nell’elenco', 'Tipo', 'Membri', 'Iscrizione', 'Iscritto il', 'Ha votato da remoto', 'Il voto conta', 'Motivo', 'Città del voto', 'Dispositivo', 'Votato il', 'Ha votato in aula', 'Il voto in aula conta', 'Votato in aula il'];
    const corpo = righe.map(r => {
      const individuale = r.tipo === 'individuale';
      return [
        r.nome,
        r.matricola || '',
        r.in_elenco === true ? 'sì' : r.in_elenco === false ? 'no' : '',
        individuale ? 'individuale' : 'team',
        individuale ? '' : (r.membri || []).join(', '),
        r.spazio ? 'solo per il contest' : (r.corso_nome || corso.nome),
        data_(r.creato_il),
        !individuale ? 'non vota' : r.ha_votato ? 'sì' : 'no',
        individuale && r.ha_votato ? (r.conta === false ? 'no' : 'sì') : '',
        r.motivo ? (MOTIVO_ESCLUSIONE[r.motivo] || r.motivo) : '',
        r.voto_zona || '',
        r.voto_dispositivo ? (ETICHETTA_DISPOSITIVO[r.voto_dispositivo] || r.voto_dispositivo) : '',
        data_(r.voto_il),
        !individuale ? '' : r.ha_votato_live ? 'sì' : 'no',
        individuale && r.ha_votato_live ? (r.live_conta === false ? 'no' : 'sì') : '',
        data_(r.voto_live_il),
      ];
    });
    const testo = '\ufeff' + [intestazione, ...corpo].map(r => r.map(cella).join(';')).join('\r\n');
    const slug = sel.titolo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'contest';
    const url = URL.createObjectURL(new Blob([testo], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `votanti-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    avvisa(`CSV scaricato: ${righe.length} righe`);
  };
  const salvaImpostazioni = () => sel && rpc('docente_salva_contest', {
    p_corso_id: corso.id,
    p_id: sel.id, p_titolo: bozza.titolo, p_sottotitolo: bozza.sottotitolo, p_descrizione: bozza.descrizione,
    p_iscrizione: bozza.iscrizione, p_mostra_classifica: bozza.mostra_classifica, p_proposte_da: bozza.proposte_da,
  }, 'Impostazioni salvate');

  const impostaFase = (fase: FaseContest) => {
    if (!sel) return;
    const fine = fase === 'voto' ? (scadenza ? new Date(scadenza).toISOString() : null) : null;
    rpc('docente_imposta_fase_contest', { p_id: sel.id, p_fase: fase, p_voto_fine: fine }, `Fase: ${ETICHETTA_FASE[fase]}`);
  };

  const live = async (azione: 'apri' | 'chiudi' | 'rivela' | 'copri' | 'azzera') => {
    if (!sel) return;
    const r = await rpc('docente_live_contest', { p_id: sel.id, p_azione: azione, p_durata_sec: durata }, azione === 'apri' ? 'Voto dal vivo aperto' : azione === 'chiudi' ? 'Voto dal vivo chiuso' : azione === 'azzera' ? 'Voto dal vivo azzerato' : undefined);
    if (r.ok) setCodiceLive((r.data as any)?.codice || null);
  };

  const impostaStatoAttivita = async (s: StatoAttivita) => {
    if (!attivitaContest) return;
    const { error } = await supabase.rpc('docente_imposta_stato_attivita', { p_id: attivitaContest.id, p_stato: s, p_passcode: passcode });
    if (error) avvisa(messaggioErroreContest(error.message), true); else avvisa(`Attività: ${STATI_ATTIVITA.find(x => x.id === s)?.label}`);
    caricaAttivita();
  };

  const salvaProposta = async () => {
    if (!sel || !modifica) return;
    const d = modifica.dati;
    const { error } = await supabase.rpc('docente_salva_proposta', {
      p_contest_id: sel.id, p_id: modifica.id, p_autori: d.autori || '', p_titolo: d.titolo, p_sintesi: d.sintesi,
      p_problema: d.problema, p_proposta: d.proposta, p_perche: d.perche, p_immagine: d.immagine, p_galleria: d.galleria, p_passcode: passcode,
    });
    if (error) return avvisa(messaggioErroreContest(error.message), true);
    setModifica(null);
    avvisa('Proposta salvata');
    caricaProposte();
  };

  const azioneProposta = async (nome: string, args: Record<string, any>, ok: string) => {
    const { error } = await supabase.rpc(nome, { ...args, p_passcode: passcode });
    if (error) return avvisa(messaggioErroreContest(error.message), true);
    avvisa(ok);
    setConferma(null);
    caricaProposte();
  };


  const votiPer = useMemo(() => new Map((stat?.per_proposta || []).map(p => [p.id, p])), [stat]);
  // Pagina studenti: quella dell'ateneo per i contest aperti a tutto l'ateneo.
  const diAteneo = !!corso.ateneo_codice && (corso.spazio_ateneo || (!!sel && sel.ambito === 'ateneo' && (sel.stato_ateneo || 'bozza') !== 'bozza'));
  const paginaStudenti = diAteneo ? `/${corso.ateneo_codice}/contest${sel ? `?c=${sel.id}` : ''}` : '/contest';
  const linkLive = sel && codiceLive ? `${origine}/contest/live?codice=${codiceLive}` : `${origine}/contest/live`;
  const liveAperto = sel?.live_stato === 'aperto' && (!sel.live_fine || new Date(sel.live_fine).getTime() > adesso);
  const visibili = proposte.filter(p => !p.nascosta);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', minHeight: '100%' }} className="mz-docente">
      <style>{`@media (max-width: 860px){ .mz-docente{ grid-template-columns: minmax(0, 1fr) !important; } .mz-docente > aside{ position: static !important; height: auto !important; border-right: 0 !important; border-bottom: 1px solid var(--line); } }`}</style>
      {/* Elenco contest */}
      <aside style={{ borderRight: '1px solid var(--line)', padding: 20, display: 'grid', alignContent: 'start', gap: 14, position: 'sticky', top: 0, height: '100%', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="mz-mono" style={{ color: 'var(--ink)' }}>Contest</span>
          <button type="button" className="mz-pill sm b" onClick={nuovo}>+ Nuovo</button>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {lista.map((c, i) => (
            <li key={c.id}>
              <button type="button" onClick={() => setSelId(c.id)} aria-current={c.id === selId}
                style={{ all: 'unset', cursor: 'pointer', display: 'grid', gap: 2, width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, background: c.id === selId ? 'var(--ink)' : 'transparent', color: c.id === selId ? 'var(--bg)' : 'inherit', transition: 'background .3s' }}>
                <span className="mz-mono" style={{ color: 'inherit', opacity: .7 }}>({pad(lista.length - i)})<Sep />{ETICHETTA_FASE[c.fase]}{c.live_stato === 'aperto' && <><Sep />live</>}</span>
                <span className="mz-break" style={{ fontFamily: 'var(--f-display)', fontSize: 18, letterSpacing: '-.02em' }}>{c.titolo}</span>
              </button>
            </li>
          ))}
          {lista.length === 0 && <li className="mz-muted" style={{ fontSize: 14 }}>Nessun contest. Creane uno.</li>}
        </ul>
        <div className="mz-hair" style={{ paddingTop: 14, display: 'grid', gap: 8 }}>
          <span className="mz-mono">
            {corso.spazio_ateneo ? 'Attività nell’ateneo' : 'Attività nel corso'}
            <Info lato="destra">{corso.spazio_ateneo ? 'Quando è «Attiva» i contest di questo spazio si votano dalla pagina dell’ateneo.' : 'Se il contest compare nella home del corso. Finché non è «Attiva» gli studenti del corso non votano da qui; il voto dal vivo funziona comunque.'}</Info>
          </span>
          {attivitaContest ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {STATI_ATTIVITA.map(o => (
                <button key={o.id} type="button" className={`mz-chip ${attivitaContest.stato === o.id ? 'on' : ''}`} style={{ justifyContent: 'center' }} aria-pressed={attivitaContest.stato === o.id} onClick={() => impostaStatoAttivita(o.id)}>{o.label}</button>
              ))}
            </div>
          ) : <span className="mz-muted" style={{ fontSize: 13 }}>Attività non trovata: esegui la migrazione 20261012.</span>}
          {!corso.spazio_ateneo && <a href="/contest" target="_blank" rel="noreferrer" className="mz-mono" style={{ color: 'var(--accento)' }}>Pagina del corso ↗</a>}
        </div>
        {!corso.spazio_ateneo && sel && (
          <div className="mz-hair" style={{ paddingTop: 14, display: 'grid', gap: 8 }}>
            <span className="mz-mono">
              Questo contest nell’ateneo
              <Info lato="destra">{corso.ateneo_id ? `Indipendente dal corso: se è «Attiva» compare nella pagina di ${corso.ateneo_nome} e votano anche gli studenti degli altri corsi, o chi si iscrive solo al contest, anche se nel corso non è visibile.` : 'Per aprirlo all’ateneo, assegna prima il corso a un ateneo in Corso & Form.'}</Info>
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {STATI_ATENEO.map(o => (
                <button key={o.id} type="button" disabled={!corso.ateneo_id} className={`mz-chip ${(sel.stato_ateneo || 'bozza') === o.id ? 'on' : ''}`} style={{ justifyContent: 'center', opacity: corso.ateneo_id ? 1 : .5 }} aria-pressed={(sel.stato_ateneo || 'bozza') === o.id}
                  onClick={() => rpc('docente_stato_ateneo_contest', { p_id: sel.id, p_stato: o.id }, `Nell’ateneo: ${o.label}`)}>{o.label}</button>
              ))}
            </div>
            {diAteneo && (
              <>
                <a href={paginaStudenti} target="_blank" rel="noreferrer" className="mz-mono" style={{ color: 'var(--accento)' }}>Pagina dell’ateneo ↗</a>
                <span className="mz-mono mz-break" style={{ textTransform: 'none' }}>{origine.replace(/^https?:\/\//, '')}{paginaStudenti}</span>
              </>
            )}
          </div>
        )}
        {corso.spazio_ateneo && (
          <div style={{ display: 'grid', gap: 8 }}>
            <a href={paginaStudenti} target="_blank" rel="noreferrer" className="mz-mono" style={{ color: 'var(--accento)' }}>Pagina dell’ateneo ↗</a>
            <span className="mz-mono mz-break" style={{ textTransform: 'none' }}>{origine.replace(/^https?:\/\//, '')}{paginaStudenti}</span>
          </div>
        )}
      </aside>

      <div style={{ padding: 'clamp(20px, 4vw, 44px)', display: 'grid', alignContent: 'start', gap: 36, minWidth: 0 }}>
        {problemiDb.length > 0 && (
          <div role="alert" style={{ padding: '14px 18px', borderRadius: 16, background: '#fef2f2', boxShadow: 'inset 0 0 0 1px #fecaca', color: '#991b1b', fontSize: 14, display: 'grid', gap: 6 }}>
            <strong>Il database del Contest non è allineato: il voto può dare errori.</strong>
            <span>Esegui nell’SQL Editor di Supabase l’ultima migrazione del Contest, <code>supabase/migrations/20261020_contest_pesi_esclusioni.sql</code>, poi ricarica questa pagina.</span>
            <span className="mz-mono" style={{ color: '#991b1b', textTransform: 'none' }}>{problemiDb.join(' — ')}</span>
          </div>
        )}
        {messaggio && (
          <div role="status" className="mz-in" style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 80, padding: '12px 16px', borderRadius: 12, background: messaggio.errore ? '#dc2626' : 'var(--ink)', color: messaggio.errore ? '#fff' : 'var(--bg)', fontSize: 14, maxWidth: 360 }}>{messaggio.testo}</div>
        )}
        {!sel ? (
          <div style={{ display: 'grid', gap: 16, justifyItems: 'start', paddingTop: 40 }}>
            <h1 className="mz-display" style={{ fontSize: 'clamp(40px, 6vw, 80px)' }}>Crea il primo <span className="mz-blue">contest</span>.</h1>
            <p className="mz-muted" style={{ margin: 0, maxWidth: 520 }}>Nasce in bozza, visibile solo a te.</p>
            <button type="button" className="mz-pill b lg" onClick={nuovo}>+ Nuovo contest</button>
          </div>
        ) : (
          <>
            <header style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
                  <h1 className="mz-display mz-break" style={{ fontSize: 'clamp(38px, 5vw, 72px)' }}>
                    {(sel.fase === 'voto' || liveAperto) && <span className="mz-live-dot" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 18 }} aria-label="Voto in corso" />}
                    {sel.titolo}<span className="mz-sup">({pad(visibili.length)})</span>
                  </h1>
                </div>
                <a href={`/teacher/contest/proiezione?id=${sel.id}`} target="_blank" rel="noreferrer" className="mz-pill lg">Proietta in aula ⤢</a>
              </div>
              <Segmentato etichetta="Sezioni" valore={sezione} onCambia={setSezione}
                opzioni={[{ id: 'gestione', label: 'Gestione' }, { id: 'proposte', label: `Proposte (${proposte.length})` }, { id: 'dati', label: 'Dati del voto' }, { id: 'iscritti', label: `Chi vota (${iscritti.filter(x => x.tipo === 'individuale').length})` }]} />
            </header>

            {sezione === 'gestione' && (
              <>
                <Riquadro n="01" titolo="Fase del contest">
                  <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 10 }}>
                    {FASI.map((f, i) => {
                      const corrente = sel.fase === f;
                      return (
                        <li key={f}>
                          <button type="button" onClick={() => f !== 'voto' && impostaFase(f)} disabled={f === 'voto'}
                            style={{ all: 'unset', cursor: f === 'voto' ? 'default' : 'pointer', boxSizing: 'border-box', width: '100%', height: '100%', display: 'grid', gap: 6, padding: 16, borderRadius: 14, background: corrente ? 'var(--accento-tenue)' : 'var(--paper)', color: 'inherit', boxShadow: corrente ? 'inset 0 0 0 2px var(--accento-vivo)' : 'inset 0 0 0 1px var(--line)', transition: 'background .4s' }}>
                            <span className="mz-mono" style={{ color: 'inherit', opacity: .75 }}>{pad(i + 1)}{corrente && <><Sep />ora</>}</span>
                            <span style={{ fontFamily: 'var(--f-display)', fontSize: 22, letterSpacing: '-.02em' }}>{ETICHETTA_FASE[f]}</span>
                            <span style={{ fontSize: 13, opacity: .8 }}>{DESCR_FASE[f]}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  <div style={{ display: 'grid', gap: 12, padding: 18, borderRadius: 14, boxShadow: 'inset 0 0 0 1px var(--line)', background: 'var(--paper)' }}>
                    <span className="mz-mono" style={{ color: 'var(--ink)' }}>Scadenza del voto da remoto</span>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input type="datetime-local" className="mz-input" style={{ width: 'auto' }} value={scadenza} onChange={e => setScadenza(e.target.value)} aria-label="Scadenza del voto" />
                      {[{ l: '+1 ora', ms: 3600e3 }, { l: '+1 giorno', ms: 86400e3 }, { l: '+3 giorni', ms: 3 * 86400e3 }, { l: '+1 settimana', ms: 7 * 86400e3 }].map(x => (
                        <button key={x.l} type="button" className="mz-chip" onClick={() => setScadenza(inLocale(new Date(Date.now() + x.ms).toISOString()))}>{x.l}</button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button type="button" className="mz-pill b" onClick={() => impostaFase('voto')} disabled={!scadenza}>
                        {sel.fase === 'voto' ? 'Aggiorna la scadenza' : 'Apri il voto da remoto'}
                      </button>
                      {sel.fase === 'voto' && sel.voto_fine && <Countdown fine={sel.voto_fine} inizio={sel.voto_inizio} adesso={adesso} grande={false} />}
                    </div>
                  </div>
                </Riquadro>

                <Riquadro n="02" titolo="Voto dal vivo, dal pubblico" info={sel.richiedi_matricola ? 'Il pubblico vota dal telefono con il QR o il codice proiettato: prima entra con nome, cognome e matricola, poi vota (una matricola, un voto). Un voto dal vivo aperto alla volta.' : 'Il pubblico vota dal telefono senza iscriversi, un voto per dispositivo, con il QR o il codice proiettato. Un voto dal vivo aperto alla volta.'}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 24, alignItems: 'start' }}>
                    <div style={{ display: 'grid', gap: 14 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {DURATE.map(d => <button key={d.s} type="button" className="mz-chip" aria-pressed={durata === d.s} onClick={() => setDurata(d.s)}>{d.l}</button>)}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="mz-pill b" onClick={() => live('apri')}>{liveAperto ? 'Riapri con nuovo codice' : 'Apri il voto dal vivo'}</button>
                        {liveAperto && <button type="button" className="mz-pill o" onClick={() => live('chiudi')}>Chiudi</button>}
                        {sel.vincitore_rivelato
                          ? <button type="button" className="mz-pill ghost" onClick={() => live('copri')}>Copri di nuovo il vincitore</button>
                          : <button type="button" className="mz-pill ghost" onClick={() => live('rivela')}>Svela il vincitore a tutti</button>}
                        {conferma === 'azzera-live'
                          ? <button type="button" className="mz-pill" style={{ background: '#dc2626', color: '#fff' }} onClick={() => { live('azzera'); setConferma(null); }}>Sicuro? Cancella i voti dal vivo</button>
                          : <button type="button" className="mz-pill ghost danger" onClick={() => setConferma('azzera-live')}>Azzera voto dal vivo</button>}
                      </div>
                      {liveAperto && sel.live_fine && <Countdown fine={sel.live_fine} adesso={adesso} grande={false} finito="Tempo scaduto" />}
                    </div>
                    {codiceLive && (
                      <div style={{ display: 'flex', gap: 18, alignItems: 'center', padding: 16, borderRadius: 14, background: 'var(--paper)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
                        <QR testo={linkLive} dimensione={120} />
                        <div style={{ display: 'grid', gap: 4 }}>
                          <span className="mz-mono">Codice</span>
                          <span className="mz-display mz-num" style={{ fontSize: 52, lineHeight: 1, color: liveAperto ? 'var(--accento)' : 'var(--muted)' }}>{codiceLive}</span>
                          <span className="mz-mono mz-break">{origine.replace(/^https?:\/\//, '')}/contest/live</span>
                        </div>
                      </div>
                    )}
                  </div>
                </Riquadro>

                <Riquadro n="03" titolo="Testi e regole">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 18 }}>
                    <label className="mz-field"><span className="mz-mono">Titolo</span><input className="mz-input" value={bozza.titolo} onChange={e => setBozza({ ...bozza, titolo: e.target.value })} maxLength={90} /></label>
                    <label className="mz-field"><span className="mz-mono">Sottotitolo</span><input className="mz-input" value={bozza.sottotitolo} onChange={e => setBozza({ ...bozza, sottotitolo: e.target.value })} maxLength={200} /></label>
                  </div>
                  <div className="mz-field">
                    <span className="mz-mono">
                      Copertina
                      <Info>Compare nella pagina dell’ateneo e in testa al contest. Si salva appena la scegli. Senza copertina si vede un mosaico delle proposte.</Info>
                    </span>
                    <label className="mz-frame" style={{ aspectRatio: '21 / 8', cursor: 'pointer', display: 'block', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
                      {sel.copertina
                        ? <img src={sel.copertina} alt="Copertina del contest" />
                        : <span className="mz-mono" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{caricaCopertina ? 'Carico…' : '+ Scegli un’immagine'}</span>}
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                        const f = e.target.files?.[0]; e.target.value = '';
                        if (!f) return;
                        setCaricaCopertina(true);
                        try { await rpc('docente_imposta_copertina_contest', { p_id: sel.id, p_copertina: await comprimiImmagine(f, 1800, 0.8) }, 'Copertina salvata'); }
                        finally { setCaricaCopertina(false); }
                      }} />
                    </label>
                    {sel.copertina && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span className="mz-muted" style={{ fontSize: 13, flex: 1 }}>{caricaCopertina ? 'Carico…' : 'Tocca l’immagine per cambiarla.'}</span>
                        <button type="button" className="mz-pill sm ghost" onClick={() => rpc('docente_imposta_copertina_contest', { p_id: sel.id, p_copertina: '' }, 'Copertina rimossa')}>Togli la copertina</button>
                      </div>
                    )}
                  </div>
                  <label className="mz-field"><span className="mz-mono">Descrizione e regole del voto</span><textarea className="mz-input" value={bozza.descrizione} onChange={e => setBozza({ ...bozza, descrizione: e.target.value })} maxLength={2000} /></label>
                  <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'end' }}>
                    <div className="mz-field">
                      <span className="mz-mono">Chi carica le proposte</span>
                      <Segmentato etichetta="Chi carica le proposte" valore={bozza.proposte_da} onCambia={v => setBozza({ ...bozza, proposte_da: v })}
                        opzioni={[{ id: 'docente', label: 'Docenti' }, { id: 'studenti', label: 'Anche gli studenti' }]} />
                    </div>
                    <div className="mz-field">
                      <span className="mz-mono">Chi candida<Info>Si vota sempre con un accesso individuale: una persona, un voto. Questa scelta riguarda solo chi può candidare una proposta.</Info></span>
                      <Segmentato etichetta="Chi può candidare" valore={bozza.iscrizione} onCambia={v => setBozza({ ...bozza, iscrizione: v })}
                        opzioni={[{ id: 'individuale', label: 'Individui' }, { id: 'gruppo', label: 'Gruppi' }, { id: 'entrambe', label: 'Entrambi' }]} />
                    </div>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
                      <input type="checkbox" checked={bozza.mostra_classifica} onChange={e => setBozza({ ...bozza, mostra_classifica: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--accento)' }} />
                      Classifica visibile durante il voto
                    </label>
                  </div>
                  <div className={`barra-salva ${modificato ? 'attiva' : ''}`}>
                    <span style={{ fontSize: 14 }} className={modificato ? '' : 'mz-muted'}>{modificato ? 'Modifiche non salvate' : 'Tutto salvato'}</span>
                    <button type="button" className="mz-pill b lg" onClick={salvaImpostazioni} disabled={!modificato || !bozza.titolo.trim()}>Salva le modifiche</button>
                  </div>
                </Riquadro>

                <Riquadro n="04" titolo="Conteggio dei voti" info="I voti esclusi restano salvati: puoi riammetterli quando vuoi. Classifica e vincitore usano i punti pesati.">
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', padding: '14px 16px', borderRadius: 14, background: sel.richiedi_matricola ? 'var(--accento-tenue)' : 'var(--paper)', boxShadow: `inset 0 0 0 1px ${sel.richiedi_matricola ? 'var(--accento-bordo)' : 'var(--line)'}` }}>
                    <div style={{ display: 'grid', gap: 4, minWidth: 0, flex: '1 1 320px' }}>
                      <strong style={{ fontSize: 15 }}>Un voto a matricola</strong>
                      <span style={{ fontSize: 13.5 }} className="mz-muted">
                        {sel.richiedi_matricola
                          ? 'Attivo: per votare servono nome, cognome e matricola, da remoto e in aula. Il QR apre prima l’accesso.'
                          : 'Spento: da remoto basta l’accesso individuale, in aula si vota per dispositivo.'}
                      </span>
                    </div>
                    <button type="button" className={`mz-pill ${sel.richiedi_matricola ? 'o' : 'b'}`} onClick={() => rpc('docente_imposta_matricola_contest', { p_id: sel.id, p_richiedi: !sel.richiedi_matricola }, sel.richiedi_matricola ? 'Matricola non più richiesta' : 'Matricola richiesta per votare')}>
                      {sel.richiedi_matricola ? 'Disattiva' : 'Richiedi la matricola'}
                    </button>
                    {sel.richiedi_matricola && <div style={{ flexBasis: '100%' }}><ElencoMatricole contestId={sel.id} passcode={passcode} onAvviso={avvisa} /></div>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 18 }}>
                    {([['peso_remoto', 'Peso del voto da remoto'], ['peso_live', 'Peso del voto in aula']] as const).map(([k, etichetta]) => (
                      <div key={k} className="mz-field">
                        <span className="mz-mono">{etichetta}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <button type="button" className="mz-pill sm o" aria-label={`Riduci ${etichetta.toLowerCase()}`} disabled={regole[k] <= 0} onClick={() => setRegole({ ...regole, [k]: Math.max(0, regole[k] - 1) })}>−</button>
                          <span className="mz-display mz-num" style={{ fontSize: 44, lineHeight: 1, minWidth: 64, textAlign: 'center' }}>×{regole[k]}</span>
                          <button type="button" className="mz-pill sm o" aria-label={`Aumenta ${etichetta.toLowerCase()}`} disabled={regole[k] >= 10} onClick={() => setRegole({ ...regole, [k]: Math.min(10, regole[k] + 1) })}>+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p style={{ margin: 0, fontSize: 14.5 }}>
                    {regole.peso_remoto === regole.peso_live
                      ? 'Remoto e aula valgono uguale.'
                      : regole.peso_remoto === 0 ? 'Conta solo il voto in aula.'
                      : regole.peso_live === 0 ? 'Conta solo il voto da remoto.'
                      : `Un voto ${regole.peso_live > regole.peso_remoto ? 'in aula' : 'da remoto'} vale ${Math.max(regole.peso_live, regole.peso_remoto)} punti, uno ${regole.peso_live > regole.peso_remoto ? 'da remoto' : 'in aula'} ${Math.min(regole.peso_live, regole.peso_remoto)}.`}
                  </p>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <span className="mz-mono">Non contare</span>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
                      <input type="checkbox" checked={regole.nome_singolo} onChange={e => setRegole({ ...regole, nome_singolo: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--accento)' }} />
                      chi si è iscritto con il solo nome{stat?.esclusi?.solo_nome ? ` (${stat.esclusi.solo_nome})` : ''}
                    </label>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
                      <input type="checkbox" checked={regole.senza_posizione} onChange={e => setRegole({ ...regole, senza_posizione: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--accento)' }} />
                      i voti senza posizione{typeof stat?.senza_posizione === 'number' ? ` (${stat.senza_posizione})` : ''}
                    </label>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
                      <input type="checkbox" checked={regole.senza_matricola} onChange={e => setRegole({ ...regole, senza_matricola: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--accento)' }} />
                      i voti senza matricola, anche quelli in aula per dispositivo{stat?.esclusi?.senza_matricola ? ` (${stat.esclusi.senza_matricola})` : ''}
                    </label>
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <span className="mz-mono">
                      Zone del voto
                      <Info lato="destra">Tocca una zona per escluderla dal conteggio (per esempio i voti da città lontane). Tocca di nuovo per riammetterla.</Info>
                    </span>
                    {(stat?.punti_tutti || []).length === 0
                      ? <span className="mz-muted" style={{ fontSize: 13.5 }}>Le zone compaiono quando arrivano voti con posizione.</span>
                      : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {(stat?.punti_tutti || []).map(z => {
                            const esclusa = regole.zone.includes(z.chiave);
                            return (
                              <button key={z.chiave} type="button" aria-pressed={!esclusa} className={`mz-chip ${esclusa ? '' : 'on'}`}
                                style={esclusa ? { textDecoration: 'line-through', opacity: .6 } : undefined}
                                onClick={() => setRegole({ ...regole, zone: esclusa ? regole.zone.filter(x => x !== z.chiave) : [...regole.zone, z.chiave] })}>
                                {z.zona} <span className="mz-mono">{z.n}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                  </div>
                  {stat?.esclusi && Object.keys(stat.esclusi).length > 0 && (
                    <p style={{ margin: 0, fontSize: 14 }} className="mz-muted">
                      Ora non contano {Object.values(stat.esclusi).reduce((a, b) => a + b, 0)} voti: {Object.entries(stat.esclusi).map(([m, n]) => `${n} ${MOTIVO_ESCLUSIONE[m] || m}`).join(', ')}.
                    </p>
                  )}
                  <div className={`barra-salva ${regoleModificate ? 'attiva' : ''}`}>
                    <span style={{ fontSize: 14 }} className={regoleModificate ? '' : 'mz-muted'}>{regoleModificate ? 'Modifiche non salvate' : 'Tutto salvato'}</span>
                    <button type="button" className="mz-pill b lg" onClick={salvaRegole} disabled={!regoleModificate || regole.peso_remoto + regole.peso_live === 0}>Applica al conteggio</button>
                  </div>
                </Riquadro>

                <Riquadro n="05" titolo="Zona pericolosa">
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {conferma === 'azzera-remoto'
                      ? <button type="button" className="mz-pill" style={{ background: '#dc2626', color: '#fff' }} onClick={() => { rpc('docente_azzera_voti_remoti', { p_id: sel.id }, 'Voti da remoto azzerati'); setConferma(null); }}>Sicuro? Cancella i voti da remoto</button>
                      : <button type="button" className="mz-pill ghost danger" onClick={() => setConferma('azzera-remoto')}>Azzera i voti da remoto</button>}
                    {conferma === 'elimina-contest'
                      ? <button type="button" className="mz-pill" style={{ background: '#dc2626', color: '#fff' }} onClick={() => { rpc('docente_elimina_contest', { p_id: sel.id }, 'Contest eliminato'); setConferma(null); }}>Sicuro? Elimina contest, proposte e voti</button>
                      : <button type="button" className="mz-pill ghost danger" onClick={() => setConferma('elimina-contest')}>Elimina il contest</button>}
                  </div>
                </Riquadro>
              </>
            )}

            {sezione === 'proposte' && (
              <Riquadro n={pad(proposte.length)} titolo="Proposte" azioni={<button type="button" className="mz-pill sm b" onClick={() => setModifica({ id: null, dati: { ...PROPOSTA_VUOTA, autori: '' } })}>+ Aggiungi proposta</button>}>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid' }}>
                  {proposte.map((p, i) => {
                    const v = votiPer.get(p.id);
                    return (
                      <li key={p.id} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr) auto', gap: 16, alignItems: 'center', padding: '14px 0', borderTop: i ? '1px solid var(--line)' : undefined, opacity: p.nascosta ? .45 : 1 }}>
                        <Cornice src={p.immagine} alt="" style={{ width: 96, aspectRatio: '4 / 3', borderRadius: 12 }} etichettaVuota="—" />
                        <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                          <span className="mz-mono mz-break">({pad(i + 1)})<Sep />{p.autori || 'Senza autori'}{p.nascosta && <><Sep />nascosta</>}{p.team_id && <><Sep />candidata dagli studenti</>}</span>
                          <span className="mz-break" style={{ fontFamily: 'var(--f-display)', fontSize: 22, letterSpacing: '-.02em' }}>{p.titolo}</span>
                          <span className="mz-muted mz-break" style={{ fontSize: 13.5 }}>{p.sintesi}</span>
                        </div>
                        <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
                          <span className="mz-mono mz-num" style={{ color: 'var(--ink)' }}>{v ? <>{v.remoto} remoto<Sep />{v.live} live</> : '0 voti'}</span>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'end' }}>
                            <button type="button" className="mz-pill sm ghost" onClick={() => setModifica({ id: p.id, dati: { titolo: p.titolo, sintesi: p.sintesi, problema: p.problema, proposta: p.proposta, perche: p.perche, immagine: p.immagine, galleria: p.galleria, autori: p.autori } })}>Modifica</button>
                            <button type="button" className="mz-pill sm ghost" onClick={() => azioneProposta('docente_nascondi_proposta', { p_id: p.id, p_nascosta: !p.nascosta }, p.nascosta ? 'Proposta di nuovo visibile' : 'Proposta nascosta')}>{p.nascosta ? 'Mostra' : 'Nascondi'}</button>
                            {conferma === `p${p.id}`
                              ? <button type="button" className="mz-pill sm" style={{ background: '#dc2626', color: '#fff' }} onClick={() => azioneProposta('docente_elimina_proposta', { p_id: p.id }, 'Proposta eliminata')}>Conferma</button>
                              : <button type="button" className="mz-pill sm ghost danger" onClick={() => setConferma(`p${p.id}`)}>Elimina</button>}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                  {proposte.length === 0 && <li className="mz-muted">Nessuna proposta: aggiungi la prima con «+ Aggiungi proposta».</li>}
                </ul>
              </Riquadro>
            )}

            {sezione === 'dati' && (stat
              ? <DashboardVoto stat={stat} scarto={scarto} proposte={visibili} />
              : <p className="mz-muted">Carico i dati…</p>)}

            {sezione === 'iscritti' && (() => {
              const individuali = iscritti.filter(x => x.tipo === 'individuale');
              const votanti = individuali.filter(x => x.ha_votato).length;
              const contano = individuali.filter(x => x.ha_votato && x.conta !== false).length;
              const inAula = individuali.filter(x => x.ha_votato_live).length;
              const q = filtroIscritti.trim().toLowerCase();
              const visibili = q ? iscritti.filter(x => [x.nome, x.corso_nome, x.voto_zona, x.matricola].some(v => (v || '').toLowerCase().includes(q))) : iscritti;
              return (
                <Riquadro n={pad(individuali.length)} titolo="Chi può votare"
                  info="Votano solo gli accessi individuali, un voto a testa. Per un contest di ateneo compaiono anche gli iscritti solo al contest e gli accessi degli altri corsi. Si vede chi ha votato, mai per quale proposta."
                  azioni={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="mz-pill sm" onClick={scaricaCsv} disabled={iscritti.length === 0}>Scarica CSV ↓</button>
                    <a href="/teacher/team" className="mz-pill sm ghost">Gestisci i team →</a>
                  </div>}>
                  {!elencoCompleto && (
                    <p role="note" style={{ margin: 0, fontSize: 13.5, color: '#991b1b' }}>Vedi solo gli accessi del corso: per l’elenco completo esegui la migrazione 20261019_votanti_contest.sql.</p>
                  )}
                  <div style={{ display: 'flex', gap: 16, alignItems: 'end', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 28 }}>
                      <div style={{ display: 'grid' }}><span className="mz-display mz-num" style={{ fontSize: 44, lineHeight: 1 }}>{pad(individuali.length)}</span><span className="mz-mono">iscritti individuali</span></div>
                      {elencoCompleto && <div style={{ display: 'grid' }}><span className="mz-display mz-num" style={{ fontSize: 44, lineHeight: 1, color: 'var(--accento)' }}>{pad(votanti)}</span><span className="mz-mono">{inAula ? 'hanno votato da remoto' : 'hanno votato'}</span></div>}
                      {inAula > 0 && <div style={{ display: 'grid' }}><span className="mz-display mz-num" style={{ fontSize: 44, lineHeight: 1 }}>{pad(inAula)}</span><span className="mz-mono">in aula</span></div>}
                      {elencoCompleto && contano !== votanti && <div style={{ display: 'grid' }}><span className="mz-display mz-num" style={{ fontSize: 44, lineHeight: 1 }}>{pad(contano)}</span><span className="mz-mono">voti che contano</span></div>}
                    </div>
                    <input className="mz-input" style={{ maxWidth: 280 }} placeholder="Cerca nome, matricola, corso o città" aria-label="Cerca tra gli iscritti" value={filtroIscritti} onChange={e => setFiltroIscritti(e.target.value)} />
                  </div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {visibili.map((s, i) => {
                      const puo = s.tipo === 'individuale';
                      const origine = s.spazio ? 'solo per il contest' : s.corso_nome;
                      return (
                        <li key={s.team_id || s.numero} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '12px 0', borderTop: i ? '1px solid var(--line)' : undefined, opacity: puo ? 1 : .45 }}>
                          <div style={{ minWidth: 0 }}>
                            <span className="mz-break" style={{ fontFamily: 'var(--f-display)', fontSize: 19 }}>{s.nome}</span>{' '}
                            <span className="mz-mono">{s.tipo === 'individuale' ? 'individuale' : `gruppo ${s.numero}, ${s.membri.length} membri`}{s.matricola ? `, matricola ${s.matricola}` : ''}{origine ? `, ${origine}` : ''}</span>
                            {puo && s.nome_completo === false && <span className="mz-chip" style={{ marginLeft: 8, cursor: 'default', fontSize: 11, padding: '2px 8px' }}>solo nome</span>}
                            {puo && s.in_elenco === false && <span className="mz-chip" style={{ marginLeft: 8, cursor: 'default', fontSize: 11, padding: '2px 8px', color: '#991b1b', borderColor: '#fecaca' }}>fuori elenco</span>}
                            {s.tipo !== 'individuale' && s.membri.length > 0 && <div className="mz-muted mz-break" style={{ fontSize: 13 }}>{s.membri.join(', ')}</div>}
                            {s.ha_votato && (s.voto_zona || s.voto_dispositivo || s.voto_il) && (
                              <div className="mz-muted mz-break" style={{ fontSize: 13, marginTop: 2 }}>
                                Ha votato{s.voto_zona ? ` da ${s.voto_zona}` : ', posizione non disponibile'}
                                {s.voto_dispositivo ? `, ${(ETICHETTA_DISPOSITIVO[s.voto_dispositivo] || s.voto_dispositivo).toLowerCase()}` : ''}
                                {s.voto_il ? `, ${new Date(s.voto_il).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                              </div>
                            )}
                            {s.ha_votato_live && (
                              <div className="mz-muted" style={{ fontSize: 13, marginTop: 2 }}>
                                Ha votato in aula{s.voto_live_il ? `, ${new Date(s.voto_live_il).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}{s.live_conta === false ? ', non conta' : ''}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <span className="mz-mono" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', color: s.ha_votato && s.conta !== false ? 'var(--ink)' : undefined }}>
                              {!puo ? 'team, non vota'
                                : s.ha_votato ? (s.conta === false
                                  ? <>ha votato, non conta{s.motivo ? `: ${MOTIVO_ESCLUSIONE[s.motivo] || s.motivo}` : ''}</>
                                  : <><span className="mz-live-dot" style={{ width: 7, height: 7 }} />ha votato</>)
                                : s.ha_votato_live ? 'ha votato in aula'
                                : elencoCompleto ? 'non ancora' : 'vota'}
                            </span>
                            {puo && s.team_id && (s.ha_votato || s.ha_votato_live) && (
                              <button type="button" className="mz-pill sm ghost" onClick={() => escludiVoto(s.team_id!, !s.escluso)}>{s.escluso ? 'Riammetti' : 'Escludi'}</button>
                            )}
                            {s.team_id && s.eliminabile && (confermaElimina === s.team_id
                              ? <button type="button" className="mz-pill sm" style={{ background: '#dc2626', color: '#fff' }} onClick={() => eliminaVotante(s.team_id!)}>Sicuro? Elimina</button>
                              : <button type="button" className="mz-pill sm ghost danger" onClick={() => setConfermaElimina(s.team_id!)}>Elimina</button>)}
                          </div>
                        </li>
                      );
                    })}
                    {visibili.length === 0 && <li className="mz-muted">{q ? 'Nessun risultato.' : 'Ancora nessun iscritto.'}</li>}
                  </ul>
                </Riquadro>
              );
            })()}
          </>
        )}
      </div>

      <Sheet aperto={!!modifica} onChiudi={() => setModifica(null)} categoria={modifica?.id ? 'Modifica proposta' : 'Nuova proposta'}
        azioni={<button type="button" className="mz-pill sm b" onClick={salvaProposta} disabled={!modifica?.dati.titolo.trim()}>Salva</button>}>
        {modifica && (
          <div style={{ padding: 'clamp(20px, 4vw, 40px)' }}>
            <CampiProposta dati={modifica.dati} onCambia={d => setModifica({ ...modifica, dati: d })} conAutori />
          </div>
        )}
        {modifica && (
          <div className="barra-salva attiva" style={{ margin: 0, borderRadius: 0, padding: '14px clamp(20px, 4vw, 40px) calc(14px + env(safe-area-inset-bottom))' }}>
            <span className="mz-muted" style={{ fontSize: 14 }}>{modifica.dati.titolo.trim() ? '' : 'Serve un titolo'}</span>
            <button type="button" className="mz-pill b lg" onClick={salvaProposta} disabled={!modifica.dati.titolo.trim()}>Salva la proposta</button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
