import { Router } from 'express';
import { PatientController } from '../controllers/patient.controller';
import { patientAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(patientAuth);
router.get('/profile', PatientController.getProfile);
router.post('/profile', PatientController.saveProfile);
router.put('/profile', PatientController.saveProfile);

export default router;
