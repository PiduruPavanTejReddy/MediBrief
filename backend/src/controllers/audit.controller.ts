import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AuditService } from '../services/audit.service';

export class AuditController {
  public static async getHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const patientId = req.patientId!;
      const limit = parseInt(req.query.limit as string || '50', 10);
      const logs = AuditService.getLogsForPatient(patientId, limit);
      res.json({ success: true, data: logs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
