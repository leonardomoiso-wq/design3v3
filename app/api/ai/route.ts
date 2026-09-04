import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

// Inizializzazione del client ufficiale con la chiave API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    const { imageBase64, promptText } = await req.json();

    // Struttura dei contenuti per il modello multimodale (testo + immagine)
    const contents: any[] = [promptText];

    if (imageBase64) {
      // Estrae il formato e i dati binari dall'immagine Base64
      const matches = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        contents.push({
          inlineData: {
            mimeType: matches[1],
            data: matches[2],
          },
        });
      }
    }

    // Chiamata al modello Gemini (es. gemini-2.5-flash) per l'analisi avanzata
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
    });

    return NextResponse.json({ text: response.text });
  } catch (error) {
    console.error("Errore durante la generazione AI:", error);
    return NextResponse.json({ error: "Errore nell'elaborazione dell'intelligenza artificiale." }, { status: 500 });
  }
}