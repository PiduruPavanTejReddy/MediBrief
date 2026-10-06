import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { config } from '../config/env';
import { User, PatientProfile } from '../types';
import { AuditService } from './audit.service';
import { OTPService } from './otp/otp.service';

export interface SendOtpResult {
  success: boolean;
  message: string;
  expiresInSeconds: number;
  devOtp?: string;
  smsDelivered?: boolean;
  smsProvider?: string;
  smsError?: string;
}

export interface VerifyOtpResult {
  token: string;
  user: User;
  profile: PatientProfile | null;
  isNewUser: boolean;
}

export class AuthService {
  public static async sendOtp(mobileNumber: string): Promise<SendOtpResult> {
    const otpResult = await OTPService.sendOTP(mobileNumber);
    return {
      success: otpResult.success,
      message: otpResult.message,
      expiresInSeconds: otpResult.expiresInSeconds || 300,
      devOtp: otpResult.devOtp,
      smsDelivered: otpResult.success && otpResult.provider !== 'mock',
      smsProvider: otpResult.provider,
      smsError: otpResult.error
    };
  }

  public static async resendOtp(mobileNumber: string): Promise<SendOtpResult> {
    const resendResult = await OTPService.resendOTP(mobileNumber);
    return {
      success: resendResult.success,
      message: resendResult.message,
      expiresInSeconds: 300,
      smsDelivered: resendResult.success && resendResult.provider !== 'mock',
      smsProvider: resendResult.provider,
      smsError: resendResult.error
    };
  }

  public static async verifyOtp(mobileNumber: string, otp: string): Promise<VerifyOtpResult> {
    const normalizedMobile = mobileNumber.replace(/[\s\-\(\)]/g, '');
    const now = new Date().toISOString();

    // Verify OTP through OTPService (handles MSG91 / local verification, rate-limiting attempts, and expiry)
    await OTPService.verifyOTP(normalizedMobile, otp);

    // Find or create user
    let user = db.prepare('SELECT * FROM users WHERE mobile_number = ?').get(normalizedMobile) as User | undefined;
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      const newUserId = uuidv4();
      const insertUser = db.prepare(`
        INSERT INTO users (id, role, mobile_number, created_at, updated_at)
        VALUES (?, 'patient', ?, ?, ?)
      `);
      insertUser.run(newUserId, normalizedMobile, now, now);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(newUserId) as User;

      AuditService.log(user.id, 'patient', user.id, 'USER_REGISTERED', {
        mobile: normalizedMobile
      });
    } else {
      AuditService.log(user.id, 'patient', user.id, 'USER_LOGIN', {
        mobile: normalizedMobile
      });
    }

    // Retrieve profile if it exists
    const profile = db.prepare('SELECT * FROM patient_profiles WHERE user_id = ?').get(user.id) as PatientProfile | undefined;

    // Issue JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        mobile: user.mobile_number
      },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    return {
      token,
      user,
      profile: profile || null,
      isNewUser
    };
  }

  /**
   * Authenticates or registers a patient using a verified Firebase ID token.
   * Links the Firebase UID against the MediBrief patient user record.
   */
  public static async authenticateWithFirebase(firebaseIdToken: string, fallbackMobile?: string): Promise<VerifyOtpResult> {
    const { FirebaseService } = await import('./firebase.service');
    const verifiedUser = await FirebaseService.verifyIdToken(firebaseIdToken);

    const mobileNumber = verifiedUser.phoneNumber || fallbackMobile;
    if (!mobileNumber) {
      throw new Error('Phone number is missing from Firebase credential.');
    }

    const normalizedMobile = mobileNumber.replace(/[\s\-\(\)]/g, '');
    const now = new Date().toISOString();

    // Look for existing user by firebase_uid or mobile_number
    let user = db.prepare('SELECT * FROM users WHERE firebase_uid = ? OR mobile_number = ?').get(verifiedUser.uid, normalizedMobile) as User | undefined;
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      const newUserId = uuidv4();
      const insertUser = db.prepare(`
        INSERT INTO users (id, role, mobile_number, firebase_uid, created_at, updated_at)
        VALUES (?, 'patient', ?, ?, ?, ?)
      `);
      insertUser.run(newUserId, normalizedMobile, verifiedUser.uid, now, now);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(newUserId) as User;

      AuditService.log(user.id, 'patient', user.id, 'USER_REGISTERED_FIREBASE', {
        mobile: normalizedMobile,
        firebase_uid: verifiedUser.uid
      });
    } else {
      // Update firebase_uid and updated_at if not previously linked
      if (!user.firebase_uid || user.firebase_uid !== verifiedUser.uid) {
        db.prepare('UPDATE users SET firebase_uid = ?, updated_at = ? WHERE id = ?').run(verifiedUser.uid, now, user.id);
        user.firebase_uid = verifiedUser.uid;
      }

      AuditService.log(user.id, 'patient', user.id, 'USER_LOGIN_FIREBASE', {
        mobile: normalizedMobile,
        firebase_uid: verifiedUser.uid
      });
    }

    // Retrieve profile if it exists
    const profile = db.prepare('SELECT * FROM patient_profiles WHERE user_id = ?').get(user.id) as PatientProfile | undefined;

    // Issue JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        mobile: user.mobile_number,
        firebaseUid: user.firebase_uid
      },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    return {
      token,
      user,
      profile: profile || null,
      isNewUser
    };
  }

  public static async getMe(userId: string): Promise<{ user: User; profile: PatientProfile | null }> {
    const user = db.prepare('SELECT id, role, mobile_number, created_at, updated_at FROM users WHERE id = ?').get(userId) as User | undefined;
    if (!user) {
      throw new Error('User not found');
    }
    const profile = db.prepare('SELECT * FROM patient_profiles WHERE user_id = ?').get(userId) as PatientProfile | undefined;
    return {
      user,
      profile: profile || null
    };
  }
}
