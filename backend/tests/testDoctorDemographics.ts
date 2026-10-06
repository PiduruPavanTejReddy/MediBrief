import assert from 'assert';
import { db } from '../src/db/database';
import { calculateAge, formatAge } from '../src/utils/date.utils';

async function testDoctorDemographicsConsistency() {
  console.log('--- Testing Doctor Portal Demographics Consistency & Dynamic Age Calculation ---');
  const baseUrl = 'http://localhost:5000/api';

  // 1. Log in demo patient
  db.prepare('DELETE FROM otp_verifications WHERE mobile_number = ?').run('+919876543210');
  const sendRes = await fetch(`${baseUrl}/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobileNumber: '+919876543210' })
  });
  const sendData = await sendRes.json();
  assert.strictEqual(sendData.success, true);
  const otp = sendData.data.devOtp || '123456';

  const verifyRes = await fetch(`${baseUrl}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobileNumber: '+919876543210', otp })
  });
  const verifyData = await verifyRes.json();
  assert.strictEqual(verifyData.success, true);
  const patientToken = verifyData.data.token;

  // 2. Fetch patient profile directly
  const profileRes = await fetch(`${baseUrl}/patients/profile`, {
    headers: { 'Authorization': `Bearer ${patientToken}` }
  });
  const profileData = await profileRes.json();
  assert.strictEqual(profileData.success, true);
  const patientProfile = profileData.data.profile;
  assert.ok(patientProfile);
  console.log(`  ✓ Patient profile loaded: Name: ${patientProfile.full_name}, DOB: ${patientProfile.date_of_birth}, Age: ${patientProfile.age}`);

  // 3. Create Doctor Sharing Session
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

  // 4. Verify Doctor Access Code
  const docVerifyRes = await fetch(`${baseUrl}/sharing/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessCode })
  });
  const docVerifyData = await docVerifyRes.json();
  assert.strictEqual(docVerifyData.success, true);
  const doctorToken = docVerifyData.data.doctorToken;

  // 5. Query Doctor Session Info
  const docSessionRes = await fetch(`${baseUrl}/doctor/session`, {
    headers: { 'Authorization': `Bearer ${doctorToken}` }
  });
  const docSessionData = await docSessionRes.json();
  assert.strictEqual(docSessionData.success, true);
  const docPatient = docSessionData.data.patient;

  // 6. Assert authoritative consistency
  assert.strictEqual(docPatient.fullName, patientProfile.full_name, 'Patient full name mismatch');
  assert.strictEqual(docPatient.dateOfBirth, patientProfile.date_of_birth, 'DOB mismatch between patient and doctor portals');
  assert.strictEqual(docPatient.age, patientProfile.age, 'Age mismatch between patient and doctor portals');
  assert.strictEqual(docPatient.gender, patientProfile.gender, 'Gender mismatch');
  assert.strictEqual(docPatient.bloodGroup, patientProfile.blood_group, 'Blood group mismatch');
  console.log(`  ✓ Complete demographic consistency verified between Patient and Doctor portals!`);

  // 7. Test DOB edge case: when DOB is missing/null, age must be 'Age not available' and DOB null
  const testDobAge = calculateAge(null);
  assert.strictEqual(testDobAge, null);
  const testFormattedMissing = formatAge(null);
  assert.strictEqual(testFormattedMissing, 'Age not available');
  console.log(`  ✓ Edge case verified: Missing DOB evaluates to "Age not available" without errors.`);

  // 8. Clean up sharing session
  await fetch(`${baseUrl}/sharing/${sessionId}/revoke`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${patientToken}` }
  });
  console.log(`  ✓ Sharing session revoked.`);
  console.log('\n>>> Doctor Demographics Consistency Test Passed! <<<\n');
}

testDoctorDemographicsConsistency().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
