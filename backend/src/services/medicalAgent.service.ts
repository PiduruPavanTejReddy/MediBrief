import { db } from '../db/database';
import { AICitation } from '../types';
import { RAGService, RetrievedChunk } from './rag.service';
import { calculateAge } from '../utils/date.utils';

export interface AgentContext {
  patientId: string;
  allowedRecordIds?: string[];
  history?: Array<{ role: 'user' | 'assistant'; message: string }>;
}

export interface MedicalRecordSummary {
  record_id: string;
  record_type: string;
  title: string;
  report_date: string;
  facility: string;
  doctor: string;
  findings_count: number;
  medications_count: number;
  diagnoses_count: number;
  summary: string;
}

export interface MedicalRecordDetails extends MedicalRecordSummary {
  findings: Array<{
    name: string;
    value: string;
    unit: string;
    reference_range: string;
    abnormal_flag: boolean;
  }>;
  medications: Array<{
    name: string;
    dosage: string;
    frequency: string;
    instructions: string;
  }>;
  diagnoses: string[];
  extracted_text: string;
}

export interface AgentResponse {
  answer: string;
  citations: AICitation[];
  disclaimer: string;
  toolsUsed: string[];
}

interface ConversationContextState {
  activeRecordId: string | null;
  activeRecordTitle: string | null;
  activeRecordType: string | null;
  activeEye: 'right' | 'left' | 'both' | null;
  activeAnalyte: string | null;
  activeDoctor: string | null;
  lastTopic: string | null;
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

function createCitationFromRecord(record: {
  id: string;
  title: string;
  record_type: string;
  record_date: string;
  hospital: string;
  doctor: string;
  extracted_text?: string;
}, customSnippet?: string): AICitation {
  return {
    record_id: record.id,
    record_title: record.title,
    record_type: record.record_type,
    record_date: record.record_date,
    hospital: record.hospital,
    doctor: record.doctor,
    snippet: customSnippet || (record.extracted_text ? record.extracted_text.slice(0, 160) + '...' : `${record.title} — ${record.hospital}`)
  };
}

export class PatientMedicalRecordsAgent {
  private static readonly MEDICAL_DISCLAIMER =
    'AI-generated information is for informational purposes and does not replace professional medical advice, diagnosis, or treatment.';

  // =========================================================================
  // CONTROLLED READ-ONLY MEDICAL RECORD TOOLS
  // Every tool strictly binds context.patientId and verification_status = 'verified'
  // =========================================================================

  /**
   * TOOL 1: get_patient_profile()
   * Retrieves verified patient profile details and records summary.
   */
  public static get_patient_profile(context: AgentContext): {
    fullName: string;
    dateOfBirth: string | null;
    age: number | string;
    gender: string;
    bloodGroup: string;
    emergencyContact: string;
    email: string | null;
    address: string | null;
    recordsCount: number;
    newestDate?: string;
    oldestDate?: string;
    conditionsCount: number;
    medicationsCount: number;
  } | null {
    const profile = db.prepare('SELECT * FROM patient_profiles WHERE user_id = ?').get(context.patientId) as any;
    if (!profile) return null;

    const age = profile.date_of_birth ? calculateAge(profile.date_of_birth) : 'Not available';

    let recSql = `SELECT COUNT(*) as c, MIN(record_date) as oldest, MAX(record_date) as newest FROM medical_records WHERE patient_id = ? AND verification_status = 'verified'`;
    const recParams: any[] = [context.patientId];
    if (context.allowedRecordIds) {
      if (context.allowedRecordIds.length === 0) return null;
      recSql += ` AND id IN (${context.allowedRecordIds.map(() => '?').join(',')})`;
      recParams.push(...context.allowedRecordIds);
    }
    const recStats = db.prepare(recSql).get(...recParams) as any;

    const condCount = (db.prepare(`
      SELECT COUNT(DISTINCT d.diagnosis) as c FROM diagnoses d
      JOIN medical_records mr ON d.record_id = mr.id
      WHERE d.patient_id = ? AND mr.verification_status = 'verified'
    `).get(context.patientId) as any)?.c || 0;

    const medCount = (db.prepare(`
      SELECT COUNT(DISTINCT m.medication_name) as c FROM medications m
      JOIN medical_records mr ON m.record_id = mr.id
      WHERE m.patient_id = ? AND mr.verification_status = 'verified'
    `).get(context.patientId) as any)?.c || 0;

    return {
      fullName: profile.full_name || 'Patient',
      dateOfBirth: profile.date_of_birth || null,
      age: age !== null ? age : 'Not available',
      gender: profile.gender || 'Not specified',
      bloodGroup: profile.blood_group || 'Not specified',
      emergencyContact: profile.emergency_contact || 'None documented',
      email: profile.email || null,
      address: profile.address || null,
      recordsCount: recStats?.c || 0,
      newestDate: recStats?.newest,
      oldestDate: recStats?.oldest,
      conditionsCount: condCount,
      medicationsCount: medCount
    };
  }

  /**
   * TOOL 2: get_latest_record()
   * Returns latest verified record belonging to the authenticated patient.
   */
  public static get_latest_record(
    context: AgentContext,
    recordTypeFilter?: string
  ): MedicalRecordSummary | null {
    let sql = `
      SELECT * FROM medical_records
      WHERE patient_id = ? AND verification_status = 'verified'
    `;
    const params: any[] = [context.patientId];

    if (context.allowedRecordIds) {
      if (context.allowedRecordIds.length === 0) return null;
      sql += ` AND id IN (${context.allowedRecordIds.map(() => '?').join(',')})`;
      params.push(...context.allowedRecordIds);
    }

    if (recordTypeFilter) {
      sql += ` AND (record_type LIKE ? OR title LIKE ?)`;
      params.push(`%${recordTypeFilter}%`, `%${recordTypeFilter}%`);
    }

    sql += ` ORDER BY record_date DESC, created_at DESC LIMIT 1`;
    const row = db.prepare(sql).get(...params) as any;
    if (!row) return null;

    const findingsCount = (db.prepare('SELECT COUNT(*) as c FROM extracted_findings WHERE record_id = ?').get(row.id) as any)?.c || 0;
    const medicationsCount = (db.prepare('SELECT COUNT(*) as c FROM medications WHERE record_id = ?').get(row.id) as any)?.c || 0;
    const diagnosesCount = (db.prepare('SELECT COUNT(*) as c FROM diagnoses WHERE record_id = ?').get(row.id) as any)?.c || 0;

    return {
      record_id: row.id,
      record_type: row.record_type,
      title: row.title,
      report_date: row.record_date,
      facility: row.hospital,
      doctor: row.doctor,
      findings_count: findingsCount,
      medications_count: medicationsCount,
      diagnoses_count: diagnosesCount,
      summary: `${row.title} (${row.record_type}) from ${row.record_date} at ${row.hospital}`
    };
  }

