import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { storageService } from '../services/storage.service';
import { ocrService } from '../services/ocr.service';
import { RAGService } from '../services/rag.service';
import { AuditService } from '../services/audit.service';
import { MedicalRecord } from '../types';

export class RecordController {
  public static async uploadDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'No document file uploaded' });
        return;
      }

      const patientId = req.patientId!;
      const file = req.file;

      // 1. Save file to secure storage
      const uploadResult = await storageService.saveFile(
        file.buffer,
        file.originalname,
        file.mimetype
      );

      // 2. Perform OCR and structured clinical extraction
      const ocrResult = await ocrService.processDocument(
        file.buffer,
        file.mimetype,
        file.originalname
      );

      // Generate signed preview URL for verification review
      const previewUrl = storageService.generateSignedUrl(uploadResult.fileKey, 60);

      AuditService.log(patientId, 'patient', patientId, 'DOCUMENT_OCR_PROCESSED', {
        fileName: file.originalname,
        fileKey: uploadResult.fileKey,
        detectedType: ocrResult.recordType
      });

      res.json({
        success: true,
        data: {
          fileKey: uploadResult.fileKey,
          fileName: uploadResult.fileName,
          fileSize: uploadResult.fileSize,
          mimeType: uploadResult.mimeType,
          previewUrl,
          ocrResult
        }
      });
    } catch (err: any) {
      console.error('[RecordController] uploadDocument error:', err);
      res.status(500).json({ success: false, error: err.message || 'Error processing document' });
    }
  }

  public static async verifyAndSaveRecord(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const patientId = req.patientId!;
      const {
        fileKey,
        fileName,
        fileSize,
        mimeType,
        title,
        recordType,
        hospital,
        doctor,
        recordDate,
        extractedText,
        findings,
        medications,
        diagnoses
      } = req.body;

      if (!fileKey || !title || !recordType || !recordDate) {
        res.status(400).json({
          success: false,
          error: 'Required fields missing: fileKey, title, recordType, and recordDate are mandatory.'
        });
        return;
      }

      const recordId = uuidv4();
      const now = new Date().toISOString();

      // Insert medical record
      const insertRecordStmt = db.prepare(`
        INSERT INTO medical_records (
          id, patient_id, record_type, title, hospital, doctor, 
          record_date, uploaded_at, original_file_key, file_name, 
          file_size, mime_type, extracted_text, verification_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', ?, ?)
      `);

      insertRecordStmt.run(
        recordId,
        patientId,
        recordType,
        title,
        hospital || 'Diagnostic Lab / Hospital',
        doctor || 'Attending Physician',
        recordDate,
        now,
        fileKey,
        fileName || 'medical_report',
        fileSize || 0,
        mimeType || 'application/pdf',
        extractedText || '',
        now,
        now
      );

      // Insert findings
      if (Array.isArray(findings) && findings.length > 0) {
        const insertFinding = db.prepare(`
          INSERT INTO extracted_findings (id, record_id, finding_type, name, value, unit, reference_range, abnormal_flag, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const f of findings) {
          insertFinding.run(
            uuidv4(),
            recordId,
            f.type || 'laboratory',
            f.name,
            f.value,
            f.unit || null,
            f.referenceRange || f.reference_range || null,
            f.isAbnormal || f.abnormal_flag ? 1 : 0,
            now
          );
        }
      }

      // Insert medications
      if (Array.isArray(medications) && medications.length > 0) {
        const insertMed = db.prepare(`
          INSERT INTO medications (id, patient_id, record_id, medication_name, dosage, frequency, duration, instructions, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const m of medications) {
          insertMed.run(
            uuidv4(),
            patientId,
            recordId,
            m.name || m.medication_name,
            m.dosage,
            m.frequency,
            m.duration || null,
            m.instructions || null,
            now
          );
        }
      }

      // Insert diagnoses
      if (Array.isArray(diagnoses) && diagnoses.length > 0) {
        const insertDiag = db.prepare(`
          INSERT INTO diagnoses (id, patient_id, record_id, diagnosis, diagnosis_date, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const d of diagnoses) {
          const diagStr = typeof d === 'string' ? d : d.diagnosis;
          insertDiag.run(uuidv4(), patientId, recordId, diagStr, recordDate, now);
        }
      }

      // Index for AI / RAG
      const fullRecord = db.prepare('SELECT * FROM medical_records WHERE id = ?').get(recordId) as MedicalRecord;
      RAGService.indexRecord(fullRecord, { findings, medications, diagnoses });

      // Audit log
      AuditService.log(patientId, 'patient', patientId, 'RECORD_VERIFIED_AND_SAVED', {
        recordId,
        title,
        recordType
      });

      res.status(201).json({
        success: true,
        data: {
          ...fullRecord,
          signedUrl: storageService.generateSignedUrl(fullRecord.original_file_key, 60)
        }
      });
    } catch (err: any) {
      console.error('[RecordController] verifyAndSaveRecord error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to save record' });
    }
  }

  public static async getRecords(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const patientId = req.patientId!;
      const { type, search, doctor, hospital, dateFrom, dateTo } = req.query;

      let query = `SELECT * FROM medical_records WHERE patient_id = ?`;
      const params: any[] = [patientId];

      if (type && type !== 'All') {
        query += ` AND record_type = ?`;
        params.push(type);
      }

      if (doctor) {
        query += ` AND doctor LIKE ?`;
        params.push(`%${doctor}%`);
      }

      if (hospital) {
        query += ` AND hospital LIKE ?`;
        params.push(`%${hospital}%`);
      }

      if (dateFrom) {
        query += ` AND record_date >= ?`;
        params.push(dateFrom);
      }

      if (dateTo) {
        query += ` AND record_date <= ?`;
        params.push(dateTo);
      }

      if (search) {
        query += ` AND (title LIKE ? OR extracted_text LIKE ? OR hospital LIKE ? OR doctor LIKE ?)`;
        const s = `%${search}%`;
        params.push(s, s, s, s);
      }

      query += ` ORDER BY record_date DESC, created_at DESC`;

      const records = db.prepare(query).all(...params) as MedicalRecord[];

      // Populate findings, medications, diagnoses, and signed URLs
      const enriched = records.map(r => {
        const findings = db.prepare('SELECT * FROM extracted_findings WHERE record_id = ?').all(r.id);
        const medications = db.prepare('SELECT * FROM medications WHERE record_id = ?').all(r.id);
        const diagnoses = db.prepare('SELECT * FROM diagnoses WHERE record_id = ?').all(r.id);
        const signedUrl = storageService.generateSignedUrl(r.original_file_key, 60);

        return {
          ...r,
          findings,
          medications,
          diagnoses,
          signedUrl
        };
      });

      res.json({ success: true, data: enriched });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getRecordById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const recordId = req.params.id;
      const patientId = req.patientId;
      const doctorSession = req.doctorSession;

      let record = db.prepare('SELECT * FROM medical_records WHERE id = ?').get(recordId) as MedicalRecord | undefined;

      if (!record) {
        res.status(404).json({ success: false, error: 'This medical record is no longer available.' });
        return;
      }

      // Security check: Must belong to patient OR be in doctor session whitelist
      if (patientId && record.patient_id !== patientId) {
        res.status(403).json({ success: false, error: 'Forbidden: Access denied to this patient record.' });
        return;
      }

      if (doctorSession) {
        if (record.patient_id !== doctorSession.patientId || !doctorSession.permittedRecordIds.includes(record.id)) {
          res.status(403).json({ success: false, error: 'Forbidden: This record was not shared in your doctor session.' });
          return;
        }

        // Audit doctor opening report
        AuditService.log(doctorSession.patientId, 'doctor', doctorSession.doctorSessionId, 'REPORT_VIEWED', {
          recordId: record.id,
          title: record.title,
          recordType: record.record_type
        });
      }

      const findings = db.prepare('SELECT * FROM extracted_findings WHERE record_id = ?').all(record.id);
      const medications = db.prepare('SELECT * FROM medications WHERE record_id = ?').all(record.id);
      const diagnoses = db.prepare('SELECT * FROM diagnoses WHERE record_id = ?').all(record.id);
      const signedUrl = storageService.generateSignedUrl(record.original_file_key, 60);

      res.json({
        success: true,
        data: {
          ...record,
          findings,
          medications,
          diagnoses,
          signedUrl
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async deleteRecord(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const patientId = req.patientId;
      if (!patientId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Patient login required' });
        return;
      }
      const recordId = String(req.params.id);

      // Verify that the record exists and strictly belongs to the authenticated patient
      const record = db.prepare('SELECT * FROM medical_records WHERE id = ? AND patient_id = ?').get(recordId, patientId) as MedicalRecord | undefined;
      if (!record) {
        res.status(404).json({ success: false, error: 'Record not found or you do not have permission to delete it.' });
        return;
      }

      // 1. Delete physical file from storage
      try {
        await storageService.deleteFile(record.original_file_key);
      } catch (fileErr: any) {
        console.warn(`[RecordController] Storage file deletion warning for ${record.original_file_key}:`, fileErr.message);
      }

      // 2. Cascade delete associated relational and vector data
      db.prepare('DELETE FROM document_embeddings WHERE record_id = ?').run(recordId);
      db.prepare('DELETE FROM extracted_findings WHERE record_id = ?').run(recordId);
      db.prepare('DELETE FROM medications WHERE record_id = ?').run(recordId);
      db.prepare('DELETE FROM diagnoses WHERE record_id = ?').run(recordId);
      db.prepare('DELETE FROM sharing_session_records WHERE record_id = ?').run(recordId);
      db.prepare('DELETE FROM medical_records WHERE id = ?').run(recordId);

      // 3. Log audit event
      AuditService.log(patientId, 'patient', patientId, 'RECORD_DELETED', {
        recordId,
        title: record.title
      });

      res.json({ success: true, message: 'Medical record deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static serveFile(req: Request, res: Response): void {
    try {
      const fileKey = String(req.params.key);
      const { expires, signature } = req.query as { expires?: string; signature?: string };

      if (!fileKey) {
        res.status(400).send('Missing file key');
        return;
      }

      // Validate signed URL
      if (!expires || !signature) {
        res.status(401).send('Unauthorized: Signed URL parameters missing');
        return;
      }

      const isValid = storageService.verifySignedUrl(
        fileKey,
        parseInt(expires, 10),
        signature
      );

      if (!isValid) {
        res.status(403).send('Forbidden: Download link expired or invalid');
        return;
      }

      const { stream, mimeType, size } = storageService.getFileStream(fileKey);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', size);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      stream.pipe(res);
    } catch (err: any) {
      res.status(404).send('File not found');
    }
  }
}
