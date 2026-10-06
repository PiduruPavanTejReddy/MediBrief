import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { initDatabase, db } from '../db/database';
import { RAGService } from '../services/rag.service';
import { AuditService } from '../services/audit.service';
import { config } from '../config/env';

export function seedDemoData(): void {
  initDatabase();

  const uploadsDir = config.storageUploadDir;
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  console.log('[Seed] Seeding demo medical records for Rahul Sharma...');

  // 1. Create Demo User
  const demoMobile = '+919876543210';
  let user = db.prepare('SELECT * FROM users WHERE mobile_number = ?').get(demoMobile) as any;
  const now = new Date().toISOString();

  if (!user) {
    const userId = uuidv4();
    db.prepare(`
      INSERT INTO users (id, role, mobile_number, created_at, updated_at)
      VALUES (?, 'patient', ?, ?, ?)
    `).run(userId, demoMobile, now, now);
    user = { id: userId, mobile_number: demoMobile };
  }

  const patientId = user.id;

  // 2. Create Patient Profile
  const existingProfile = db.prepare('SELECT id FROM patient_profiles WHERE user_id = ?').get(patientId);
  if (!existingProfile) {
    db.prepare(`
      INSERT INTO patient_profiles (
        id, user_id, full_name, date_of_birth, gender, blood_group, 
        emergency_contact, email, address, created_at, updated_at
      ) VALUES (?, ?, 'Rahul Sharma', '1984-06-15', 'Male', 'O+', '+919876543211 (Pooja Sharma - Spouse)', 'rahul.sharma@example.com', 'Flat 402, Green Valley Apts, Indiranagar, Bengaluru', ?, ?)
    `).run(uuidv4(), patientId, now, now);
  }

  // Clear existing records to ensure clean idempotency
  db.prepare('DELETE FROM medical_records WHERE patient_id = ?').run(patientId);

  // 3. Define 12 Multi-Year Reports
  const reports = [
    {
      title: 'Routine Health Checkup & Fasting Blood Sugar',
      record_type: 'Blood Test',
      record_date: '2023-04-10',
      hospital: 'Apollo Clinic, Indiranagar',
      doctor: 'Dr. Rajesh Sharma, MD',
      findings: [
        { name: 'HbA1c', value: '7.2', unit: '%', range: '4.0 - 5.6 %', abnormal: 1 },
        { name: 'Fasting Blood Sugar', value: '126', unit: 'mg/dL', range: '70 - 99 mg/dL', abnormal: 1 },
        { name: 'Total Cholesterol', value: '220', unit: 'mg/dL', range: '125 - 200 mg/dL', abnormal: 1 },
        { name: 'Blood Pressure', value: '142/92', unit: 'mmHg', range: '90/60 - 120/80 mmHg', abnormal: 1 }
      ],
      medications: [
        { name: 'Metformin', dosage: '500mg', frequency: 'Twice daily after meals', instructions: 'Oral with water' },
        { name: 'Amlodipine', dosage: '5mg', frequency: 'Once daily morning', instructions: 'Take with breakfast' }
      ],
      diagnoses: ['Type 2 Diabetes Mellitus', 'Essential Hypertension (Stage 1)'],
      text: `APOLLO CLINIC - INDIRANAGAR
PATIENT: Rahul Sharma | AGE: 39 | GENDER: Male
DATE: 2023-04-10
PHYSICIAN: Dr. Rajesh Sharma, MD (Internal Medicine)

CLINICAL NOTES:
Patient presented for routine executive health checkup. Complains of mild afternoon fatigue and increased thirst.
Vitals: BP 142/92 mmHg, Pulse 76 bpm, BMI 27.2 kg/m2.

LABORATORY INVESTIGATIONS:
- HbA1c: 7.2 % [ELEVATED] (Ref: < 5.7 % Normal, >= 6.5 % Diabetes)
- Fasting Blood Sugar: 126 mg/dL [HIGH] (Ref: 70 - 99 mg/dL)
- Total Cholesterol: 220 mg/dL [BORDERLINE HIGH] (Ref: < 200 mg/dL)
- Triglycerides: 180 mg/dL (Ref: < 150 mg/dL)

DIAGNOSIS:
1. Type 2 Diabetes Mellitus - Newly detected
2. Essential Hypertension (Stage 1)

MANAGEMENT & PRESCRIPTION:
1. Tab. Metformin 500mg BD after breakfast and dinner
2. Tab. Amlodipine 5mg OD in the morning
3. Lifestyle: Low carbohydrate, low sodium diet. 30 minutes daily moderate exercise.`
    },
    {
      title: 'Post-Medication Follow-up HbA1c',
      record_type: 'Blood Test',
      record_date: '2023-07-15',
      hospital: 'Metropolis Healthcare Labs',
      doctor: 'Dr. Anita Roy, MD',
      findings: [
        { name: 'HbA1c', value: '7.0', unit: '%', range: '4.0 - 5.6 %', abnormal: 1 },
        { name: 'Fasting Blood Sugar', value: '118', unit: 'mg/dL', range: '70 - 99 mg/dL', abnormal: 1 },
        { name: 'Post Prandial Blood Sugar', value: '154', unit: 'mg/dL', range: '< 140 mg/dL', abnormal: 1 }
      ],
      medications: [
        { name: 'Metformin', dosage: '500mg', frequency: 'Twice daily after meals', instructions: 'Continue ongoing dose' }
      ],
      diagnoses: ['Type 2 Diabetes Mellitus - Improving'],
      text: `METROPOLIS HEALTHCARE LABS
PATIENT: Rahul Sharma | REF BY: Dr. Anita Roy, MD
DATE: 2023-07-15
INVESTIGATION: Glycemic Control Evaluation

RESULTS:
- HbA1c (Glycosylated Hemoglobin): 7.0 % (Previous: 7.2 %)
- Estimated Average Glucose (eAG): 154 mg/dL
- Fasting Plasma Glucose: 118 mg/dL (Ref: 70 - 100 mg/dL)
- Post-Prandial Plasma Glucose: 154 mg/dL (Ref: < 140 mg/dL)

IMPRESSION:
Favorable response to Metformin 500mg BD. HbA1c trend reflects early glycemic improvement.`
    },
    {
      title: 'Comprehensive Renal & Liver Function Panel',
      record_type: 'Blood Test',
      record_date: '2023-11-20',
      hospital: 'Max Diagnostics Center',
      doctor: 'Dr. Rajesh Sharma, MD',
      findings: [
        { name: 'Serum Creatinine', value: '1.0', unit: 'mg/dL', range: '0.7 - 1.3 mg/dL', abnormal: 0 },
        { name: 'Blood Urea', value: '28', unit: 'mg/dL', range: '15 - 45 mg/dL', abnormal: 0 },
        { name: 'eGFR', value: '94', unit: 'mL/min/1.73m2', range: '> 90 mL/min', abnormal: 0 },
        { name: 'SGPT (ALT)', value: '32', unit: 'U/L', range: '< 45 U/L', abnormal: 0 },
        { name: 'SGOT (AST)', value: '28', unit: 'U/L', range: '< 40 U/L', abnormal: 0 }
      ],
      medications: [],
      diagnoses: [],
      text: `MAX DIAGNOSTICS CENTER
PATIENT: Rahul Sharma | DATE: 2023-11-20
TEST: Comprehensive Renal & Hepatic Profile

RESULTS:
- Serum Creatinine: 1.0 mg/dL (Reference: 0.7 - 1.3 mg/dL) [NORMAL]
- Blood Urea Nitrogen: 28 mg/dL (Reference: 15 - 45 mg/dL) [NORMAL]
- Estimated GFR (CKD-EPI): 94 mL/min/1.73m2 [NORMAL]
- Serum Bilirubin Total: 0.8 mg/dL (Reference: 0.2 - 1.2 mg/dL)
- SGPT / ALT: 32 U/L (Reference: < 45 U/L)
- SGOT / AST: 28 U/L (Reference: < 40 U/L)

IMPRESSION:
Normal renal and liver biochemistry. No medication toxicity noted.`
    },
    {
      title: 'Ophthalmology Retinal Screening',
      record_type: 'Consultation',
      record_date: '2024-02-18',
      hospital: 'Sankara Eye Hospital',
      doctor: 'Dr. Meenakshi Sundaram, MS (Ophth)',
      findings: [
        { name: 'Intraocular Pressure (OD)', value: '14', unit: 'mmHg', range: '10 - 21 mmHg', abnormal: 0 },
        { name: 'Intraocular Pressure (OS)', value: '15', unit: 'mmHg', range: '10 - 21 mmHg', abnormal: 0 }
      ],
      medications: [],
      diagnoses: ['No Diabetic Retinopathy', 'Hypertensive Retinopathy (Grade 1 - Mild)'],
      text: `SANKARA EYE HOSPITAL - DIABETIC RETINOPATHY CLINIC
PATIENT: Rahul Sharma | AGE: 40 | DATE: 2024-02-18
EXAMINER: Dr. Meenakshi Sundaram, MS

FINDINGS:
- Visual Acuity: 6/6 with current refractive correction bilateral.
- Slit Lamp Exam: Anterior segment unremarkable, clear crystalline lenses.
- Dilated Fundus Examination:
  - Optic disc margins sharp, cup-to-disc ratio 0.3 bilaterally.
  - Macula dry, foveal reflex preserved.
  - Retinal vasculature shows mild arteriolar narrowing consistent with grade 1 hypertensive changes.
  - Zero microaneurysms, zero cotton-wool spots, zero hard exudates.

IMPRESSION:
No evidence of diabetic retinopathy. Mild benign hypertensive arteriolar change.
RECOMMENDATION: Annual routine diabetic eye screening.`
    },
    {
      title: 'Cardiovascular Risk & Fasting Lipid Profile',
      record_type: 'Blood Test',
      record_date: '2024-05-12',
      hospital: 'Apollo Specialty Hospitals',
      doctor: 'Dr. Sunil Varma, MD, DM (Cardiology)',
      findings: [
        { name: 'Total Cholesterol', value: '185', unit: 'mg/dL', range: '< 200 mg/dL', abnormal: 0 },
        { name: 'LDL Cholesterol', value: '110', unit: 'mg/dL', range: '< 100 mg/dL', abnormal: 1 },
        { name: 'HDL Cholesterol', value: '46', unit: 'mg/dL', range: '> 40 mg/dL', abnormal: 0 },
        { name: 'Triglycerides', value: '145', unit: 'mg/dL', range: '< 150 mg/dL', abnormal: 0 }
      ],
      medications: [
        { name: 'Atorvastatin', dosage: '10mg', frequency: 'Once daily at bedtime', instructions: 'For LDL optimization' }
      ],
      diagnoses: ['Dyslipidemia - Controlled on lifestyle'],
      text: `APOLLO SPECIALTY HOSPITALS - PREVENTIVE CARDIOLOGY
PATIENT: Rahul Sharma | DATE: 2024-05-12
DOCTOR: Dr. Sunil Varma, MD, DM

LIPID PANEL:
- Total Serum Cholesterol: 185 mg/dL (Ref: < 200 mg/dL)
- LDL Cholesterol: 110 mg/dL (Optimal < 100 mg/dL) [BORDERLINE]
- HDL Cholesterol: 46 mg/dL (Ref: > 40 mg/dL)
- Serum Triglycerides: 145 mg/dL (Ref: < 150 mg/dL)

IMPRESSION:
Total cholesterol improved from 220 to 185 mg/dL. LDL slightly elevated.
Prescribed low-dose Statin for endothelial protection given concurrent diabetes.`
    },
    {
      title: 'Quarterly Glycemic Assessment (HbA1c)',
      record_type: 'Blood Test',
      record_date: '2024-09-08',
      hospital: 'Metropolis Healthcare Labs',
      doctor: 'Dr. Anita Roy, MD',
      findings: [
        { name: 'HbA1c', value: '6.8', unit: '%', range: '4.0 - 5.6 %', abnormal: 1 },
        { name: 'Estimated Average Glucose', value: '148', unit: 'mg/dL', range: '80 - 130 mg/dL', abnormal: 1 },
        { name: 'Fasting Blood Sugar', value: '112', unit: 'mg/dL', range: '70 - 99 mg/dL', abnormal: 1 }
      ],
      medications: [
        { name: 'Metformin', dosage: '500mg', frequency: 'Twice daily after meals', instructions: 'Maintain current dosage' }
      ],
      diagnoses: ['Type 2 Diabetes Mellitus - Moderate Glycemic Control'],
      text: `METROPOLIS HEALTHCARE LABS
PATIENT: Rahul Sharma | DATE: 2024-09-08
TEST: HbA1c Monitoring

RESULTS:
- HbA1c: 6.8 % (Down from 7.0 % on 2023-07-15)
- Fasting Glucose: 112 mg/dL
- eAG: 148 mg/dL

NOTE: Glycemic parameters demonstrate continued favorable trend with regular lifestyle compliance.`
    },
    {
      title: 'Chest Radiography (X-Ray PA View)',
      record_type: 'X-Ray',
      record_date: '2024-12-05',
      hospital: 'Max Healthcare Institute',
      doctor: 'Dr. R. K. Gupta, MD (Radiodiagnosis)',
      findings: [
        { name: 'Cardiothoracic Ratio', value: '0.48', unit: 'ratio', range: '< 0.50', abnormal: 0 },
        { name: 'Costophrenic Angles', value: 'Clear', unit: '', range: 'Sharp/Clear', abnormal: 0 }
      ],
      medications: [],
      diagnoses: ['Normal Chest Radiograph'],
      text: `MAX HEALTHCARE INSTITUTE - DEPARTMENT OF RADIODIAGNOSIS
PATIENT: Rahul Sharma | AGE: 40 | DATE: 2024-12-05
EXAMINATION: CHEST X-RAY PA VIEW

FINDINGS:
- Trachea is central in position.
- Bony thorax and surrounding soft tissues are unremarkable.
- Cardiac size and contour are within normal limits (CTR = 0.48).
- Both hemidiaphragms are smooth; costophrenic and cardiophrenic angles are acute and clear.
- Lung parenchyma shows clear lung fields without consolidation, cavitation, or pleural effusion.

IMPRESSION: Normal chest radiograph.`
    },
    {
      title: 'Inpatient Discharge Summary: Laparoscopic Cholecystectomy',
      record_type: 'Discharge Summary',
      record_date: '2025-03-13',
      hospital: 'Fortis Healthcare Hospital',
      doctor: 'Dr. Vikram Malhotra, MS, MCh',
      findings: [
        { name: 'Post-op Hemoglobin', value: '13.8', unit: 'g/dL', range: '13.0 - 17.0 g/dL', abnormal: 0 },
        { name: 'Post-op WBC', value: '7,800', unit: '/cumm', range: '4,000 - 11,000', abnormal: 0 }
      ],
      medications: [
        { name: 'Pantoprazole', dosage: '40mg', frequency: 'Once daily before breakfast', instructions: '14 days' },
        { name: 'Paracetamol', dosage: '650mg', frequency: 'As needed for pain', instructions: 'Maximum 3 times daily' },
        { name: 'Cefuroxime', dosage: '500mg', frequency: 'Twice daily', instructions: '5 days course' }
      ],
      diagnoses: ['Acute Calculous Cholecystitis', 'Status Post Laparoscopic Cholecystectomy'],
      text: `FORTIS HEALTHCARE HOSPITAL
DEPARTMENT OF SURGICAL GASTROENTEROLOGY
DISCHARGE SUMMARY

PATIENT: Rahul Sharma | AGE: 41 | GENDER: Male
ADMISSION: 2025-03-10 | DISCHARGE: 2025-03-13
ATTENDING SURGEON: Dr. Vikram Malhotra, MS, MCh

ADMISSION REASON:
Acute onset severe right upper quadrant abdominal pain radiating to right infrascapular area, associated with nausea.
Abdominal ultrasound demonstrated multiple small gallstones with gallbladder wall thickening (4.2mm).

SURGICAL PROCEDURE:
Laparoscopic Cholecystectomy performed on 2025-03-11 under General Anesthesia.
Operative findings: Distended inflamed gallbladder with multiple mixed gallstones. Cystic duct and artery clipped and divided cleanly. Gallbladder retrieved in endobag. Zero intraoperative bile leak or complications.

POST-OPERATIVE COURSE:
Patient tolerated oral sips at 6 hours post-op, regular diet on post-op day 1. Surgical port sites clean and healing well.
Afebrile throughout. Vitals stable. Resumed routine oral antihypertensive and antidiabetic therapy.

DISCHARGE ADVICE:
1. Tab. Pantoprazole 40mg OD x 14 days
2. Tab. Paracetamol 650mg SOS for mild discomfort
3. Tab. Cefuroxime 500mg BD x 5 days
4. Continue Metformin 500mg BD and Amlodipine 5mg OD.`
    },
    {
      title: 'Post-Surgical Follow-up & Abdominal Sonography',
      record_type: 'Ultrasound',
      record_date: '2025-06-22',
      hospital: 'Fortis Healthcare Hospital',
      doctor: 'Dr. Vikram Malhotra, MS, MCh',
      findings: [
        { name: 'Common Bile Duct Diameter', value: '4.8', unit: 'mm', range: '< 6.0 mm', abnormal: 0 },
        { name: 'Gallbladder Bed Fluid', value: 'Absent', unit: '', range: 'None', abnormal: 0 }
      ],
      medications: [],
      diagnoses: ['Complete Post-Operative Resolution'],
      text: `FORTIS HEALTHCARE - ULTRASOUND DEPARTMENT
PATIENT: Rahul Sharma | DATE: 2025-06-22
EXAMINATION: ULTRASOUND WHOLE ABDOMEN (FOLLOW-UP)

FINDINGS:
- Liver is normal in size (14.2 cm), smooth contour, normal parenchymal echotexture.
- Gallbladder is surgically absent (post-cholecystectomy state).
- Gallbladder fossa is clean with no fluid collection, hematoma, or abscess.
- Common bile duct measures 4.8 mm, normal calibre without intrahepatic biliary dilatation.
- Spleen, pancreas, and kidneys are normal.

IMPRESSION: Normal post-cholecystectomy abdominal sonogram. Excellent surgical recovery.`
    },
    {
      title: 'Magnetic Resonance Imaging (MRI Brain with Contrast)',
      record_type: 'MRI',
      record_date: '2025-11-14',
      hospital: 'Apollo Specialty Hospitals',
      doctor: 'Dr. K. S. Murthy, DMRD, DNB',
      findings: [
        { name: 'Intracranial Hemorrhage', value: 'Negative', unit: '', range: 'Negative', abnormal: 0 },
        { name: 'Mass Effect / Midline Shift', value: 'None', unit: '', range: 'None', abnormal: 0 },
        { name: 'Subcortical White Matter', value: 'Mild Ischemia', unit: '', range: 'Age-consistent', abnormal: 0 }
      ],
      medications: [],
      diagnoses: ['Chronic Tension-type Headache', 'Mild Age-Consistent Microvascular Changes'],
      text: `APOLLO SPECIALTY HOSPITALS - DEPARTMENT OF NEURORADIOLOGY
PATIENT: Rahul Sharma | AGE: 41 | DATE: 2025-11-14
REFERRING DOCTOR: Dr. Rajesh Sharma, MD
MODALITY: MRI BRAIN WITH GADOLINIUM CONTRAST

CLINICAL INDICATION:
Evaluation of recurring tension headaches and intermittent postural lightheadedness.

TECHNIQUE:
Axial T1, T2, FLAIR, DWI, GRE, and post-gadolinium T1-weighted sequences.

FINDINGS:
1. Cerebral hemispheres exhibit normal sulcal and gyral patterns.
2. Ventricular system, sylvian fissures, and basal cisterns are symmetric and within normal anatomical limits for age.
3. No focal intracranial space-occupying lesion, infarction, or acute intracranial hemorrhage observed.
4. Minimal punctate hyperintensities seen in deep periventricular white matter on T2/FLAIR images, non-specific and consistent with mild microvascular ischemic changes secondary to hypertension.
5. Major intracranial arterial flow voids are preserved.

IMPRESSION:
1. No acute intracranial abnormality or intracranial mass.
2. Mild chronic microvascular white matter changes, age and blood-pressure consistent.
RECOMMENDATIONS: Continued tight control of blood pressure and glycemic indices.`
    },
    {
      title: 'Annual Cardiovascular Checkup & Resting ECG',
      record_type: 'Consultation',
      record_date: '2026-03-10',
      hospital: 'Max Super Speciality Hospital',
      doctor: 'Dr. S. N. Roy, MD, DM (Cardiology)',
      findings: [
        { name: 'Resting Blood Pressure', value: '128/82', unit: 'mmHg', range: '90/60 - 120/80 mmHg', abnormal: 0 },
        { name: 'Heart Rate', value: '72', unit: 'bpm', range: '60 - 100 bpm', abnormal: 0 },
        { name: 'ECG Rhythm', value: 'Normal Sinus', unit: '', range: 'Normal Sinus', abnormal: 0 }
      ],
      medications: [
        { name: 'Amlodipine', dosage: '5mg', frequency: 'Once daily in morning', instructions: 'Continue ongoing dose' },
        { name: 'Metformin', dosage: '500mg', frequency: 'Twice daily after meals', instructions: 'Continue ongoing dose' }
      ],
      diagnoses: ['Essential Hypertension - Well Controlled', 'Type 2 Diabetes - Stable'],
      text: `MAX SUPER SPECIALITY HOSPITAL
CARDIOLOGY CLINICAL ASSESSMENT NOTE
PATIENT: Rahul Sharma | AGE: 42 | DATE: 2026-03-10
CARDIOLOGIST: Dr. S. N. Roy, MD, DM

CLINICAL SUMMARY:
Patient attends for annual cardiovascular risk assessment. No complaints of chest pain, dyspnea on exertion, or palpitations.
Blood pressure well controlled at 128/82 mmHg on Tab. Amlodipine 5mg OD.

INVESTIGATIONS:
- 12-lead Resting Electrocardiogram (ECG): Normal sinus rhythm at 72 bpm. PR interval 156 ms, QRS 88 ms, QTc 418 ms. No ST-T wave abnormalities or ischemic changes. Normal axis.
- Serum Electrolytes: Sodium 141 mEq/L, Potassium 4.2 mEq/L, Chloride 102 mEq/L [ALL NORMAL].

PLAN:
Continue current regimen (Amlodipine 5mg OD, Metformin 500mg BD). Review again in 12 months or SOS.`
    },
    {
      title: 'Latest Comprehensive Metabolic Panel & HbA1c',
      record_type: 'Blood Test',
      record_date: '2026-07-20',
      hospital: 'Metropolis Healthcare Labs',
      doctor: 'Dr. Anita Roy, MD (Endocrinologist)',
      findings: [
        { name: 'HbA1c', value: '6.5', unit: '%', range: '4.0 - 5.6 %', abnormal: 1 },
        { name: 'Fasting Blood Sugar', value: '106', unit: 'mg/dL', range: '70 - 99 mg/dL', abnormal: 1 },
        { name: 'Serum Creatinine', value: '0.9', unit: 'mg/dL', range: '0.7 - 1.3 mg/dL', abnormal: 0 },
        { name: 'Hemoglobin', value: '14.4', unit: 'g/dL', range: '13.0 - 17.5 g/dL', abnormal: 0 },
        { name: 'Platelet Count', value: '250,000', unit: '/cumm', range: '150,000 - 450,000', abnormal: 0 }
      ],
      medications: [
        { name: 'Metformin', dosage: '500mg', frequency: 'Twice daily after meals', instructions: 'Continue maintenance' },
        { name: 'Amlodipine', dosage: '5mg', frequency: 'Once daily morning', instructions: 'Continue maintenance' }
      ],
      diagnoses: ['Type 2 Diabetes Mellitus - Controlled', 'Essential Hypertension - Controlled'],
      text: `METROPOLIS HEALTHCARE LABS
COMPREHENSIVE METABOLIC & GLYCEMIC PROFILE
PATIENT: Rahul Sharma | AGE: 42 | GENDER: Male
DATE OF COLLECTION: 2026-07-20
REPORTING ENDOCRINOLOGIST: Dr. Anita Roy, MD

BIOCHEMISTRY RESULTS:
- HbA1c (Glycosylated Hemoglobin): 6.5 % (Significant improvement from 7.2% baseline)
- Estimated Average Glucose (eAG): 140 mg/dL
- Fasting Blood Sugar: 106 mg/dL (Reference: 70 - 99 mg/dL)
- Serum Creatinine: 0.9 mg/dL (Reference: 0.7 - 1.3 mg/dL)
- Total Leucocyte Count (WBC): 7,100 /cumm
- Hemoglobin: 14.4 g/dL
- Platelets: 250,000 /cumm

IMPRESSION:
Remarkable glycemic and metabolic stability. HbA1c reduced to 6.5% under ongoing Metformin and dietary compliance. Renal function remains optimal.
ADVICE: Continue current medications. Next review in 6 months.`
    },
    {
      title: 'Eye Prescription',
      record_type: 'Prescription',
      record_date: '2026-09-19',
      hospital: 'Shifa Al Jazeera Medical Centre Fahaheel',
      doctor: 'Dr. Reshma Ravindra Malakere',
      findings: [
        { name: 'OD Sphere (Right Eye)', value: '-1.25', unit: 'DS', range: '0.00', abnormal: 1 },
        { name: 'OD Cylinder (Right Eye)', value: '-0.50', unit: 'DC', range: '0.00', abnormal: 1 },
        { name: 'OD Axis', value: '180', unit: 'deg', range: '0 - 180', abnormal: 0 },
        { name: 'OD Visual Acuity', value: '6/6', unit: '', range: '6/6', abnormal: 0 },
        { name: 'OS Sphere (Left Eye)', value: '-1.00', unit: 'DS', range: '0.00', abnormal: 1 },
        { name: 'OS Cylinder (Left Eye)', value: '-0.75', unit: 'DC', range: '0.00', abnormal: 1 },
        { name: 'OS Axis', value: '175', unit: 'deg', range: '0 - 180', abnormal: 0 },
        { name: 'OS Visual Acuity', value: '6/6', unit: '', range: '6/6', abnormal: 0 },
        { name: 'Pupillary Distance (PD)', value: '64', unit: 'mm', range: '58 - 68 mm', abnormal: 0 },
        { name: 'Near Add', value: '+1.50', unit: 'DS', range: '+0.75 - +2.50', abnormal: 0 },
        { name: 'Intraocular Pressure (IOP)', value: '14', unit: 'mmHg', range: '10 - 21 mmHg', abnormal: 0 },
        { name: 'Lens Recommendation', value: 'Anti-Reflective Blue Cut', unit: '', range: '', abnormal: 0 }
      ],
      medications: [
        { name: 'Carboxymethylcellulose 0.5% Eye Drops', dosage: '1 drop', frequency: '3 times daily', instructions: 'Instill into both eyes for dry eye relief' }
      ],
      diagnoses: ['Compound Myopic Astigmatism (Both Eyes)', 'Mild Computer Vision Dry Eye Syndrome'],
      text: `SHIFA AL JAZEERA MEDICAL CENTRE FAHAHEEL
DEPARTMENT OF OPHTHALMOLOGY & REFRACTION CLINIC
PATIENT: Rahul Sharma | DATE: 2026-09-19
EXAMINING SPECIALIST: Dr. Reshma Ravindra Malakere, MBBS, MS (Ophthalmology)

REFRACTIVE EXAMINATION FINDINGS:
1. Right Eye (OD - Oculus Dexter):
   - Sphere: -1.25 DS
   - Cylinder: -0.50 DC
   - Axis: 180 degrees
   - Corrected Visual Acuity: 6/6
2. Left Eye (OS - Oculus Sinister):
   - Sphere: -1.00 DS
   - Cylinder: -0.75 DC
   - Axis: 175 degrees
   - Corrected Visual Acuity: 6/6
3. Optical Measurements:
   - Pupillary Distance (PD): 64 mm
   - Reading Addition (Add): +1.50 DS
   - Intraocular Pressure (IOP): 14 mmHg (Both eyes normal)
   - Lenses: Progressive, Anti-Reflective coating with blue light filter recommended for screen use.

ADVICE:
1. Wear corrective glasses during computer use and driving.
2. Carboxymethylcellulose 0.5% eye drops 1 drop TID for dry eyes.
3. Review prescription in 12 months.`
    }
  ];

  const insertRecordStmt = db.prepare(`
    INSERT INTO medical_records (
      id, patient_id, record_type, title, hospital, doctor, 
      record_date, uploaded_at, original_file_key, file_name, 
      file_size, mime_type, extracted_text, verification_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'application/pdf', ?, 'verified', ?, ?)
  `);

  const insertFindingStmt = db.prepare(`
    INSERT INTO extracted_findings (id, record_id, finding_type, name, value, unit, reference_range, abnormal_flag, created_at)
    VALUES (?, ?, 'laboratory', ?, ?, ?, ?, ?, ?)
  `);

  const insertMedStmt = db.prepare(`
    INSERT INTO medications (id, patient_id, record_id, medication_name, dosage, frequency, instructions, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDiagStmt = db.prepare(`
    INSERT INTO diagnoses (id, patient_id, record_id, diagnosis, diagnosis_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Insert all reports and index for RAG
  for (const rep of reports) {
    const recordId = uuidv4();
    const fileKey = `${recordId}.pdf`;
    const filePath = path.join(uploadsDir, fileKey);

    // Write formatted report file to disk
    fs.writeFileSync(filePath, rep.text, 'utf8');

    insertRecordStmt.run(
      recordId,
      patientId,
      rep.record_type,
      rep.title,
      rep.hospital,
      rep.doctor,
      rep.record_date,
      now,
      fileKey,
      `${rep.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
      Buffer.byteLength(rep.text),
      rep.text,
      now,
      now
    );

    for (const f of rep.findings) {
      insertFindingStmt.run(
        uuidv4(),
        recordId,
        f.name,
        f.value,
        f.unit,
        f.range,
        f.abnormal,
        now
      );
    }

    for (const m of rep.medications) {
      insertMedStmt.run(
        uuidv4(),
        patientId,
        recordId,
        m.name,
        m.dosage,
        m.frequency,
        m.instructions,
        now
      );
    }

    for (const d of rep.diagnoses) {
      insertDiagStmt.run(
        uuidv4(),
        patientId,
        recordId,
        d,
        rep.record_date,
        now
      );
    }

    const savedRecord = db.prepare('SELECT * FROM medical_records WHERE id = ?').get(recordId) as any;
    RAGService.indexRecord(savedRecord, {
      findings: rep.findings.map(f => ({ ...f, abnormal_flag: f.abnormal, reference_range: f.range })),
      medications: rep.medications.map(m => ({ ...m, medication_name: m.name })),
      diagnoses: rep.diagnoses.map(d => ({ diagnosis: d }))
    });
  }

  // Add initial audit logs
  AuditService.log(patientId, 'system', 'system', 'DEMO_DATA_SEEDED', {
    reportCount: reports.length,
    dateRange: '2023-04-10 to 2026-07-20'
  });

  console.log(`[Seed] Successfully seeded ${reports.length} medical records spanning 2023-2026 for Rahul Sharma.`);
}

if (require.main === module) {
  seedDemoData();
}