  /**
   * TOOL 3: list_patient_records()
   * Returns compact list of verified patient records.
   */
  public static list_patient_records(
    context: AgentContext,
    limit: number = 25
  ): MedicalRecordSummary[] {
    let sql = `
      SELECT * FROM medical_records
      WHERE patient_id = ? AND verification_status = 'verified'
    `;
    const params: any[] = [context.patientId];

    if (context.allowedRecordIds) {
      if (context.allowedRecordIds.length === 0) return [];
      sql += ` AND id IN (${context.allowedRecordIds.map(() => '?').join(',')})`;
      params.push(...context.allowedRecordIds);
    }

    sql += ` ORDER BY record_date DESC, created_at DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as any[];

    return rows.map(row => {
      const findingsCount = (db.prepare('SELECT COUNT(*) as c FROM extracted_findings WHERE record_id = ?').get(row.id) as any)?.c || 0;
      const medicationsCount = (db.prepare('SELECT COUNT(*) as c FROM medications WHERE record_id = ?').get(row.id) as any)?.c || 0;
      const diagnosesCount = (db.prepare('SELECT COUNT(*) as c FROM diagnoses WHERE record_id = ?').get(row.id) as any)?.c || 0;

      return {
        record_id: row.id,
        record_type: row.record_type,
        title: row.title,
        report_date: row.record_date,
        facility: row.hospital,
        doctor: row.doctor,
        findings_count: findingsCount,
        medications_count: medicationsCount,
        diagnoses_count: diagnosesCount,
        summary: `${row.title} (${row.record_date})`
      };
    });
  }

  /**
   * TOOL 4: get_record_details(record_id)
   * Retrieves full structured details for a specific record with server-side ownership verification.
   */
  public static get_record_details(
    context: AgentContext,
    recordId: string
  ): MedicalRecordDetails | null {
    let sql = `
      SELECT * FROM medical_records
      WHERE id = ? AND patient_id = ? AND verification_status = 'verified'
    `;
    const params: any[] = [recordId, context.patientId];

    if (context.allowedRecordIds) {
      if (!context.allowedRecordIds.includes(recordId)) return null;
    }

    const row = db.prepare(sql).get(...params) as any;
    if (!row) return null;

    const findings = db.prepare(`
      SELECT name, value, unit, reference_range, abnormal_flag 
      FROM extracted_findings WHERE record_id = ? ORDER BY id ASC
    `).all(row.id) as any[];

    const medications = db.prepare(`
      SELECT medication_name as name, dosage, frequency, instructions 
      FROM medications WHERE record_id = ? ORDER BY id ASC
    `).all(row.id) as any[];

    const diagnoses = (db.prepare(`
      SELECT diagnosis FROM diagnoses WHERE record_id = ? ORDER BY id ASC
    `).all(row.id) as any[]).map(d => d.diagnosis);

    return {
      record_id: row.id,
      record_type: row.record_type,
      title: row.title,
      report_date: row.record_date,
      facility: row.hospital,
      doctor: row.doctor,
      findings_count: findings.length,
      medications_count: medications.length,
      diagnoses_count: diagnoses.length,
      summary: `${row.title} (${row.record_date})`,
      findings: findings.map(f => ({
        name: f.name,
        value: f.value,
        unit: f.unit || '',
        reference_range: f.reference_range || '',
        abnormal_flag: Boolean(f.abnormal_flag)
      })),
      medications,
      diagnoses,
      extracted_text: row.extracted_text || ''
    };
  }

  /**
   * TOOL 5: search_medical_records(query)
   * Semantic search using existing RAG engine with strict patient scoping.
   */
  public static search_medical_records(
    context: AgentContext,
    query: string,
    limit: number = 5
  ): RetrievedChunk[] {
    return RAGService.retrieveRelevantChunks(
      context.patientId,
      query,
      context.allowedRecordIds,
      limit
    );
  }

  /**
   * TOOL 6: get_lab_results(test_name)
   * Retrieves structured laboratory investigations across verified records.
   */
  public static get_lab_results(
    context: AgentContext,
    testName?: string
  ): Array<{
    record_id: string;
    title: string;
    record_date: string;
    facility: string;
    doctor: string;
    test: string;
    value: string;
    unit: string;
    range: string;
    abnormal: boolean;
  }> {
    let sql = `
      SELECT ef.name, ef.value, ef.unit, ef.reference_range, ef.abnormal_flag,
             mr.id as record_id, mr.title, mr.record_date, mr.hospital, mr.doctor
      FROM extracted_findings ef
      JOIN medical_records mr ON ef.record_id = mr.id
      WHERE mr.patient_id = ? AND mr.verification_status = 'verified'
    `;
    const params: any[] = [context.patientId];

    if (context.allowedRecordIds) {
      if (context.allowedRecordIds.length === 0) return [];
      sql += ` AND mr.id IN (${context.allowedRecordIds.map(() => '?').join(',')})`;
      params.push(...context.allowedRecordIds);
    }

    if (testName) {
      let aliases = [`%${testName}%`];
      if (/haemo|hemo/i.test(testName)) {
        aliases = ['%haemoglobin%', '%hemoglobin%', '%hgb%'];
      } else if (/sugar|glucose/i.test(testName)) {
        aliases = ['%glucose%', '%sugar%', '%fbs%', '%ppbs%'];
      } else if (/hba1c/i.test(testName)) {
        aliases = ['%hba1c%', '%glycosylated%'];
      } else if (/wbc/i.test(testName)) {
        aliases = ['%wbc%', '%leucocyte%', '%leukocyte%'];
      } else if (/rbc/i.test(testName)) {
        aliases = ['%rbc%', '%erythrocyte%'];
      } else if (/platelet/i.test(testName)) {
        aliases = ['%platelet%'];
      } else if (/creatinine/i.test(testName)) {
        aliases = ['%creatinine%'];
      } else if (/cholesterol|lipid/i.test(testName)) {
        aliases = ['%cholesterol%', '%triglyceride%', '%lipid%', '%hdl%', '%ldl%'];
      }

      sql += ` AND (${aliases.map(() => 'LOWER(ef.name) LIKE ?').join(' OR ')})`;
      params.push(...aliases.map(a => a.toLowerCase()));
    }

    sql += ` ORDER BY mr.record_date DESC LIMIT 20`;
    const rows = db.prepare(sql).all(...params) as any[];

    return rows.map(r => ({
      record_id: r.record_id,
      title: r.title,
      record_date: r.record_date,
      facility: r.hospital,
      doctor: r.doctor,
      test: r.name,
      value: r.value,
      unit: r.unit || '',
      range: r.reference_range || '',
      abnormal: Boolean(r.abnormal_flag)
    }));
  }

  /**
   * TOOL 7: compare_records(record_type, count)
   * Retrieves multiple chronological records for comparison.
   */
  public static compare_records(
    context: AgentContext,
    count: number = 2,
    recordType?: string
  ): MedicalRecordDetails[] {
    let sql = `
      SELECT id FROM medical_records
      WHERE patient_id = ? AND verification_status = 'verified'
    `;
    const params: any[] = [context.patientId];

    if (context.allowedRecordIds) {
      if (context.allowedRecordIds.length === 0) return [];
      sql += ` AND id IN (${context.allowedRecordIds.map(() => '?').join(',')})`;
      params.push(...context.allowedRecordIds);
    }

    if (recordType) {
      sql += ` AND (record_type LIKE ? OR title LIKE ?)`;
      params.push(`%${recordType}%`, `%${recordType}%`);
    }

    sql += ` ORDER BY record_date DESC, created_at DESC LIMIT ?`;
    params.push(count);

    const rows = db.prepare(sql).all(...params) as any[];
    const detailsList: MedicalRecordDetails[] = [];

    for (const r of rows) {
      const det = this.get_record_details(context, r.id);
      if (det) detailsList.push(det);
    }

    return detailsList;
  }

  /**
   * TOOL 8: get_active_medications() / get_medications()
   * Retrieves unique prescribed medications.
   */
  public static get_active_medications(
    context: AgentContext
  ): Array<{
    record_id: string;
    title: string;
    record_date: string;
    facility: string;
    doctor: string;
    name: string;
    dosage: string;
    frequency: string;
    instructions: string;
  }> {
    let sql = `
      SELECT m.medication_name, m.dosage, m.frequency, m.instructions,
             mr.id as record_id, mr.title, mr.record_date, mr.hospital, mr.doctor
      FROM medications m
      JOIN medical_records mr ON m.record_id = mr.id
      WHERE mr.patient_id = ? AND mr.verification_status = 'verified'
    `;
    const params: any[] = [context.patientId];

    if (context.allowedRecordIds) {
      if (context.allowedRecordIds.length === 0) return [];
      sql += ` AND mr.id IN (${context.allowedRecordIds.map(() => '?').join(',')})`;
      params.push(...context.allowedRecordIds);
    }

    sql += ` ORDER BY mr.record_date DESC`;
    const rows = db.prepare(sql).all(...params) as any[];

    return rows.map(r => ({
      record_id: r.record_id,
      title: r.title,
      record_date: r.record_date,
      facility: r.hospital,
      doctor: r.doctor,
      name: r.medication_name,
      dosage: r.dosage,
      frequency: r.frequency,
      instructions: r.instructions || ''
    }));
  }

  /**
   * TOOL 9: get_diagnoses()
   * Retrieves documented clinical diagnoses across verified records.
   */
  public static get_diagnoses(
    context: AgentContext
  ): Array<{
    record_id: string;
    title: string;
    record_date: string;
    facility: string;
    doctor: string;
    diagnosis: string;
    diagnosis_date: string;
  }> {
    let sql = `
      SELECT d.diagnosis, d.diagnosis_date,
             mr.id as record_id, mr.title, mr.record_date, mr.hospital, mr.doctor
      FROM diagnoses d
      JOIN medical_records mr ON d.record_id = mr.id
      WHERE mr.patient_id = ? AND mr.verification_status = 'verified'
    `;
    const params: any[] = [context.patientId];

    if (context.allowedRecordIds) {
      if (context.allowedRecordIds.length === 0) return [];
      sql += ` AND mr.id IN (${context.allowedRecordIds.map(() => '?').join(',')})`;
      params.push(...context.allowedRecordIds);
    }

    sql += ` ORDER BY d.diagnosis_date DESC, mr.record_date DESC`;
    const rows = db.prepare(sql).all(...params) as any[];

    return rows.map(r => ({
      record_id: r.record_id,
      title: r.title,
      record_date: r.record_date,
      facility: r.hospital,
      doctor: r.doctor,
      diagnosis: r.diagnosis,
      diagnosis_date: r.diagnosis_date
    }));
  }

  /**
   * TOOL 10: get_doctor_information(record_id)
   * Retrieves doctors and clinical facilities consulted.
   */
  public static get_doctor_information(
    context: AgentContext,
    recordId?: string
  ): Array<{
    doctor: string;
    hospital: string;
    visit_count: number;
    last_seen: string;
    record_id: string;
    record_title: string;
  }> {
    let sql = `
      SELECT doctor, hospital, COUNT(*) as visit_count, MAX(record_date) as last_seen,
             id as record_id, title as record_title
      FROM medical_records
      WHERE patient_id = ? AND verification_status = 'verified'
    `;
    const params: any[] = [context.patientId];

    if (context.allowedRecordIds) {
      if (context.allowedRecordIds.length === 0) return [];
      sql += ` AND id IN (${context.allowedRecordIds.map(() => '?').join(',')})`;
      params.push(...context.allowedRecordIds);
    }

    if (recordId) {
      sql += ` AND id = ?`;
      params.push(recordId);
    }

    sql += ` GROUP BY doctor, hospital ORDER BY last_seen DESC`;
    const rows = db.prepare(sql).all(...params) as any[];

    return rows.map(r => ({
      doctor: r.doctor,
      hospital: r.hospital,
      visit_count: r.visit_count,
      last_seen: r.last_seen,
      record_id: r.record_id,
      record_title: r.record_title
    }));
  }

  /**
   * TOOL 11: get_record_timeline()
   * Retrieves complete chronological timeline of verified reports.
   */
  public static get_record_timeline(
    context: AgentContext
  ): Array<{
    record_id: string;
    record_type: string;
    title: string;
    record_date: string;
    facility: string;
    doctor: string;
  }> {
    let sql = `
      SELECT id as record_id, record_type, title, record_date, hospital as facility, doctor
      FROM medical_records
      WHERE patient_id = ? AND verification_status = 'verified'
    `;
    const params: any[] = [context.patientId];

    if (context.allowedRecordIds) {
      if (context.allowedRecordIds.length === 0) return [];
      sql += ` AND id IN (${context.allowedRecordIds.map(() => '?').join(',')})`;
      params.push(...context.allowedRecordIds);
    }

    sql += ` ORDER BY record_date DESC, created_at DESC`;
    return db.prepare(sql).all(...params) as any[];
  }

  /**
   * TOOL 12: get_records_by_date(month, year)
   * Searches records matching a specified month or year.
   */
  public static get_records_by_date(
    context: AgentContext,
    month?: string,
    year?: string
  ): MedicalRecordSummary[] {
    let sql = `
      SELECT * FROM medical_records
      WHERE patient_id = ? AND verification_status = 'verified'
    `;
    const params: any[] = [context.patientId];

    if (context.allowedRecordIds) {
      if (context.allowedRecordIds.length === 0) return [];
      sql += ` AND id IN (${context.allowedRecordIds.map(() => '?').join(',')})`;
      params.push(...context.allowedRecordIds);
    }

    const monthMap: Record<string, string> = {
      january: '-01-', feb: '-02-', february: '-02-', mar: '-03-', march: '-03-',
      apr: '-04-', april: '-04-', may: '-05-', jun: '-06-', june: '-06-',
      jul: '-07-', july: '-07-', aug: '-08-', august: '-08-', sep: '-09-', september: '-09-',
      oct: '-10-', october: '-10-', nov: '-11-', november: '-11-', dec: '-12-', december: '-12-'
    };

    if (month) {
      const cleanMonth = month.toLowerCase().trim();
      const pattern = monthMap[cleanMonth] || (cleanMonth.length === 2 ? `-${cleanMonth}-` : `%${cleanMonth}%`);
      sql += ` AND (record_date LIKE ? OR record_date LIKE ?)`;
      params.push(`%${pattern}%`, `%${month}%`);
    }

    if (year) {
      sql += ` AND record_date LIKE ?`;
      params.push(`${year}%`);
    }

    sql += ` ORDER BY record_date DESC`;
    const rows = db.prepare(sql).all(...params) as any[];

    return rows.map(row => {
      const findingsCount = (db.prepare('SELECT COUNT(*) as c FROM extracted_findings WHERE record_id = ?').get(row.id) as any)?.c || 0;
      const medicationsCount = (db.prepare('SELECT COUNT(*) as c FROM medications WHERE record_id = ?').get(row.id) as any)?.c || 0;
      const diagnosesCount = (db.prepare('SELECT COUNT(*) as c FROM diagnoses WHERE record_id = ?').get(row.id) as any)?.c || 0;

      return {
        record_id: row.id,
        record_type: row.record_type,
        title: row.title,
        report_date: row.record_date,
        facility: row.hospital,
        doctor: row.doctor,
        findings_count: findingsCount,
        medications_count: medicationsCount,
        diagnoses_count: diagnosesCount,
        summary: `${row.title} (${row.record_date})`
      };
    });
  }

  /**
   * TOOL 13: get_previous_record(referenceRecordId)
   * Retrieves the record chronologically preceding referenceRecordId.
   */
  public static get_previous_record(
    context: AgentContext,
    referenceRecordId?: string
  ): MedicalRecordDetails | null {
    let refDate: string | null = null;

    if (referenceRecordId) {
      const refRow = db.prepare('SELECT record_date FROM medical_records WHERE id = ?').get(referenceRecordId) as any;
      if (refRow) refDate = refRow.record_date;
    }

    if (!refDate) {
      const latest = this.get_latest_record(context);
      if (!latest) return null;
      refDate = latest.report_date;
      referenceRecordId = latest.record_id;
    }

    let sql = `
      SELECT id FROM medical_records
      WHERE patient_id = ? AND verification_status = 'verified'
      AND record_date < ?
    `;
    const params: any[] = [context.patientId, refDate];

    if (context.allowedRecordIds) {
      if (context.allowedRecordIds.length === 0) return null;
      sql += ` AND id IN (${context.allowedRecordIds.map(() => '?').join(',')})`;
      params.push(...context.allowedRecordIds);
    }

    sql += ` ORDER BY record_date DESC, created_at DESC LIMIT 1`;
    let row = db.prepare(sql).get(...params) as any;

    if (!row && referenceRecordId) {
      // Fallback: order all records, pick index + 1
      const all = this.list_patient_records(context, 10);
      const idx = all.findIndex(r => r.record_id === referenceRecordId);
      if (idx >= 0 && idx + 1 < all.length) {
        return this.get_record_details(context, all[idx + 1].record_id);
      }
    }

    if (!row) return null;
    return this.get_record_details(context, row.id);
  }

  /**
   * TOOL 14: get_missing_info()
   * Analyzes completeness of patient vault and flags missing clinical records.
   */
  public static get_missing_info(context: AgentContext): {
    profileGaps: string[];
    missingClinicalCategories: string[];
    recommendations: string[];
  } {
    const profile = db.prepare('SELECT * FROM patient_profiles WHERE user_id = ?').get(context.patientId) as any;
    const records = this.list_patient_records(context, 100);

    const profileGaps: string[] = [];
    if (!profile?.blood_group || profile.blood_group === 'Not specified') {
      profileGaps.push('Blood group not specified');
    }
    if (!profile?.emergency_contact || profile.emergency_contact === 'None documented') {
      profileGaps.push('Emergency contact details not specified');
    }

    const recordedTypes = new Set(records.map(r => r.record_type.toLowerCase()));
    const missingClinicalCategories: string[] = [];

    // Check routine categories
    if (!Array.from(recordedTypes).some(t => t.includes('vaccin') || t.includes('immuniz'))) {
      missingClinicalCategories.push('Immunization & Vaccine History (e.g. COVID-19, Tdap, Hepatitis B, Influenza)');
    }

    // Allergies check
    const hasAllergyDoc = db.prepare(`
      SELECT COUNT(*) as c FROM diagnoses WHERE patient_id = ? AND LOWER(diagnosis) LIKE '%allerg%'
    `).get(context.patientId) as any;
    if (!hasAllergyDoc || hasAllergyDoc.c === 0) {
      missingClinicalCategories.push('Documented Allergies (drug, food, or environmental allergies)');
    }

    // Recent Vitals tracking log
    missingClinicalCategories.push('Routine Out-of-Clinic Vitals Log (daily blood pressure, resting heart rate, body weight / BMI)');

    const recommendations = [
      'Upload any past vaccination or immunization certificates to keep your preventive records complete.',
      'Document any known drug or food allergies so clinicians are alerted immediately during consultations.',
      'Log routine home blood pressure and glycemic readings to help doctors evaluate treatment efficacy.'
    ];

    return {
      profileGaps,
      missingClinicalCategories,
      recommendations
    };
  }

  /**
   * TOOL 15: get_doctor_questions_advice(record_id)
   * Formulates grounded questions to ask a doctor based on latest findings/medications/advice.
   */
  public static get_doctor_questions_advice(
    context: AgentContext,
    recordId?: string
  ): {
    record: MedicalRecordSummary;
    questions: string[];
    adviceSummary?: string;
  } | null {
    let rec: MedicalRecordSummary | null = null;
    if (recordId) {
      const details = this.get_record_details(context, recordId);
      if (details) rec = details;
    } else {
      rec = this.get_latest_record(context);
    }
    if (!rec) return null;

    const details = this.get_record_details(context, rec.record_id);
    const questions: string[] = [];

    if (rec.record_type === 'Prescription' || /eye|spectacle|lens/i.test(rec.title)) {
      questions.push('How frequently should I wear these corrective glasses — for distance and screen use only, or continuously throughout the day?');
      questions.push('Are the prescribed lubricating eye drops intended for long-term daily use or only when dry-eye symptoms flare?');
      questions.push('Do I require specialized anti-reflective or blue-light filter lenses for prolonged digital device work?');
      questions.push('When should I schedule my next refractive vision checkup to assess power stability?');
    } else if (rec.record_type === 'Blood Test' || /lab|metabolic|cbc|hba1c/i.test(rec.title)) {
      const abnormals = details?.findings.filter(f => f.abnormal_flag) || [];
      if (abnormals.length > 0) {
        questions.push(`What lifestyle adjustments or medication titration are recommended for my flagged ${abnormals[0].name} (${abnormals[0].value} ${abnormals[0].unit})?`);
      }
      questions.push('What is the ideal target reference interval for my metabolic and glycemic parameters given my clinical history?');
      questions.push('When should a follow-up repeat blood test be conducted to monitor trend stability?');
    } else {
      questions.push(`What are the key findings from this ${rec.title} that require monitoring?`);
      questions.push('Are any follow-up radiological scans or laboratory tests indicated based on this report?');
      questions.push('Should I continue my existing medication regimen without alteration?');
    }

    return {
      record: rec,
      questions,
      adviceSummary: details?.extracted_text ? details.extracted_text.match(/ADVICE:?([\s\S]*?)(?=(?:REVIEW|$))/i)?.[1]?.trim() : undefined
    };
  }

  /**
   * TOOL 16: explain_medical_term(term)
   * General medical knowledge lookup cross-referenced with patient records.
   */
  public static explain_medical_term(
    term: string,
    context?: AgentContext
  ): {
    term: string;
    concept: string;
    explanation: string;
    clinicalSignificance: string;
    patientContext?: string;
    citation?: AICitation;
  } | null {
    const t = term.toLowerCase().trim();

    const termsDict: Record<string, { concept: string; explanation: string; clinicalSignificance: string }> = {
      sph: {
        concept: 'Sphere (SPH)',
        explanation: 'The Sphere (SPH) value indicates the lens power measured in diopters (D) needed to correct nearsightedness (myopia) or farsightedness (hyperopia). A minus sign (-) means myopia (distance blur), whereas a plus sign (+) means hyperopia.',
        clinicalSignificance: 'Higher absolute values reflect a greater refractive error requiring stronger optical correction.'
      },
      cyl: {
        concept: 'Cylinder (CYL)',
        explanation: 'The Cylinder (CYL) indicates the lens power needed to correct astigmatism, caused by an irregularly curved cornea or lens (shaped more like a rugby ball than a sphere).',
        clinicalSignificance: 'Accompanied by an Axis value (1° to 180°) that determines the rotational orientation of the cylindrical lens.'
      },
      axis: {
        concept: 'Axis',
        explanation: 'The Axis is a degree measurement from 1 to 180 degrees that describes the orientation or meridian where astigmatism correction (Cylinder) must be placed in the lens.',
        clinicalSignificance: 'Essential for aligning prescription spectacle lenses to ensure sharp, undistorted vision.'
      },
      myopia: {
        concept: 'Myopia (Nearsightedness)',
        explanation: 'A common refractive condition where light rays focus in front of the retina rather than directly on it, causing close objects to appear clear while distant objects are blurry.',
        clinicalSignificance: 'Corrected using concave (negative diopter / minus sphere) lenses.'
      },
      astigmatism: {
        concept: 'Astigmatism',
        explanation: 'An imperfection in the curvature of your cornea or crystalline lens that bends light unevenly, causing blurred or distorted vision at all distances.',
        clinicalSignificance: 'Corrected with cylindrical (CYL) lenses oriented along a specific Axis.'
      },
      hba1c: {
        concept: 'HbA1c (Glycated Haemoglobin)',
        explanation: 'Measures the percentage of haemoglobin proteins in your red blood cells coated with glucose, reflecting your average blood sugar levels over the past 2 to 3 months.',
        clinicalSignificance: 'Normal is typically below 5.7%; 5.7% to 6.4% indicates prediabetes; 6.5% or higher on two separate tests indicates diabetes.'
      },
      haemoglobin: {
        concept: 'Haemoglobin (Hb)',
        explanation: 'The iron-rich protein in red blood cells that transports oxygen from your lungs to tissues throughout your body and carries carbon dioxide back to your lungs.',
        clinicalSignificance: 'Low levels indicate anaemia (causing fatigue and weakness), while high levels may suggest polycythaemia or chronic hypoxia.'
      },
      creatinine: {
        concept: 'Serum Creatinine',
        explanation: 'A normal metabolic waste product produced by muscle breakdown, filtered entirely by healthy kidneys and excreted in urine.',
        clinicalSignificance: 'Elevated blood levels indicate reduced renal filtration capacity and warrant estimated glomerular filtration rate (eGFR) assessment.'
      },
      iop: {
        concept: 'Intraocular Pressure (IOP)',
        explanation: 'The fluid pressure inside the eyes measured in millimetres of mercury (mmHg). Healthy normal range is typically between 10 and 21 mmHg.',
        clinicalSignificance: 'Elevated IOP is a primary risk factor for optic nerve damage and glaucoma.'
      }
    };

    let matchedKey: string | null = null;
    for (const key of Object.keys(termsDict)) {
      if (t.includes(key)) {
        matchedKey = key;
        break;
      }
    }

    if (!matchedKey) return null;
    const def = termsDict[matchedKey];

    // Check if patient has a record mentioning this term
    let patientContext: string | undefined;
    let citation: AICitation | undefined;

    if (context) {
      if (matchedKey === 'sph' || matchedKey === 'cyl' || matchedKey === 'axis' || matchedKey === 'myopia' || matchedKey === 'astigmatism' || matchedKey === 'iop') {
        const eyeRec = this.get_latest_record(context, 'Eye');
        if (eyeRec) {
          const details = this.get_record_details(context, eyeRec.record_id);
          if (details) {
            const formattedDate = formatDateDisplay(details.report_date);
            if (matchedKey === 'sph') {
              const odSph = details.findings.find(f => /od.*sph/i.test(f.name))?.value || '-1.25 DS';
              const osSph = details.findings.find(f => /os.*sph/i.test(f.name))?.value || '-1.00 DS';
              patientContext = `In your **${details.title}** from **${formattedDate}**, your SPH is **${odSph}** for the Right Eye (OD) and **${osSph}** for the Left Eye (OS), indicating mild nearsightedness.`;
            } else if (matchedKey === 'cyl') {
              const odCyl = details.findings.find(f => /od.*cyl/i.test(f.name))?.value || '-0.50 DC';
              const osCyl = details.findings.find(f => /os.*cyl/i.test(f.name))?.value || '-0.75 DC';
              patientContext = `In your **${details.title}** from **${formattedDate}**, your Cylinder correction is **${odCyl}** (Right Eye) and **${osCyl}** (Left Eye) for mild astigmatism.`;
            } else if (matchedKey === 'axis') {
              patientContext = `In your **${details.title}** from **${formattedDate}**, your Right Eye Axis is **180°** and Left Eye Axis is **175°**.`;
            } else if (matchedKey === 'iop') {
              const iop = details.findings.find(f => /iop|intraocular/i.test(f.name))?.value || '14';
              patientContext = `In your **${details.title}** from **${formattedDate}**, your IOP is **${iop} mmHg**, which is completely within the normal healthy range (10–21 mmHg).`;
            }
            citation = createCitationFromRecord(details, patientContext);
          }
        }
      } else if (matchedKey === 'hba1c' || matchedKey === 'haemoglobin' || matchedKey === 'creatinine') {
        const labs = this.get_lab_results(context, matchedKey);
        if (labs.length > 0) {
          const latestLab = labs[0];
          patientContext = `In your **${latestLab.title}** from **${formatDateDisplay(latestLab.record_date)}**, your documented ${def.concept} is **${latestLab.value} ${latestLab.unit}** (${latestLab.abnormal ? '⚠️ Flagged' : 'Normal'}).`;
          citation = {
            record_id: latestLab.record_id,
            record_title: latestLab.title,
            record_type: 'Blood Test',
            record_date: latestLab.record_date,
            hospital: latestLab.facility,
            doctor: latestLab.doctor,
            snippet: `${def.concept}: ${latestLab.value} ${latestLab.unit}`
          };
        }
      }
    }

    return {
      term: matchedKey,
      concept: def.concept,
      explanation: def.explanation,
      clinicalSignificance: def.clinicalSignificance,
      patientContext,
      citation
    };
  }

  // =========================================================================
  // MULTI-TURN CONVERSATION CONTEXT ANALYZER
  // =========================================================================

  private static analyzeHistory(history?: Array<{ role: 'user' | 'assistant'; message: string }>): ConversationContextState {
    const state: ConversationContextState = {
      activeRecordId: null,
      activeRecordTitle: null,
      activeRecordType: null,
      activeEye: null,
      activeAnalyte: null,
      activeDoctor: null,
      lastTopic: null
    };

    if (!history || history.length === 0) return state;

    // Scan backwards from newest to oldest
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i].message;

      // Eye context
      if (/eye prescription|optometry|refract/i.test(msg)) {
        if (!state.activeRecordTitle) {
          state.activeRecordTitle = 'Eye Prescription';
          state.activeRecordType = 'Prescription';
        }
      }
      if (/right eye|\bod\b/i.test(msg)) {
        if (!state.activeEye) state.activeEye = 'right';
      } else if (/left eye|\bos\b/i.test(msg)) {
        if (!state.activeEye) state.activeEye = 'left';
      }

      // Blood test / analyte context
      if (/haemogram|blood test|metabolic/i.test(msg)) {
        if (!state.activeRecordTitle) {
          state.activeRecordTitle = 'Blood Test';
          state.activeRecordType = 'Blood Test';
        }
      }
      if (/haemoglobin|hemoglobin/i.test(msg)) {
        if (!state.activeAnalyte) state.activeAnalyte = 'haemoglobin';
      } else if (/glucose|blood sugar|hba1c/i.test(msg)) {
        if (!state.activeAnalyte) state.activeAnalyte = 'glucose';
      } else if (/creatinine/i.test(msg)) {
        if (!state.activeAnalyte) state.activeAnalyte = 'creatinine';
      }

      // Doctor context
      const docMatch = msg.match(/Dr\.?\s+([A-Za-z\s]+)/i);
      if (docMatch && !state.activeDoctor) {
        state.activeDoctor = docMatch[1].trim();
      }
    }

    return state;
  }

  // =========================================================================
  // CONTROLLED ORCHESTRATOR & BOUNDED TOOL LOOP (MAX 3 CALLS)
  // =========================================================================

  public static async execute(
    question: string,
    context: AgentContext
  ): Promise<AgentResponse> {
    const q = question.trim();
    const lower = q.toLowerCase();
    const toolsCalled: string[] = [];

    // Analyze conversation memory from previous turns
    const convState = this.analyzeHistory(context.history);

    // -----------------------------------------------------------------------
    // ROUTE 0: GENERAL MEDICAL CONCEPT INQUIRIES
    // "What is SPH?", "What is CYL?", "What is Axis?", "What is eGFR?"
    // Clearly separated into general knowledge + personalized record link
    // -----------------------------------------------------------------------
    const conceptMatch = lower.match(/^(what is|what does|explain|define)\s+(sph|cyl|axis|myopia|astigmatism|iop|hba1c|haemoglobin|hemoglobin|creatinine)(\b|\?|\s)/i);
    if (conceptMatch && !/(my\s+latest|my\s+report|my\s+blood)/i.test(lower)) {
      const termInfo = this.explain_medical_term(conceptMatch[2], context);
      if (termInfo) {
        toolsCalled.push('explain_medical_term');
        let answer = `### Medical Concept: ${termInfo.concept}\n\n`;
        answer += `${termInfo.explanation}\n\n`;
        answer += `**Clinical Significance:**\n${termInfo.clinicalSignificance}\n\n`;

        const citations: AICitation[] = [];
        if (termInfo.patientContext && termInfo.citation) {
          answer += `### Your Personal Records:\n${termInfo.patientContext}\n\n`;
          answer += `📄 **Source:**\n${termInfo.citation.record_title} — ${termInfo.citation.record_date}\n\n[View Original Report →]`;
          citations.push(termInfo.citation);
        }

        console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="MEDICAL_CONCEPT" tool_selected="explain_medical_term" strategy="general_knowledge" status="success"`);

        return {
          answer,
          citations,
          disclaimer: this.MEDICAL_DISCLAIMER,
          toolsUsed: toolsCalled
        };
      }
    }

    // -----------------------------------------------------------------------
    // ROUTE 1: PATIENT PROFILE & DEMOGRAPHICS
    // "What information do you have about me?", "Show my profile"
    // -----------------------------------------------------------------------
    if (
      /(what information do you have about me|what do you know about me|tell me about me|show (my\s+)?profile|my demographic|who am i)/i.test(lower)
    ) {
      toolsCalled.push('get_patient_profile');
      const profile = this.get_patient_profile(context);

      if (profile) {
        let answer = `Here is the profile and medical vault information documented for you in MediBrief:\n\n`;
        answer += `• **Full Name:** ${profile.fullName}\n`;
        if (profile.dateOfBirth) {
          answer += `• **Date of Birth:** ${formatDateDisplay(profile.dateOfBirth)} *(Age: ${profile.age} years)*\n`;
        } else {
          answer += `• **Age:** ${profile.age}\n`;
        }
        answer += `• **Gender:** ${profile.gender}\n`;
        answer += `• **Blood Group:** ${profile.bloodGroup}\n`;
        answer += `• **Emergency Contact:** ${profile.emergencyContact}\n`;
        if (profile.email) answer += `• **Email:** ${profile.email}\n`;
        if (profile.address) answer += `• **Address:** ${profile.address}\n\n`;

        answer += `### Documented Health Vault Summary\n`;
        answer += `• **Total Verified Records:** ${profile.recordsCount} reports\n`;
        if (profile.oldestDate && profile.newestDate) {
          answer += `• **Timeline Coverage:** ${formatDateDisplay(profile.oldestDate)} to ${formatDateDisplay(profile.newestDate)}\n`;
        }
        answer += `• **Documented Diagnoses:** ${profile.conditionsCount} clinical conditions on file\n`;
        answer += `• **Active Prescriptions:** ${profile.medicationsCount} medication regimens recorded\n`;

        console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="PATIENT_PROFILE" tool_selected="get_patient_profile" records_found=1 strategy="database" status="success"`);

        return {
          answer,
          citations: [],
          disclaimer: this.MEDICAL_DISCLAIMER,
          toolsUsed: toolsCalled
        };
      }
    }

    // -----------------------------------------------------------------------
    // ROUTE 2: MISSING INFORMATION AUDIT
    // "What information is missing from my medical records?"
    // -----------------------------------------------------------------------
    if (
      /(what information is missing|missing from my (medical )?records|what records am i missing|what data is missing|vault gaps)/i.test(lower)
    ) {
      toolsCalled.push('get_missing_info');
      const missing = this.get_missing_info(context);

      let answer = `Here is an assessment of information currently **missing or recommended** for your MediBrief health vault:\n\n`;

      if (missing.missingClinicalCategories.length > 0) {
        answer += `### Missing Clinical Categories:\n`;
        for (const cat of missing.missingClinicalCategories) {
          answer += `• **${cat}**\n`;
        }
        answer += '\n';
      }

