import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AIService } from '../services/ai.service';
import { AuditService } from '../services/audit.service';

export class AIController {
  public static async chat(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const patientId = req.patientId!;
      const { question, history } = req.body;

      if (!question || typeof question !== 'string') {
        res.status(400).json({ success: false, error: 'Question string is required' });
        return;
      }

      const response = await AIService.chat(patientId, question, 'patient', undefined, history);

      AuditService.log(patientId, 'patient', patientId, 'AI_CHAT_QUERY', {
        question: question.slice(0, 80),
        citationCount: response.citations.length
      });

      res.json({ success: true, data: response });
    } catch (err: any) {
      console.error('[AIController] chat error:', err);
      res.status(500).json({ success: false, error: err.message || 'AI assistant encountered an error' });
    }
  }

  public static async generateSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const patientId = req.patientId!;
      const summary = await AIService.generateSummary(patientId);

      AuditService.log(patientId, 'patient', patientId, 'AI_SUMMARY_GENERATED', {
        recordCount: summary.sourceRecords.length
      });

      res.json({ success: true, data: summary });
    } catch (err: any) {
      console.error('[AIController] generateSummary error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to generate summary' });
    }
  }
}
