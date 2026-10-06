import assert from 'assert';
import { db } from '../src/db/database';
import { AIService } from '../src/services/ai.service';

async function run28QuestionsTest() {
  console.log('====================================================');
  console.log('   Testing MediBrief AI: 28 Question Types Suite    ');
  console.log('====================================================\n');

  const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get('+919876543210') as any;
  assert.ok(user, 'Test patient user exists');
  const patientId = user.id;

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ PASSED: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ FAILED: ${name}`);
      console.error(`    Error: ${err.message}\n`);
      failed++;
    }
  }

  // 1. What is my latest report?
  await test('Q1: What is my latest report?', async () => {
    const res = await AIService.chat(patientId, 'What is my latest report?', 'patient');
    assert.ok(res.answer.includes('Eye Prescription'));
    assert.ok(res.answer.includes('19 September 2026'));
    assert.ok(res.citations.length >= 1);
  });

  // 2. Tell me about my latest report.
  await test('Q2: Tell me about my latest report.', async () => {
    const res = await AIService.chat(patientId, 'Tell me about my latest report.', 'patient');
    assert.ok(res.answer.includes('Eye Prescription'));
    assert.ok(res.answer.includes('Dr. Reshma Ravindra Malakere'));
    assert.ok(res.citations.length >= 1);
  });

  // 3. Show me my medical records.
  await test('Q3: Show me my medical records.', async () => {
    const res = await AIService.chat(patientId, 'Show me my medical records.', 'patient');
    assert.ok(res.answer.includes('verified medical record'));
    assert.ok(res.citations.length >= 10);
  });

  // 4. What reports do I have?
  await test('Q4: What reports do I have?', async () => {
    const res = await AIService.chat(patientId, 'What reports do I have?', 'patient');
    assert.ok(res.answer.includes('verified medical record'));
    assert.ok(res.citations.length >= 10);
  });

  // 5. What was my latest blood test?
  await test('Q5: What was my latest blood test?', async () => {
    const res = await AIService.chat(patientId, 'What was my latest blood test?', 'patient');
    assert.ok(res.answer.includes('Blood Test') || res.answer.includes('Metabolic'));
    assert.ok(res.citations.length >= 1);
  });

  // 6. What was my haemoglobin?
  await test('Q6: What was my haemoglobin?', async () => {
    const res = await AIService.chat(patientId, 'What was my haemoglobin?', 'patient');
    assert.ok(res.answer.toLowerCase().includes('haemoglobin') || res.answer.toLowerCase().includes('hemoglobin'));
    assert.ok(res.citations.length >= 1);
  });

  // 7. What is my eye prescription?
  await test('Q7: What is my eye prescription?', async () => {
    const res = await AIService.chat(patientId, 'What is my eye prescription?', 'patient');
    assert.ok(res.answer.includes('Eye Prescription'));
    assert.ok(res.answer.includes('OD') || res.answer.includes('Right Eye'));
    assert.ok(res.citations.length >= 1);
  });

  // 8. What was my right eye power?
  await test('Q8: What was my right eye power?', async () => {
    const res = await AIService.chat(patientId, 'What was my right eye power?', 'patient');
    assert.ok(res.answer.includes('-1.25 DS'));
    assert.ok(res.answer.includes('-0.50 DC'));
    assert.ok(res.citations.length >= 1);
  });

  // 9. What was my left eye power?
  await test('Q9: What was my left eye power?', async () => {
    const res = await AIService.chat(patientId, 'What was my left eye power?', 'patient');
    assert.ok(res.answer.includes('-1.00 DS') || res.answer.includes('Left Eye (OS'));
    assert.ok(res.citations.length >= 1);
  });

  // 10. Which doctor issued my latest report?
  await test('Q10: Which doctor issued my latest report?', async () => {
    const res = await AIService.chat(patientId, 'Which doctor issued my latest report?', 'patient');
    assert.ok(res.answer.includes('Dr. Reshma Ravindra Malakere'));
    assert.ok(res.citations.length >= 1);
  });

  // 11. When was my last medical checkup?
  await test('Q11: When was my last medical checkup?', async () => {
    const res = await AIService.chat(patientId, 'When was my last medical checkup?', 'patient');
    assert.ok(res.answer.includes('19 September 2026'));
    assert.ok(res.citations.length >= 1);
  });

  // 12. What medications are recorded?
  await test('Q12: What medications are recorded?', async () => {
    const res = await AIService.chat(patientId, 'What medications are recorded?', 'patient');
    assert.ok(res.answer.includes('documented medications'));
    assert.ok(res.citations.length >= 1);
  });

  // 13. What diagnoses are recorded?
  await test('Q13: What diagnoses are recorded?', async () => {
    const res = await AIService.chat(patientId, 'What diagnoses are recorded?', 'patient');
    assert.ok(res.answer.includes('documented clinical diagnoses'));
    assert.ok(res.answer.includes('Diabetes') || res.answer.includes('Astigmatism'));
    assert.ok(res.citations.length >= 1);
  });

  // 14. Summarize my medical history.
  await test('Q14: Summarize my medical history.', async () => {
    const res = await AIService.chat(patientId, 'Summarize my medical history.', 'patient');
    assert.ok(res.answer.includes('PATIENT MEDICAL SUMMARY'));
    assert.ok(res.citations.length >= 1);
  });

  // 15. What changed between my latest two reports?
  await test('Q15: What changed between my latest two reports?', async () => {
    const res = await AIService.chat(patientId, 'What changed between my latest two reports?', 'patient');
    assert.ok(res.answer.includes('recent medical reports'));
    assert.ok(res.citations.length >= 2);
  });

  // 16. Compare my latest and previous reports.
  await test('Q16: Compare my latest and previous reports.', async () => {
    const res = await AIService.chat(patientId, 'Compare my latest and previous reports.', 'patient');
    assert.ok(res.answer.includes('recent medical reports'));
    assert.ok(res.citations.length >= 2);
  });

  // 17. Tell me everything in my eye report.
  await test('Q17: Tell me everything in my eye report.', async () => {
    const res = await AIService.chat(patientId, 'Tell me everything in my eye report.', 'patient');
    assert.ok(res.answer.includes('Right Eye (OD'));
    assert.ok(res.answer.includes('Left Eye (OS'));
    assert.ok(res.answer.includes('Optical Measurements & Lenses') || res.answer.includes('Anti-Reflective'));
    assert.ok(res.citations.length >= 1);
  });

  // 18. What did my doctor mention about my condition?
  await test('Q18: What did my doctor mention about my condition?', async () => {
    const res = await AIService.chat(patientId, 'What did my doctor mention about my condition?', 'patient');
    assert.ok(res.answer.includes('Dr. Reshma Ravindra Malakere'));
    assert.ok(res.answer.includes('glasses') || res.answer.includes('eye drops') || res.answer.includes('advice') || res.answer.includes('Lubricating'));
    assert.ok(res.citations.length >= 1);
  });

  // 19. What reports do I have from June?
  await test('Q19: What reports do I have from June?', async () => {
    const res = await AIService.chat(patientId, 'What reports do I have from June?', 'patient');
    assert.ok(res.answer.includes('JUNE'));
    assert.ok(res.answer.includes('Post-Surgical Follow-up & Abdominal Sonography'));
    assert.ok(res.citations.length >= 1);
  });

  // 20. What happened in my most recent medical visit?
  await test('Q20: What happened in my most recent medical visit?', async () => {
    const res = await AIService.chat(patientId, 'What happened in my most recent medical visit?', 'patient');
    assert.ok(res.answer.includes('19 September 2026'));
    assert.ok(res.answer.includes('Dr. Reshma Ravindra Malakere'));
    assert.ok(res.citations.length >= 1);
  });

  // 21. What information do you have about me?
  await test('Q21: What information do you have about me?', async () => {
    const res = await AIService.chat(patientId, 'What information do you have about me?', 'patient');
    assert.ok(res.answer.includes('Rahul Sharma'));
    assert.ok(res.answer.includes('Blood Group') && res.answer.includes('O+'));
    assert.ok(res.answer.includes('Emergency Contact:'));
    assert.ok(res.answer.includes('13 reports') || res.answer.includes('13'));
  });

  // 22. What information is missing from my medical records?
  await test('Q22: What information is missing from my medical records?', async () => {
    const res = await AIService.chat(patientId, 'What information is missing from my medical records?', 'patient');
    assert.ok(res.answer.includes('Missing Clinical Categories') || res.answer.includes('missing or recommended'));
    assert.ok(res.answer.includes('Immunization') || res.answer.includes('Allergies') || res.answer.includes('Vitals'));
  });

  // 23. Explain my latest report in simple terms.
  await test('Q23: Explain my latest report in simple terms.', async () => {
    const res = await AIService.chat(patientId, 'Explain my latest report in simple terms.', 'patient');
    assert.ok(res.answer.includes('plain-English') || res.answer.includes('breakdown'));
    assert.ok(res.answer.includes('nearsightedness') || res.answer.includes('myopia'));
    assert.ok(res.citations.length >= 1);
  });

  // 24. What should I ask my doctor about this report?
  await test('Q24: What should I ask my doctor about this report?', async () => {
    const res = await AIService.chat(patientId, 'What should I ask my doctor about this report?', 'patient');
    assert.ok(res.answer.includes('high-yield questions'));
    assert.ok(res.answer.includes('glasses') || res.answer.includes('eye drops') || res.answer.includes('checkup'));
    assert.ok(res.citations.length >= 1);
  });

  // 25. Follow-up: What about the previous one?
  await test('Q25: Follow-up: What about the previous one?', async () => {
    const history = [
      { role: 'user' as const, message: 'What is my latest report?' },
      { role: 'assistant' as const, message: 'Your latest report is Eye Prescription dated 19 September 2026.' }
    ];
    const res = await AIService.chat(patientId, 'What about the previous one?', 'patient', undefined, history);
    assert.ok(res.answer.includes('previous report is'));
    assert.ok(res.citations.length === 1);
    assert.ok(!res.citations[0].record_title.includes('Eye Prescription'));
  });

  // 26. Follow-up: And what about the other eye?
  await test('Q26: Follow-up: And what about the other eye?', async () => {
    const history = [
      { role: 'user' as const, message: 'What was my right eye power?' },
      { role: 'assistant' as const, message: 'In your Eye Prescription, your Right Eye (OD) prescription is: SPH -1.25 DS, CYL -0.50 DC, Axis 180.' }
    ];
    const res = await AIService.chat(patientId, 'And what about the other eye?', 'patient', undefined, history);
    assert.ok(res.answer.includes('Left Eye (OS'));
    assert.ok(res.answer.includes('-1.00 DS') || res.answer.includes('-0.75 DC'));
    assert.ok(res.citations.length >= 1);
  });

  // 27. Follow-up: Can you summarize that?
  await test('Q27: Follow-up: Can you summarize that?', async () => {
    const history = [
      { role: 'user' as const, message: 'Tell me about my latest report.' },
      { role: 'assistant' as const, message: 'Here are the details from your Eye Prescription from 19 September 2026.' }
    ];
    const res = await AIService.chat(patientId, 'Can you summarize that?', 'patient', undefined, history);
    assert.ok(res.answer.includes('concise summary'));
    assert.ok(res.citations.length >= 1);
  });

  // 28. Follow-up: Can you explain that result?
  await test('Q28: Follow-up: Can you explain that result?', async () => {
    const history = [
      { role: 'user' as const, message: 'What was my haemoglobin?' },
      { role: 'assistant' as const, message: 'Your latest Haemoglobin was 14.2 g/dL on 20 July 2026.' }
    ];
    const res = await AIService.chat(patientId, 'Can you explain that result?', 'patient', undefined, history);
    assert.ok(res.answer.includes('Haemoglobin') || res.answer.includes('protein'));
    assert.ok(res.answer.includes('oxygen'));
  });

  // BONUS: Medical Concept query
  await test('BONUS: Concept explanation: What is SPH?', async () => {
    const res = await AIService.chat(patientId, 'What is SPH?', 'patient');
    assert.ok(res.answer.includes('Sphere (SPH)'));
    assert.ok(res.answer.includes('nearsightedness') || res.answer.includes('myopia'));
    assert.ok(res.answer.includes('Your Personal Records:'));
    assert.ok(res.citations.length >= 1);
  });

  // BONUS: Honest Missing Data query
  await test('BONUS: Honest missing data: What was my vitamin D level?', async () => {
    const res = await AIService.chat(patientId, 'What was my vitamin D level?', 'patient');
    assert.ok(res.answer.includes("I don't have a vitamin d result") || res.answer.includes("couldn't find this information"));
    assert.strictEqual(res.citations.length, 0);
  });

  console.log('\n====================================================');
  console.log(` 28 Question Suite Completed: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run28QuestionsTest().catch(err => {
  console.error('Fatal test error in 28 questions suite:', err);
  process.exit(1);
});
