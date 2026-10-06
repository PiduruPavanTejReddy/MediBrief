import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/database';
import { config } from '../../config/env';
import { OTPProvider, SendOTPResult, VerifyOTPResult, ResendOTPResult } from './otp.provider.interface';
import { MiniMothOTPProvider } from './minimoth.provider';
import { MSG91OTPProvider } from './msg91.provider';
import { MockOTPProvider } from './mock.provider';

export class OTPService {
  private static providerInstance: OTPProvider | null = null;

  public static getProvider(): OTPProvider {
    const hasMiniMothApiKey = Boolean(process.env.MINIMOTH_API_KEY && process.env.MINIMOTH_API_KEY.trim().length > 0);
    const hasMSG91Credentials = Boolean((process.env.MSG91_API_KEY || process.env.MSG91_AUTH_KEY) && process.env.MSG91_OTP_TEMPLATE_ID);
    const providerName = (process.env.OTP_PROVIDER || config.otpProvider || 'minimoth').toLowerCase();
    
    // Priority 1: MiniMoth (Native WhatsApp + SMS for India)
    if (hasMiniMothApiKey || providerName === 'minimoth') {
      if (!this.providerInstance || this.providerInstance.name !== 'minimoth') {
        this.providerInstance = new MiniMothOTPProvider();
      }
      return this.providerInstance;
    }

    // Priority 2: MSG91
    if (hasMSG91Credentials && providerName === 'msg91') {
      if (!this.providerInstance || this.providerInstance.name !== 'msg91') {
        this.providerInstance = new MSG91OTPProvider();
      }
      return this.providerInstance;
    }

    if (!this.providerInstance || this.providerInstance.name !== 'mock') {
      this.providerInstance = new MockOTPProvider();
    }
    return this.providerInstance;
  }

  private static hashValue(val: string): string {
    return crypto.createHash('sha256').update(val).digest('hex');
  }

  /**
   * Normalize phone number to standard format
   */
  public static normalizeMobile(mobileNumber: string): string {
    const cleaned = mobileNumber.replace(/[\s\-\(\)]/g, '');
    if (!/^\+?[0-9]{10,14}$/.test(cleaned)) {
      throw new Error('Invalid phone number. Please provide a valid 10-12 digit phone number (e.g. +91 9876543210).');
    }
    return cleaned;
  }

