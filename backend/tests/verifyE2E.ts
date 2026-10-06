import assert from 'assert';
import { db } from '../src/db/database';

async function runE2E() {
  console.log('--- Running Live End-to-End API Flow Test ---');
  const baseUrl = 'http://localhost:5000/api';

  // Clear prior test OTP records for the demo number so rate limit doesn't trip across rapid test runs
  db.prepare('DELETE FROM otp_verifications WHERE mobile_number = ?').run('+919876543210');

  // 1. Patient send OTP
  const sendRes = await fetch(`${baseUrl}/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobileNumber: '+919876543210' })
  });
  const sendData = await sendRes.json();
  assert.strictEqual(sendData.success, true);
  const otpToUse = sendData.data.devOtp || '123456';
  console.log(`  ✓ 1. Sent OTP to demo patient (+919876543210), OTP: ${otpToUse}`);

  // 2. Patient verify OTP
  const verifyRes = await fetch(`${baseUrl}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobileNumber: '+919876543210', otp: otpToUse })
  });
  const verifyData = await verifyRes.json();
  assert.strictEqual(verifyData.success, true);
  const patientToken = verifyData.data.token;
  assert.ok(patientToken);
  console.log('  ✓ 2. Verified OTP & obtained Patient JWT');

  // 3. Retrieve patient records
  const recordsRes = await fetch(`${baseUrl}/records`, {
    headers: { 'Authorization': `Bearer ${patientToken}` }
  });
  const recordsData = await recordsRes.json();
  assert.strictEqual(recordsData.success, true);
  assert.ok(recordsData.data.length >= 12);
  console.log(`  ✓ 3. Retrieved ${recordsData.data.length} chronological records for Rahul Sharma`);

  // 4. Query MediVault AI as patient
  const chatRes = await fetch(`${baseUrl}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${patientToken}`
    },
    body: JSON.stringify({ question: 'What were my HbA1c levels over time?' })
  });
  const chatData = await chatRes.json();
  assert.strictEqual(chatData.success, true);
  assert.ok(chatData.data.answer.includes('HbA1c'));
  assert.ok(chatData.data.citations.length > 0);
  console.log(`  ✓ 4. MediVault AI answered with ${chatData.data.citations.length} clickable citations`);

  // 4b. Query Patient Medical Records Agent with latest report
  const latestChatRes = await fetch(`${baseUrl}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${patientToken}`
    },
    body: JSON.stringify({ question: 'Can you tell me about my latest report?' })
  });
  const latestChatData = await latestChatRes.json();
  assert.strictEqual(latestChatData.success, true);
  assert.ok(latestChatData.data.answer.includes('Eye Prescription'));
  assert.ok(latestChatData.data.answer.includes('19 September 2026'));
  assert.strictEqual(latestChatData.data.citations.length, 1);
  console.log('  ✓ 4b. Patient Medical Records Agent answered latest report query with Eye Prescription & citation');

  // 5. Patient generates Doctor Sharing Session
  const shareRes = await fetch(`${baseUrl}/sharing/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${patientToken}`
    },
    body: JSON.stringify({ scopeType: 'all' })
  });
  const shareData = await shareRes.json();
  assert.strictEqual(shareData.success, true);
  const accessCode = shareData.data.accessCode;
  const sessionId = shareData.data.session.id;
  assert.ok(accessCode);
  console.log(`  ✓ 5. Generated temporary doctor access code: ${accessCode}`);

  // 6. Doctor accesses portal with code
  const docVerifyRes = await fetch(`${baseUrl}/sharing/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessCode })
  });
  const docVerifyData = await docVerifyRes.json();
  assert.strictEqual(docVerifyData.success, true);
  const doctorToken = docVerifyData.data.doctorToken;
  assert.ok(doctorToken);
  console.log('  ✓ 6. Doctor validated access code & received scoped Doctor JWT');

  // 7. Doctor fetches session info & clinical summary
  const docSessionRes = await fetch(`${baseUrl}/doctor/session`, {
    headers: { 'Authorization': `Bearer ${doctorToken}` }
  });
  const docSessionData = await docSessionRes.json();
  assert.strictEqual(docSessionData.success, true);
  assert.strictEqual(docSessionData.data.patient.fullName, 'Rahul Sharma');
  console.log('  ✓ 7. Doctor loaded Patient Demographics & AI Clinical History Digest');

  // 8. Doctor queries AI
  const docChatRes = await fetch(`${baseUrl}/doctor/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${doctorToken}`
    },
    body: JSON.stringify({ question: 'What medications is this patient taking?' })
  });
  const docChatData = await docChatRes.json();
  assert.strictEqual(docChatData.success, true);
  assert.ok(docChatData.data.answer.includes('Metformin'));
  console.log('  ✓ 8. Doctor AI assistant queried and answered with scoped prescription data');

  // 9. Patient revokes sharing access
  const revokeRes = await fetch(`${baseUrl}/sharing/${sessionId}/revoke`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${patientToken}` }
  });
  const revokeData = await revokeRes.json();
  assert.strictEqual(revokeData.success, true);
  console.log('  ✓ 9. Patient revoked doctor sharing session immediately');

  // 10. Doctor attempts to make query after revocation
  const docBlockedRes = await fetch(`${baseUrl}/doctor/records`, {
    headers: { 'Authorization': `Bearer ${doctorToken}` }
  });
  assert.strictEqual(docBlockedRes.status, 403);
  console.log('  ✓ 10. Doctor request immediately rejected with HTTP 403 Forbidden after revocation');

  // 11. Patient verifies audit trail
  const auditRes = await fetch(`${baseUrl}/audit/history`, {
    headers: { 'Authorization': `Bearer ${patientToken}` }
  });
  const auditData = await auditRes.json();
  assert.strictEqual(auditData.success, true);
  assert.ok(auditData.data.length >= 4);
  console.log(`  ✓ 11. Audit trail verified with ${auditData.data.length} logged security events`);

  // 12. Patient creates and then deletes a medical record
  const createRecRes = await fetch(`${baseUrl}/records/verify-and-save`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${patientToken}`
    },
    body: JSON.stringify({
      title: 'Temporary Test Lab Report',
      recordType: 'Blood Test',
      recordDate: '2026-10-06',
      hospital: 'Test Diagnostics',
      doctor: 'Dr. Test',
      fileKey: 'temp_test_key_for_deletion',
      findings: [
        { name: 'Test Metric', value: '10', unit: 'mg/dL', type: 'laboratory', isAbnormal: false }
      ]
    })
  });
  const createRecData = await createRecRes.json();
  assert.strictEqual(createRecRes.status, 201);
  const testRecId = createRecData.data.id;

  const deleteRecordRes = await fetch(`${baseUrl}/records/${testRecId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${patientToken}` }
  });
  const deleteRecordData = await deleteRecordRes.json();
  assert.strictEqual(deleteRecordRes.status, 200);
  assert.strictEqual(deleteRecordData.success, true);
  console.log('  ✓ 12a. Record deleted successfully via DELETE /api/records/:id');

  // Verify record no longer accessible (returns 404 with specific medical message)
  const getDeletedRes = await fetch(`${baseUrl}/records/${testRecId}`, {
    headers: { 'Authorization': `Bearer ${patientToken}` }
  });
  assert.strictEqual(getDeletedRes.status, 404);
  const getDeletedData = await getDeletedRes.json();
  assert.strictEqual(getDeletedData.error, 'This medical record is no longer available.');
  console.log('  ✓ 12b. Attempt to access deleted record returned 404 with "This medical record is no longer available."');

  // Verify deletion event was audited
  const finalAuditRes = await fetch(`${baseUrl}/audit/history`, {
    headers: { 'Authorization': `Bearer ${patientToken}` }
  });
  const finalAuditData = await finalAuditRes.json();
  const hasDeleteEvent = finalAuditData.data.some((e: any) => e.action === 'RECORD_DELETED');
  assert.ok(hasDeleteEvent, 'Audit log should contain RECORD_DELETED');
  console.log('  ✓ 12c. Deletion audit event confirmed in security trail');

  console.log('\n>>> All 12 Live End-to-End Steps Verified Successfully! <<<');
}

runE2E().catch(err => {
  console.error('E2E Test Failed:', err);
  process.exit(1);
});

