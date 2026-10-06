import { Router } from 'express';
import { SharingController } from '../controllers/sharing.controller';
import { patientAuth } from '../middleware/auth.middleware';

const router = Router();

// Public doctor code verification endpoint (doctor enters code)
router.post('/verify-code', SharingController.verifyDoctorCode);

// Patient protected endpoints
router.use(patientAuth);
router.post('/create', SharingController.createSession);
router.get('/active', SharingController.getActiveSessions);
router.post('/:id/revoke', SharingController.revokeSession);

export default router;
