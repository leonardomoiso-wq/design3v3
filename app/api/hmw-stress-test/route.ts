import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Il template è fisso e vive solo qui: lo studente controlla nome e
// descrizione del ruolo (testo libero), mai il vincolo "solo domande, mai
// soluzioni" che lo accompagna — così un ruolo proposto non può diventare
// un system prompt che bypassa questa regola.
export async function POST(req: Request) {
  try {
    const { hmwTesto, ruoloNome, ruoloDescrizione } = await req.json();

    if (!hmwTesto || !ruoloNome || !ruoloDescrizione) {
      return NextResponse.json({ error: 'Parametri mancanti.' }, { status: 400 });
    }

    const prompt = `Rispondi SOLO nei panni di questo ruolo: "${ruoloNome}" — ${ruoloDescrizione}. Il tuo compito è porre domande critiche e sollevare obiezioni sull'HMW proposto qui sotto. Non fornire mai soluzioni o proposte di design, solo domande e criticità dal tuo punto di vista.\n\nHMW da analizzare: "${hmwTesto}"`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [prompt],
    });

    return NextResponse.json({ text: response.text });
  } catch (error) {
    console.error('Errore durante lo stress test AI:', error);
    return NextResponse.json({ error: "Errore nell'elaborazione dell'intelligenza artificiale." }, { status: 500 });
  }
}
