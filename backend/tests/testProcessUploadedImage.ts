import fs from 'fs';
import { ocrService } from '../src/services/ocr.service';

async function run() {
  const imgPath = 'C:/Users/pavan/.gemini/antigravity/brain/34624627-84d6-4ca8-97c9-57757f392294/.user_uploaded/media_1788591285495.jpg';
  const buffer = fs.readFileSync(imgPath);

  console.log('Processing user image with MedicalOCRService...');
  const result = await ocrService.processDocument(buffer, 'image/jpeg', 'haemogram_report.jpg');

  console.log('\n--- OCR RESULT ---');
  console.log('Title:', result.title);
  console.log('Record Type:', result.recordType);
  console.log('Hospital:', result.hospital);
  console.log('Doctor:', result.doctor);
  console.log('Patient Name:', result.patientName);
  console.log('Findings Count:', result.findings.length);
  console.log('Findings:', JSON.stringify(result.findings, null, 2));
  console.log('Diagnoses:', result.diagnoses);
}

run().catch(console.error);