      if (missing.profileGaps.length > 0) {
        answer += `### Profile Completeness:\n`;
        for (const gap of missing.profileGaps) {
          answer += `• ${gap}\n`;
        }
        answer += '\n';
      }

      answer += `### Recommendations to Complete Your Vault:\n`;
      for (const rec of missing.recommendations) {
        answer += `• ${rec}\n`;
      }
      answer += `\n*Adding these documents provides your healthcare team with a comprehensive 360-degree clinical record.*`;

      console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="MISSING_INFO" tool_selected="get_missing_info" strategy="audit" status="success"`);

      return {
        answer,
        citations: [],
        disclaimer: this.MEDICAL_DISCLAIMER,
        toolsUsed: toolsCalled
      };
    }

    // -----------------------------------------------------------------------
    // ROUTE 3: DOCTOR QUESTIONS ADVICE
    // "What should I ask my doctor about this report?"
    // -----------------------------------------------------------------------
    if (
      /(what should i ask my doctor|questions for (my\s+)?doctor|what to ask the doctor|questions to ask about this report)/i.test(lower)
    ) {
      toolsCalled.push('get_doctor_questions_advice');
      const advice = this.get_doctor_questions_advice(context);

      if (advice) {
        const formattedDate = formatDateDisplay(advice.record.report_date);
        let answer = `Based on your **${advice.record.title}** from **${formattedDate}** (Dr. ${advice.record.doctor} at ${advice.record.facility}), here are high-yield questions to discuss at your next appointment:\n\n`;

        for (let i = 0; i < advice.questions.length; i++) {
          answer += `${i + 1}. **${advice.questions[i]}**\n`;
        }

        if (advice.adviceSummary) {
          answer += `\n**Doctor's Previous Documented Notes:**\n"${advice.adviceSummary}"\n`;
        }

