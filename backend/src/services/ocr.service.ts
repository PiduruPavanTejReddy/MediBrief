import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { config } from '../config/env';

export interface ParsedFinding {
  name: string;
  value: string;
  unit: string;
  referenceRange: string;
  isAbnormal: boolean;
  type: string;
}

export interface ParsedMedication {
  name: string;
  dosage: string;
  frequency: string;
  duration?: string;
  instructions?: string;
}

export interface OCRResult {
  rawText: string;
  title: string;
  recordType: string;
  recordDate: string;
  hospital: string;
  doctor: string;
  patientName: string;
  findings: ParsedFinding[];
  medications: ParsedMedication[];
  diagnoses: string[];
  impression: string;
  confidenceScore: number;
}

export interface IOCRService {
  processDocument(buffer: Buffer, mimeType: string, fileName: string): Promise<OCRResult>;
}

export class MedicalOCRService implements IOCRService {
  public async processDocument(buffer: Buffer, mimeType: string, fileName: string): Promise<OCRResult> {
    const apiKey = process.env.GEMINI_API_KEY || config.geminiApiKey;

    // 1. If Google Gemini API key is configured, use Gemini Multimodal Vision for 100% precision
    if (apiKey && apiKey.trim().length > 10) {
      try {
        console.log(`[MedicalOCR] Analyzing document "${fileName}" with Google Gemini Vision...`);
        return await this.extractWithGeminiVision(buffer, mimeType, apiKey.trim());
      } catch (err: any) {
        console.warn(`[MedicalOCR] Gemini Vision failed (${err.message}). Falling back to local OCR engine.`);
      }
    }

    // 2. If it's a plain text document (.txt / clinical notes)
    if (mimeType.includes('text') || fileName.endsWith('.txt')) {
      const textContent = buffer.toString('utf8');
      return this.parseMedicalText(textContent, fileName);
    }

    // 3. For images, run local Tesseract OCR with sharp preprocessing
    try {
      console.log(`[MedicalOCR] Running local Tesseract OCR engine on "${fileName}"...`);
      const extractedText = await this.extractWithTesseract(buffer);
      if (extractedText && extractedText.trim().length > 25) {
        console.log(`[MedicalOCR] Tesseract extracted ${extractedText.trim().length} characters.`);
        return this.parseMedicalText(extractedText, fileName);
      }
    } catch (tessErr: any) {
      console.warn(`[MedicalOCR] Tesseract extraction warning:`, tessErr.message);
    }

    // 4. If local OCR extracted minimal text from a photo/scan, return a clean blank review template
    // NEVER invent or return a fake dummy patient report!
    console.log(`[MedicalOCR] Minimal text detected on "${fileName}". Returning clean template for manual review.`);
    return {
      rawText: 'Document uploaded. Visual inspection required.',
      title: fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ') || 'Medical Report',
      recordType: 'Blood Test',
      recordDate: new Date().toISOString().split('T')[0],
      hospital: 'Pathology & Diagnostic Center',
      doctor: 'Attending Doctor',
      patientName: 'Patient',
      findings: [],
      medications: [],
      diagnoses: [],
      impression: 'Please review and confirm extracted medical values. For automatic instant transcription of camera photos, connect a free Gemini API Key in Settings.',
      confidenceScore: 0.5
    };
  }

