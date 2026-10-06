import { db } from '../db/database';
import { AICitation, PatientProfile } from '../types';
import { RAGService } from './rag.service';
import { calculateAge } from '../utils/date.utils';
import { PatientMedicalRecordsAgent } from './medicalAgent.service';

export interface AIChatResponse {
  answer: string;
  citations: AICitation[];
  disclaimer: string;
}

export interface MedicalSummaryResponse {
  summary: string;
  patientInfo: {
    fullName: string;
    dateOfBirth?: string;
    age: number | string;
    gender?: string;
    bloodGroup: string;
    emergencyContact: string;
  };
  knownConditions: string[];
  currentMedications: Array<{ name: string; dosage: string; frequency: string }>;
  recentInvestigations: Array<{ test: string; value: string; date: string; flag: boolean }>;
  sourceRecords: AICitation[];
}

export type AIQueryIntent =
  | 'LATEST_RECORD'
  | 'RECORD_LIST'
  | 'LAB_RESULT'
  | 'MEDICATION'
  | 'SUMMARY'
  | 'COMPARISON_TREND'
  | 'DOCUMENT_SPECIFIC'
  | 'DOCTOR_FACILITY'
  | 'GENERAL_MEDICAL_QUERY';

interface ClassifiedIntent {
  intent: AIQueryIntent;
  targetTest?: string;
  targetDocType?: string;
  isLatestSpecific?: boolean;
}

