import { OTPProvider, SendOTPResult, VerifyOTPResult, ResendOTPResult } from './otp.provider.interface';

export class MiniMothOTPProvider implements OTPProvider {
  public name = 'minimoth';

  private getApiKey(): string {
    return (process.env.MINIMOTH_API_KEY || '').trim();
  }

  private getBaseUrl(): string {
    return (process.env.MINIMOTH_BASE_URL || 'https://api.minimoth.dev').replace(/\/$/, '');
  }

  /**
   * Normalizes mobile number to E.164 with +91 for Indian numbers:
   * e.g. 9876543210 -> +919876543210
   */
  private formatPhoneNumber(mobileNumber: string): string {
    const cleaned = mobileNumber.replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('+')) {
      return cleaned;
    }
    if (cleaned.length === 10) {
      return `+91${cleaned}`;
    }
    if (cleaned.startsWith('91') && cleaned.length === 12) {
      return `+${cleaned}`;
    }
    return `+${cleaned}`;
  }

  /**
   * Sends OTP via MiniMoth API (WhatsApp first, automatic SMS fallback)
   * Endpoint: POST https://api.minimoth.dev/v1/otp/send
   */
  public async sendOTP(mobileNumber: string, localFallbackOtp?: string): Promise<SendOTPResult> {
    const apiKey = this.getApiKey();
    const phone = this.formatPhoneNumber(mobileNumber);

    if (!apiKey) {
      console.warn('[MiniMoth] MINIMOTH_API_KEY is not configured in backend/.env. Using dev fallback.');
      return {
        success: false,
        message: 'MiniMoth API Key is not configured yet in backend settings.',
        provider: this.name,
        expiresInSeconds: 300,
        devOtp: localFallbackOtp,
        error: 'MINIMOTH_API_KEY missing'
      };
    }

    try {
      console.log(`[MiniMoth] Requesting MiniMoth OTP dispatch to ${phone}...`);

      const response = await fetch(`${this.getBaseUrl()}/v1/otp/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ phone })
      });

      const data = await response.json().catch(() => ({})) as any;
      console.log('[MiniMoth] /v1/otp/send Response:', response.status, data);

      if (response.ok && (data.success !== false)) {
        const isTestMode = apiKey.startsWith('mm_test_');
        return {
          success: true,
          message: isTestMode 
            ? `[MiniMoth Sandbox] OTP simulated successfully for ${phone}` 
            : (data.message || `OTP sent via MiniMoth (WhatsApp / SMS) to ${phone}!`),
          provider: this.name,
          messageId: data.id || data.otp_id || data.messageId || 'minimoth_dispatched',
          expiresInSeconds: data.expiresInSeconds || 300,
          devOtp: isTestMode ? localFallbackOtp : undefined
        };
      } else {
        const errorMsg = data.error || data.message || `MiniMoth API returned HTTP ${response.status}`;
        return {
          success: false,
          message: errorMsg,
          provider: this.name,
          expiresInSeconds: 300,
          devOtp: undefined,
          error: errorMsg
        };
      }
    } catch (err: any) {
      console.error('[MiniMoth] Send OTP network failure:', err);
      return {
        success: false,
        message: `Network error connecting to MiniMoth: ${err.message}`,
        provider: this.name,
        expiresInSeconds: 300,
        devOtp: undefined,
        error: err.message
      };
    }
  }

  /**
   * Verifies OTP via MiniMoth API
   * Endpoint: POST https://api.minimoth.dev/v1/otp/verify
   */
  public async verifyOTP(mobileNumber: string, otp: string): Promise<VerifyOTPResult> {
    const apiKey = this.getApiKey();
    const phone = this.formatPhoneNumber(mobileNumber);

    if (!apiKey) {
      return {
        success: false,
        message: 'MINIMOTH_API_KEY is not configured',
        provider: this.name,
        error: 'MINIMOTH_API_KEY missing'
      };
    }

    try {
      console.log(`[MiniMoth] Verifying OTP with MiniMoth for ${phone}...`);

      const response = await fetch(`${this.getBaseUrl()}/v1/otp/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          phone,
          code: otp.trim()
        })
      });

      const data = await response.json().catch(() => ({})) as any;
      console.log('[MiniMoth] /v1/otp/verify Response:', response.status, data);

      if (response.ok && (data.success !== false) && !data.error) {
        return {
          success: true,
          message: 'OTP verified successfully by MiniMoth.',
          provider: this.name
        };
      } else {
        const errorMsg = data.error || data.message || 'Invalid or expired OTP code.';
        return {
          success: false,
          message: errorMsg,
          provider: this.name,
          error: errorMsg
        };
      }
    } catch (err: any) {
      console.error('[MiniMoth] Verify OTP network failure:', err);
      return {
        success: false,
        message: `Network error connecting to MiniMoth verify API: ${err.message}`,
        provider: this.name,
        error: err.message
      };
    }
  }

  /**
   * Resends OTP via MiniMoth
   */
  public async resendOTP(mobileNumber: string): Promise<ResendOTPResult> {
    const sendRes = await this.sendOTP(mobileNumber);
    return {
      success: sendRes.success,
      message: sendRes.message,
      provider: this.name,
      error: sendRes.error
    };
  }
}
