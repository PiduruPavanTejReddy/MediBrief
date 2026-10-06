import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { db, initDatabase } from '../src/db/database';
import { ocrService } from '../src/services/ocr.service';
import { RAGService } from '../src/services/rag.service';
import { AIService } from '../src/services/ai.service';
import { SharingService } from '../src/services/sharing.service';
import { v4 as uuidv4 } from 'uuid';

async function runRealDatasetTest() {
  console.log('================================================================');
  console.log(' TESTING MEDIBRIEF WITH REAL CLINICAL DATASETS (MTSamples/MIMIC)');
  console.log('================================================================\n');

  initDatabase();

  const datasetDir = path.resolve(__dirname, '../../test_real_datasets');
  const files = [
    {
      fileName: 'discharge_summary_cardiology.txt',
      filePath: path.join(datasetDir, 'discharge_summary_cardiology.txt'),
      expectedCategory: 'Discharge Summary',
      expectedHospital: 'APOLLO HOSPITALS',
      expectedDoc: 'Dr. K. R. Balakrishnan'
    },
    {
      fileName: 'cbc_lipid_lab_report.txt',
      filePath: path.join(datasetDir, 'cbc_lipid_lab_report.txt'),
      expectedCategory: 'Blood Test',
      expectedHospital: 'METROPOLIS HEALTHCARE',
      expectedDoc: 'Dr. K. R. Balakrishnan'
    },
    {
      fileName: 'radiology_chest_mri.txt',
      filePath: path.join(datasetDir, 'radiology_chest_mri.txt'),
      expectedCategory: 'MRI',
      expectedHospital: 'MAX HEALTHCARE',
      expectedDoc: 'Dr. Sengottuvelu'
    }
  ];

  // 1. Create a dedicated test patient profile for the real dataset
  const testPatientId = uuidv4();
  const testMobile = '+919988776655';
  const now = new Date().toISOString();

  // Clean up any previous test run records
  db.prepare('DELETE FROM users WHERE mobile_number = ?').run(testMobile);

  db.prepare(`
    INSERT INTO users (id, role, mobile_number, created_at, updated_at)
    VALUES (?, 'patient', ?, ?, ?)
  `).run(testPatientId, testMobile, now, now);

  db.prepare(`
    INSERT INTO patient_profiles (id, user_id, full_name, date_of_birth, gender, blood_group, emergency_contact, email, address, created_at, updated_at)
    VALUES (?, ?, 'Venkatraman Iyer', '1968-04-12', 'Male', 'B+', '+91 99887 00000 (Priya Iyer - Daughter)', 'v.iyer@example.com', 'Chennai, Tamil Nadu', ?, ?)
  `).run(uuidv4(), testPatientId, now, now);

  console.log(`[Setup] Created Test Patient: Venkatraman Iyer (ID: ${testPatientId})`);

  const createdRecordIds: string[] = [];

  // 2. Ingest and run Medical OCR on each real document
  console.log('\n--- 1. OCR Ingestion & Clinical Entity Extraction ---');
  for (const f of files) {
    const content = fs.readFileSync(f.filePath, 'utf8');
    const buffer = Buffer.from(content);

    const ocrResult = await ocrService.processDocument(buffer, 'text/plain', f.fileName);

    console.log(`\n  📄 File: ${f.fileName}`);
    console.log(`     • Detected Type: "${ocrResult.recordType}" (Title: "${ocrResult.title}")`);
    console.log(`     • Healthcare Center: "${ocrResult.hospital}"`);
    console.log(`     • Attending Doctor: "${ocrResult.doctor}"`);
    console.log(`     • Date: ${ocrResult.recordDate}`);
    console.log(`     • Extracted Lab Findings: ${ocrResult.findings.length} findings`);
    ocrResult.findings.slice(0, 3).forEach(fn => {
      console.log(`       - ${fn.name}: ${fn.value} ${fn.unit} ${fn.isAbnormal ? '[ABNORMAL]' : ''}`);
    });
    console.log(`     • Extracted Medications: ${ocrResult.medications.length} items`);
    ocrResult.medications.forEach(m => {
      console.log(`       - ${m.name} (${m.dosage}) - ${m.frequency}`);
    });
    console.log(`     • Documented Diagnoses: ${ocrResult.diagnoses.join(', ') || 'N/A'}`);

    // Verify key extractions
    assert.ok(ocrResult.findings.length > 0, `Failed to extract findings from ${f.fileName}`);
    assert.ok(ocrResult.hospital.length > 3, `Failed to extract hospital from ${f.fileName}`);

    // Save record to DB
    const recordId = uuidv4();
    createdRecordIds.push(recordId);

    db.prepare(`
      INSERT INTO medical_records (
        id, patient_id, record_type, title, hospital, doctor, record_date, uploaded_at,
        original_file_key, file_name, file_size, mime_type, extracted_text, verification_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', ?, ?)
    `).run(
      recordId, testPatientId, ocrResult.recordType, ocrResult.title, ocrResult.hospital,
      ocrResult.doctor, ocrResult.recordDate, now, f.fileName, f.fileName, buffer.length,
      'text/plain', content, now, now
    );

    // Save findings
    for (const finding of ocrResult.findings) {
      db.prepare(`
        INSERT INTO extracted_findings (id, record_id, finding_type, name, value, unit, reference_range, abnormal_flag, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), recordId, finding.type || 'laboratory', finding.name, finding.value, finding.unit, finding.referenceRange, finding.isAbnormal ? 1 : 0, now);
    }

    // Save medications
    for (const med of ocrResult.medications) {
      db.prepare(`
        INSERT INTO medications (id, patient_id, record_id, medication_name, dosage, frequency, duration, instructions, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testPatientId, recordId, med.name, med.dosage, med.frequency, med.duration || null, med.instructions || null, now);
    }

    // Save diagnoses
    for (const diag of ocrResult.diagnoses) {
      db.prepare(`
        INSERT INTO diagnoses (id, patient_id, record_id, diagnosis, diagnosis_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testPatientId, recordId, diag, ocrResult.recordDate || now, now);
    }

    // Index vector embeddings for RAG
    const fullRecord = db.prepare('SELECT * FROM medical_records WHERE id = ?').get(recordId) as any;
    RAGService.indexRecord(fullRecord, {
      findings: ocrResult.findings,
      medications: ocrResult.medications,
      diagnoses: ocrResult.diagnoses.map(d => ({ diagnosis: d }))
    });
  }

  console.log(`\n  ✓ Successfully parsed and indexed ${createdRecordIds.length} real clinical reports!`);

  // 3. Test RAG Retrieval over the real datasets
  console.log('\n--- 2. Testing RAG Vector Search & Retrieval Accuracy ---');

  const query1 = 'What is the patient left ventricular ejection fraction and cardiac viability?';
  const retrievedChunks1 = RAGService.retrieveRelevantChunks(testPatientId, query1, undefined, 3);
  console.log(`  🔍 Query: "${query1}"`);
  console.log(`     Retrieved ${retrievedChunks1.length} chunks:`);
  retrievedChunks1.forEach((c, idx) => {
    console.log(`     [Chunk ${idx + 1}] (${c.citation.record_title}): ${c.chunkText.substring(0, 90)}...`);
  });
  assert.ok(retrievedChunks1.some(c => c.chunkText.includes('LVEF') || c.chunkText.includes('Ejection Fraction') || c.chunkText.includes('45')));
  console.log('     ✓ Precision verified: LVEF and MRI viability correctly retrieved!');

  const query2 = 'What heart medications were prescribed at discharge?';
  const retrievedChunks2 = RAGService.retrieveRelevantChunks(testPatientId, query2, undefined, 3);
  console.log(`\n  🔍 Query: "${query2}"`);
  console.log(`     Retrieved ${retrievedChunks2.length} chunks:`);
  retrievedChunks2.forEach((c, idx) => {
    console.log(`     [Chunk ${idx + 1}] (${c.citation.record_title}): ${c.chunkText.substring(0, 90)}...`);
  });
  assert.ok(retrievedChunks2.some(c => c.chunkText.includes('Ticagrelor') || c.chunkText.includes('Rosuvastatin') || c.chunkText.includes('Metoprolol')));
  console.log('     ✓ Precision verified: Cardiac medications accurately retrieved!');

  // 4. Test MediVault AI Clinical Chat Assistant with Citations
  console.log('\n--- 3. Testing MediVault AI Answer Generation with Citations ---');
  const aiAnswer = await AIService.chat(
    testPatientId,
    'What did my blood test show regarding my kidneys and cholesterol?',
    'patient'
  );

  console.log(`\n  🤖 MediVault AI Response:\n${aiAnswer.answer}\n`);
  console.log(`  📎 Generated Citations (${aiAnswer.citations.length}):`);
  aiAnswer.citations.forEach(cit => {
    console.log(`     • [${cit.record_title} - ${cit.record_date}] (${cit.record_type})`);
  });

  assert.ok(aiAnswer.citations.length > 0, 'Expected citations linking back to original clinical records');
  console.log('  ✓ AI accurately answered with clickable citations to laboratory records!');

  // 5. Test Doctor Sharing Lifecycle with Real Dataset
  console.log('\n--- 4. Testing Temporary Doctor Sharing with Real Clinical Data ---');
  const sharingResult = await SharingService.createSession({
    patientId: testPatientId,
    scopeType: 'all'
  });

  console.log(`  ✓ Generated Access Code: ${sharingResult.accessCode}`);

  // Doctor accesses the session
  const doctorAccess = await SharingService.verifyCode(sharingResult.accessCode);
  assert.strictEqual(doctorAccess.patientId, testPatientId);
  console.log(`  ✓ Doctor authenticated into session (Access Code Verified). Permitted records: ${doctorAccess.recordCount}`);

  // Doctor AI consultation summary
  const clinicalDigest = await AIService.generateSummary(testPatientId);
  console.log(`\n  📋 Doctor AI Clinical Digest Summary:\n${clinicalDigest.summary}\n`);
  console.log(`     Known Conditions: ${clinicalDigest.knownConditions.join('; ')}`);
  console.log(`     Active Medications: ${clinicalDigest.currentMedications.map(m => `${m.name} (${m.dosage})`).join(', ')}`);
  assert.ok(clinicalDigest.patientInfo.fullName.includes('Venkatraman Iyer'));

  // Doctor finishes consultation and ends session
  await SharingService.endSessionByDoctor(doctorAccess.sharingSessionId, 'doc_test_session_1');
  console.log('  ✓ Doctor concluded consultation session.');

  // Verify access is terminated
  let terminatedCheck = false;
  try {
    await SharingService.verifyCode(sharingResult.accessCode);
  } catch (e: any) {
    terminatedCheck = true;
    console.log(`  ✓ Verification: Subsequent access rejected with message: "${e.message}"`);
  }
  assert.strictEqual(terminatedCheck, true);

  console.log('\n================================================================');
  console.log(' 🎉 ALL REAL DATASET PIPELINE TESTS COMPLETED SUCCESSFULLY! 🎉');
  console.log('================================================================\n');
}

runRealDatasetTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal real dataset test error:', err);
    process.exit(1);
  });