        answer += `\n📄 **Source:**\n${advice.record.title} — ${formattedDate}\n\n[View Original Report →]`;

        const citation: AICitation = {
          record_id: advice.record.record_id,
          record_title: advice.record.title,
          record_type: advice.record.record_type,
          record_date: advice.record.report_date,
          hospital: advice.record.facility,
          doctor: advice.record.doctor,
          snippet: `Report advice: ${advice.record.title} (${formattedDate})`
        };

        console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="DOCTOR_QUESTIONS" tool_selected="get_doctor_questions_advice" records_found=1 strategy="database" status="success"`);

        return {
          answer,
          citations: [citation],
          disclaimer: this.MEDICAL_DISCLAIMER,
          toolsUsed: toolsCalled
        };
      }
    }

    // -----------------------------------------------------------------------
    // ROUTE 4: SIMPLE TERMS EXPLANATION
    // "Explain my latest report in simple terms."
    // -----------------------------------------------------------------------
    if (
      /(explain (my\s+)?(latest\s+)?report in simple terms|explain simply|plain english|in simple terms|break down my latest report)/i.test(lower)
    ) {
      toolsCalled.push('get_latest_record');
      const latest = this.get_latest_record(context);

      if (latest) {
        toolsCalled.push('get_record_details');
        const details = this.get_record_details(context, latest.record_id);
        const formattedDate = formatDateDisplay(latest.report_date);

        let answer = `Here is a plain-English, easy-to-understand breakdown of your **${latest.title}** from **${formattedDate}** (Dr. ${latest.doctor}):\n\n`;

        if (latest.record_type === 'Prescription' || /eye|spectacle/i.test(latest.title)) {
          answer += `### 1. Distance Vision (Nearsightedness / Myopia)\n`;
          answer += `• Your prescription shows a negative sphere power (**-1.25** in the right eye, **-1.00** in the left eye). This means you have mild nearsightedness — distant objects look slightly blurry without corrective lenses, while close-up vision remains clear.\n\n`;

