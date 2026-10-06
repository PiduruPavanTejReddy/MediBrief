import assert from 'assert';
import { v4 as uuidv4 } from 'uuid';
import { initDatabase, db } from '../src/db/database';
import { AuthService } from '../src/services/auth.service';
import { SharingService } from '../src/services/sharing.service';
import { RAGService } from '../src/services/rag.service';
import { AIService } from '../src/services/ai.service';
import { ocrService } from '../src/services/ocr.service';
import { storageService } from '../src/services/storage.service';
import { seedDemoData } from '../src/seeds/seedDemoData';
import { calculateAge, formatAge } from '../src/utils/date.utils';

async function runAllTests() {
  console.log('====================================================');
  console.log(' Starting MediBrief Automated Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ PASSED: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ FAILED: ${name}`);
      console.error(`    Error: ${err.message}`);
      failed++;
    }
  }

  // 0. Ensure clean DB and seed
  initDatabase();
  db.prepare('DELETE FROM otp_verifications').run();
  seedDemoData();

  console.log('--- Phase 1: Authentication & OTP Tests ---');

  await test('OTP request and verification flow', async () => {
    const mobile = '+919123456780';
    const sendResult = await AuthService.sendOtp(mobile);
    assert.strictEqual(sendResult.success, true);
    assert.ok(sendResult.expiresInSeconds > 0);
    assert.ok(sendResult.devOtp);

    const verifyResult = await AuthService.verifyOtp(mobile, sendResult.devOtp!);
    assert.ok(verifyResult.token);
    assert.strictEqual(verifyResult.user.mobile_number, mobile);
  });

  await test('Firebase ID token authentication links Firebase UID to patient account', async () => {
    const testUid = 'firebase_user_test_919123456789';
    const testMobile = '+919123456789';
    // Craft test base64 token payload containing user_id
    const payload = Buffer.from(JSON.stringify({
      user_id: testUid,
      phone_number: testMobile,
      auth_time: Math.floor(Date.now() / 1000)
    })).toString('base64');
    const mockIdToken = `fakeHeader.${payload}.fakeSignature`;

    const fbAuthResult = await AuthService.authenticateWithFirebase(mockIdToken, testMobile);
    assert.ok(fbAuthResult.token);
    assert.strictEqual(fbAuthResult.user.mobile_number, testMobile);
    assert.strictEqual(fbAuthResult.user.firebase_uid, testUid);

    // Verify user can be queried by firebase_uid
    const retrievedUser = db.prepare('SELECT * FROM users WHERE firebase_uid = ?').get(testUid) as any;
    assert.ok(retrievedUser);
    assert.strictEqual(retrievedUser.firebase_uid, testUid);
  });

  await test('Invalid OTP rejection and attempt decrement', async () => {
    const mobile = '+919123456781';
    await AuthService.sendOtp(mobile);

    let caught = false;
    try {
      await AuthService.verifyOtp(mobile, '999999');
    } catch (err: any) {
      caught = true;
      assert.ok(err.message.includes('Invalid OTP') || err.message.includes('Incorrect OTP'));
    }
    assert.strictEqual(caught, true);
  });

  await test('Rate limiting prevents rapid OTP flooding', async () => {
    const mobile = '+919123456782';
    let rateLimited = false;
    for (let i = 0; i < 6; i++) {
      try {
        await AuthService.sendOtp(mobile);
      } catch (err: any) {
        if (err.message.includes('Too many OTP requests')) {
          rateLimited = true;
          break;
        }
      }
    }
    assert.strictEqual(rateLimited, true);
  });

  console.log('\n--- Phase 1b: Date of Birth & Dynamic Age Verification ---');

  await test('Date of Birth accurately calculates age considering month boundaries & leap years', async () => {
    // Current year: 2026, month: Oct
    // User requested examples:
    // DOB: 20 December 2007 -> 18 years
    const decDob = calculateAge('2007-12-20');
    assert.strictEqual(decDob, 18, 'Birthday in December has not occurred yet this year');

    // DOB: 20 September 2007 -> 19 years
    const sepDob = calculateAge('2007-09-20');
    assert.strictEqual(sepDob, 19, 'Birthday in September has already occurred this year');

    // Birthday today: 6 October 2007 -> 19 years
    const todayDob = calculateAge('2007-10-06');
    assert.strictEqual(todayDob, 19, 'Birthday today counts as completed year');

    // Birthday tomorrow: 7 October 2007 -> 18 years
    const tomorrowDob = calculateAge('2007-10-07');
    assert.strictEqual(tomorrowDob, 18, 'Birthday tomorrow has not occurred yet');

    // Leap year birthdate: 29 Feb 2004 -> 22 years in Oct 2026
    const leapDob = calculateAge('2004-02-29');
    assert.strictEqual(leapDob, 22, 'Leap year birthday is accurately computed');

    // Future birthdate guard
    const futureDob = calculateAge('2028-01-01');
    assert.strictEqual(futureDob, null, 'Future birth date returns null');

    // Invalid format guard
    const invalidDob = calculateAge('invalid-date');
    assert.strictEqual(invalidDob, null, 'Invalid birth date returns null');

    // Graceful formatting: DOB missing -> "Age not available"
    assert.strictEqual(formatAge(null), 'Age not available');
    assert.strictEqual(formatAge(''), 'Age not available');
    assert.strictEqual(formatAge('2007-09-20'), '19 years');
    assert.strictEqual(formatAge('2007-09-20', { short: true }), '19 yrs');
  });

  console.log('\n--- Phase 2: Medical Records & Chronological Ordering ---');

  await test('Records are chronologically sorted (newest to oldest)', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    assert.ok(user);

    const records = db.prepare(`
      SELECT record_date, title FROM medical_records 
      WHERE patient_id = ? 
      ORDER BY record_date DESC
    `).all(user.id) as any[];

    assert.ok(records.length >= 12);
    for (let i = 0; i < records.length - 1; i++) {
      const d1 = new Date(records[i].record_date).getTime();
      const d2 = new Date(records[i + 1].record_date).getTime();
      assert.ok(d1 >= d2, `Record ${records[i].title} (${records[i].record_date}) should be >= ${records[i + 1].record_date}`);
    }
  });

  await test('OCR extracts structured lab values and clinical entities', async () => {
    const sampleText = `METROPOLIS HEALTHCARE LABS
PATIENT: Test Patient
DATE: 2026-08-01
DOCTOR: Dr. Anita Roy, MD
HbA1c: 6.7 %
Fasting Blood Sugar: 114 mg/dL
IMPRESSION: Stable diabetes.`;

    const ocrResult = ocrService.parseMedicalText(sampleText, 'lab_test.txt');
    assert.strictEqual(ocrResult.recordType, 'Blood Test');
    assert.ok(ocrResult.findings.some(f => f.name === 'HbA1c' && f.value === '6.7'));
    assert.ok(ocrResult.findings.some(f => f.name === 'Fasting Blood Sugar' && f.value === '114'));
    assert.strictEqual(ocrResult.recordDate, '2026-08-01');
  });

  console.log('\n--- Phase 3: Doctor Sharing, Hashing & Revocation ---');

  await test('Cryptographic doctor sharing code generation & hash verification', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    
    // Create sharing session for Blood Tests only
    const createResult = await SharingService.createSession({
      patientId: user.id,
      scopeType: 'categories',
      categories: ['Blood Test']
    });

    assert.ok(createResult.accessCode.match(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/));
    assert.ok(createResult.recordCount > 0);

    // Doctor enters code
    const doctorLogin = await SharingService.verifyCode(createResult.accessCode);
    assert.ok(doctorLogin.doctorToken);
    assert.strictEqual(doctorLogin.patientId, user.id);
  });

  await test('Patient can revoke sharing access immediately', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    
    const sessionRes = await SharingService.createSession({
      patientId: user.id,
      scopeType: 'all'
    });

    // Revoke
    await SharingService.revokeSessionByPatient(user.id, sessionRes.session.id);

    // Doctor tries to verify revoked code
    let revokedCheckFailed = false;
    try {
      await SharingService.verifyCode(sessionRes.accessCode);
    } catch (err: any) {
      revokedCheckFailed = true;
      assert.ok(err.message.includes('revoked'));
    }
    assert.strictEqual(revokedCheckFailed, true);
  });

  await test('Doctor can end session and terminates access', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    
    const sessionRes = await SharingService.createSession({
      patientId: user.id,
      scopeType: 'all'
    });

    const docLogin = await SharingService.verifyCode(sessionRes.accessCode);
    await SharingService.endSessionByDoctor(sessionRes.session.id, 'doc-session-test');

    let endCheckFailed = false;
    try {
      await SharingService.verifyCode(sessionRes.accessCode);
    } catch (err: any) {
      endCheckFailed = true;
      assert.ok(err.message.includes('already ended'));
    }
    assert.strictEqual(endCheckFailed, true);
  });

  console.log('\n--- Phase 4: Intent-Aware Retrieval & MediVault AI Tests ---');

  await test('1. Intent: LATEST_RECORD deterministically returns newest verified report', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const aiResp = await AIService.chat(user.id, 'Can you give me my latest report', 'patient');

    assert.ok(aiResp.answer.includes('Eye Prescription'), 'Should identify Eye Prescription');
    assert.ok(aiResp.answer.includes('19 September 2026'), 'Should state exact date');
    assert.ok(aiResp.answer.includes('Shifa Al Jazeera Medical Centre Fahaheel'), 'Should state facility');
    assert.ok(aiResp.citations.length === 1, 'Should include exact citation');
    assert.ok(aiResp.citations[0].record_title.includes('Eye Prescription'));
  });

  await test('2. Intent: What is my latest medical record?', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const aiResp = await AIService.chat(user.id, 'What is my latest medical record?', 'patient');

    assert.ok(aiResp.answer.includes('Eye Prescription'));
    assert.ok(aiResp.citations.length > 0);
  });

  await test('3. Intent: RECORD_LIST lists all verified patient records', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const aiResp = await AIService.chat(user.id, 'Show me my medical reports', 'patient');

    assert.ok(aiResp.answer.includes('verified medical record'));
    assert.ok(aiResp.citations.length >= 12);
  });

  await test('4. Intent: LAB_RESULT (latest blood test) finds newest blood test', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const aiResp = await AIService.chat(user.id, 'What was my latest blood test?', 'patient');

    assert.ok(aiResp.answer.includes('Blood Test') || aiResp.answer.includes('Metabolic'));
    assert.ok(aiResp.citations.length > 0);
  });

  await test('5. Intent: LAB_RESULT (specific analyte: haemoglobin)', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const aiResp = await AIService.chat(user.id, 'What was my haemoglobin?', 'patient');

    assert.ok(aiResp.answer.toLowerCase().includes('haemoglobin') || aiResp.answer.toLowerCase().includes('hemoglobin'));
    assert.ok(aiResp.citations.length > 0);
  });

  await test('6. Intent: MEDICATION queries verified prescriptions', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const aiResp = await AIService.chat(user.id, 'What medications am I taking?', 'patient');

    assert.ok(aiResp.answer.includes('Metformin') || aiResp.answer.includes('Amlodipine'));
    assert.ok(aiResp.citations.length > 0);
  });

  await test('7. Intent: COMPARISON_TREND compares recent reports chronologically', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const aiResp = await AIService.chat(user.id, 'What changed in my recent reports?', 'patient');

    assert.ok(aiResp.answer.includes('recent medical reports') || aiResp.answer.includes('comparison'));
    assert.ok(aiResp.citations.length >= 2);
  });

  await test('8. Intent: SUMMARY generates comprehensive clinical digest', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const aiResp = await AIService.chat(user.id, 'Summarize my medical history', 'patient');

    assert.ok(aiResp.answer.includes('PATIENT MEDICAL SUMMARY'));
    assert.ok(aiResp.citations.length > 0);
  });

  await test('9. Intent: DOCUMENT_SPECIFIC retrieves Eye Prescription details', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const aiResp = await AIService.chat(user.id, 'What does my eye prescription say?', 'patient');

    assert.ok(aiResp.answer.includes('Eye Prescription'));
    assert.ok(aiResp.answer.includes('Dr. Reshma Ravindra Malakere'));
    assert.ok(aiResp.citations.length === 1);
  });

  await test('10. Intent: DOCTOR_FACILITY retrieves doctor for latest prescription', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const aiResp = await AIService.chat(user.id, 'Which doctor wrote my latest prescription?', 'patient');

    assert.ok(aiResp.answer.includes('Reshma Ravindra Malakere'));
    assert.ok(aiResp.citations.length > 0);
  });

  await test('11. Conversational context: follow-up on right eye from Eye Prescription', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const history = [
      { role: 'user', message: 'What is my latest report?' },
      { role: 'assistant', message: 'Your latest report is Eye Prescription from 19 September 2026.' }
    ];
    const aiResp = await AIService.chat(user.id, 'What did it say about my right eye?', 'patient', undefined, history);

    assert.ok(aiResp.answer.includes('Right Eye') || aiResp.answer.includes('OD'));
    assert.ok(aiResp.citations.length === 1);
  });

  await test('12. Security: Unverified records are strictly excluded from AI retrieval', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const pendingId = uuidv4();
    db.prepare(`
      INSERT INTO medical_records (
        id, patient_id, record_type, title, hospital, doctor, record_date, 
        uploaded_at, original_file_key, file_name, file_size, mime_type, 
        extracted_text, verification_status, created_at, updated_at
      ) VALUES (?, ?, 'Consultation', 'UNVERIFIED REJECTED REPORT', 'Fake Clinic', 'Dr. Fake', '2026-10-01', datetime('now'), 'fake.pdf', 'fake.pdf', 100, 'application/pdf', 'Unverified pending evaluation', 'pending', datetime('now'), datetime('now'))
    `).run(pendingId, user.id);

    const aiResp = await AIService.chat(user.id, 'Can you give me my latest report', 'patient');
    // Must return the verified Eye Prescription, NOT the unverified pending record from Oct 1
    assert.ok(!aiResp.answer.includes('UNVERIFIED REJECTED REPORT'));
    assert.ok(aiResp.answer.includes('Eye Prescription'));

    // Clean up
    db.prepare('DELETE FROM medical_records WHERE id = ?').run(pendingId);
  });

  await test('13. Anti-hallucination guard protects against fabricating non-existent records', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const aiResp = await AIService.chat(user.id, 'What was my chemotherapy regimen for leukemia?', 'patient');

    assert.ok(aiResp.answer.includes("I couldn't find this information in the medical records"));
    assert.strictEqual(aiResp.citations.length, 0);
  });

  console.log('\n--- Phase 5: MANDATORY SECURITY ISOLATION TESTS ---');

  await test('CRITICAL SECURITY: Patient A cannot access Patient B records or embeddings', async () => {
    // Create Patient A
    const patientAId = uuidv4();
    db.prepare(`
      INSERT INTO users (id, role, mobile_number, created_at, updated_at)
      VALUES (?, 'patient', '+919999990001', datetime('now'), datetime('now'))
    `).run(patientAId);

    // Create Patient B
    const patientBId = uuidv4();
    db.prepare(`
      INSERT INTO users (id, role, mobile_number, created_at, updated_at)
      VALUES (?, 'patient', '+919999990002', datetime('now'), datetime('now'))
    `).run(patientBId);

    // Create confidential record for Patient B
    const secretBRecordId = uuidv4();
    db.prepare(`
      INSERT INTO medical_records (
        id, patient_id, record_type, title, hospital, doctor, record_date, 
        uploaded_at, original_file_key, file_name, file_size, mime_type, 
        extracted_text, verification_status, created_at, updated_at
      ) VALUES (?, ?, 'Consultation', 'CONFIDENTIAL PSYCHIATRY EVALUATION PATIENT B', 'Secret Clinic', 'Dr. Confidential', '2026-08-15', datetime('now'), 'secret_b.pdf', 'secret_b.pdf', 100, 'application/pdf', 'CONFIDENTIAL PSYCHIATRIC DIAGNOSIS: Bipolar 1 Disorder severe mania', 'verified', datetime('now'), datetime('now'))
    `).run(secretBRecordId, patientBId);

    // Index Patient B's confidential record
    const secretBRecord = db.prepare('SELECT * FROM medical_records WHERE id = ?').get(secretBRecordId) as any;
    RAGService.indexRecord(secretBRecord);

    // Now Patient A queries AI about psychiatric diagnosis
    const patientAQuery = await AIService.chat(patientAId, 'What psychiatric condition was diagnosed?', 'patient');

    // Patient A MUST NOT get Patient B's diagnosis or citations
    assert.strictEqual(patientAQuery.citations.length, 0, 'Patient A should receive 0 citations from Patient B');
    assert.ok(
      patientAQuery.answer.includes("I couldn't find this information"),
      'Patient A should be told no records exist, preventing data leakage'
    );
    assert.ok(!patientAQuery.answer.includes('Bipolar'), 'Patient A must never see Patient B private diagnosis!');

    // Clean up
    db.prepare('DELETE FROM medical_records WHERE patient_id IN (?, ?)').run(patientAId, patientBId);
    db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(patientAId, patientBId);
  });

  await test('Doctor cannot query records outside the shared whitelist', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;

    // Get an MRI record
    const mriRecord = db.prepare(`
      SELECT id FROM medical_records 
      WHERE patient_id = ? AND record_type = 'MRI'
    `).get(user.id) as any;
    assert.ok(mriRecord);

    // Doctor session shared ONLY with a Blood Test record ID (excluding MRI)
    const bloodRecord = db.prepare(`
      SELECT id FROM medical_records 
      WHERE patient_id = ? AND record_type = 'Blood Test'
    `).get(user.id) as any;

    const doctorAllowedIds = [bloodRecord.id];

    // Doctor asks about the MRI scan
    const docResp = await AIService.chat(user.id, 'What did the brain MRI scan show?', 'doctor', doctorAllowedIds);

    // Must not retrieve the MRI record because it was not in doctorAllowedIds
    assert.ok(!docResp.citations.some(c => c.record_id === mriRecord.id), 'Doctor AI must not cite unshared MRI report');
  });

  console.log('\n--- Phase 6: Patient Medical Records Agent - 15 Mandatory Questions ---');

  await test('Q1: "Can you tell me about my latest report?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'Can you tell me about my latest report?', 'patient');
    assert.ok(res.answer.includes('Eye Prescription'));
    assert.ok(res.answer.includes('19 September 2026'));
    assert.ok(res.answer.includes('Dr. Reshma Ravindra Malakere'));
    assert.strictEqual(res.citations.length, 1);
    assert.ok(res.citations[0].record_title.includes('Eye Prescription'));
  });

  await test('Q2: "What\'s my latest report?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, "What's my latest report?", 'patient');
    assert.ok(res.answer.includes('Eye Prescription'));
    assert.ok(res.answer.includes('19 September 2026'));
    assert.strictEqual(res.citations.length, 1);
  });

  await test('Q3: "Show me my latest medical record."', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'Show me my latest medical record.', 'patient');
    assert.ok(res.answer.includes('Eye Prescription'));
    assert.strictEqual(res.citations.length, 1);
  });

  await test('Q4: "What reports do I have?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'What reports do I have?', 'patient');
    assert.ok(res.answer.includes('13 verified medical records'));
    assert.ok(res.citations.length === 13);
  });

  await test('Q5: "Tell me about my eye prescription."', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'Tell me about my eye prescription.', 'patient');
    assert.ok(res.answer.includes('Eye Prescription'));
    assert.ok(res.answer.includes('Right Eye (OD') || res.answer.includes('OD - Oculus Dexter'));
    assert.ok(res.answer.includes('Left Eye (OS') || res.answer.includes('OS - Oculus Sinister'));
    assert.strictEqual(res.citations.length, 1);
  });

  await test('Q6: "What was my right eye prescription?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'What was my right eye prescription?', 'patient');
    assert.ok(res.answer.includes('Right Eye (OD') || res.answer.includes('OD'));
    assert.ok(res.answer.includes('-1.25 DS'));
    assert.ok(res.answer.includes('-0.50 DC'));
    assert.strictEqual(res.citations.length, 1);
  });

  await test('Q7: "What was my latest blood test?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'What was my latest blood test?', 'patient');
    assert.ok(res.answer.includes('Blood Test') || res.answer.includes('Metabolic'));
    assert.ok(res.citations.length >= 1);
  });

  await test('Q8: "What was my haemoglobin?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'What was my haemoglobin?', 'patient');
    assert.ok(res.answer.toLowerCase().includes('haemoglobin') || res.answer.toLowerCase().includes('hemoglobin'));
    assert.ok(res.answer.includes('14.2') || res.answer.includes('13.8'));
    assert.ok(res.citations.length >= 1);
  });

  await test('Q9: "What changed in my recent reports?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'What changed in my recent reports?', 'patient');
    assert.ok(res.answer.includes('recent medical reports') || res.answer.includes('comparison'));
    assert.ok(res.citations.length >= 2);
  });

  await test('Q10: "Summarize my medical history."', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'Summarize my medical history.', 'patient');
    assert.ok(res.answer.includes('PATIENT MEDICAL SUMMARY'));
    assert.ok(res.answer.includes('Documented Records Overview'));
    assert.ok(res.citations.length > 0);
  });

  await test('Q11: "What medications am I taking?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'What medications am I taking?', 'patient');
    assert.ok(res.answer.includes('Metformin') || res.answer.includes('Amlodipine'));
    assert.ok(res.citations.length > 0);
  });

  await test('Q12: "Which doctor issued my latest report?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'Which doctor issued my latest report?', 'patient');
    assert.ok(res.answer.includes('Dr. Reshma Ravindra Malakere'));
    assert.ok(res.answer.includes('Eye Prescription'));
    assert.strictEqual(res.citations.length, 1);
  });

  await test('Q13: "What did my doctor say about my latest report?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'What did my doctor say about my latest report?', 'patient');
    assert.ok(res.answer.includes('Dr. Reshma Ravindra Malakere'));
    assert.ok(res.answer.includes('glasses') || res.answer.includes('eye drops') || res.answer.includes('advice') || res.answer.includes('Lubricating'));
    assert.strictEqual(res.citations.length, 1);
  });

  await test('Q14: Follow-up: "What about the previous one?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const history = [
      { role: 'user' as const, message: 'Can you tell me about my latest report?' },
      { role: 'assistant' as const, message: 'Your latest report is Eye Prescription dated 19 September 2026.' }
    ];
    const res = await AIService.chat(user.id, 'What about the previous one?', 'patient', undefined, history);
    assert.ok(res.answer.includes('previous report is'));
    assert.strictEqual(res.citations.length, 1);
    assert.ok(!res.citations[0].record_title.includes('Eye Prescription'), 'Should return the record prior to Eye Prescription');
  });

  await test('Q15: Follow-up: "Compare that with my previous report."', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const history = [
      { role: 'user' as const, message: 'Tell me about my eye prescription.' },
      { role: 'assistant' as const, message: 'Your eye prescription is from 19 September 2026.' }
    ];
    const res = await AIService.chat(user.id, 'Compare that with my previous report.', 'patient', undefined, history);
    assert.ok(res.answer.includes('recent medical reports'));
    assert.ok(res.citations.length >= 2);
  });

  console.log('\n--- Phase 7: Complete 28 Questions & Conversational Follow-Up Suite ---');

  await test('Q16: "Show me my medical records."', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'Show me my medical records.', 'patient');
    assert.ok(res.answer.includes('verified medical record'));
    assert.ok(res.citations.length >= 10);
  });

  await test('Q17: "What was my left eye power?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'What was my left eye power?', 'patient');
    assert.ok(res.answer.includes('-1.00 DS') || res.answer.includes('Left Eye (OS'));
    assert.ok(res.citations.length >= 1);
  });

  await test('Q18: "When was my last medical checkup?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'When was my last medical checkup?', 'patient');
    assert.ok(res.answer.includes('19 September 2026'));
    assert.ok(res.citations.length >= 1);
  });

  await test('Q19: "What diagnoses are recorded?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'What diagnoses are recorded?', 'patient');
    assert.ok(res.answer.includes('documented clinical diagnoses'));
    assert.ok(res.citations.length >= 1);
  });

  await test('Q20: "What changed between my latest two reports?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'What changed between my latest two reports?', 'patient');
    assert.ok(res.answer.includes('recent medical reports'));
    assert.ok(res.citations.length >= 2);
  });

  await test('Q21: "Tell me everything in my eye report."', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'Tell me everything in my eye report.', 'patient');
    assert.ok(res.answer.includes('Right Eye (OD'));
    assert.ok(res.answer.includes('Left Eye (OS'));
    assert.ok(res.citations.length >= 1);
  });

  await test('Q22: "What reports do I have from June?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'What reports do I have from June?', 'patient');
    assert.ok(res.answer.includes('JUNE'));
    assert.ok(res.citations.length >= 1);
  });

  await test('Q23: "What happened in my most recent medical visit?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'What happened in my most recent medical visit?', 'patient');
    assert.ok(res.answer.includes('19 September 2026'));
    assert.ok(res.citations.length >= 1);
  });

  await test('Q24: "What information do you have about me?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'What information do you have about me?', 'patient');
    assert.ok(res.answer.includes('Rahul Sharma'));
    assert.ok(res.answer.includes('Blood Group') && res.answer.includes('O+'));
    assert.ok(res.answer.includes('Emergency Contact:'));
  });

  await test('Q25: "What information is missing from my medical records?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'What information is missing from my medical records?', 'patient');
    assert.ok(res.answer.includes('Missing Clinical Categories') || res.answer.includes('missing or recommended'));
  });

  await test('Q26: "Explain my latest report in simple terms."', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'Explain my latest report in simple terms.', 'patient');
    assert.ok(res.answer.includes('plain-English') || res.answer.includes('breakdown'));
    assert.ok(res.citations.length >= 1);
  });

  await test('Q27: "What should I ask my doctor about this report?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const res = await AIService.chat(user.id, 'What should I ask my doctor about this report?', 'patient');
    assert.ok(res.answer.includes('high-yield questions'));
    assert.ok(res.citations.length >= 1);
  });

  await test('Q28: Follow-up: "And what about the other eye?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const history = [
      { role: 'user' as const, message: 'What was my right eye power?' },
      { role: 'assistant' as const, message: 'In your Eye Prescription, your Right Eye (OD) prescription is: SPH -1.25 DS, CYL -0.50 DC, Axis 180.' }
    ];
    const res = await AIService.chat(user.id, 'And what about the other eye?', 'patient', undefined, history);
    assert.ok(res.answer.includes('Left Eye (OS'));
    assert.ok(res.citations.length >= 1);
  });

  await test('Q29: Follow-up: "Can you summarize that?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const history = [
      { role: 'user' as const, message: 'Tell me about my latest report.' },
      { role: 'assistant' as const, message: 'Here are the details from your Eye Prescription from 19 September 2026.' }
    ];
    const res = await AIService.chat(user.id, 'Can you summarize that?', 'patient', undefined, history);
    assert.ok(res.answer.includes('concise summary'));
    assert.ok(res.citations.length >= 1);
  });

  await test('Q30: Follow-up: "Can you explain that result?"', async () => {
    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
    const history = [
      { role: 'user' as const, message: 'What was my haemoglobin?' },
      { role: 'assistant' as const, message: 'Your latest Haemoglobin was 14.2 g/dL on 20 July 2026.' }
    ];
    const res = await AIService.chat(user.id, 'Can you explain that result?', 'patient', undefined, history);
    assert.ok(res.answer.includes('Haemoglobin') || res.answer.includes('protein'));
  });

  console.log('\n====================================================');
  console.log(` Test Suite Completed: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
