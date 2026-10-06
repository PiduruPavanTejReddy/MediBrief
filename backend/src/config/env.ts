import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  jwtSecret: process.env.JWT_SECRET || 'medibrief-secure-supersecret-jwt-key-2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  nodeEnv: process.env.NODE_ENV || 'development',
  storageProvider: process.env.STORAGE_PROVIDER || 'local',
  storageUploadDir: process.env.STORAGE_UPLOAD_DIR || path.resolve(__dirname, '../../uploads'),
  ocrProvider: process.env.OCR_PROVIDER || 'local_medical',
  aiProvider: process.env.AI_PROVIDER || 'local_medical',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  otpProvider: process.env.OTP_PROVIDER || 'firebase',
  mockOtpCode: process.env.MOCK_OTP_CODE || '123456',
  databaseUrl: process.env.DATABASE_URL || 'file:./medibrief.db',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || '',
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY || '',
  firebaseServiceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH || ''
};
