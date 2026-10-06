import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function testLite() {
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });

  try {
    const res = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: ['Say "Lite OK"']
    });
    console.log('gemini-3.5-flash-lite responded:', res.text);
  } catch (e: any) {
    console.log('gemini-3.5-flash-lite failed:', e.message);
  }
}

testLite();
