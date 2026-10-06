import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { db } from '../db/database';
import { SharingService } from '../services/sharing.service';
import { AIService } from '../services/ai.service';
import { storageService } from '../services/storage.service';
import { AuditService } from '../services/audit.service';
import { PatientProfile } from '../types';
import { calculateAge } from '../utils/date.utils';

export class DoctorController {
  public static async getSessionInfo(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const doctorSession = req.doctorSession!;
      const patientId = doctorSession.patientId;

      // Fetch patient profile
      const profile = db.prepare('SELECT * FROM patient_profiles WHERE user_id = ?').get(patientId) as PatientProfile | undefined;
      const user = db.prepare('SELECT id, created_at FROM users WHERE id = ?').get(patientId);

      // Dynamically calculate age from date of birth
      const computedAge = profile?.date_of_birth ? calculateAge(profile.date_of_birth) : null;
      const age: number | string = computedAge !== null ? computedAge : 'Age not available';

      // Generate doctor-friendly clinical summary strictly for permitted records
      const summary = await AIService.generateSummary(patientId, doctorSession.permittedRecordIds);

      res.json({
        success: true,
        data: {
          doctorSessionId: doctorSession.doctorSessionId,
          sharingSessionId: doctorSession.sharingSessionId,
          patient: {
            fullName: profile?.full_name || 'Patient',
            dateOfBirth: profile?.date_of_birth || null,
            age,
            gender: profile?.gender || 'N/A',
            bloodGroup: profile?.blood_group || 'N/A',
            emergencyContact: profile?.emergency_contact || 'N/A'
          },
          permittedRecordCount: doctorSession.permittedRecordIds.length,
          clinicalSummary: summary
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getSharedRecords(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const doctorSession = req.doctorSession!;
      const records = SharingService.getSharedRecords(doctorSession.sharingSessionId);

      const enriched = records.map(r => ({
        ...r,
        signedUrl: storageService.generateSignedUrl(r.original_file_key, 60)
      }));

      res.json({ success: true, data: enriched });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async chat(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const doctorSession = req.doctorSession!;
      const { question, history } = req.body;

      if (!question) {
        res.status(400).json({ success: false, error: 'Question is required' });
        return;
      }

      // AI retrieval STRICTLY restricted to permittedRecordIds
      const response = await AIService.chat(
        doctorSession.patientId,
        question,
        'doctor',
        doctorSession.permittedRecordIds,
        history
      );

      AuditService.log(doctorSession.patientId, 'doctor', doctorSession.doctorSessionId, 'DOCTOR_AI_QUERY', {
        question: question.slice(0, 80),
        citationCount: response.citations.length
      });

      res.json({ success: true, data: response });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async endSession(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const doctorSession = req.doctorSession!;
      await SharingService.endSessionByDoctor(doctorSession.sharingSessionId, doctorSession.doctorSessionId);
      res.json({ success: true, message: 'Doctor session ended successfully' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
