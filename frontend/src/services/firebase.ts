import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  Auth,
  UserCredential
} from 'firebase/auth';

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

// Local storage key for custom Firebase Client config
const FIREBASE_CONFIG_STORAGE_KEY = 'medibrief_firebase_client_config';

export class FirebaseClient {
  private static app: FirebaseApp | null = null;
  private static auth: Auth | null = null;
  private static recaptchaVerifier: RecaptchaVerifier | null = null;
  private static confirmationResult: ConfirmationResult | null = null;

  public static getStoredConfig(): FirebaseClientConfig | null {
    try {
      const stored = localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {}

    // Fallback to Vite environment variables if defined
    if (import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      return {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
        appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
      };
    }

    return null;
  }

  public static saveConfig(cfg: FirebaseClientConfig): void {
    localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(cfg));
    // Reset instances to reload
    this.app = null;
    this.auth = null;
    this.recaptchaVerifier = null;
  }

  public static isConfigured(): boolean {
    return Boolean(this.getStoredConfig()?.apiKey && this.getStoredConfig()?.projectId);
  }

  public static getAuthInstance(): Auth {
    if (this.auth) return this.auth;

    const config = this.getStoredConfig();
    if (!config || !config.apiKey || !config.projectId) {
      throw new Error('Firebase is not configured. Please provide your Firebase Web Configuration.');
    }

    if (!getApps().length) {
      this.app = initializeApp(config);
    } else {
      this.app = getApp();
    }

    this.auth = getAuth(this.app);
    return this.auth;
  }

  /**
   * Initializes reCAPTCHA verifier for Phone Auth (invisible reCAPTCHA)
   */
  public static setupRecaptcha(containerElementId: string = 'recaptcha-container'): RecaptchaVerifier {
    const auth = this.getAuthInstance();

    if (this.recaptchaVerifier) {
      try {
        this.recaptchaVerifier.clear();
      } catch (e) {}
      this.recaptchaVerifier = null;
    }

    this.recaptchaVerifier = new RecaptchaVerifier(auth, containerElementId, {
      size: 'invisible',
      callback: () => {
        console.log('[FirebaseClient] reCAPTCHA verified.');
      },
      'expired-callback': () => {
        console.warn('[FirebaseClient] reCAPTCHA expired, please try again.');
      }
    });

    return this.recaptchaVerifier;
  }

  /**
   * Sends real SMS OTP via Firebase Phone Authentication
   * Supports Indian numbers with +91 or any valid E.164 phone number
   */
  public static async sendPhoneOtp(
    phoneNumber: string,
    recaptchaContainerId: string = 'recaptcha-container'
  ): Promise<ConfirmationResult> {
    const auth = this.getAuthInstance();
    const verifier = this.setupRecaptcha(recaptchaContainerId);

    // Format to E.164 format: e.g. +919876543210
    const cleaned = phoneNumber.replace(/[\s\-\(\)]/g, '');
    let formatted = cleaned;
    if (!formatted.startsWith('+')) {
      if (formatted.length === 10) {
        formatted = `+91${formatted}`;
      } else if (formatted.startsWith('91') && formatted.length === 12) {
        formatted = `+${formatted}`;
      } else {
        formatted = `+${formatted}`;
      }
    }

    console.log(`[FirebaseClient] Requesting Firebase to dispatch real SMS OTP to ${formatted}...`);
    this.confirmationResult = await signInWithPhoneNumber(auth, formatted, verifier);
    return this.confirmationResult;
  }

  /**
   * Verifies the SMS OTP with Firebase
   * Returns Firebase ID Token to establish session on MediBrief backend
   */
  public static async verifyPhoneOtp(otpCode: string): Promise<{ idToken: string; userCredential: UserCredential }> {
    if (!this.confirmationResult) {
      throw new Error('No active Firebase Phone verification in progress. Please request an OTP first.');
    }

    const userCredential = await this.confirmationResult.confirm(otpCode.trim());
    const idToken = await userCredential.user.getIdToken(true);

    return {
      idToken,
      userCredential
    };
  }

  public static clearConfirmation(): void {
    this.confirmationResult = null;
    if (this.recaptchaVerifier) {
      try {
        this.recaptchaVerifier.clear();
      } catch (e) {}
      this.recaptchaVerifier = null;
    }
  }
}
