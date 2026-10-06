import { Router } from 'express';
import { DoctorController } from '../controllers/doctor.controller';
import { doctorAuth } from '../middleware/auth.middleware';

const router = Router();

// All doctor routes require active doctor session token
router.use(doctorAuth);

router.get('/session', DoctorController.getSessionInfo);
router.get('/records', DoctorController.getSharedRecords);
router.post('/ai/chat', DoctorController.chat);
router.post('/end-session', DoctorController.endSession);

export default router;
