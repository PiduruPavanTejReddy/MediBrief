import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class AuthController {
  public static async sendOtp(req: Request, res: Response): Promise<void> {
    try {
      const { mobileNumber } = req.body;
      if (!mobileNumber) {
        res.status(400).json({ success: false, error: 'Mobile number is required', code: 'INVALID_PHONE_NUMBER' });
        return;
      }
      const result = await AuthService.sendOtp(mobileNumber);
      if (!result.success) {
        const isInvalid = /invalid (phone|mobile)|supported market/i.test(result.message || '');
        if (isInvalid) {
          res.status(400).json({
            success: false,
            error: "Invalid phone number, or this number's country isn't a supported market yet.",
            code: 'INVALID_PHONE_NUMBER'
          });
          return;
        }

        res.status(400).json({
          success: false,
          error: result.message || 'SMS delivery failed. Please check your number and try again.',
          code: 'SMS_DELIVERY_FAILED'
        });
        return;
      }
      res.json({ success: true, data: result });
    } catch (err: any) {
      const msg = err.message || 'Failed to send OTP';
      const isRateLimit = /too many/i.test(msg);
      const isInvalid = /invalid (phone|mobile)|format/i.test(msg);
      res.status(400).json({
        success: false,
        error: msg,
        code: isRateLimit ? 'TOO_MANY_ATTEMPTS' : (isInvalid ? 'INVALID_PHONE_NUMBER' : 'SMS_DELIVERY_FAILED')
      });
    }
  }

  public static async verifyOtp(req: Request, res: Response): Promise<void> {
    try {
      const { mobileNumber, otp } = req.body;
      if (!mobileNumber || !otp) {
        res.status(400).json({ success: false, error: 'Mobile number and OTP are required', code: 'INCORRECT_OTP' });
        return;
      }
      const result = await AuthService.verifyOtp(mobileNumber, otp);
      res.json({ success: true, data: result });
    } catch (err: any) {
      const msg = err.message || 'OTP verification failed';
      let code = 'INCORRECT_OTP';
      if (/expired/i.test(msg)) {
        code = 'OTP_EXPIRED';
      } else if (/maximum|too many|attempts/i.test(msg)) {
        code = 'TOO_MANY_ATTEMPTS';
      }
      res.status(400).json({ success: false, error: msg, code });
    }
  }

  public static async resendOtp(req: Request, res: Response): Promise<void> {
    try {
      const { mobileNumber } = req.body;
      if (!mobileNumber) {
        res.status(400).json({ success: false, error: 'Mobile number is required', code: 'INVALID_PHONE_NUMBER' });
        return;
      }
      const result = await AuthService.resendOtp(mobileNumber);
      if (!result.success) {
        res.status(400).json({
          success: false,
          error: result.message || 'SMS delivery failed. Please try again.',
          code: 'SMS_DELIVERY_FAILED'
        });
        return;
      }
      res.json({ success: true, data: result });
    } catch (err: any) {
      const msg = err.message || 'Failed to resend OTP';
      const isRateLimit = /cooldown|wait|too many/i.test(msg);
      res.status(400).json({
        success: false,
        error: msg,
        code: isRateLimit ? 'TOO_MANY_ATTEMPTS' : 'SMS_DELIVERY_FAILED'
      });
    }
  }

  public static async getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.patientId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const result = await AuthService.getMe(req.patientId);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(404).json({ success: false, error: err.message || 'User not found' });
    }
  }

  public static async verifyFirebase(req: Request, res: Response): Promise<void> {
    try {
      const { idToken, mobileNumber } = req.body;
      if (!idToken) {
        res.status(400).json({ success: false, error: 'Firebase ID Token is required.' });
        return;
      }
      const result = await AuthService.authenticateWithFirebase(idToken, mobileNumber);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(401).json({ success: false, error: err.message || 'Firebase authentication failed.' });
    }
  }

  public static async getSMSStatus(req: Request, res: Response): Promise<void> {
    const hasMiniMoth = Boolean(process.env.MINIMOTH_API_KEY && process.env.MINIMOTH_API_KEY.trim().length > 0);
    const hasFirebase = Boolean(
      process.env.FIREBASE_PROJECT_ID ||
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH ||
      process.env.FIREBASE_CLIENT_EMAIL
    );
    const activeProvider = (process.env.OTP_PROVIDER || (hasMiniMoth ? 'minimoth' : 'firebase')).toLowerCase();

    res.json({
      success: true,
      data: {
        provider: activeProvider,
        hasMiniMoth,
        hasFirebase,
        activeProvider,
        firebaseConfig: {
          apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || '',
          authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || '',
          projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '',
          storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || '',
          messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || '',
          appId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || ''
        }
      }
    });
  }

  public static async configureMiniMoth(req: Request, res: Response): Promise<void> {
    try {
      const { apiKey } = req.body;
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 5) {
        res.status(400).json({ success: false, error: 'Valid MiniMoth API key is required.' });
        return;
      }

      process.env.MINIMOTH_API_KEY = apiKey.trim();
      process.env.OTP_PROVIDER = 'minimoth';

      // Persist to backend/.env
      try {
        const fs = await import('fs');
        const path = await import('path');
        const envPath = path.resolve(__dirname, '../../../backend/.env');
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf8');
          if (envContent.includes('MINIMOTH_API_KEY=')) {
            envContent = envContent.replace(/MINIMOTH_API_KEY=.*/g, `MINIMOTH_API_KEY=${apiKey.trim()}`);
          } else {
            envContent += `\nMINIMOTH_API_KEY=${apiKey.trim()}\n`;
          }
          if (envContent.includes('OTP_PROVIDER=')) {
            envContent = envContent.replace(/OTP_PROVIDER=.*/g, `OTP_PROVIDER=minimoth`);
          } else {
            envContent += `\nOTP_PROVIDER=minimoth\n`;
          }
          fs.writeFileSync(envPath, envContent, 'utf8');
        }
      } catch (err: any) {
        console.warn('Could not persist MINIMOTH_API_KEY to .env:', err.message);
      }

      console.log('[AuthController] MiniMoth API key configured successfully.');
      res.json({
        success: true,
        message: 'MiniMoth WhatsApp + SMS gateway configured successfully!'
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async configureFirebase(req: Request, res: Response): Promise<void> {
    try {
      const { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId } = req.body;
      if (!apiKey || !projectId) {
        res.status(400).json({ success: false, error: 'Firebase apiKey and projectId are required.' });
        return;
      }

      process.env.FIREBASE_API_KEY = apiKey.trim();
      process.env.FIREBASE_PROJECT_ID = projectId.trim();
      if (authDomain) process.env.FIREBASE_AUTH_DOMAIN = authDomain.trim();
      if (storageBucket) process.env.FIREBASE_STORAGE_BUCKET = storageBucket.trim();
      if (messagingSenderId) process.env.FIREBASE_MESSAGING_SENDER_ID = messagingSenderId.trim();
      if (appId) process.env.FIREBASE_APP_ID = appId.trim();
      process.env.OTP_PROVIDER = 'firebase';

      console.log('[AuthController] Firebase configuration updated dynamically.');

      res.json({
        success: true,
        message: 'Firebase Phone Authentication configured successfully!'
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getGeminiStatus(req: Request, res: Response): Promise<void> {
    const hasGemini = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 10);
    res.json({
      success: true,
      data: {
        hasGemini,
        aiProvider: hasGemini ? 'google_gemini' : 'local_ocr'
      }
    });
  }

  public static async configureGemini(req: Request, res: Response): Promise<void> {
    try {
      const { apiKey } = req.body;
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 5) {
        res.status(400).json({ success: false, error: 'Valid Gemini API key is required.' });
        return;
      }

      process.env.GEMINI_API_KEY = apiKey.trim();

      // Persist to backend/.env if writable
      try {
        const fs = await import('fs');
        const path = await import('path');
        const envPath = path.resolve(__dirname, '../../../backend/.env');
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf8');
          if (envContent.includes('GEMINI_API_KEY=')) {
            envContent = envContent.replace(/GEMINI_API_KEY=.*/g, `GEMINI_API_KEY=${apiKey.trim()}`);
          } else {
            envContent += `\nGEMINI_API_KEY=${apiKey.trim()}\n`;
          }
          fs.writeFileSync(envPath, envContent, 'utf8');
        }
      } catch (err: any) {
        console.warn('Could not persist GEMINI_API_KEY to .env:', err.message);
      }

      console.log('[AuthController] Gemini API key configured successfully.');
      res.json({
        success: true,
        message: 'Google Gemini Vision configured successfully! Multimodal AI OCR is now active.'
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

