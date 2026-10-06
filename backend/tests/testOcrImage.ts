import fs from 'fs';
import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';

async function testOcrModes() {
  const imgPath = 'C:/Users/pavan/.gemini/antigravity/brain/34624627-84d6-4ca8-97c9-57757f392294/.user_uploaded/media_1788591285495.jpg';
  const rawBuffer = fs.readFileSync(imgPath);

  // Resize and enhance contrast
  const enhanced = await sharp(rawBuffer)
    .greyscale()
    .linear(1.5, -30) // increase contrast
    .toBuffer();

  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO
  });

  const res = await worker.recognize(enhanced);
  console.log('--- ENHANCED OCR TEXT ---');
  console.log(res.data.text);
  console.log('--- END ---');

  await worker.terminate();
}

testOcrModes().catch(console.error);
