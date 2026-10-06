import { Router } from 'express';
import { AIController } from '../controllers/ai.controller';
import { patientAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(patientAuth);
router.post('/chat', AIController.chat);
router.get('/summary', AIController.generateSummary);

export default router;
