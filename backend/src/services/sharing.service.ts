import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { config } from '../config/env';
import { SharingSession, MedicalRecord, DoctorSessionPayload } from '../types';
import { AuditService } from './audit.service';

export interface CreateSharingSessionInput {
  patientId: string;
  scopeType: 'all' | 'date_range' | 'categories' | 'selected';
  categories?: string[];
  dateFrom?: string;
  dateTo?: string;
  selectedRecordIds?: string[];
}

export interface CreateSharingSessionResult {
  session: SharingSession;
  accessCode: string;
  qrCodeUrl: string;
  recordCount: number;
}

export interface VerifyDoctorCodeResult {
  doctorToken: string;
  sharingSessionId: string;
  patientId: string;
  recordCount: number;
}

export class SharingService {
  private static hashCode(code: string): string {
    const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return crypto.createHash('sha256').update(clean).digest('hex');
  }

  private static generateDisplayCode(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude ambiguous chars 0, 1, I, O
    const randomBytes = crypto.randomBytes(8);
    let part1 = '';
    let part2 = '';
    for (let i = 0; i < 4; i++) {
      part1 += chars[randomBytes[i] % chars.length];
    }
    for (let i = 4; i < 8; i++) {
      part2 += chars[randomBytes[i] % chars.length];
    }
    return `${part1}-${part2}`;
  }

  public static async createSession(input: CreateSharingSessionInput): Promise<CreateSharingSessionResult> {
    const accessCode = this.generateDisplayCode();
    const accessCodeHash = this.hashCode(accessCode);
    const sessionId = uuidv4();
    const now = new Date().toISOString();

    // Determine records within scope
    let recordsQuery = `SELECT id FROM medical_records WHERE patient_id = ?`;
    const params: any[] = [input.patientId];

    if (input.scopeType === 'date_range') {
      if (input.dateFrom) {
        recordsQuery += ` AND record_date >= ?`;
        params.push(input.dateFrom);
      }
      if (input.dateTo) {
        recordsQuery += ` AND record_date <= ?`;
        params.push(input.dateTo);
      }
    } else if (input.scopeType === 'categories' && input.categories && input.categories.length > 0) {
      const placeholders = input.categories.map(() => '?').join(',');
      recordsQuery += ` AND record_type IN (${placeholders})`;
      params.push(...input.categories);
    } else if (input.scopeType === 'selected' && input.selectedRecordIds && input.selectedRecordIds.length > 0) {
      const placeholders = input.selectedRecordIds.map(() => '?').join(',');
      recordsQuery += ` AND id IN (${placeholders})`;
      params.push(...input.selectedRecordIds);
    }

    const eligibleRecords = db.prepare(recordsQuery).all(...params) as { id: string }[];
    const recordIds = eligibleRecords.map(r => r.id);

    // Insert sharing session record
    const insertSessionStmt = db.prepare(`
      INSERT INTO sharing_sessions (
        id, patient_id, access_code_hash, access_code_display, 
        scope_type, scope_categories_json, scope_date_from, scope_date_to, 
        status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
    `);

    insertSessionStmt.run(
      sessionId,
      input.patientId,
      accessCodeHash,
      accessCode,
      input.scopeType,
      input.categories ? JSON.stringify(input.categories) : null,
      input.dateFrom || null,
      input.dateTo || null,
      now
    );

    // Associate permitted record IDs
    const insertRecordStmt = db.prepare(`
      INSERT INTO sharing_session_records (id, session_id, record_id)
      VALUES (?, ?, ?)
    `);

    const linkRecordsTx = db.transaction((ids: string[]) => {
      for (const recId of ids) {
        insertRecordStmt.run(uuidv4(), sessionId, recId);
      }
    });
    linkRecordsTx(recordIds);

    // Audit log
    AuditService.log(input.patientId, 'patient', input.patientId, 'SHARING_CODE_GENERATED', {
      sessionId,
      scopeType: input.scopeType,
      recordCount: recordIds.length
    });

    const qrCodeUrl = `${config.clientUrl}/doctor?code=${encodeURIComponent(accessCode)}`;

    const sessionRecord = db.prepare('SELECT * FROM sharing_sessions WHERE id = ?').get(sessionId) as SharingSession;
    sessionRecord.record_count = recordIds.length;

    return {
      session: sessionRecord,
      accessCode,
      qrCodeUrl,
      recordCount: recordIds.length
    };
  }

