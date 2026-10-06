import { Router } from 'express';
import { AuditController } from '../controllers/audit.controller';
import { patientAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(patientAuth);
router.get('/history', AuditController.getHistory);

export default router;
