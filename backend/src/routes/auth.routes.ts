import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { patientAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/send-otp', AuthController.sendOtp);
router.post('/resend-otp', AuthController.resendOtp);
router.post('/verify-otp', AuthController.verifyOtp);
router.post('/verify-firebase', AuthController.verifyFirebase);
router.get('/me', patientAuth, AuthController.getMe);
router.get('/sms-status', AuthController.getSMSStatus);
router.post('/configure-minimoth', AuthController.configureMiniMoth);
router.post('/configure-firebase', AuthController.configureFirebase);
router.post('/configure-sms', AuthController.configureFirebase);
router.get('/gemini-status', AuthController.getGeminiStatus);
router.post('/configure-gemini', AuthController.configureGemini);

export default router;
