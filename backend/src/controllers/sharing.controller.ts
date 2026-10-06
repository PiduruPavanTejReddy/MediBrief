import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { SharingService } from '../services/sharing.service';

export class SharingController {
  public static async createSession(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const patientId = req.patientId!;
      const { scopeType, categories, dateFrom, dateTo, selectedRecordIds } = req.body;

      const result = await SharingService.createSession({
        patientId,
        scopeType: scopeType || 'all',
        categories,
        dateFrom,
        dateTo,
        selectedRecordIds
      });

      res.status(201).json({ success: true, data: result });
    } catch (err: any) {
      console.error('[SharingController] createSession error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to create sharing session' });
    }
  }

  public static async getActiveSessions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const patientId = req.patientId!;
      const sessions = SharingService.getActiveSessionsForPatient(patientId);
      res.json({ success: true, data: sessions });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async revokeSession(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const patientId = req.patientId!;
      const sessionId = String(req.params.id);

      await SharingService.revokeSessionByPatient(patientId, sessionId);
      res.json({ success: true, message: 'Doctor sharing session revoked immediately' });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  public static async verifyDoctorCode(req: Request, res: Response): Promise<void> {
    try {
      const { accessCode } = req.body;
      if (!accessCode) {
        res.status(400).json({ success: false, error: 'Doctor access code is required' });
        return;
      }

      const result = await SharingService.verifyCode(accessCode);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(403).json({ success: false, error: err.message || 'Access code is invalid' });
    }
  }
}