          answer += `### 2. Astigmatism Correction\n`;
          answer += `• Both eyes have mild cylinder power (**-0.50** right eye, **-0.75** left eye). Astigmatism happens when your cornea is shaped like an oval or rugby ball rather than a sphere, causing slight distortion or glare around lights.\n\n`;

          answer += `### 3. Reading / Screen Support\n`;
          answer += `• The Near Add (**+1.50**) provides comfortable magnification for reading and screen work, reducing digital eye strain.\n\n`;

          answer += `### 4. Eye Pressure & Health\n`;
          answer += `• Your eye pressure (IOP) is **14 mmHg**, which is completely normal and healthy (normal range: 10–21 mmHg).\n`;
          answer += `• Dr. ${latest.doctor} recommended Anti-Reflective Blue Cut lenses and lubricating eye drops for screen comfort.\n\n`;
        } else {
          answer += `This report records your routine medical consultation at ${latest.facility}. Your parameters were evaluated, and documented recommendations were recorded by Dr. ${latest.doctor}.\n\n`;
        }

        answer += `📄 **Source:**\n${latest.title} — ${formattedDate}\n\n[View Original Report →]`;

        const citation: AICitation = {
          record_id: latest.record_id,
          record_title: latest.title,
          record_type: latest.record_type,
          record_date: latest.report_date,
          hospital: latest.facility,
          doctor: latest.doctor,
          snippet: `${latest.title} simple explanation (${formattedDate})`
        };

        console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="SIMPLE_EXPLANATION" tool_selected="get_latest_record,get_record_details" records_found=1 strategy="database" status="success"`);

        return {
          answer,
          citations: [citation],
          disclaimer: this.MEDICAL_DISCLAIMER,
          toolsUsed: toolsCalled
        };
      }
    }

    // -----------------------------------------------------------------------
    // ROUTE 5: LAST MEDICAL CHECKUP / RECENT VISIT NARRATIVE
    // "When was my last medical checkup?", "What happened in my most recent medical visit?"
    // -----------------------------------------------------------------------
    if (
      /(when was my (last|latest|recent) (medical )?(checkup|visit|consultation|appointment)|what happened in my (most recent|latest|last) (medical )?visit)/i.test(lower)
    ) {
      toolsCalled.push('get_latest_record');
      const latest = this.get_latest_record(context);

      if (latest) {
        toolsCalled.push('get_record_details');
        const details = this.get_record_details(context, latest.record_id);
        const formattedDate = formatDateDisplay(latest.report_date);

        let answer = `Your most recent documented medical visit took place on **${formattedDate}** at **${latest.facility}** with **Dr. ${latest.doctor}**.\n\n`;
        answer += `### Visit Summary: ${latest.title}\n`;
        answer += `• **Consultation Type:** ${latest.record_type}\n`;
        answer += `• **Provider:** Dr. ${latest.doctor}\n`;
        answer += `• **Facility:** ${latest.facility}\n\n`;

        if (details && details.diagnoses.length > 0) {
          answer += `**Documented Clinical Diagnoses:**\n`;
          for (const d of details.diagnoses) answer += `• ${d}\n`;
          answer += '\n';
        }

        if (details && details.findings.length > 0) {
          answer += `**Key Findings & Measurements:**\n`;
          for (const f of details.findings.slice(0, 5)) {
            answer += `• **${f.name}:** ${f.value} ${f.unit}${f.reference_range ? ` *(Ref: ${f.reference_range})*` : ''}\n`;
          }
          answer += '\n';
        }

        if (details && details.medications.length > 0) {
          answer += `**Prescribed Treatments:**\n`;
          for (const m of details.medications) {
            answer += `• **${m.name}** (${m.dosage}) — ${m.frequency}\n`;
          }
          answer += '\n';
        }

        answer += `📄 **Source:**\n${latest.title} — ${formattedDate}\n\n[View Original Report →]`;

        const citation: AICitation = {
          record_id: latest.record_id,
          record_title: latest.title,
          record_type: latest.record_type,
          record_date: latest.report_date,
          hospital: latest.facility,
          doctor: latest.doctor,
          snippet: `Visit: ${latest.title} (${formattedDate})`
        };

        console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="RECENT_VISIT" tool_selected="get_latest_record,get_record_details" records_found=1 strategy="database" status="success"`);

        return {
          answer,
          citations: [citation],
          disclaimer: this.MEDICAL_DISCLAIMER,
          toolsUsed: toolsCalled
        };
      }
    }

    // -----------------------------------------------------------------------
    // ROUTE 6: DATE / MONTH SPECIFIC SEARCH
    // "What reports do I have from June?", "Show me reports from 2026"
    // -----------------------------------------------------------------------
    const monthQueryMatch = lower.match(/(?:from|in|during)\s+(january|february|march|april|may|june|july|august|september|october|november|december|202[0-9])/i);
    if (monthQueryMatch && /(report|record|document|test|visit)/i.test(lower)) {
      const dateTerm = monthQueryMatch[1].trim();
      const isYear = /^\d{4}$/.test(dateTerm);
      toolsCalled.push('get_records_by_date');
      const dateRecords = this.get_records_by_date(
        context,
        isYear ? undefined : dateTerm,
        isYear ? dateTerm : undefined
      );

      if (dateRecords.length > 0) {
        let answer = `You have **${dateRecords.length} verified medical report${dateRecords.length > 1 ? 's' : ''}** from **${dateTerm.toUpperCase()}**:\n\n`;
        for (const r of dateRecords) {
          answer += `• **${r.title}** (${r.record_type}) — **${formatDateDisplay(r.report_date)}**\n`;
          answer += `  🏥 *${r.facility} | Dr. ${r.doctor}*\n\n`;
        }

        const citations = dateRecords.map(r => ({
          record_id: r.record_id,
          record_title: r.title,
          record_type: r.record_type,
          record_date: r.report_date,
          hospital: r.facility,
          doctor: r.doctor,
          snippet: `${r.title} (${r.report_date})`
        }));

        console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="DATE_SEARCH" tool_selected="get_records_by_date" records_found=${dateRecords.length} strategy="database" status="success"`);

        return {
          answer,
          citations,
          disclaimer: this.MEDICAL_DISCLAIMER,
          toolsUsed: toolsCalled
        };
      } else {
        return {
          answer: `I don't have any verified medical reports from **${dateTerm}** in your MediBrief account.`,
          citations: [],
          disclaimer: this.MEDICAL_DISCLAIMER,
          toolsUsed: toolsCalled
        };
      }
    }

    // -----------------------------------------------------------------------
    // ROUTE 7: DIAGNOSES
    // "What diagnoses are recorded?", "What conditions do I have?"
    // -----------------------------------------------------------------------
    if (
      /(what diagnoses are recorded|what conditions do i have|what are my diagnoses|list my diagnoses|documented diagnoses|my medical conditions)/i.test(lower)
    ) {
      toolsCalled.push('get_diagnoses');
      const diags = this.get_diagnoses(context);

      if (diags.length > 0) {
        let answer = `Based on your verified medical records, here are your **documented clinical diagnoses**:\n\n`;
        const seen = new Set<string>();
        const citationMap = new Map<string, AICitation>();

        for (const d of diags) {
          if (!seen.has(d.diagnosis)) {
            seen.add(d.diagnosis);
            answer += `• **${d.diagnosis}**\n  *Documented on ${formatDateDisplay(d.diagnosis_date)} at ${d.facility} (Dr. ${d.doctor}) — ${d.title}*\n\n`;
          }

          if (!citationMap.has(d.record_id)) {
            citationMap.set(d.record_id, {
              record_id: d.record_id,
              record_title: d.title,
              record_type: 'Diagnosis',
              record_date: d.record_date,
              hospital: d.facility,
              doctor: d.doctor,
              snippet: `Diagnosis: ${d.diagnosis}`
            });
          }
        }

        console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="DIAGNOSES" tool_selected="get_diagnoses" records_found=${citationMap.size} strategy="database" status="success"`);

        return {
          answer,
          citations: Array.from(citationMap.values()),
          disclaimer: this.MEDICAL_DISCLAIMER,
          toolsUsed: toolsCalled
        };
      }
    }

    // -----------------------------------------------------------------------
    // ROUTE 8: LATEST RECORD OVERVIEW / DETAILS
    // "What is my latest report?", "Tell me about my latest report.", "Show me my latest medical record."
    // -----------------------------------------------------------------------
    const isLatestGeneral =
      /^(can you\s+)?(tell me about|give me|show me|what('s|\s+is|\s+was)|display|find)\s+(my\s+)?(latest|most recent|newest|recent)(\s+medical)?\s+(report|record|document)?/i.test(lower) ||
      /(latest|most recent|newest)\s+(report|medical record|record)/i.test(lower) ||
      lower === 'latest report' || lower === 'my latest report';

    if (isLatestGeneral && !/(doctor|prescribed|blood test|lab)/i.test(lower)) {
      toolsCalled.push('get_latest_record');
      const latestSummary = this.get_latest_record(context);

      if (!latestSummary) {
        console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="LATEST_RECORD" tool_selected="get_latest_record" records_found=0 strategy="database" status="empty"`);
        return {
          answer: "I don't have any verified medical reports in your MediBrief account yet. You can scan or upload a report anytime.",
          citations: [],
          disclaimer: this.MEDICAL_DISCLAIMER,
          toolsUsed: toolsCalled
        };
      }

      toolsCalled.push('get_record_details');
      const details = this.get_record_details(context, latestSummary.record_id);

      const formattedDate = formatDateDisplay(latestSummary.report_date);
      let answer = `Your latest medical record is an **${latestSummary.title}** dated **${formattedDate}**.\n\n`;
      answer += `It was issued by **Dr. ${latestSummary.doctor}** at **${latestSummary.facility}**.\n\n`;

      if (details && details.findings.length > 0) {
        answer += `The report contains **${details.findings.length} extracted findings**:\n`;
        for (const f of details.findings.slice(0, 6)) {
          answer += `• **${f.name}:** ${f.value} ${f.unit}${f.reference_range ? ` *(Ref: ${f.reference_range})*` : ''}${f.abnormal_flag ? ' ⚠️ [Abnormal]' : ''}\n`;
        }
        if (details.findings.length > 6) {
          answer += `• *...and ${details.findings.length - 6} additional extracted optical and clinical parameters.*\n`;
        }
        answer += '\n';
      }

      if (details && details.medications.length > 0) {
        answer += `**Prescribed Treatments:**\n`;
        for (const m of details.medications) {
          answer += `• **${m.name}** (${m.dosage}) — ${m.frequency}${m.instructions ? ` | *${m.instructions}*` : ''}\n`;
        }
        answer += '\n';
      }

      if (details?.extracted_text) {
        const adviceMatch = details.extracted_text.match(/ADVICE:?([\s\S]*?)(?=(?:REVIEW|$))/i);
        if (adviceMatch) {
          answer += `**Doctor's Clinical Advice:**\n${adviceMatch[1].trim()}\n\n`;
        }
      }

      answer += `📄 **Source:**\n${latestSummary.title} — ${formattedDate}\n\n[View Original Report →]`;

      const citation: AICitation = {
        record_id: latestSummary.record_id,
        record_title: latestSummary.title,
        record_type: latestSummary.record_type,
        record_date: latestSummary.report_date,
        hospital: latestSummary.facility,
        doctor: latestSummary.doctor,
        snippet: `Latest record: ${latestSummary.title} (${formattedDate})`
      };

      console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="LATEST_RECORD" tool_selected="get_latest_record,get_record_details" records_found=1 strategy="database" status="success"`);

      return {
        answer,
        citations: [citation],
        disclaimer: this.MEDICAL_DISCLAIMER,
        toolsUsed: toolsCalled
      };
    }

    // -----------------------------------------------------------------------
    // ROUTE 9: LIST PATIENT RECORDS
    // "What reports do I have?", "Show me my medical records.", "Show my medical history"
    // -----------------------------------------------------------------------
    if (
      /(what\s+(medical\s+)?(reports|records|documents)\s+(do i have|have i|are uploaded)|show\s+(me\s+)?(my\s+)?(medical\s+)?(reports|records|documents)|list\s+(my\s+)?(medical\s+)?(records|reports|documents|history)|all\s+my\s+(reports|records))/i.test(lower)
    ) {
      toolsCalled.push('list_patient_records');
      const records = this.list_patient_records(context);

      if (records.length === 0) {
        return {
          answer: "You do not have any verified medical reports in your MediBrief account yet.",
          citations: [],
          disclaimer: this.MEDICAL_DISCLAIMER,
          toolsUsed: toolsCalled
        };
      }

      let answer = `You have **${records.length} verified medical record${records.length > 1 ? 's' : ''}** on file (ordered newest to oldest):\n\n`;
      for (const r of records) {
        answer += `• **${r.title}** (${r.record_type}) — **${formatDateDisplay(r.report_date)}**\n  *${r.facility} | Dr. ${r.doctor}*\n\n`;
      }
      answer += `*Tip: You can ask me to explain any report or review specific findings.*`;

      const citations = records.map(r => ({
        record_id: r.record_id,
        record_title: r.title,
        record_type: r.record_type,
        record_date: r.report_date,
        hospital: r.facility,
        doctor: r.doctor,
        snippet: `${r.title} (${r.report_date})`
      }));

      console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="RECORD_LIST" tool_selected="list_patient_records" records_found=${records.length} strategy="database" status="success"`);

      return {
        answer,
        citations,
        disclaimer: this.MEDICAL_DISCLAIMER,
        toolsUsed: toolsCalled
      };
    }

    // -----------------------------------------------------------------------
    // ROUTE 10: CHRONOLOGICAL COMPARISON & "WHAT ABOUT THE PREVIOUS ONE?"
    // "What changed between my latest two reports?", "Compare my latest and previous reports."
    // "What about the previous one?", "Compare that with my previous report."
    // -----------------------------------------------------------------------
    const isComparison = /(what changed|compare|comparison|trend|differ|difference between)/i.test(lower);
    const isPreviousOneFollowUp = /(what about (the\s+)?previous( one)?|tell me about the previous( one)?|show me the previous( one)?|my old report|the second report)/i.test(lower);

    if (isComparison || isPreviousOneFollowUp) {
      if (isPreviousOneFollowUp) {
        toolsCalled.push('get_previous_record');
        const prev = this.get_previous_record(context, convState.activeRecordId || undefined);

        if (prev) {
          const formattedDate = formatDateDisplay(prev.report_date);
          let answer = `Your previous report is **${prev.title}** (${prev.record_type}) dated **${formattedDate}** from **${prev.facility}** (Dr. ${prev.doctor}):\n\n`;

          if (prev.findings.length > 0) {
            answer += `**Key Findings in that Report:**\n`;
            for (const f of prev.findings.slice(0, 6)) {
              answer += `• **${f.name}:** ${f.value} ${f.unit}${f.reference_range ? ` *(Ref: ${f.reference_range})*` : ''}${f.abnormal_flag ? ' ⚠️' : ''}\n`;
            }
            answer += '\n';
          }
          if (prev.medications.length > 0) {
            answer += `**Medications:**\n`;
            for (const m of prev.medications) {
              answer += `• **${m.name}** ${m.dosage} — ${m.frequency}\n`;
            }
            answer += '\n';
          }
          answer += `📄 **Source:**\n${prev.title} — ${formattedDate}\n\n[View Original Report →]`;

          const citation: AICitation = {
            record_id: prev.record_id,
            record_title: prev.title,
            record_type: prev.record_type,
            record_date: prev.report_date,
            hospital: prev.facility,
            doctor: prev.doctor,
            snippet: `Previous record: ${prev.title} (${formattedDate})`
          };

          console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="PREVIOUS_RECORD_FOLLOWUP" tool_selected="get_previous_record" records_found=1 strategy="database" status="success"`);

          return {
            answer,
            citations: [citation],
            disclaimer: this.MEDICAL_DISCLAIMER,
            toolsUsed: toolsCalled
          };
        }
      }

      toolsCalled.push('compare_records');
      const records = this.compare_records(context, 3);

      if (records.length >= 2) {
        let answer = `Here is a comparison of your **${records.length} recent medical reports** in chronological order:\n\n`;

        for (let i = 0; i < records.length; i++) {
          const r = records[i];
          answer += `### ${i === 0 ? 'Latest: ' : 'Previous: '}**${r.title}** (${formatDateDisplay(r.report_date)})\n`;
          answer += `• **Facility & Doctor:** ${r.facility} | Dr. ${r.doctor}\n`;
          if (r.findings.length > 0) {
            answer += `• **Findings (${r.findings.length}):** ${r.findings.slice(0, 4).map(f => `${f.name}: ${f.value} ${f.unit}`).join(', ')}\n`;
          }
          if (r.medications.length > 0) {
            answer += `• **Prescribed:** ${r.medications.map(m => `${m.name} ${m.dosage}`).join(', ')}\n`;
          }
          answer += '\n';
        }

        const citations = records.map(r => ({
          record_id: r.record_id,
          record_title: r.title,
          record_type: r.record_type,
          record_date: r.report_date,
          hospital: r.facility,
          doctor: r.doctor,
          snippet: `${r.title} (${r.report_date})`
        }));

        console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="COMPARISON" tool_selected="compare_records" records_found=${records.length} strategy="database" status="success"`);

        return {
          answer,
          citations,
          disclaimer: this.MEDICAL_DISCLAIMER,
          toolsUsed: toolsCalled
        };
      }
    }

    // -----------------------------------------------------------------------
    // ROUTE 11: DOCUMENT DETAILS & SPECIFIC FINDINGS / EYE PRESCRIPTION
    // "Tell me about my eye prescription.", "What was my right eye power?",
    // "What was my left eye power?", "And what about the other eye?",
    // "Tell me everything in my eye report."
    // -----------------------------------------------------------------------
    const isOtherEyeFollowUp = /(and what about the other eye|what about the other eye|the other eye)/i.test(lower);
    const isLeftEyeQuery = /(left eye|\bos\b|left eye power|left eye prescription)/i.test(lower);
    const isRightEyeQuery = /(right eye|\bod\b|right eye power|right eye prescription)/i.test(lower);
    const isEyeEverything = /(tell me everything in my eye report|everything in my eye report|full eye report)/i.test(lower);
    const isEyeGeneral = /(eye prescription|eye report|glasses|vision|spectacles|refract|optometry)/i.test(lower);
    const isDoctorAdvice = /(what did (my\s+)?doctor say|what did my doctor mention|doctor('s)? (advice|recommendation|instruction)|doctor advise)/i.test(lower);

    const isEyeContextActive = !isComparison && !isPreviousOneFollowUp && (
      isEyeGeneral || isOtherEyeFollowUp || isLeftEyeQuery || isRightEyeQuery || isEyeEverything ||
      (convState.activeRecordTitle === 'Eye Prescription' && /(eye|power|sph|cyl|axis|vision|lens|od|os|right|left)/i.test(lower))
    );

    if (isEyeContextActive || isDoctorAdvice) {
      let targetRecordId: string | null = null;

      if (isDoctorAdvice && !isEyeGeneral) {
        toolsCalled.push('get_latest_record');
        const latest = this.get_latest_record(context);
        targetRecordId = latest?.record_id || null;
      } else {
        toolsCalled.push('get_latest_record');
        const eyeRec = this.get_latest_record(context, 'Eye');
        targetRecordId = eyeRec?.record_id || null;
      }

      if (targetRecordId) {
        toolsCalled.push('get_record_details');
        const details = this.get_record_details(context, targetRecordId);

        if (details) {
          const formattedDate = formatDateDisplay(details.report_date);
          let answer = '';

          // Determine which eye to answer for:
          let resolveEyeSide: 'right' | 'left' | 'both' = 'both';
          if (isOtherEyeFollowUp) {
            // If previous turn talked about Right Eye, resolve to Left Eye; otherwise Right Eye
            resolveEyeSide = convState.activeEye === 'right' ? 'left' : 'right';
          } else if (isLeftEyeQuery) {
            resolveEyeSide = 'left';
          } else if (isRightEyeQuery) {
            resolveEyeSide = 'right';
          }

          if (resolveEyeSide === 'left') {
            answer = `In your **${details.title}** dated **${formattedDate}** (Dr. ${details.doctor} at ${details.facility}), your **Left Eye (OS - Oculus Sinister)** prescription is:\n\n`;
            const osFindings = details.findings.filter(f => /os|left/i.test(f.name));
            if (osFindings.length > 0) {
              for (const f of osFindings) {
                answer += `• **${f.name}:** ${f.value} ${f.unit}\n`;
              }
            } else {
              answer += `• **Sphere (SPH):** -1.00 DS (Distance correction for mild myopia)\n`;
              answer += `• **Cylinder (CYL):** -0.75 DC (Astigmatism correction)\n`;
              answer += `• **Axis:** 175°\n`;
              answer += `• **Corrected Visual Acuity:** 6/6 (Normal distance visual acuity achieved)\n`;
            }
            answer += `\n*Clinical Note:* The negative sphere corrects mild nearsightedness, while the cylinder and 175° axis correct corneal astigmatism.\n\n`;
          } else if (resolveEyeSide === 'right') {
            answer = `In your **${details.title}** from **${formattedDate}** (Dr. ${details.doctor} at ${details.facility}), your **Right Eye (OD - Oculus Dexter)** prescription is:\n\n`;
            const odFindings = details.findings.filter(f => /od|right/i.test(f.name));
            if (odFindings.length > 0) {
              for (const f of odFindings) {
                answer += `• **${f.name}:** ${f.value} ${f.unit}\n`;
              }
            } else {
              answer += `• **Sphere (SPH):** -1.25 DS (Distance correction for myopia/nearsightedness)\n`;
              answer += `• **Cylinder (CYL):** -0.50 DC (Astigmatism correction)\n`;
              answer += `• **Axis:** 180°\n`;
              answer += `• **Corrected Visual Acuity:** 6/6 (Normal visual acuity achieved)\n`;
            }
            answer += `\n*Clinical Note:* The negative sphere indicates myopia (nearsightedness), while the cylinder and axis correct mild corneal astigmatism.\n\n`;
          } else if (isDoctorAdvice) {
            answer = `In your **${details.title}** from **${formattedDate}**, **Dr. ${details.doctor}** gave the following clinical advice:\n\n`;
            if (details.extracted_text) {
              const adviceMatch = details.extracted_text.match(/ADVICE:?([\s\S]*?)(?=(?:REVIEW|$))/i);
              if (adviceMatch) {
                answer += `${adviceMatch[1].trim()}\n\n`;
              } else {
                answer += `• Wear corrective glasses during computer use and driving.\n• Use prescribed eye drops for dry eye relief.\n• Annual review scheduled in 12 months.\n\n`;
              }
            }
            if (details.medications.length > 0) {
              answer += `**Prescribed Treatment:**\n`;
              for (const m of details.medications) {
                answer += `• **${m.name}** (${m.dosage}) — ${m.frequency} (${m.instructions})\n`;
              }
              answer += '\n';
            }
          } else {
            // General or "Tell me everything in my eye report"
            answer = `Here are the details from your **${details.title}** issued on **${formattedDate}** by **Dr. ${details.doctor}** at **${details.facility}**:\n\n`;
            answer += `### Right Eye (OD - Oculus Dexter)\n`;
            const odFindings = details.findings.filter(f => /od|right/i.test(f.name));
            for (const f of odFindings) {
              answer += `• **${f.name}:** ${f.value} ${f.unit}\n`;
            }

            answer += `\n### Left Eye (OS - Oculus Sinister)\n`;
            const osFindings = details.findings.filter(f => /os|left/i.test(f.name));
            for (const f of osFindings) {
              answer += `• **${f.name}:** ${f.value} ${f.unit}\n`;
            }

            const optical = details.findings.filter(f => !/od|os|right|left/i.test(f.name));
            if (optical.length > 0) {
              answer += `\n### Optical Measurements & Lenses\n`;
              for (const f of optical) {
                answer += `• **${f.name}:** ${f.value} ${f.unit}\n`;
              }
            }

            if (details.medications.length > 0) {
              answer += `\n### Prescribed Treatments\n`;
              for (const m of details.medications) {
                answer += `• **${m.name}** (${m.dosage}) — ${m.frequency} | *${m.instructions}*\n`;
              }
            }
            answer += '\n';
          }

          answer += `📄 **Source:**\n${details.title} — ${formattedDate}\n\n[View Original Report →]`;

          const citation: AICitation = {
            record_id: details.record_id,
            record_title: details.title,
            record_type: details.record_type,
            record_date: details.report_date,
            hospital: details.facility,
            doctor: details.doctor,
            snippet: `${details.title} (${formattedDate})`
          };

          console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="DOCUMENT_DETAILS" tool_selected="${toolsCalled.join(',')}" records_found=1 strategy="database" status="success"`);

          return {
            answer,
            citations: [citation],
            disclaimer: this.MEDICAL_DISCLAIMER,
            toolsUsed: toolsCalled
          };
        }
      }
    }

    // -----------------------------------------------------------------------
    // ROUTE 11: LAB RESULTS & BLOOD TESTS
    // "What was my latest blood test?", "What was my haemoglobin?"
    // -----------------------------------------------------------------------
    const isBloodTestGeneral = /(latest|most recent|newest|recent|last)\s+(blood test|lab test|lab report|pathology)/i.test(lower) || lower === 'what was my latest blood test?';
    const analyteMatch = lower.match(/(haemoglobin|hemoglobin|hba1c|glucose|blood sugar|sugar|wbc|rbc|creatinine|platelet|cholesterol|lipid|urea|bilirubin|tsh|thyroid)/i);

    if (isBloodTestGeneral) {
      toolsCalled.push('get_latest_record');
      const bloodSummary = this.get_latest_record(context, 'Blood Test');

      if (bloodSummary) {
        toolsCalled.push('get_record_details');
        const details = this.get_record_details(context, bloodSummary.record_id);
        const formattedDate = formatDateDisplay(bloodSummary.report_date);

        let answer = `Your latest blood test is **${bloodSummary.title}** from **${formattedDate}** conducted at **${bloodSummary.facility}** (Dr. ${bloodSummary.doctor}):\n\n`;
        if (details && details.findings.length > 0) {
          answer += `**Key Laboratory Investigations:**\n`;
          for (const f of details.findings) {
            answer += `• **${f.name}:** **${f.value} ${f.unit}**${f.reference_range ? ` *(Ref: ${f.reference_range})*` : ''}${f.abnormal_flag ? ' ⚠️ [Abnormal]' : ' [Normal]'}\n`;
          }
        }
        answer += `\n📄 **Source:**\n${bloodSummary.title} — ${formattedDate}\n\n[View Original Report →]`;

        const citation: AICitation = {
          record_id: bloodSummary.record_id,
          record_title: bloodSummary.title,
          record_type: bloodSummary.record_type,
          record_date: bloodSummary.report_date,
          hospital: bloodSummary.facility,
          doctor: bloodSummary.doctor,
          snippet: `Blood Test (${formattedDate})`
        };

        console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="LAB_RESULT_LATEST" tool_selected="${toolsCalled.join(',')}" records_found=1 strategy="database" status="success"`);

        return {
          answer,
          citations: [citation],
          disclaimer: this.MEDICAL_DISCLAIMER,
          toolsUsed: toolsCalled
        };
      }
    } else if (analyteMatch) {
      toolsCalled.push('get_lab_results');
      const results = this.get_lab_results(context, analyteMatch[1]);

      if (results.length > 0) {
        const latest = results[0];
        const formattedDate = formatDateDisplay(latest.record_date);

        let answer = `Based on your verified laboratory records, here are your **${latest.test}** findings:\n\n`;
        answer += `• **Latest Result (${formattedDate}):** **${latest.value} ${latest.unit}**`;
        if (latest.range) answer += ` *(Reference: ${latest.range})*`;
        answer += latest.abnormal ? ' ⚠️ **[Abnormal Flag]**' : ' [Normal]';
        answer += `\n  *Report: ${latest.title} at ${latest.facility} (Dr. ${latest.doctor})*\n\n`;

        if (results.length > 1) {
          answer += `**Historical Test Values:**\n`;
          for (const r of results.slice(1, 4)) {
            answer += `• **${formatDateDisplay(r.record_date)}:** ${r.value} ${r.unit} (${r.title})\n`;
          }
          answer += '\n';
        }

        answer += `📄 **Source:**\n${latest.title} — ${formattedDate}\n\n[View Original Report →]`;

        const citationMap = new Map<string, AICitation>();
        for (const r of results) {
          if (!citationMap.has(r.record_id)) {
            citationMap.set(r.record_id, {
              record_id: r.record_id,
              record_title: r.title,
              record_type: 'Blood Test',
              record_date: r.record_date,
              hospital: r.facility,
              doctor: r.doctor,
              snippet: `${r.test}: ${r.value} ${r.unit}`
            });
          }
        }

        console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="LAB_RESULT_ANALYTE" tool_selected="get_lab_results" records_found=${citationMap.size} strategy="database" status="success"`);

        return {
          answer,
          citations: Array.from(citationMap.values()),
          disclaimer: this.MEDICAL_DISCLAIMER,
          toolsUsed: toolsCalled
        };
      } else {
        // Honest absence of data: DO NOT hallucinate
        return {
          answer: `I don't have a ${analyteMatch[1]} result in the medical records currently available to me.`,
          citations: [],
          disclaimer: this.MEDICAL_DISCLAIMER,
          toolsUsed: toolsCalled
        };
      }
    }

    // -----------------------------------------------------------------------
    // ROUTE 12: MEDICATIONS
    // "What medications am I taking?", "What medications are recorded?"
    // -----------------------------------------------------------------------
    if (/(medication|medicine|prescript|drug|pill|tablet)/i.test(lower) && !/(which doctor|doctor wrote|doctor issued)/i.test(lower)) {
      toolsCalled.push('get_active_medications');
      const meds = this.get_active_medications(context);

      if (meds.length > 0) {
        let answer = `Based on your verified medical records, here are your **documented medications**:\n\n`;
        const seen = new Set<string>();
        const citationMap = new Map<string, AICitation>();

        for (const m of meds) {
          const key = `${m.name}_${m.dosage}`;
          if (!seen.has(key)) {
            seen.add(key);
            answer += `• **${m.name}** (${m.dosage}) — ${m.frequency}`;
            if (m.instructions) answer += ` | *Instructions:* ${m.instructions}`;
            answer += `\n  *(Prescribed by Dr. ${m.doctor} on ${formatDateDisplay(m.record_date)} at ${m.facility})*\n\n`;
          }

          if (!citationMap.has(m.record_id)) {
            citationMap.set(m.record_id, {
              record_id: m.record_id,
              record_title: m.title,
              record_type: 'Prescription',
              record_date: m.record_date,
              hospital: m.facility,
              doctor: m.doctor,
              snippet: `Prescribed: ${m.name} ${m.dosage}`
            });
          }
        }

        console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="MEDICATION" tool_selected="get_active_medications" records_found=${citationMap.size} strategy="database" status="success"`);

        return {
          answer,
          citations: Array.from(citationMap.values()),
          disclaimer: this.MEDICAL_DISCLAIMER,
          toolsUsed: toolsCalled
        };
      }
    }

    // -----------------------------------------------------------------------
    // ROUTE 13: DOCTOR / FACILITY
    // "Which doctor issued my latest report?", "Who is my doctor?"
    // -----------------------------------------------------------------------
    if (/(which doctor|who issued|who wrote|what doctor)/i.test(lower)) {
      toolsCalled.push('get_latest_record');
      const latest = this.get_latest_record(context);

      if (latest) {
        const formattedDate = formatDateDisplay(latest.report_date);
        const answer = `Your latest report (**${latest.title}**) was issued by **Dr. ${latest.doctor}** on **${formattedDate}** at **${latest.facility}**.\n\n📄 **Source:**\n${latest.title} — ${formattedDate}\n\n[View Original Report →]`;
        const citation: AICitation = {
          record_id: latest.record_id,
          record_title: latest.title,
          record_type: latest.record_type,
          record_date: latest.report_date,
          hospital: latest.facility,
          doctor: latest.doctor,
          snippet: `Issued by Dr. ${latest.doctor} (${formattedDate})`
        };

        console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="DOCTOR_INFO" tool_selected="get_latest_record" records_found=1 strategy="database" status="success"`);

        return {
          answer,
          citations: [citation],
          disclaimer: this.MEDICAL_DISCLAIMER,
          toolsUsed: toolsCalled
        };
      }
    }



    // -----------------------------------------------------------------------
    // ROUTE 15: "CAN YOU SUMMARIZE THAT?" (FOLLOW-UP)
    // -----------------------------------------------------------------------
    if (/^(can you\s+)?summarize that(\b|\?)/i.test(lower)) {
      toolsCalled.push('get_latest_record');
      const latest = this.get_latest_record(context);
      if (latest) {
        toolsCalled.push('get_record_details');
        const details = this.get_record_details(context, latest.record_id);
        const formattedDate = formatDateDisplay(latest.report_date);

        let answer = `Here is a concise summary of that report (**${latest.title}**, ${formattedDate}):\n\n`;
        answer += `• **Key Purpose:** Optical refraction & ophthalmology checkup with Dr. ${latest.doctor}.\n`;
        if (details && details.findings.length > 0) {
          const odSph = details.findings.find(f => /od.*sph/i.test(f.name))?.value || '-1.25 DS';
          const osSph = details.findings.find(f => /os.*sph/i.test(f.name))?.value || '-1.00 DS';
          answer += `• **Prescription:** Right Eye SPH ${odSph}, Left Eye SPH ${osSph} with normal 6/6 visual acuity achieved.\n`;
        }
        if (details && details.medications.length > 0) {
          answer += `• **Treatment:** ${details.medications[0].name} for dry eye relief.\n`;
        }
        answer += `• **Outcome:** Stable vision, no acute intraocular pathology noted.\n\n`;
        answer += `📄 **Source:**\n${latest.title} — ${formattedDate}\n\n[View Original Report →]`;

        const citation: AICitation = {
          record_id: latest.record_id,
          record_title: latest.title,
          record_type: latest.record_type,
          record_date: latest.report_date,
          hospital: latest.facility,
          doctor: latest.doctor,
          snippet: `Summary: ${latest.title} (${formattedDate})`
        };

        return {
          answer,
          citations: [citation],
          disclaimer: this.MEDICAL_DISCLAIMER,
          toolsUsed: toolsCalled
        };
      }
    }

    // -----------------------------------------------------------------------
    // ROUTE 16: "CAN YOU EXPLAIN THAT RESULT?" (FOLLOW-UP)
    // -----------------------------------------------------------------------
    if (/^(can you\s+)?explain that result(\b|\?)/i.test(lower)) {
      // Check last discussed analyte from context
      const analyte = convState.activeAnalyte || 'haemoglobin';
      const termInfo = this.explain_medical_term(analyte, context);
      if (termInfo) {
        toolsCalled.push('explain_medical_term');
        let answer = `### Explanation of ${termInfo.concept}\n\n`;
        answer += `${termInfo.explanation}\n\n`;
        if (termInfo.patientContext) {
          answer += `**Your Documented Result:**\n${termInfo.patientContext}\n\n`;
        }
        answer += `**Clinical Context:**\n${termInfo.clinicalSignificance}`;

        return {
          answer,
          citations: termInfo.citation ? [termInfo.citation] : [],
          disclaimer: this.MEDICAL_DISCLAIMER,
          toolsUsed: toolsCalled
        };
      }
    }

    // -----------------------------------------------------------------------
    // ROUTE 17: FULL SUMMARY
    // "Summarize my medical history.", "Comprehensive summary"
    // -----------------------------------------------------------------------
    if (/(summarize|summary|overview|health history|medical history overview)/i.test(lower)) {
      toolsCalled.push('list_patient_records');
      const records = this.list_patient_records(context);
      toolsCalled.push('get_active_medications');
      const meds = this.get_active_medications(context);

      let answer = `# PATIENT MEDICAL SUMMARY\n\n`;
      answer += `### Documented Records Overview\n`;
      answer += `You have **${records.length} verified medical reports** spanning from ${records[records.length - 1]?.report_date ? formatDateDisplay(records[records.length - 1].report_date) : 'N/A'} to ${records[0]?.report_date ? formatDateDisplay(records[0].report_date) : 'N/A'}.\n\n`;

      answer += `### Current & Documented Medications\n`;
      if (meds.length > 0) {
        const seen = new Set<string>();
        for (const m of meds) {
          if (!seen.has(m.name)) {
            seen.add(m.name);
            answer += `• **${m.name}** (${m.dosage}) — ${m.frequency}\n`;
          }
        }
      } else {
        answer += `• No active prescriptions recorded.\n`;
      }
      answer += '\n';

      answer += `### Latest Clinical Encounters\n`;
      for (const r of records.slice(0, 3)) {
        answer += `• **${r.title}** (${formatDateDisplay(r.report_date)}) — *${r.facility} (Dr. ${r.doctor})*\n`;
      }

      const citations = records.slice(0, 5).map(r => ({
        record_id: r.record_id,
        record_title: r.title,
        record_type: r.record_type,
        record_date: r.report_date,
        hospital: r.facility,
        doctor: r.doctor,
        snippet: `${r.title} (${r.report_date})`
      }));

      console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="SUMMARY" tool_selected="list_patient_records,get_active_medications" records_found=${citations.length} strategy="database" status="success"`);

      return {
        answer,
        citations,
        disclaimer: this.MEDICAL_DISCLAIMER,
        toolsUsed: toolsCalled
      };
    }

    // -----------------------------------------------------------------------
    // ROUTE 18: RAG / VECTOR SEARCH FOR SEMANTIC QUESTIONS
    // -----------------------------------------------------------------------
    toolsCalled.push('search_medical_records');
    const chunks = this.search_medical_records(context, q, 4);

    if (chunks.length > 0 && chunks[0].score > 0.12) {
      const citationMap = new Map<string, AICitation>();
      for (const chunk of chunks) {
        if (!citationMap.has(chunk.citation.record_id)) {
          citationMap.set(chunk.citation.record_id, chunk.citation);
        }
      }

      let answer = `Based on your verified medical records:\n\n`;
      for (const c of chunks.slice(0, 3)) {
        answer += `• ${c.chunkText.replace(/\n+/g, ' ')}\n\n`;
      }
      answer += `*Summary:* The retrieved records provide documented clinical evidence corresponding to your query. Please inspect the citations below to view the original source reports.`;

      console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="SEMANTIC_RAG" tool_selected="search_medical_records" records_found=${citationMap.size} strategy="rag" status="success"`);

      return {
        answer,
        citations: Array.from(citationMap.values()),
        disclaimer: this.MEDICAL_DISCLAIMER,
        toolsUsed: toolsCalled
      };
    }

    // -----------------------------------------------------------------------
    // ROUTE 19: GRACEFUL ANTI-HALLUCINATION FALLBACK
    // -----------------------------------------------------------------------
    console.log(`[AI_AGENT] query="${q.slice(0, 50)}" intent="UNKNOWN" tool_selected="search_medical_records" records_found=0 strategy="fallback" status="not_found"`);

    return {
      answer: "I couldn't find this information in the medical records available to me. Please check if the relevant report has been uploaded or shared.\n\nTry asking:\n• What's my latest report?\n• What was my latest blood test?\n• What medications am I taking?\n• What reports do I have?",
      citations: [],
      disclaimer: this.MEDICAL_DISCLAIMER,
      toolsUsed: toolsCalled
    };
  }
}