  public static async verifyCode(accessCode: string): Promise<VerifyDoctorCodeResult> {
    const codeHash = this.hashCode(accessCode);

    const session = db.prepare(`
      SELECT * FROM sharing_sessions 
      WHERE access_code_hash = ?
    `).get(codeHash) as SharingSession | undefined;

    if (!session) {
      throw new Error('Invalid doctor access code. Please verify the code with the patient.');
    }

    if (session.status !== 'ACTIVE') {
      if (session.status === 'REVOKED') {
        throw new Error('This sharing session has been revoked by the patient.');
      }
      if (session.status === 'ENDED') {
        throw new Error('This doctor consultation session has already ended.');
      }
      throw new Error('This sharing session is no longer active.');
    }

    // Retrieve permitted record IDs
    const linkedRecords = db.prepare(`
      SELECT record_id FROM sharing_session_records 
      WHERE session_id = ?
    `).all(session.id) as { record_id: string }[];

    const permittedRecordIds = linkedRecords.map(r => r.record_id);
    const doctorSessionId = uuidv4();

    // Update doctor_session_id
    db.prepare('UPDATE sharing_sessions SET doctor_session_id = ? WHERE id = ?').run(
      doctorSessionId,
      session.id
    );

    // Issue doctor scoped JWT
    const payload: DoctorSessionPayload = {
      doctorSessionId,
      sharingSessionId: session.id,
      patientId: session.patient_id,
      role: 'doctor',
      permittedRecordIds
    };

    const doctorToken = jwt.sign(payload, config.jwtSecret, { expiresIn: '12h' });

    // Audit log
    AuditService.log(session.patient_id, 'doctor', doctorSessionId, 'DOCTOR_SESSION_STARTED', {
      sharingSessionId: session.id,
      recordCount: permittedRecordIds.length
    });

    return {
      doctorToken,
      sharingSessionId: session.id,
      patientId: session.patient_id,
      recordCount: permittedRecordIds.length
    };
  }

  public static async revokeSessionByPatient(patientId: string, sessionId: string): Promise<void> {
    const session = db.prepare('SELECT * FROM sharing_sessions WHERE id = ? AND patient_id = ?').get(
      sessionId,
      patientId
    ) as SharingSession | undefined;

    if (!session) {
      throw new Error('Sharing session not found or you do not have permission to revoke it.');
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE sharing_sessions 
      SET status = 'REVOKED', revoked_at = ?, revoked_by = 'patient' 
      WHERE id = ?
    `).run(now, sessionId);

    AuditService.log(patientId, 'patient', patientId, 'SHARING_SESSION_REVOKED', {
      sessionId
    });
  }

  public static async endSessionByDoctor(sharingSessionId: string, doctorSessionId: string): Promise<void> {
    const session = db.prepare('SELECT * FROM sharing_sessions WHERE id = ?').get(
      sharingSessionId
    ) as SharingSession | undefined;

    if (!session) {
      throw new Error('Session not found.');
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE sharing_sessions 
      SET status = 'ENDED', ended_at = ?, revoked_by = 'doctor' 
      WHERE id = ?
    `).run(now, sharingSessionId);

    AuditService.log(session.patient_id, 'doctor', doctorSessionId, 'DOCTOR_SESSION_ENDED', {
      sharingSessionId
    });
  }

  public static getActiveSessionsForPatient(patientId: string): SharingSession[] {
    const sessions = db.prepare(`
      SELECT s.*, COUNT(r.record_id) as record_count 
      FROM sharing_sessions s
      LEFT JOIN sharing_session_records r ON s.id = r.session_id
      WHERE s.patient_id = ? AND s.status = 'ACTIVE'
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `).all(patientId) as any[];

    return sessions;
  }

  public static getSharedRecords(sharingSessionId: string): MedicalRecord[] {
    const rows = db.prepare(`
      SELECT mr.* FROM medical_records mr
      JOIN sharing_session_records ssr ON mr.id = ssr.record_id
      WHERE ssr.session_id = ?
      ORDER BY mr.record_date DESC
    `).all(sharingSessionId) as any[];

    return rows.map(r => {
      const findings = db.prepare('SELECT * FROM extracted_findings WHERE record_id = ?').all(r.id);
      const meds = db.prepare('SELECT * FROM medications WHERE record_id = ?').all(r.id);
      const diags = db.prepare('SELECT * FROM diagnoses WHERE record_id = ?').all(r.id);
      return {
        ...r,
        findings,
        medications: meds,
        diagnoses: diags
      };
    });
  }
}