  /**
   * sendOTP:
   * 1. Rate-limiting check (max 4 requests per 5 minutes)
   * 2. Generates cryptographically secure 6-digit OTP
   * 3. Dispatches via provider (MSG91 in production)
   * 4. Persists hash with 5-minute expiry in database
   */
  public static async sendOTP(mobileNumber: string): Promise<SendOTPResult> {
    const normalizedMobile = this.normalizeMobile(mobileNumber);

    // Rate-limiting check: max 4 requests in last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const rateCheckStmt = db.prepare(`
      SELECT COUNT(*) as count FROM otp_verifications 
      WHERE mobile_number = ? AND created_at > ?
    `);
    const rateResult = rateCheckStmt.get(normalizedMobile, fiveMinutesAgo) as { count: number };
    if (rateResult.count >= 4) {
      throw new Error('Too many OTP requests. Please wait a few minutes before requesting another OTP.');
    }

    // Generate secure cryptographically random 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = this.hashValue(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes validity
    const id = uuidv4();
    const now = new Date().toISOString();

    // Invalidate prior active OTPs for this number without erasing rate-limit history
    db.prepare('UPDATE otp_verifications SET verified = 2 WHERE mobile_number = ? AND verified = 0').run(normalizedMobile);

    // Persist new OTP verification record
    db.prepare(`
      INSERT INTO otp_verifications (id, mobile_number, otp_hash, attempts, expires_at, verified, created_at)
      VALUES (?, ?, ?, 0, ?, 0, ?)
    `).run(id, normalizedMobile, otpHash, expiresAt, now);

    console.log(`[OTPService] Generated 6-digit OTP for ${normalizedMobile}: ${otp} (Expires in 5m)`);

    // Dispatch via configured provider (MSG91)
    const provider = this.getProvider();
    const result = await provider.sendOTP(normalizedMobile, otp);

    return {
      ...result,
      expiresInSeconds: 300
    };
  }

  /**
   * resendOTP:
   * Enforces 30-second resend cooldown before allowing a resend
   */
  public static async resendOTP(mobileNumber: string): Promise<ResendOTPResult> {
    const normalizedMobile = this.normalizeMobile(mobileNumber);

    // Check cooldown: must be at least 30 seconds since last OTP request
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();
    const recentStmt = db.prepare(`
      SELECT created_at FROM otp_verifications 
      WHERE mobile_number = ? AND created_at > ?
      ORDER BY created_at DESC LIMIT 1
    `);
    const recent = recentStmt.get(normalizedMobile, thirtySecondsAgo) as any;
    if (recent) {
      throw new Error('Resend cooldown active. Please wait 30 seconds before resending OTP.');
    }

    const provider = this.getProvider();
    if (provider.name === 'msg91') {
      const resendRes = await provider.resendOTP(normalizedMobile);
      if (resendRes.success) return resendRes;
    }

    // Fallback or standard resend: generate fresh OTP with standard sendOTP flow
    const sendRes = await this.sendOTP(normalizedMobile);
    return {
      success: sendRes.success,
      message: sendRes.message,
      provider: sendRes.provider,
      error: sendRes.error
    };
  }

  /**
   * verifyOTP:
   * 1. Validates local record, expiry, and max attempts (5)
   * 2. If MSG91 is provider, verifies against MSG91 Verify OTP API
   * 3. Validates OTP hash match locally
   * 4. Marks as verified
   */
  public static async verifyOTP(mobileNumber: string, otp: string): Promise<VerifyOTPResult> {
    const normalizedMobile = this.normalizeMobile(mobileNumber);
    const trimmedOtp = otp.trim();

    if (!trimmedOtp || trimmedOtp.length < 4) {
      throw new Error('Please enter a valid OTP.');
    }

    const stmt = db.prepare(`
      SELECT * FROM otp_verifications 
      WHERE mobile_number = ? AND verified = 0 
      ORDER BY created_at DESC LIMIT 1
    `);
    const record = stmt.get(normalizedMobile) as any;

    if (!record) {
      throw new Error('No active OTP found. Please request an OTP first.');
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      db.prepare('DELETE FROM otp_verifications WHERE id = ?').run(record.id);
      throw new Error('OTP expired. Please request a new OTP.');
    }

    if (record.attempts >= 5) {
      db.prepare('DELETE FROM otp_verifications WHERE id = ?').run(record.id);
      throw new Error('Too many attempts. Maximum verification attempts exceeded. Please request a new OTP.');
    }

    const provider = this.getProvider();

    // If using MiniMoth and API key is present, verify with MiniMoth API
    if (provider.name === 'minimoth' && process.env.MINIMOTH_API_KEY) {
      const mmVerify = await provider.verifyOTP(normalizedMobile, trimmedOtp);
      if (mmVerify.success) {
        db.prepare('UPDATE otp_verifications SET verified = 1 WHERE id = ?').run(record.id);
        return {
          success: true,
          message: 'OTP verified successfully via MiniMoth.',
          provider: 'minimoth'
        };
      }
      // If MiniMoth rejects, check if it matches local hash (e.g. sandbox/dev fallback) before throwing
      const inputHash = this.hashValue(trimmedOtp);
      if (inputHash !== record.otp_hash) {
        db.prepare('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = ?').run(record.id);
        const remaining = 5 - (record.attempts + 1);
        throw new Error(mmVerify.message || `Incorrect OTP. You have ${remaining} attempts remaining.`);
      }
    }

    // If using MSG91, verify against MSG91 Verify OTP endpoint
    if (provider.name === 'msg91' && process.env.MSG91_API_KEY) {
      const msg91Verify = await provider.verifyOTP(normalizedMobile, trimmedOtp);
      if (msg91Verify.success) {
        db.prepare('UPDATE otp_verifications SET verified = 1 WHERE id = ?').run(record.id);
        return {
          success: true,
          message: 'OTP verified successfully via MSG91.',
          provider: 'msg91'
        };
      }
      // If MSG91 returns failure, update attempt count
      db.prepare('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = ?').run(record.id);
      const remaining = 5 - (record.attempts + 1);
      throw new Error(msg91Verify.message || `Incorrect OTP. You have ${remaining} attempts remaining.`);
    }

    // Local / standard verification: match SHA-256 hash or mock bypass
    const inputHash = this.hashValue(trimmedOtp);
    const isMockMatch = config.otpProvider === 'mock' && trimmedOtp === (config.mockOtpCode || '123456');

    if (inputHash !== record.otp_hash && !isMockMatch) {
      db.prepare('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = ?').run(record.id);
      const remaining = 5 - (record.attempts + 1);
      throw new Error(`Incorrect OTP. You have ${remaining} attempts remaining.`);
    }

    // Success: mark OTP verified
    db.prepare('UPDATE otp_verifications SET verified = 1 WHERE id = ?').run(record.id);

    return {
      success: true,
      message: 'OTP verified successfully.',
      provider: provider.name
    };
  }
}
