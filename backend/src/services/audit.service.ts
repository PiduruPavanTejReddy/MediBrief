import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { AuditLog } from '../types';

export class AuditService {
  public static log(
    patientId: string,
    actorType: 'patient' | 'doctor' | 'system',
    actorId: string,
    action: string,
    metadata?: Record<string, any>
  ): AuditLog {
    const logEntry: AuditLog = {
      id: uuidv4(),
      patient_id: patientId,
      actor_type: actorType,
      actor_id: actorId,
      action,
      metadata_json: metadata ? JSON.stringify(metadata) : undefined,
      timestamp: new Date().toISOString()
    };

    const stmt = db.prepare(`
      INSERT INTO audit_logs (id, patient_id, actor_type, actor_id, action, metadata_json, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      logEntry.id,
      logEntry.patient_id,
      logEntry.actor_type,
      logEntry.actor_id,
      logEntry.action,
      logEntry.metadata_json || null,
      logEntry.timestamp
    );

    return logEntry;
  }

  public static getLogsForPatient(patientId: string, limit: number = 50): AuditLog[] {
    const stmt = db.prepare(`
      SELECT * FROM audit_logs 
      WHERE patient_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    return stmt.all(patientId, limit) as AuditLog[];
  }
}
