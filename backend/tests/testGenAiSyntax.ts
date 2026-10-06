import { GoogleGenAI } from '@google/genai';

console.log('GoogleGenAI export:', typeof GoogleGenAI);
try {
  const ai = new GoogleGenAI({ apiKey: 'test-key' });
  console.log('GoogleGenAI instance created successfully:', !!ai.models);
} catch (e: any) {
  console.log('Error initializing:', e.message);
}
