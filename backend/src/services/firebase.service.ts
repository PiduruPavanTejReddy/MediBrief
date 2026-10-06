import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env';

export interface VerifiedFirebaseUser {
  uid: string;
  phoneNumber?: string;
  authTime: number;
}

export class FirebaseService {
  private static isInitialized = false;
  private static app: App | null = null;

  private static initialize(): void {
    if (this.isInitialized) return;

    try {
      // 1. Check if service account key JSON file path is provided
      if (config.firebaseServiceAccountPath) {
        const filePath = path.isAbsolute(config.firebaseServiceAccountPath)
          ? config.firebaseServiceAccountPath
          : path.resolve(process.cwd(), config.firebaseServiceAccountPath);

        if (fs.existsSync(filePath)) {
          const serviceAccount = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          this.app = initializeApp({
            credential: cert(serviceAccount)
          });
          this.isInitialized = true;
          console.log('[FirebaseService] Initialized via service account JSON file.');
          return;
        }
      }

      // 2. Check if discrete environment variables are provided
      if (config.firebaseProjectId && config.firebaseClientEmail && config.firebasePrivateKey) {
        this.app = initializeApp({
          credential: cert({
            projectId: config.firebaseProjectId,
            clientEmail: config.firebaseClientEmail,
            // Replace escaped newlines if passed in .env
            privateKey: config.firebasePrivateKey.replace(/\\n/g, '\n')
          })
        });
        this.isInitialized = true;
        console.log('[FirebaseService] Initialized via environment credentials.');
        return;
      }

      // 3. Fallback: project ID only or default application credentials
      if (config.firebaseProjectId) {
        this.app = initializeApp({
          projectId: config.firebaseProjectId
        });
        this.isInitialized = true;
        console.log(`[FirebaseService] Initialized with projectId: ${config.firebaseProjectId}`);
        return;
      }

      console.warn('[FirebaseService] Firebase Admin credentials not fully configured in backend/.env. ID token verification will run in development mode if unconfigured.');
    } catch (err: any) {
      console.error('[FirebaseService] Initialization error:', err.message);
    }
  }

  /**
   * Verifies a Firebase ID token sent from the frontend after successful Phone Auth
   */
  public static async verifyIdToken(idToken: string): Promise<VerifiedFirebaseUser> {
    this.initialize();

    if (!idToken || typeof idToken !== 'string') {
      throw new Error('Firebase ID Token is required.');
    }

    // If Firebase admin is initialized with credentials, perform cryptographic verification
    if (getApps().length > 0 && this.app) {
      try {
        const auth = getAuth(this.app);
        const decodedToken = await auth.verifyIdToken(idToken);
        return {
          uid: decodedToken.uid,
          phoneNumber: decodedToken.phone_number,
          authTime: decodedToken.auth_time
        };
      } catch (err: any) {
        console.error('[FirebaseService] verifyIdToken error:', err.message);
        throw new Error(`Firebase token verification failed: ${err.message}`);
      }
    }

    // Development fallback if Firebase Admin credentials are not yet set in backend/.env:
    // Safely parse unverified JWT payload so developers can test immediately
    try {
      const parts = idToken.split('.');
      if (parts.length === 3) {
        const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
        const payload = JSON.parse(payloadJson);
        if (payload.user_id || payload.sub) {
          console.log('[FirebaseService] Parsed token payload in development mode (UID:', payload.user_id || payload.sub, ')');
          return {
            uid: payload.user_id || payload.sub,
            phoneNumber: payload.phone_number_or_test || payload.phone_number,
            authTime: payload.auth_time || Math.floor(Date.now() / 1000)
          };
        }
      }
    } catch (e) {
      // Ignore parse error and throw proper error
    }

    throw new Error('Firebase Admin is not configured. Please set FIREBASE_PROJECT_ID or service account in backend/.env.');
  }
}
