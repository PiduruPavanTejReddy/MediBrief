import fs from 'fs';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function testOptimizedVision() {
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });

  const imgPath = 'C:/Users/pavan/.gemini/antigravity/brain/34624627-84d6-4ca8-97c9-57757f392294/.user_uploaded/media_1788591285495.jpg';
  const rawBuffer = fs.readFileSync(imgPath);

  // Resize to max 1600px width/height and quality 85 for fast, optimal AI vision
  const optimizedBuffer = await sharp(rawBuffer)
    .resize({ width: 1400, height: 1800, fit: 'inside' })
    .jpeg({ quality: 85 })
    .toBuffer();

  const base64Data = optimizedBuffer.toString('base64');
  console.log(`Optimized image size: ${Math.round(optimizedBuffer.length / 1024)} KB`);

  const prompt = `You are an expert clinical medical document transcription and OCR system.
Examine this medical report, lab document, or prescription carefully.
Extract every single lab investigation, test name, measured value, unit, biological reference interval, and flag if abnormal.
Also extract the patient name, age, gender, report date, hospital/pathology center name, and attending doctor/pathologist.

Return a JSON object with this EXACT structure (valid JSON ONLY, no markdown backticks or extra text):
{
  "rawText": "full plain text transcript of the document",
  "title": "Document Title",
  "recordType": "Blood Test",
  "recordDate": "YYYY-MM-DD",
  "hospital": "Hospital / Pathology Lab name",
  "doctor": "Doctor / Pathologist name",
  "patientName": "Patient Name",
  "findings": [
    {
      "name": "Test Name",
      "value": "Test Value",
      "unit": "Unit",
      "referenceRange": "Reference range",
      "isAbnormal": true,
      "type": "laboratory"
    }
  ],
  "medications": [],
  "diagnoses": [],
  "impression": "Summary clinical impression or interpretation",
  "confidenceScore": 0.98
}`;

  const modelsToTry = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];

  for (const model of modelsToTry) {
    try {
      console.log(`Sending to ${model}...`);
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: 'image/jpeg'
            }
          },
          prompt
        ]
      });

      console.log(`\n✓ SUCCESS with ${model}!`);
      console.log(response.text);
      return;
    } catch (e: any) {
      console.log(`✗ ${model} error:`, e.message);
    }
  }
}

testOptimizedVision().catch(console.error);