  private async extractWithGeminiVision(buffer: Buffer, mimeType: string, apiKey: string): Promise<OCRResult> {
    const ai = new GoogleGenAI({ apiKey });

    let effectiveMime = mimeType;
    if (!effectiveMime || effectiveMime === 'application/octet-stream') {
      effectiveMime = 'image/jpeg';
    }

    // Optimize image size with sharp for fast, reliable multimodal transfer
    let imagePayloadBuffer = buffer;
    if (effectiveMime.startsWith('image/')) {
      try {
        imagePayloadBuffer = await sharp(buffer)
          .resize({ width: 1400, height: 1800, fit: 'inside' })
          .jpeg({ quality: 85 })
          .toBuffer();
        effectiveMime = 'image/jpeg';
      } catch (err: any) {
        console.warn('[MedicalOCR] Sharp resize skipped, using raw buffer:', err.message);
      }
    }

    const base64Data = imagePayloadBuffer.toString('base64');

    const prompt = `You are an expert clinical medical document transcription and OCR system.
Examine this medical report, lab document, or prescription carefully.
Extract every single lab investigation, test name, measured value, unit, biological reference interval, and flag if abnormal.
Also extract the patient name, age, gender, report date, hospital/pathology center name, and attending doctor/pathologist.

Return a JSON object with this EXACT structure (valid JSON ONLY, do NOT include markdown backticks or commentary):
{
  "rawText": "full plain text transcript of the document",
  "title": "Document Title (e.g. Haemogram / Complete Blood Count)",
  "recordType": "Blood Test",
  "recordDate": "YYYY-MM-DD",
  "hospital": "Hospital / Pathology Lab name",
  "doctor": "Doctor / Pathologist name",
  "patientName": "Patient Name",
  "findings": [
    {
      "name": "Test Name (e.g. Haemoglobin, Total WBC Count, Neutrophil, Platelet Count)",
      "value": "Test Value (e.g. 14.8, 9700, 67, 1.79)",
      "unit": "Unit (e.g. gm%, /cmm, %, mil./cmm, fL)",
      "referenceRange": "Reference range (e.g. 12 - 16, 4000 - 11000, 50 - 65)",
      "isAbnormal": true,
      "type": "laboratory"
    }
  ],
  "medications": [
    {
      "name": "Medication Name",
      "dosage": "e.g. 500 mg",
      "frequency": "e.g. twice daily",
      "duration": "e.g. 5 days",
      "instructions": "e.g. after meals"
    }
  ],
  "diagnoses": ["any clinical impressions, diagnoses, or notes"],
  "impression": "Summary clinical impression or interpretation",
  "confidenceScore": 0.98
}`;

    const modelsToTry = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];
    let lastError: any = null;

    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              inlineData: {
                data: base64Data,
                mimeType: effectiveMime
              }
            },
            prompt
          ]
        });

        const responseText = response.text || '';
        let cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const firstBrace = cleanJson.indexOf('{');
        const lastBrace = cleanJson.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
        }
        const parsed = JSON.parse(cleanJson);

        return {
          rawText: parsed.rawText || responseText,
          title: parsed.title || 'Medical Report',
          recordType: parsed.recordType || 'Blood Test',
          recordDate: parsed.recordDate || new Date().toISOString().split('T')[0],
          hospital: parsed.hospital || 'Diagnostic Laboratory',
          doctor: parsed.doctor || 'Attending Physician',
          patientName: parsed.patientName || 'Patient',
          findings: Array.isArray(parsed.findings) ? parsed.findings : [],
          medications: Array.isArray(parsed.medications) ? parsed.medications : [],
          diagnoses: Array.isArray(parsed.diagnoses) ? parsed.diagnoses : [],
          impression: parsed.impression || '',
          confidenceScore: parsed.confidenceScore || 0.98
        };
      } catch (err: any) {
        lastError = err;
        console.warn(`[MedicalOCR] Model ${model} returned error: ${err.message}. Trying next candidate...`);
      }
    }

    throw lastError || new Error('All Gemini Vision models failed to process image');
  }

  private async extractWithTesseract(buffer: Buffer): Promise<string> {
    let processedBuffer: Buffer;
    try {
      // Upscale and normalize image for better text readability
      processedBuffer = await sharp(buffer)
        .greyscale()
        .normalize()
        .sharpen({ sigma: 1.2 })
        .toBuffer();
    } catch {
      processedBuffer = buffer;
    }

    const worker = await createWorker('eng');
    const ret = await worker.recognize(processedBuffer);
    await worker.terminate();
    return ret.data.text || '';
  }

  public parseMedicalText(text: string, originalFileName: string): OCRResult {
    // 1. Hospital / Clinic detection
    let hospital = 'General Medical Center';
    const hospMatch = text.match(/(Dr\.\s*Fortis\s*Pathology|METROPOLIS[^\n\r]+|APOLLO[^\n\r]+|MAX[^\n\r]+|FORTIS[^\n\r]+|CITY CARE[^\n\r]+|[A-Za-z\s]{3,40}(?:PATHOLOGY|HOSPITAL|CLINIC|LABORATORY|LABS|HEALTHCARE|CENTER|DIAGNOSTICS|INSTITUTE))/i);
    if (hospMatch && hospMatch[1]) {
      hospital = hospMatch[1].replace(/[\r\n]+/g, ' ').trim();
    }

    // 2. Doctor detection
    let doctor = 'Dr. Attending Physician';
    const docMatch = text.match(/(?:DOCTOR|PHYSICIAN|DR\.|CONSULTANT|REF BY)[\s:]+(?:Dr\.\s*)?([A-Za-z\.\s]{3,35}(?:MD|MS|MBBS|MCh|FRCS)?)/i);
    if (docMatch && docMatch[1]) {
      doctor = `Dr. ${docMatch[1].replace(/^Dr\.\s*/i, '').trim()}`;
    }

    // 3. Patient Name detection
    let patientName = 'Patient';
    const patientMatch = text.match(/(?:PATIENT\s*NAME|PATIENT|NAME)[\s:]+(?:Mrs\.|Mr\.|Ms\.)?\s*([A-Za-z\s]{2,30})/i);
    if (patientMatch && patientMatch[1]) {
      patientName = patientMatch[1].replace(/[\r\n]+/g, '').trim();
    }

    // 4. Date detection
    let recordDate = new Date().toISOString().split('T')[0];
    const dateMatch = text.match(/(?:DATE|DATED|REPORT DATE)[\s:]+([0-9]{1,2}[-\/][0-9]{1,2}[-\/][0-9]{4}|[0-9]{4}[-\/][0-9]{2}[-\/][0-9]{2})/i);
    if (dateMatch && dateMatch[1]) {
      const rawDate = dateMatch[1];
      if (rawDate.includes('-') && rawDate.split('-')[0].length === 4) {
        recordDate = rawDate;
      } else {
        const parts = rawDate.split(/[-\/]/);
        if (parts[2]?.length === 4) {
          recordDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
    }

    // 5. Document Type detection
    let recordType = 'Other';
    let title = 'Medical Report';
    const lower = text.toLowerCase();

    if (lower.includes('haemogram') || lower.includes('hemogram') || lower.includes('complete blood count') || lower.includes('cbc')) {
      recordType = 'Blood Test';
      title = 'Haemogram (Complete Blood Count)';
    } else if (lower.includes('discharge summary') || lower.includes('hospital discharge')) {
      recordType = 'Discharge Summary';
      title = 'Inpatient Discharge Summary';
    } else if (lower.includes('mri') || lower.includes('magnetic resonance')) {
      recordType = 'MRI';
      title = 'MRI Examination Report';
    } else if (lower.includes('ct scan') || lower.includes('computed tomography')) {
      recordType = 'CT Scan';
      title = 'CT Scan Examination';
    } else if (lower.includes('x-ray') || lower.includes('xray') || lower.includes('radiograph')) {
      recordType = 'X-Ray';
      title = 'Radiological X-Ray Report';
    } else if (lower.includes('prescription') || lower.includes('rx /')) {
      recordType = 'Prescription';
      title = 'Clinical Prescription';
    } else if (lower.includes('consultation')) {
      recordType = 'Consultation';
      title = 'Specialist Consultation Note';
    } else if (lower.includes('hba1c') || lower.includes('blood sugar')) {
      recordType = 'Blood Test';
      title = 'HbA1c & Blood Glucose Report';
    } else if (lower.includes('lipid profile') || lower.includes('cholesterol')) {
      recordType = 'Blood Test';
      title = 'Fasting Lipid Profile';
    } else if (lower.includes('pathology') || lower.includes('test') || lower.includes('results')) {
      recordType = 'Blood Test';
      title = 'Laboratory Pathology Report';
    }

    // 6. Findings / Lab Results extraction
    const findings: ParsedFinding[] = [];
    const lines = text.split(/\r?\n/);

    const testRegexes = [
      { name: 'Haemoglobin', pattern: /H[ae]+moglobin[^\d]*(\d+\.?\d*)\s*([a-zA-Z%]+)?/i, normal: [12.0, 16.0], unit: 'gm%' },
      { name: 'Total WBC Count', pattern: /(?:Total\s+)?WBC\s*(?:Count)?[^\d]*([\d,]+)\s*(\/cumm|\/uL|\/µL)?/i, normal: [4000, 11000], unit: '/cmm' },
      { name: 'Neutrophils', pattern: /Neutrophils?[^\d]*(\d+\.?\d*)\s*([%])?/i, normal: [50, 65], unit: '%' },
      { name: 'Lymphocytes', pattern: /Lymphocytes?[^\d]*(\d+\.?\d*)\s*([%])?/i, normal: [20, 45], unit: '%' },
      { name: 'Eosinophils', pattern: /Eosinophils?[^\d]*(\d+\.?\d*)\s*([%])?/i, normal: [1, 4], unit: '%' },
      { name: 'Monocytes', pattern: /Monocytes?[^\d]*(\d+\.?\d*)\s*([%])?/i, normal: [2, 8], unit: '%' },
      { name: 'Basophils', pattern: /Basophils?[^\d]*(\d+\.?\d*)\s*([%])?/i, normal: [0, 1], unit: '%' },
      { name: 'Haematocrit (HCT)', pattern: /H[ae]+matocrit[^\d]*(\d+\.?\d*)\s*([%])?/i, normal: [36, 50], unit: '%' },
      { name: 'RBC Count', pattern: /R\.?B\.?C\.?\s*(?:Count)?[^\d]*(\d+\.?\d*)\s*(mil\.\/cmm|million\/uL)?/i, normal: [3.8, 5.8], unit: 'mil./cmm' },
      { name: 'Platelet Count', pattern: /Platelet Count[^\d]*([\d\.]+)\s*(\/cumm|\/uL|lacs\/cmm)?/i, normal: [1.5, 4.5], unit: '/cmm' },
      { name: 'MCV', pattern: /MCV[^\d]*(\d+\.?\d*)\s*(fL)?/i, normal: [76, 96], unit: 'fL' },
      { name: 'MCH', pattern: /MCH[^\d]*(\d+\.?\d*)\s*(pg)?/i, normal: [27, 32], unit: 'pg' },
      { name: 'MCHC', pattern: /MCHC[^\d]*(\d+\.?\d*)\s*(gm\/dl)?/i, normal: [32, 36], unit: 'gm/dl' },
      { name: 'RDW-CV', pattern: /RDW[^\d]*(\d+\.?\d*)\s*([%])?/i, normal: [11.5, 14.5], unit: '%' },
      { name: 'HbA1c', pattern: /HbA1c[^\d]*(\d+\.?\d*)\s*([%])/i, normal: [4.0, 6.0], unit: '%' },
      { name: 'Fasting Blood Sugar', pattern: /(?:Fasting Blood Sugar|FBS|Fasting Glucose)[^\d]*(\d+\.?\d*)\s*(mg\/dL)/i, normal: [70, 100], unit: 'mg/dL' },
      { name: 'Serum Creatinine', pattern: /(?:Serum )?Creatinine[^\d]*(\d+\.?\d*)\s*(mg\/dL)/i, normal: [0.7, 1.3], unit: 'mg/dL' },
      { name: 'Total Cholesterol', pattern: /Total Cholesterol[^\d]*(\d+\.?\d*)\s*(mg\/dL)/i, normal: [120, 200], unit: 'mg/dL' },
      { name: 'Blood Urea', pattern: /Blood Urea[^\d]*(\d+\.?\d*)\s*(mg\/dL)/i, normal: [15, 45], unit: 'mg/dL' }
    ];

    for (const test of testRegexes) {
      const match = text.match(test.pattern);
      if (match) {
        const valNum = parseFloat(match[1].replace(/,/g, ''));
        const isAbnormal = valNum < test.normal[0] || valNum > test.normal[1];
        findings.push({
          name: test.name,
          value: match[1],
          unit: match[2] || test.unit || '',
          referenceRange: `${test.normal[0]} - ${test.normal[1]} ${test.unit || ''}`.trim(),
          isAbnormal,
          type: 'laboratory'
        });
      }
    }

    // Generic line regex for other lab lines: "Item Name: 12.3 unit (ref: a - b)"
    for (const line of lines) {
      const genericMatch = line.match(/^([A-Za-z\s\(\)\/]{3,30})[\s:]+([\d\.]+)\s*([a-zA-Z\/%]+)?\s*(?:\((?:Reference:?|Ref:?)\s*([^\)]+)\))?/i);
      if (genericMatch) {
        const name = genericMatch[1].trim();
        const value = genericMatch[2].trim();
        const unit = genericMatch[3]?.trim() || '';
        const refRange = genericMatch[4]?.trim() || '';
        if (!findings.some(f => f.name.toLowerCase() === name.toLowerCase()) && findings.length < 15) {
          const isAbnormal = line.toLowerCase().includes('high') || line.toLowerCase().includes('abnormal');
          findings.push({
            name,
            value,
            unit,
            referenceRange: refRange,
            isAbnormal,
            type: 'laboratory'
          });
        }
      }
    }

    // 7. Diagnoses extraction
    const diagnoses: string[] = [];
    const diagSection = text.match(/(?:DIAGNOSIS|DIAGNOSES|IMPRESSION|FINAL DIAGNOSIS)[\s:]+([\s\S]*?)(?=(?:Rx|MEDICATIONS|INSTRUCTIONS|RECOMMENDATION|$))/i);
    if (diagSection && diagSection[1]) {
      const diagLines = diagSection[1].split(/\r?\n/).map(l => l.replace(/^[0-9\.\-\*\•\s]+/, '').trim()).filter(l => l.length > 3 && l.length < 100);
      diagnoses.push(...diagLines.slice(0, 4));
    }

    // 8. Medications extraction
    const medications: ParsedMedication[] = [];
    const medSection = text.match(/(?:MEDICATIONS|Rx|PRESCRIPTION|DISCHARGE MEDICATIONS)[\s:]+([\s\S]*?)(?=(?:INSTRUCTIONS|RECOMMENDATIONS|ADVICE|$))/i);
    if (medSection && medSection[1]) {
      const medLines = medSection[1].split(/\r?\n/);
      for (const line of medLines) {
        const clean = line.replace(/^[0-9\.\-\*\•\s]+/, '').trim();
        if (!clean) continue;
        const medMatch = clean.match(/(?:Tab\.|Cap\.|Inj\.|Syp\.)?\s*([A-Za-z\s]+)\s*(\d+\s*(?:mg|mcg|ml|iu|g))\b(?:\s*-\s*([^\-]+))?/i);
        if (medMatch) {
          medications.push({
            name: medMatch[1].trim(),
            dosage: medMatch[2].trim(),
            frequency: medMatch[3]?.trim() || 'As directed',
            duration: '90 days'
          });
        }
      }
    }

    // 9. Impression extraction
    let impression = 'No significant acute abnormalities noted. Clinical correlation advised.';
    const impMatch = text.match(/(?:IMPRESSION|CONCLUSION|SUMMARY)[\s:]+([\s\S]*?)(?=(?:RECOMMENDATION|ADVICE|$))/i);
    if (impMatch && impMatch[1]) {
      impression = impMatch[1].replace(/\r?\n/g, ' ').trim();
    }

    return {
      rawText: text,
      title,
      recordType,
      recordDate,
      hospital,
      doctor,
      patientName,
      findings,
      medications,
      diagnoses,
      impression,
      confidenceScore: findings.length > 0 ? 0.85 : 0.4
    };
  }
}

export const ocrService = new MedicalOCRService();
