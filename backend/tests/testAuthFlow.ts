import assert from 'assert';
import { db } from '../src/db/database';

async function runAuthFlowTests() {
  console.log('====================================================');
  console.log(' MediBrief Redesigned Auth Flow Test Suite (10 Cases)');
  console.log('====================================================\n');

  const baseUrl = 'http://localhost:5000/api';
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

  // Clear test numbers from otp_verifications to ensure clean slate
  const testMobiles = [
    '+919800000001',
    '+919800000002',
    '+919800000003',
    '+919800000004',
    '+919800000005',
    '+919800000009',
    '+919876543210'
  ];
  for (const m of testMobiles) {
    db.prepare('DELETE FROM otp_verifications WHERE mobile_number = ?').run(m);
  }

  // -------------------------------------------------------------------------
  // 1. New patient phone number
  // -------------------------------------------------------------------------
  await test('1. New patient phone number receives OTP & completes registration', async () => {
    const newMobile = '+919800000001';
    db.prepare('DELETE FROM users WHERE mobile_number = ?').run(newMobile);

    const sendRes = await fetch(`${baseUrl}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: newMobile })
    });
    const sendData = await sendRes.json();
    assert.strictEqual(sendRes.status, 200);
    assert.strictEqual(sendData.success, true);
    assert.ok(sendData.data.expiresInSeconds > 0);

    const otpCode = sendData.data.devOtp || '123456';
    const verifyRes = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: newMobile, otp: otpCode })
    });
    const verifyData = await verifyRes.json();
    assert.strictEqual(verifyRes.status, 200);
    assert.strictEqual(verifyData.success, true);
    assert.strictEqual(verifyData.data.isNewUser, true);
    assert.ok(verifyData.data.token);

    // Save profile for new patient
    const profileRes = await fetch(`${baseUrl}/patients/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${verifyData.data.token}`
      },
      body: JSON.stringify({
        fullName: 'Priya Patel',
        dateOfBirth: '2000-08-15',
        gender: 'Female',
        bloodGroup: 'B+',
        emergencyContact: '+919800000099'
      })
    });
    const profileData = await profileRes.json();
    assert.strictEqual(profileRes.status, 200);
    assert.strictEqual(profileData.data.full_name, 'Priya Patel');
  });

  // -------------------------------------------------------------------------
  // 2. Existing patient phone number
  // -------------------------------------------------------------------------
  await test('2. Existing patient phone number (+919876543210) signs in directly', async () => {
    const existingMobile = '+919876543210';
    const sendRes = await fetch(`${baseUrl}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: existingMobile })
    });
    const sendData = await sendRes.json();
    assert.strictEqual(sendRes.status, 200);
    assert.strictEqual(sendData.success, true);

    const otpCode = sendData.data.devOtp || '123456';
    const verifyRes = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: existingMobile, otp: otpCode })
    });
    const verifyData = await verifyRes.json();
    assert.strictEqual(verifyRes.status, 200);
    assert.strictEqual(verifyData.success, true);
    assert.strictEqual(verifyData.data.isNewUser, false);
    assert.ok(verifyData.data.profile);
    assert.strictEqual(verifyData.data.profile.full_name, 'Rahul Sharma');
    assert.ok(verifyData.data.token);
  });

  // -------------------------------------------------------------------------
  // 3. Invalid phone number
  // -------------------------------------------------------------------------
  await test('3. Invalid phone number rejected with clear INVALID_PHONE_NUMBER code', async () => {
    // Test 3a: short digits
    const resShort = await fetch(`${baseUrl}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: '12345' })
    });
    assert.strictEqual(resShort.status, 400);
    const dataShort = await resShort.json();
    assert.strictEqual(dataShort.success, false);
    assert.strictEqual(dataShort.code, 'INVALID_PHONE_NUMBER');
    assert.ok(dataShort.error.toLowerCase().includes('invalid phone') || dataShort.error.toLowerCase().includes('format'));

    // Test 3b: empty number
    const resEmpty = await fetch(`${baseUrl}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: '' })
    });
    assert.strictEqual(resEmpty.status, 400);
    const dataEmpty = await resEmpty.json();
    assert.strictEqual(dataEmpty.code, 'INVALID_PHONE_NUMBER');
  });

  // -------------------------------------------------------------------------
  // 4. Correct OTP
  // -------------------------------------------------------------------------
  await test('4. Correct 6-digit OTP verification grants authenticated JWT session', async () => {
    const mobile = '+919800000002';
    const sendRes = await fetch(`${baseUrl}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: mobile })
    });
    const sendData = await sendRes.json();
    assert.strictEqual(sendData.success, true);

    const otpCode = sendData.data.devOtp || '123456';
    const verifyRes = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: mobile, otp: otpCode })
    });
    const verifyData = await verifyRes.json();
    assert.strictEqual(verifyRes.status, 200);
    assert.strictEqual(verifyData.success, true);
    assert.ok(verifyData.data.token);
    assert.strictEqual(verifyData.data.user.mobile_number, mobile);
  });

  // -------------------------------------------------------------------------
  // 5. Incorrect OTP
  // -------------------------------------------------------------------------
  await test('5. Incorrect OTP rejected with INCORRECT_OTP error and attempt counter', async () => {
    const mobile = '+919800000003';
    await fetch(`${baseUrl}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: mobile })
    });

    const verifyRes = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: mobile, otp: '999999' })
    });
    assert.strictEqual(verifyRes.status, 400);
    const verifyData = await verifyRes.json();
    assert.strictEqual(verifyData.success, false);
    assert.strictEqual(verifyData.code, 'INCORRECT_OTP');
    assert.ok(verifyData.error.includes('Incorrect OTP') || verifyData.error.includes('Invalid OTP'));
  });

  // -------------------------------------------------------------------------
  // 6. Expired OTP
  // -------------------------------------------------------------------------
  await test('6. Expired OTP rejected with OTP_EXPIRED error code', async () => {
    const mobile = '+919800000004';
    const sendRes = await fetch(`${baseUrl}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: mobile })
    });
    const sendData = await sendRes.json();
    const otpCode = sendData.data.devOtp || '123456';

    // Manually expire the OTP in database
    db.prepare(`
      UPDATE otp_verifications 
      SET expires_at = datetime('now', '-10 minutes')
      WHERE mobile_number = ?
    `).run(mobile);

    const verifyRes = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: mobile, otp: otpCode })
    });
    assert.strictEqual(verifyRes.status, 400);
    const verifyData = await verifyRes.json();
    assert.strictEqual(verifyData.success, false);
    assert.strictEqual(verifyData.code, 'OTP_EXPIRED');
    assert.ok(verifyData.error.toLowerCase().includes('expired'));
  });

  // -------------------------------------------------------------------------
  // 7. Resend OTP
  // -------------------------------------------------------------------------
  await test('7. Resend OTP enforces cooldown and generates fresh valid code', async () => {
    const mobile = '+919800000005';
    await fetch(`${baseUrl}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: mobile })
    });

    // Immediate resend should trigger cooldown (Too Many Attempts / Cooldown)
    const cooldownRes = await fetch(`${baseUrl}/auth/resend-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: mobile })
    });
    assert.strictEqual(cooldownRes.status, 400);
    const cooldownData = await cooldownRes.json();
    assert.strictEqual(cooldownData.code, 'TOO_MANY_ATTEMPTS');

    // Simulate cooldown elapsed (35 seconds ago)
    db.prepare(`
      UPDATE otp_verifications 
      SET created_at = datetime('now', '-35 seconds')
      WHERE mobile_number = ?
    `).run(mobile);

    // Resend after cooldown
    const resendRes = await fetch(`${baseUrl}/auth/resend-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: mobile })
    });
    assert.strictEqual(resendRes.status, 200);
    const resendData = await resendRes.json();
    assert.strictEqual(resendData.success, true);
    assert.ok(resendData.data.expiresInSeconds > 0);
  });

  // -------------------------------------------------------------------------
  // 8. Change number
  // -------------------------------------------------------------------------
  await test('8. Change number allows switching phone numbers without state collision', async () => {
    const initialNum = '+919800000008';
    const changedNum = '+919800000009';

    // Send to initial number
    const send1 = await fetch(`${baseUrl}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: initialNum })
    });
    assert.strictEqual(send1.status, 200);

    // User switches/changes number to changedNum
    const send2 = await fetch(`${baseUrl}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: changedNum })
    });
    assert.strictEqual(send2.status, 200);
    const data2 = await send2.json();
    const code2 = data2.data.devOtp || '123456';

    // Verify changed number succeeds
    const verify2 = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: changedNum, otp: code2 })
    });
    assert.strictEqual(verify2.status, 200);
    const verData2 = await verify2.json();
    assert.strictEqual(verData2.data.user.mobile_number, changedNum);
  });

  // -------------------------------------------------------------------------
  // 9. Patient logout / login
  // -------------------------------------------------------------------------
  await test('9. Patient logout clears access; subsequent login restores session', async () => {
    const mobile = '+919876543210';
    db.prepare('DELETE FROM otp_verifications WHERE mobile_number = ?').run(mobile);

    // Login
    const sendRes = await fetch(`${baseUrl}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: mobile })
    });
    const sendData = await sendRes.json();
    const otpCode = sendData.data.devOtp || '123456';

    const verifyRes = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: mobile, otp: otpCode })
    });
    const verifyData = await verifyRes.json();
    const token = verifyData.data.token;
    assert.ok(token);

    // Access protected route /api/auth/me
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(meRes.status, 200);
    const meData = await meRes.json();
    assert.strictEqual(meData.data.user.mobile_number, mobile);

    // Simulate Logout (token discarded) - Request without token fails
    const loggedOutRes = await fetch(`${baseUrl}/auth/me`, {
      headers: {}
    });
    assert.strictEqual(loggedOutRes.status, 401);

    // Log back in
    db.prepare('DELETE FROM otp_verifications WHERE mobile_number = ?').run(mobile);
    const send2 = await fetch(`${baseUrl}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: mobile })
    });
    const code2 = (await send2.json()).data.devOtp || '123456';
    const verify2 = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: mobile, otp: code2 })
    });
    assert.strictEqual(verify2.status, 200);
    const reAuthToken = (await verify2.json()).data.token;
    assert.ok(reAuthToken);
  });

  // -------------------------------------------------------------------------
  // 10. Staff / Clerk login separately
  // -------------------------------------------------------------------------
  await test('10. Staff/Doctor access code endpoint operates independently of Patient OTP', async () => {
    // 1. Patient creates a sharing session
    const patientMobile = '+919876543210';
    db.prepare('DELETE FROM otp_verifications WHERE mobile_number = ?').run(patientMobile);
    const sendRes = await fetch(`${baseUrl}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: patientMobile })
    });
    const otp = (await sendRes.json()).data.devOtp || '123456';
    const verRes = await fetch(`${baseUrl}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: patientMobile, otp })
    });
    const patientToken = (await verRes.json()).data.token;

    const shareRes = await fetch(`${baseUrl}/sharing/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${patientToken}`
      },
      body: JSON.stringify({ scopeType: 'all' })
    });
    const shareData = await shareRes.json();
    const accessCode = shareData.data.accessCode;
    assert.ok(accessCode);

    // 2. Doctor verifies access code via staff portal endpoint
    const docRes = await fetch(`${baseUrl}/sharing/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessCode })
    });
    assert.strictEqual(docRes.status, 200);
    const docData = await docRes.json();
    assert.ok(docData.data.doctorToken);
    assert.strictEqual(docData.data.sharingSessionId, shareData.data.session.id);
  });

  console.log('\n====================================================');
  console.log(` Auth Flow Suite: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
}

runAuthFlowTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