function formatDateDisplay(dateStr: string): string {
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthNum = parseInt(parts[1], 10);
      const dayNum = parseInt(parts[2], 10);
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      if (monthNum >= 1 && monthNum <= 12) {
        return `${dayNum} ${monthNames[monthNum - 1]} ${year}`;
      }
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

function createCitation(record: any, customSnippet?: string): AICitation {
  return {
    record_id: record.id,
    record_title: record.title,
    record_type: record.record_type,
    record_date: record.record_date,
    hospital: record.hospital,
    doctor: record.doctor,
    snippet: customSnippet || record.extracted_text?.slice(0, 160) + '...' || `${record.title} - ${record.hospital}`
  };
}

export class AIService {
  private static readonly MEDICAL_DISCLAIMER =
    'AI-generated information is for informational purposes and does not replace professional medical advice, diagnosis, or treatment.';

  /**
   * Intent Classifier for MediBrief Hybrid Retrieval
   */
  public static classifyIntent(query: string, history?: any[]): ClassifiedIntent {
    const q = query.trim().toLowerCase();

    // 1. DOCTOR / FACILITY queries
    if (
      /(which doctor|who is (the|my) doctor|what doctor|doctor wrote|which hospital|which clinic|what clinic|facility)/i.test(q)
    ) {
      return { intent: 'DOCTOR_FACILITY' };
    }

    // 2. COMPARISON / TREND queries
    if (
      /(what changed|compare|comparison|trend|trends|difference between|differ|has my .* changed|how did my .* change)/i.test(q)
    ) {
      // Check if a specific analyte is being trended
      const testMatch = q.match(/(haemoglobin|hemoglobin|hba1c|sugar|glucose|creatinine|wbc|blood pressure|bp|cholesterol)/i);
      return {
        intent: 'COMPARISON_TREND',
        targetTest: testMatch ? testMatch[1] : undefined
      };
    }

    // 3. SUMMARY queries
    if (
      /(summarize|summary|overview|health history|medical history overview|clinical summary)/i.test(q)
    ) {
      return { intent: 'SUMMARY' };
    }

    // 4. DOCUMENT SPECIFIC queries (Eye Prescription, MRI, CT, Ultrasound, etc.)
    if (
      /(eye prescription|right eye|left eye|\bod\b|\bos\b|vision|glasses|spectacles)/i.test(q)
    ) {
      return { intent: 'DOCUMENT_SPECIFIC', targetDocType: 'Eye Prescription' };
    }
    if (/(mri|magnetic resonance)/i.test(q)) {
      return { intent: 'DOCUMENT_SPECIFIC', targetDocType: 'MRI' };
    }
    if (/(ct scan|tomography)/i.test(q)) {
      return { intent: 'DOCUMENT_SPECIFIC', targetDocType: 'CT Scan' };
    }
    if (/(ultrasound|sonography)/i.test(q)) {
      return { intent: 'DOCUMENT_SPECIFIC', targetDocType: 'Ultrasound' };
    }

    // Check conversational follow-up from recent history
    if (history && history.length > 0) {
      const lastAssistantMsg = [...history].reverse().find(m => m.role === 'assistant')?.message || '';
      if (/eye prescription/i.test(lastAssistantMsg) && /(right|left|eye|cylinder|sphere|axis|glass)/i.test(q)) {
        return { intent: 'DOCUMENT_SPECIFIC', targetDocType: 'Eye Prescription' };
      }
      if (/prescription/i.test(lastAssistantMsg) && /(previous|different|changed|before)/i.test(q)) {
        return { intent: 'COMPARISON_TREND', targetDocType: 'Prescription' };
      }
    }

    // 5. MEDICATION queries
    if (
      /(medication|medicine|prescript|drug|dosage|dose|pill|tablet|syrup)/i.test(q)
    ) {
      const isLatest = /(latest|most recent|newest|recent|last)/i.test(q);
      return { intent: 'MEDICATION', isLatestSpecific: isLatest };
    }

    // 6. SPECIFIC LAB TESTS / BLOOD TESTS
    const labTestMatch = q.match(/(haemoglobin|hemoglobin|hba1c|glucose|blood sugar|sugar|wbc|rbc|creatinine|platelet|cholesterol|lipid|urea|bilirubin|tsh|thyroid|vitamin|calcium|potassium|sodium|blood count|cbc|lft|kft|rft)/i);
    if (labTestMatch) {
      return { intent: 'LAB_RESULT', targetTest: labTestMatch[1] };
    }
    if (/(blood test|lab test|lab result|lab report|pathology)/i.test(q)) {
      const isLatest = /(latest|most recent|newest|recent|last)/i.test(q);
      return { intent: 'LAB_RESULT', isLatestSpecific: isLatest };
    }

    // 7. LATEST RECORD (General)
    if (
      /(latest|most recent|newest|recent)\s+(report|record|document|medical\s+record|medical\s+report|result|checkup|visit)/i.test(q) ||
      /^(can you give me|show me|what is|what was|give me|get|find|display|tell me about)\s+(my\s+)?(latest|most recent|newest|recent)/i.test(q) ||
      /(latest|newest|most recent)\s+(report|record)/i.test(q)
    ) {
      return { intent: 'LATEST_RECORD' };
    }

    // 8. RECORD LIST
    if (
      /(what\s+(medical\s+)?(reports|records|documents)\s+(do i have|have i|are uploaded)|show\s+(me\s+)?(my\s+)?(medical\s+)?(reports|records|documents)|list\s+(my\s+)?(medical\s+)?(records|reports|documents|history)|all\s+my\s+(reports|records))/i.test(q)
    ) {
      return { intent: 'RECORD_LIST' };
    }

    // 9. GENERAL MEDICAL RECORD QUERY
    return { intent: 'GENERAL_MEDICAL_QUERY' };
  }

  /**
   * Main Controlled Agent Entrypoint
   * Delegates query execution to PatientMedicalRecordsAgent orchestrator
   */
  public static async chat(
    patientId: string,
    question: string,
    actorType: 'patient' | 'doctor',
    allowedRecordIds?: string[],
    history?: any[]
  ): Promise<AIChatResponse> {
    const trimmed = question.trim();
    if (!trimmed) {
      return {
        answer: 'Please ask a question regarding the medical records.',
        citations: [],
        disclaimer: this.MEDICAL_DISCLAIMER
      };
    }

    const agentResponse = await PatientMedicalRecordsAgent.execute(trimmed, {
      patientId,
      allowedRecordIds,
      history
    });

    return {
      answer: agentResponse.answer,
      citations: agentResponse.citations,
      disclaimer: agentResponse.disclaimer
    };
  }

  /**
   * 1. LATEST_RECORD Handler
   * Deterministic DB query for newest verified record.
   */
  private static async handleLatestRecord(
    patientId: string,
    allowedRecordIds?: string[]
  ): Promise<AIChatResponse> {
    let query = `
      SELECT * FROM medical_records
      WHERE patient_id = ? AND verification_status = 'verified'
    `;
    const params: any[] = [patientId];

    if (allowedRecordIds) {
      if (allowedRecordIds.length === 0) {
        return {
          answer: "No verified medical reports have been shared in this consultation session.",
          citations: [],
          disclaimer: this.MEDICAL_DISCLAIMER
        };
      }
      query += ` AND id IN (${allowedRecordIds.map(() => '?').join(',')})`;
      params.push(...allowedRecordIds);
    }

    query += ` ORDER BY record_date DESC, created_at DESC LIMIT 1`;
    const record = db.prepare(query).get(...params) as any;

    if (!record) {
      console.log(`[AI_QUERY] intent=LATEST_RECORD patient=authenticated strategy=database records_found=0 status=empty`);
      return {
        answer: "I don't have any verified medical reports in your MediBrief account yet. You can scan or upload a document anytime using the camera or file uploader.",
        citations: [],
        disclaimer: this.MEDICAL_DISCLAIMER
      };
    }

    // Fetch findings
    const findings = db.prepare(`
      SELECT * FROM extracted_findings WHERE record_id = ? ORDER BY id ASC
    `).all(record.id) as any[];

    // Fetch medications
    const meds = db.prepare(`
      SELECT * FROM medications WHERE record_id = ?
    `).all(record.id) as any[];

    // Fetch diagnoses
    const diags = db.prepare(`
      SELECT * FROM diagnoses WHERE record_id = ?
    `).all(record.id) as any[];

    const formattedDate = formatDateDisplay(record.record_date);

    let answer = `Your latest medical record is:\n\n`;
    answer += `**${record.title}**\n`;
    answer += `• **Date:** ${formattedDate}\n`;
    answer += `• **Facility:** ${record.hospital}\n`;
    answer += `• **Doctor:** ${record.doctor}\n`;
    answer += `• **Category:** ${record.record_type}\n\n`;

    if (findings.length > 0) {
      answer += `I found **${findings.length} extracted findings** in this report:\n`;
      for (const f of findings.slice(0, 5)) {
        answer += `• **${f.name}:** ${f.value} ${f.unit || ''}${f.reference_range ? ` *(Ref: ${f.reference_range})*` : ''}${f.abnormal_flag ? ' ⚠️ [Abnormal]' : ''}\n`;
      }
      if (findings.length > 5) {
        answer += `• *...and ${findings.length - 5} additional clinical measurements.*\n`;
      }
      answer += '\n';
    }

    if (meds.length > 0) {
      answer += `**Prescribed Medications:**\n`;
      for (const m of meds) {
        answer += `• **${m.medication_name}** (${m.dosage}) — ${m.frequency}\n`;
      }
      answer += '\n';
    }

    if (diags.length > 0) {
      answer += `**Documented Diagnoses:**\n`;
      for (const d of diags) {
        answer += `• ${d.diagnosis}\n`;
      }
      answer += '\n';
    }

    answer += `[View Original Report →]`;

    const citation = createCitation(record, `Latest record: ${record.title} (${formattedDate})`);

    console.log(`[AI_QUERY] intent=LATEST_RECORD patient=authenticated strategy=database records_found=1 record_ids=${record.id} status=success`);

    return {
      answer,
      citations: [citation],
      disclaimer: this.MEDICAL_DISCLAIMER
    };
  }

  /**
   * 2. RECORD_LIST Handler
   * Deterministic list of all verified reports.
   */
  private static async handleRecordList(
    patientId: string,
    allowedRecordIds?: string[]
  ): Promise<AIChatResponse> {
    let query = `
      SELECT * FROM medical_records
      WHERE patient_id = ? AND verification_status = 'verified'
    `;
    const params: any[] = [patientId];

    if (allowedRecordIds) {
      if (allowedRecordIds.length === 0) {
        return {
          answer: "No verified medical reports have been shared in this consultation session.",
          citations: [],
          disclaimer: this.MEDICAL_DISCLAIMER
        };
      }
      query += ` AND id IN (${allowedRecordIds.map(() => '?').join(',')})`;
      params.push(...allowedRecordIds);
    }

    query += ` ORDER BY record_date DESC, created_at DESC`;
    const records = db.prepare(query).all(...params) as any[];

    if (records.length === 0) {
      console.log(`[AI_QUERY] intent=RECORD_LIST patient=authenticated strategy=database records_found=0 status=empty`);
      return {
        answer: "You don't have any verified medical records in your MediBrief account yet.",
        citations: [],
        disclaimer: this.MEDICAL_DISCLAIMER
      };
    }

    let answer = `You have **${records.length} verified medical record${records.length > 1 ? 's' : ''}** on file, listed chronologically (newest to oldest):\n\n`;

    for (const r of records) {
      const formattedDate = formatDateDisplay(r.record_date);
      answer += `• **${r.title}** (${r.record_type})\n  📅 *${formattedDate}* | 🏥 *${r.hospital}* | 👨‍⚕️ *Dr. ${r.doctor}*\n\n`;
    }

    answer += `*Tip: You can ask me to explain any specific report or review your lab test results.*`;

    const citations = records.map(r => createCitation(r));

    console.log(`[AI_QUERY] intent=RECORD_LIST patient=authenticated strategy=database records_found=${records.length} record_ids=${records.map(r => r.id).slice(0, 3).join(',')} status=success`);

    return {
      answer,
      citations,
      disclaimer: this.MEDICAL_DISCLAIMER
    };
  }

  /**
   * 3. LAB_RESULT Handler
   * Retrieves specific analyte or general latest blood test.
   */
  private static async handleLabResult(
    patientId: string,
    targetTest?: string,
    isLatestSpecific?: boolean,
    allowedRecordIds?: string[]
  ): Promise<AIChatResponse> {
    // Case A: Specific analyte (e.g. haemoglobin, WBC, creatinine, HbA1c, glucose)
    if (targetTest) {
      let query = `
        SELECT ef.*, mr.title, mr.record_date, mr.hospital, mr.doctor, mr.id as record_id
        FROM extracted_findings ef
        JOIN medical_records mr ON ef.record_id = mr.id
        WHERE mr.patient_id = ? AND mr.verification_status = 'verified'
      `;
      const params: any[] = [patientId];

      if (allowedRecordIds) {
        if (allowedRecordIds.length === 0) {
          return {
            answer: "No verified medical reports have been shared in this consultation session.",
            citations: [],
            disclaimer: this.MEDICAL_DISCLAIMER
          };
        }
        query += ` AND mr.id IN (${allowedRecordIds.map(() => '?').join(',')})`;
        params.push(...allowedRecordIds);
      }

      // Match common aliases
      let searchPatterns = [`%${targetTest}%`];
      if (/haemo|hemo/i.test(targetTest)) {
        searchPatterns = ['%haemoglobin%', '%hemoglobin%', '%hgb%'];
      } else if (/sugar|glucose/i.test(targetTest)) {
        searchPatterns = ['%glucose%', '%sugar%', '%fbs%', '%ppbs%'];
      } else if (/hba1c/i.test(targetTest)) {
        searchPatterns = ['%hba1c%', '%glycosylated%'];
      } else if (/wbc/i.test(targetTest)) {
        searchPatterns = ['%wbc%', '%leucocyte%', '%leukocyte%'];
      } else if (/rbc/i.test(targetTest)) {
        searchPatterns = ['%rbc%', '%erythrocyte%'];
      }

      query += ` AND (${searchPatterns.map(() => 'LOWER(ef.name) LIKE ?').join(' OR ')})`;
      params.push(...searchPatterns);
      query += ` ORDER BY mr.record_date DESC`;

      const findings = db.prepare(query).all(...params) as any[];

      if (findings.length > 0) {
        const latest = findings[0];
        const formattedDate = formatDateDisplay(latest.record_date);

        let answer = `Based on your laboratory reports, here are your **${latest.name}** findings:\n\n`;
        answer += `• **Latest Value (${formattedDate}):** **${latest.value} ${latest.unit || ''}**`;
        if (latest.reference_range) {
          answer += ` *(Reference: ${latest.reference_range})*`;
        }
        if (latest.abnormal_flag) {
          answer += ` ⚠️ **[Abnormal Flag]**`;
        } else {
          answer += ` [Normal]`;
        }
        answer += `\n  *Documented in ${latest.title} at ${latest.hospital} (Dr. ${latest.doctor})*\n\n`;

        if (findings.length > 1) {
          answer += `**Historical Trends:**\n`;
          for (const f of findings.slice(1, 4)) {
            answer += `• **${formatDateDisplay(f.record_date)}:** ${f.value} ${f.unit || ''} (${f.title})\n`;
          }
        }

        const citationMap = new Map<string, AICitation>();
        for (const f of findings) {
          if (!citationMap.has(f.record_id)) {
            citationMap.set(f.record_id, {
              record_id: f.record_id,
              record_title: f.title,
              record_type: 'Lab Report',
              record_date: f.record_date,
              hospital: f.hospital,
              doctor: f.doctor,
              snippet: `${f.name}: ${f.value} ${f.unit || ''} (${f.record_date})`
            });
          }
        }

        console.log(`[AI_QUERY] intent=LAB_RESULT test=${targetTest} patient=authenticated strategy=database records_found=${citationMap.size} status=success`);

        return {
          answer,
          citations: Array.from(citationMap.values()),
          disclaimer: this.MEDICAL_DISCLAIMER
        };
      }
    }

    // Case B: General or Latest Blood Test
    let bloodQuery = `
      SELECT * FROM medical_records
      WHERE patient_id = ? AND verification_status = 'verified'
      AND (
        record_type IN ('Blood Test', 'Lab Report', 'Pathology')
        OR title LIKE '%Blood%' OR title LIKE '%Lab%' OR title LIKE '%Metabolic%' OR title LIKE '%CBC%'
      )
    `;
    const bParams: any[] = [patientId];

    if (allowedRecordIds) {
      if (allowedRecordIds.length === 0) {
        return {
          answer: "No verified medical reports have been shared in this consultation session.",
          citations: [],
          disclaimer: this.MEDICAL_DISCLAIMER
        };
      }
      bloodQuery += ` AND id IN (${allowedRecordIds.map(() => '?').join(',')})`;
      bParams.push(...allowedRecordIds);
    }

    bloodQuery += ` ORDER BY record_date DESC, created_at DESC LIMIT 1`;
    const bloodRecord = db.prepare(bloodQuery).get(...bParams) as any;

    if (bloodRecord) {
      const findings = db.prepare(`
        SELECT * FROM extracted_findings WHERE record_id = ? ORDER BY id ASC
      `).all(bloodRecord.id) as any[];

      const formattedDate = formatDateDisplay(bloodRecord.record_date);
      let answer = `Your latest blood test is **${bloodRecord.title}** from **${formattedDate}** at **${bloodRecord.hospital}** (Dr. ${bloodRecord.doctor}):\n\n`;

      if (findings.length > 0) {
        answer += `**Key Laboratory Investigations:**\n`;
        for (const f of findings) {
          answer += `• **${f.name}:** **${f.value} ${f.unit || ''}**${f.reference_range ? ` (Ref: ${f.reference_range})` : ''}${f.abnormal_flag ? ' ⚠️ [Abnormal]' : ' [Normal]'}\n`;
        }
      } else {
        answer += `No discrete lab findings were extracted from this report.\n`;
      }

      const citation = createCitation(bloodRecord, `Latest Blood Test (${formattedDate})`);
      console.log(`[AI_QUERY] intent=LAB_RESULT patient=authenticated strategy=database records_found=1 record_ids=${bloodRecord.id} status=success`);

      return {
        answer,
        citations: [citation],
        disclaimer: this.MEDICAL_DISCLAIMER
      };
    }

    // Anti-hallucination fallback
    console.log(`[AI_QUERY] intent=LAB_RESULT patient=authenticated strategy=database records_found=0 status=not_found`);
    return {
      answer: "I couldn't find a verified record containing that laboratory test result in your MediBrief account.\n\nTry asking:\n• What is my latest report?\n• What medications are in my records?\n• Show me my medical reports",
      citations: [],
      disclaimer: this.MEDICAL_DISCLAIMER
    };
  }

  /**
   * 4. MEDICATION Handler
   * Retrieves active & documented prescription items.
   */
  private static async handleMedication(
    patientId: string,
    isLatestSpecific?: boolean,
    allowedRecordIds?: string[]
  ): Promise<AIChatResponse> {
    let query = `
      SELECT m.*, mr.title, mr.record_date, mr.hospital, mr.doctor, mr.id as record_id
      FROM medications m
      JOIN medical_records mr ON m.record_id = mr.id
      WHERE mr.patient_id = ? AND mr.verification_status = 'verified'
    `;
    const params: any[] = [patientId];

    if (allowedRecordIds) {
      if (allowedRecordIds.length === 0) {
        return {
          answer: "No verified medical reports have been shared in this consultation session.",
          citations: [],
          disclaimer: this.MEDICAL_DISCLAIMER
        };
      }
      query += ` AND mr.id IN (${allowedRecordIds.map(() => '?').join(',')})`;
      params.push(...allowedRecordIds);
    }

    query += ` ORDER BY mr.record_date DESC`;
    const meds = db.prepare(query).all(...params) as any[];

    if (meds.length > 0) {
      let answer = `Based on your verified medical records, here are your **documented medications**:\n\n`;

      const seen = new Set<string>();
      const citationsMap = new Map<string, AICitation>();

      for (const m of meds) {
        const key = `${m.medication_name}_${m.dosage}`;
        if (!seen.has(key)) {
          seen.add(key);
          const formattedDate = formatDateDisplay(m.record_date);
          answer += `• **${m.medication_name}** (${m.dosage}) — ${m.frequency}`;
          if (m.instructions) answer += ` | *Instructions:* ${m.instructions}`;
          answer += `\n  *(Prescribed by Dr. ${m.doctor} on ${formattedDate} at ${m.hospital})*\n\n`;
        }

        if (!citationsMap.has(m.record_id)) {
          citationsMap.set(m.record_id, {
            record_id: m.record_id,
            record_title: m.title,
            record_type: 'Prescription',
            record_date: m.record_date,
            hospital: m.hospital,
            doctor: m.doctor,
            snippet: `Prescribed: ${m.medication_name} ${m.dosage}`
          });
        }
      }

      console.log(`[AI_QUERY] intent=MEDICATION patient=authenticated strategy=database records_found=${citationsMap.size} status=success`);

      return {
        answer,
        citations: Array.from(citationsMap.values()),
        disclaimer: this.MEDICAL_DISCLAIMER
      };
    }

    // Also check if any prescription documents exist without discrete medications table rows
    let prescQuery = `
      SELECT * FROM medical_records
      WHERE patient_id = ? AND verification_status = 'verified'
      AND (record_type = 'Prescription' OR title LIKE '%Prescription%')
      ORDER BY record_date DESC LIMIT 1
    `;
    const prescRecord = db.prepare(prescQuery).get(patientId) as any;
    if (prescRecord) {
      const citation = createCitation(prescRecord);
      return {
        answer: `You have a prescription on file: **${prescRecord.title}** from **${formatDateDisplay(prescRecord.record_date)}** (Dr. ${prescRecord.doctor} at ${prescRecord.hospital}).\n\n${prescRecord.extracted_text.slice(0, 300)}...`,
        citations: [citation],
        disclaimer: this.MEDICAL_DISCLAIMER
      };
    }

    console.log(`[AI_QUERY] intent=MEDICATION patient=authenticated strategy=database records_found=0 status=empty`);
    return {
      answer: "I couldn't find any active or past prescriptions in your verified medical records.\n\nPlease check if your prescription has been scanned or uploaded.",
      citations: [],
      disclaimer: this.MEDICAL_DISCLAIMER
    };
  }

  /**
   * 5. SUMMARY Handler
   */
  private static async handleSummaryIntent(
    patientId: string,
    allowedRecordIds?: string[]
  ): Promise<AIChatResponse> {
    const summaryData = await this.generateSummary(patientId, allowedRecordIds);
    console.log(`[AI_QUERY] intent=SUMMARY patient=authenticated strategy=database records_found=${summaryData.sourceRecords.length} status=success`);
    return {
      answer: summaryData.summary,
      citations: summaryData.sourceRecords,
      disclaimer: this.MEDICAL_DISCLAIMER
    };
  }

  /**
   * 6. COMPARISON_TREND Handler
   * Compares chronological records or tracks trends.
   */
  private static async handleComparisonTrend(
    patientId: string,
    targetTest?: string,
    allowedRecordIds?: string[]
  ): Promise<AIChatResponse> {
    // If specific test (e.g. HbA1c, Glucose, Hemoglobin)
    if (targetTest) {
      return this.handleLabResult(patientId, targetTest, false, allowedRecordIds);
    }

    // General "What changed between my reports?"
    let query = `
      SELECT * FROM medical_records
      WHERE patient_id = ? AND verification_status = 'verified'
    `;
    const params: any[] = [patientId];

    if (allowedRecordIds) {
      if (allowedRecordIds.length === 0) {
        return {
          answer: "No verified medical reports have been shared in this consultation session.",
          citations: [],
          disclaimer: this.MEDICAL_DISCLAIMER
        };
      }
      query += ` AND id IN (${allowedRecordIds.map(() => '?').join(',')})`;
      params.push(...allowedRecordIds);
    }

    query += ` ORDER BY record_date DESC, created_at DESC LIMIT 3`;
    const recentRecords = db.prepare(query).all(...params) as any[];

    if (recentRecords.length < 2) {
      if (recentRecords.length === 1) {
        return {
          answer: `You have 1 verified medical record on file (**${recentRecords[0].title}** from ${formatDateDisplay(recentRecords[0].record_date)}). At least two reports are required to perform a chronological comparison.`,
          citations: [createCitation(recentRecords[0])],
          disclaimer: this.MEDICAL_DISCLAIMER
        };
      }
      return {
        answer: "You do not have enough medical records on file to perform a chronological comparison.",
        citations: [],
        disclaimer: this.MEDICAL_DISCLAIMER
      };
    }

    const citations = recentRecords.map(r => createCitation(r));

    let answer = `Here is a comparison of your **${recentRecords.length} most recent medical reports**:\n\n`;

    for (let i = 0; i < recentRecords.length; i++) {
      const r = recentRecords[i];
      const findings = db.prepare(`SELECT * FROM extracted_findings WHERE record_id = ? LIMIT 4`).all(r.id) as any[];
      const meds = db.prepare(`SELECT * FROM medications WHERE record_id = ?`).all(r.id) as any[];

      answer += `### ${i === 0 ? 'Latest: ' : 'Previous: '}**${r.title}** (${formatDateDisplay(r.record_date)})\n`;
      answer += `• **Facility & Doctor:** ${r.hospital} | Dr. ${r.doctor}\n`;
      if (findings.length > 0) {
        answer += `• **Key Findings:** ${findings.map(f => `${f.name}: ${f.value} ${f.unit || ''}${f.abnormal_flag ? ' ⚠️' : ''}`).join(', ')}\n`;
      }
      if (meds.length > 0) {
        answer += `• **Medications:** ${meds.map(m => `${m.medication_name} ${m.dosage}`).join(', ')}\n`;
      }
      answer += '\n';
    }

    console.log(`[AI_QUERY] intent=COMPARISON_TREND patient=authenticated strategy=database records_found=${recentRecords.length} status=success`);

    return {
      answer,
      citations,
      disclaimer: this.MEDICAL_DISCLAIMER
    };
  }

  /**
   * 7. DOCUMENT_SPECIFIC Handler
   * E.g. "What does my eye prescription say?", "Explain my MRI report"
   */
  private static async handleDocumentSpecific(
    patientId: string,
    targetDocType: string,
    queryText: string,
    allowedRecordIds?: string[]
  ): Promise<AIChatResponse> {
    let query = `
      SELECT * FROM medical_records
      WHERE patient_id = ? AND verification_status = 'verified'
      AND (
        title LIKE ? OR record_type LIKE ? OR extracted_text LIKE ?
      )
    `;
    const searchPattern = `%${targetDocType}%`;
    const params: any[] = [patientId, searchPattern, searchPattern, searchPattern];

    if (allowedRecordIds) {
      if (allowedRecordIds.length === 0) {
        return {
          answer: "No verified medical reports have been shared in this consultation session.",
          citations: [],
          disclaimer: this.MEDICAL_DISCLAIMER
        };
      }
      query += ` AND id IN (${allowedRecordIds.map(() => '?').join(',')})`;
      params.push(...allowedRecordIds);
    }

    query += ` ORDER BY record_date DESC LIMIT 1`;
    const record = db.prepare(query).get(...params) as any;

    if (!record) {
      console.log(`[AI_QUERY] intent=DOCUMENT_SPECIFIC target=${targetDocType} patient=authenticated strategy=database records_found=0 status=not_found`);
      return {
        answer: `I couldn't find a verified record matching "${targetDocType}" in your MediBrief account.\n\nPlease check if this report has been uploaded.`,
        citations: [],
        disclaimer: this.MEDICAL_DISCLAIMER
      };
    }

    const findings = db.prepare(`SELECT * FROM extracted_findings WHERE record_id = ?`).all(record.id) as any[];
    const formattedDate = formatDateDisplay(record.record_date);

    let answer = `Here are the details from your **${record.title}** (${formattedDate} at ${record.hospital}):\n\n`;

    // Specialized breakdown for Eye Prescription
    if (/eye/i.test(record.title) || /eye/i.test(record.record_type) || /eye/i.test(targetDocType)) {
      const isRightEyeSpecific = /(right|od\b)/i.test(queryText);
      const isLeftEyeSpecific = /(left|os\b)/i.test(queryText);

      answer += `**Attending Ophthalmologist / Optometrist:** Dr. ${record.doctor}\n\n`;

      if (findings.length > 0) {
        if (isRightEyeSpecific) {
          answer += `**Right Eye (OD - Oculus Dexter) Findings:**\n`;
          const odFindings = findings.filter(f => /od|right/i.test(f.name) || !(/os|left/i.test(f.name)));
          for (const f of odFindings) {
            answer += `• **${f.name}:** ${f.value} ${f.unit || ''}\n`;
          }
          answer += `\n*Clinical Note:* Negative sphere values indicate myopia (nearsightedness), while cylinder values correct astigmatism.\n\n`;
        } else if (isLeftEyeSpecific) {
          answer += `**Left Eye (OS - Oculus Sinister) Findings:**\n`;
          const osFindings = findings.filter(f => /os|left/i.test(f.name));
          for (const f of osFindings) {
            answer += `• **${f.name}:** ${f.value} ${f.unit || ''}\n`;
          }
          answer += `\n*Clinical Note:* Left eye optical refraction measurements.\n\n`;
        } else {
          answer += `**Refractive Measurements:**\n`;
          for (const f of findings) {
            answer += `• **${f.name}:** ${f.value} ${f.unit || ''}\n`;
          }
          answer += `\n`;
        }
      } else if (record.extracted_text) {
        answer += `${record.extracted_text}\n\n`;
      }
    } else {
      // General specialized document (e.g. MRI, CT)
      if (findings.length > 0) {
        answer += `**Documented Clinical Findings:**\n`;
        for (const f of findings) {
          answer += `• **${f.name}:** ${f.value} ${f.unit || ''}${f.abnormal_flag ? ' ⚠️' : ''}\n`;
        }
        answer += `\n`;
      }

      // Check extracted text for Impression
      const impMatch = record.extracted_text?.match(/IMPRESSION:?([\s\S]*?)(?=(?:RECOMMENDATION|$))/i);
      if (impMatch) {
        answer += `**Clinical Impression:**\n${impMatch[1].trim()}\n\n`;
      } else if (record.extracted_text) {
        answer += `**Clinical Summary:**\n${record.extracted_text.slice(0, 350)}...\n\n`;
      }
    }

    answer += `[View Original Report →]`;

    const citation = createCitation(record);
    console.log(`[AI_QUERY] intent=DOCUMENT_SPECIFIC target=${targetDocType} patient=authenticated strategy=database records_found=1 record_ids=${record.id} status=success`);

    return {
      answer,
      citations: [citation],
      disclaimer: this.MEDICAL_DISCLAIMER
    };
  }

  /**
   * 8. DOCTOR_FACILITY Handler
   * E.g. "Which doctor wrote my latest prescription?", "Which doctors have I visited?"
   */
  private static async handleDoctorFacility(
    patientId: string,
    queryText: string,
    allowedRecordIds?: string[]
  ): Promise<AIChatResponse> {
    const isPrescriptionDoctor = /(prescription|medicine|medication)/i.test(queryText);

    if (isPrescriptionDoctor) {
      let query = `
        SELECT * FROM medical_records
        WHERE patient_id = ? AND verification_status = 'verified'
        AND (record_type = 'Prescription' OR title LIKE '%Prescription%' OR id IN (SELECT record_id FROM medications))
      `;
      const params: any[] = [patientId];

      if (allowedRecordIds) {
        if (allowedRecordIds.length === 0) {
          return {
            answer: "No verified medical reports have been shared in this consultation session.",
            citations: [],
            disclaimer: this.MEDICAL_DISCLAIMER
          };
        }
        query += ` AND id IN (${allowedRecordIds.map(() => '?').join(',')})`;
        params.push(...allowedRecordIds);
      }

      query += ` ORDER BY record_date DESC LIMIT 1`;
      const record = db.prepare(query).get(...params) as any;

      if (record) {
        const formattedDate = formatDateDisplay(record.record_date);
        const answer = `Your latest prescription was written by **Dr. ${record.doctor}** on **${formattedDate}** at **${record.hospital}** for '${record.title}'.\n\n[View Original Report →]`;
        const citation = createCitation(record);

        console.log(`[AI_QUERY] intent=DOCTOR_FACILITY type=prescription patient=authenticated strategy=database records_found=1 record_ids=${record.id} status=success`);

        return {
          answer,
          citations: [citation],
          disclaimer: this.MEDICAL_DISCLAIMER
        };
      }
    }

    // List all doctors visited
    let docQuery = `
      SELECT DISTINCT doctor, hospital, MAX(record_date) as last_seen, COUNT(*) as visit_count
      FROM medical_records
      WHERE patient_id = ? AND verification_status = 'verified'
    `;
    const dParams: any[] = [patientId];

    if (allowedRecordIds) {
      if (allowedRecordIds.length === 0) {
        return {
          answer: "No verified medical reports have been shared in this consultation session.",
          citations: [],
          disclaimer: this.MEDICAL_DISCLAIMER
        };
      }
      docQuery += ` AND id IN (${allowedRecordIds.map(() => '?').join(',')})`;
      dParams.push(...allowedRecordIds);
    }

    docQuery += ` GROUP BY doctor, hospital ORDER BY last_seen DESC`;
    const doctors = db.prepare(docQuery).all(...dParams) as any[];

    if (doctors.length > 0) {
      let answer = `Based on your verified medical records, here are the physicians and healthcare facilities you have visited:\n\n`;
      for (const d of doctors) {
        answer += `• **Dr. ${d.doctor}**\n  🏥 *${d.hospital}* | Most recent visit: ${formatDateDisplay(d.last_seen)} (${d.visit_count} report${d.visit_count > 1 ? 's' : ''})\n\n`;
      }

      // Citations
      const sampleRecords = db.prepare(`
        SELECT * FROM medical_records WHERE patient_id = ? AND verification_status = 'verified' ORDER BY record_date DESC LIMIT 3
      `).all(patientId) as any[];

      console.log(`[AI_QUERY] intent=DOCTOR_FACILITY type=all patient=authenticated strategy=database records_found=${doctors.length} status=success`);

      return {
        answer,
        citations: sampleRecords.map(r => createCitation(r)),
        disclaimer: this.MEDICAL_DISCLAIMER
      };
    }

    console.log(`[AI_QUERY] intent=DOCTOR_FACILITY patient=authenticated strategy=database records_found=0 status=empty`);
    return {
      answer: "I couldn't find any doctor records in your verified medical history.",
      citations: [],
      disclaimer: this.MEDICAL_DISCLAIMER
    };
  }

  /**
   * 9. GENERAL_MEDICAL_QUERY Handler
   * Patient-scoped RAG + structured database search fallback.
   */
  private static async handleGeneralMedicalQuery(
    patientId: string,
    query: string,
    allowedRecordIds?: string[]
  ): Promise<AIChatResponse> {
    // 1. Structured DB keyword check across diagnoses and findings
    const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2);
    let dbMatches: any[] = [];

    if (terms.length > 0) {
      const diagPlaceholders = terms.map(() => 'LOWER(d.diagnosis) LIKE ?').join(' OR ');
      const diagQuery = `
        SELECT d.diagnosis, mr.id as record_id, mr.title, mr.record_date, mr.hospital, mr.doctor
        FROM diagnoses d
        JOIN medical_records mr ON d.record_id = mr.id
        WHERE mr.patient_id = ? AND mr.verification_status = 'verified'
        ${allowedRecordIds ? `AND mr.id IN (${allowedRecordIds.map(() => '?').join(',')})` : ''}
        AND (${diagPlaceholders})
      `;
      const diagParams = [patientId, ...(allowedRecordIds || []), ...terms.map(t => `%${t}%`)];
      dbMatches = db.prepare(diagQuery).all(...diagParams) as any[];
    }

    if (dbMatches.length > 0) {
      let answer = `Based on your documented clinical diagnoses:\n\n`;
      const citationsMap = new Map<string, AICitation>();

      for (const m of dbMatches) {
        answer += `• **${m.diagnosis}** — Documented on ${formatDateDisplay(m.record_date)} at ${m.hospital} (*${m.title}*)\n`;
        if (!citationsMap.has(m.record_id)) {
          citationsMap.set(m.record_id, {
            record_id: m.record_id,
            record_title: m.title,
            record_type: 'Consultation',
            record_date: m.record_date,
            hospital: m.hospital,
            doctor: m.doctor,
            snippet: `Diagnosis: ${m.diagnosis}`
          });
        }
      }

      console.log(`[AI_QUERY] intent=GENERAL_MEDICAL_QUERY patient=authenticated strategy=hybrid records_found=${citationsMap.size} status=success`);

      return {
        answer,
        citations: Array.from(citationsMap.values()),
        disclaimer: this.MEDICAL_DISCLAIMER
      };
    }

    // 2. Vector RAG Retrieval
    const retrievedChunks = RAGService.retrieveRelevantChunks(
      patientId,
      query,
      allowedRecordIds,
      5
    );

    const hasRelevantData = retrievedChunks.length > 0 && retrievedChunks[0].score > 0.12;

    if (!hasRelevantData) {
      console.log(`[AI_QUERY] intent=GENERAL_MEDICAL_QUERY patient=authenticated strategy=rag records_found=0 status=not_found`);
      return {
        answer: "I couldn't find this information in the medical records available to me. Please check if the relevant report has been uploaded or shared.",
        citations: [],
        disclaimer: this.MEDICAL_DISCLAIMER
      };
    }

    // Build citations
    const citationMap = new Map<string, AICitation>();
    for (const chunk of retrievedChunks) {
      if (!citationMap.has(chunk.citation.record_id)) {
        citationMap.set(chunk.citation.record_id, chunk.citation);
      }
    }

    let answer = `Based on your verified medical records:\n\n`;
    for (const chunk of retrievedChunks.slice(0, 3)) {
      answer += `• ${chunk.chunkText.replace(/\n+/g, ' ')}\n`;
    }
    answer += `\n*Summary:* The retrieved records provide documented evidence corresponding to your query. Please inspect the citations below to view the original source documents.`;

    console.log(`[AI_QUERY] intent=GENERAL_MEDICAL_QUERY patient=authenticated strategy=rag records_found=${citationMap.size} status=success`);

    return {
      answer,
      citations: Array.from(citationMap.values()),
      disclaimer: this.MEDICAL_DISCLAIMER
    };
  }

  /**
   * Generates comprehensive structured clinical summary
   */
  public static async generateSummary(
    patientId: string,
    allowedRecordIds?: string[]
  ): Promise<MedicalSummaryResponse> {
    const profile = db.prepare('SELECT * FROM patient_profiles WHERE user_id = ?').get(patientId) as PatientProfile | undefined;
    const computedAge = profile?.date_of_birth ? calculateAge(profile.date_of_birth) : null;
    const age: number | string = computedAge !== null ? computedAge : 'Age not available';

    let recordsQuery = `
      SELECT * FROM medical_records 
      WHERE patient_id = ? AND verification_status = 'verified'
    `;
    if (allowedRecordIds && allowedRecordIds.length > 0) {
      recordsQuery += ` AND id IN (${allowedRecordIds.map(() => '?').join(',')})`;
    }
    recordsQuery += ` ORDER BY record_date DESC`;
    const records = db.prepare(recordsQuery).all(patientId, ...(allowedRecordIds || [])) as any[];

    let diagQuery = `
      SELECT DISTINCT d.diagnosis FROM diagnoses d
      JOIN medical_records mr ON d.record_id = mr.id
      WHERE d.patient_id = ? AND mr.verification_status = 'verified'
    `;
    if (allowedRecordIds && allowedRecordIds.length > 0) {
      diagQuery += ` AND mr.id IN (${allowedRecordIds.map(() => '?').join(',')})`;
    }
    const diagnoses = (db.prepare(diagQuery).all(patientId, ...(allowedRecordIds || [])) as any[]).map(d => d.diagnosis);

    let medQuery = `
      SELECT DISTINCT m.medication_name, m.dosage, m.frequency FROM medications m
      JOIN medical_records mr ON m.record_id = mr.id
      WHERE m.patient_id = ? AND mr.verification_status = 'verified'
    `;
    if (allowedRecordIds && allowedRecordIds.length > 0) {
      medQuery += ` AND mr.id IN (${allowedRecordIds.map(() => '?').join(',')})`;
    }
    const medications = (db.prepare(medQuery).all(patientId, ...(allowedRecordIds || [])) as any[]).map(m => ({
      name: m.medication_name,
      dosage: m.dosage,
      frequency: m.frequency
    }));

    let findingsQuery = `
      SELECT ef.name, ef.value, ef.unit, ef.abnormal_flag, mr.record_date 
      FROM extracted_findings ef
      JOIN medical_records mr ON ef.record_id = mr.id
      WHERE mr.patient_id = ? AND mr.verification_status = 'verified'
    `;
    if (allowedRecordIds && allowedRecordIds.length > 0) {
      findingsQuery += ` AND mr.id IN (${allowedRecordIds.map(() => '?').join(',')})`;
    }
    findingsQuery += ` ORDER BY mr.record_date DESC LIMIT 10`;
    const findings = (db.prepare(findingsQuery).all(patientId, ...(allowedRecordIds || [])) as any[]).map(f => ({
      test: f.name,
      value: `${f.value} ${f.unit || ''}`.trim(),
      date: f.record_date,
      flag: Boolean(f.abnormal_flag)
    }));

    const sourceRecords: AICitation[] = records.map(r => createCitation(r));

    let summaryText = `# PATIENT MEDICAL SUMMARY\n\n`;
    summaryText += `**Patient:** ${profile?.full_name || 'Patient'} | **Age:** ${age} | **Gender:** ${profile?.gender || 'N/A'} | **Blood Group:** ${profile?.blood_group || 'N/A'}\n\n`;
    
    summaryText += `### Known Conditions\n`;
    if (diagnoses.length > 0) {
      for (const d of diagnoses) summaryText += `• ${d}\n`;
    } else {
      summaryText += `• No chronic conditions documented in the shared records.\n`;
    }
    summaryText += `\n`;

    summaryText += `### Current Medications\n`;
    if (medications.length > 0) {
      for (const m of medications) summaryText += `• **${m.name}** ${m.dosage} — ${m.frequency}\n`;
    } else {
      summaryText += `• No active prescriptions recorded.\n`;
    }
    summaryText += `\n`;

    summaryText += `### Recent Investigations & Key Lab Trends\n`;
    if (findings.length > 0) {
      for (const f of findings.slice(0, 6)) {
        summaryText += `• **${f.test}**: ${f.value} (${formatDateDisplay(f.date)})${f.flag ? ' ⚠️ [Abnormal]' : ''}\n`;
      }
    } else {
      summaryText += `• No laboratory investigations on file.\n`;
    }
    summaryText += `\n`;

    summaryText += `### Historical Medical Reports\n`;
    summaryText += `Total of ${records.length} documented medical reports covering ${records[records.length - 1]?.record_date ? formatDateDisplay(records[records.length - 1].record_date) : 'N/A'} to ${records[0]?.record_date ? formatDateDisplay(records[0].record_date) : 'N/A'}.\n`;

    return {
      summary: summaryText,
      patientInfo: {
        fullName: profile?.full_name || 'Patient',
        dateOfBirth: profile?.date_of_birth || null,
        age,
        gender: profile?.gender || 'N/A',
        bloodGroup: profile?.blood_group || 'N/A',
        emergencyContact: profile?.emergency_contact || 'N/A'
      },
      knownConditions: diagnoses,
      currentMedications: medications,
      recentInvestigations: findings,
      sourceRecords
    };
  }
}
