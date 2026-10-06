import { OTPProvider, SendOTPResult, VerifyOTPResult, ResendOTPResult } from './otp.provider.interface';

export class MSG91OTPProvider implements OTPProvider {
  public name = 'msg91';

  private getAuthKey(): string {
    return (process.env.MSG91_AUTH_KEY || process.env.MSG91_API_KEY || '').trim();
  }

  private getTemplateId(): string {
    return (process.env.MSG91_OTP_TEMPLATE_ID || '').trim();
  }

  /**
   * Normalizes mobile number for MSG91:
   * Indian number must be prefixed with country code 91 without '+'
   */
  private formatMobileNumber(mobileNumber: string): string {
    const cleaned = mobileNumber.replace(/[^0-9]/g, '');
    if (cleaned.length === 10) {
      return `91${cleaned}`;
    }
    if (cleaned.startsWith('91') && cleaned.length === 12) {
      return cleaned;
    }
    return cleaned;
  }

  /**
   * Sends OTP via MSG91 Send OTP API
   * Endpoint: POST https://control.msg91.com/api/v5/otp
   */
  public async sendOTP(mobileNumber: string, otp: string): Promise<SendOTPResult> {
    const authKey = this.getAuthKey();
    const templateId = this.getTemplateId();
    const formattedMobile = this.formatMobileNumber(mobileNumber);

    if (!authKey) {
      return {
        success: false,
        message: 'MSG91_API_KEY is not configured in backend/.env',
        provider: this.name,
        expiresInSeconds: 300,
        devOtp: otp,
        error: 'MSG91_API_KEY missing'
      };
    }

    if (!templateId) {
      return {
        success: false,
        message: 'MSG91_OTP_TEMPLATE_ID is not configured in backend/.env',
        provider: this.name,
        expiresInSeconds: 300,
        devOtp: otp,
        error: 'MSG91_OTP_TEMPLATE_ID missing'
      };
    }

    try {
      console.log(`[MSG91] Transmitting real OTP to ${formattedMobile} via MSG91 Send OTP API...`);

      // MSG91 v5 OTP API sends OTP with query parameters & optional JSON body
      const url = new URL('https://control.msg91.com/api/v5/otp');
      url.searchParams.append('template_id', templateId);
      url.searchParams.append('mobile', formattedMobile);
      url.searchParams.append('authkey', authKey);
      url.searchParams.append('otp_expiry', '5'); // 5 minutes
      if (otp) {
        url.searchParams.append('otp', otp);
      }

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authkey': authKey
        }
      });

      const data = (await response.json()) as any;
      console.log('[MSG91] Send OTP API Response:', data);

      if (data.type === 'success' || data.type === 'SUCCESS' || data.message === 'OTP sent successfully' || data.message === 'Already Sent') {
        return {
          success: true,
          message: 'OTP SMS delivered successfully to your phone via MSG91 telecom gateway.',
          provider: this.name,
          messageId: data.message_id || data.request_id || 'msg91_dispatched',
          expiresInSeconds: 300
        };
      } else {
        const errorMsg = data.message || JSON.stringify(data);
        return {
          success: false,
          message: `MSG91 transmission error: ${errorMsg}`,
          provider: this.name,
          expiresInSeconds: 300,
          devOtp: otp,
          error: errorMsg
        };
      }
    } catch (err: any) {
      console.error('[MSG91] Send OTP network failure:', err);
      return {
        success: false,
        message: `Network error connecting to MSG91 gateway: ${err.message}`,
        provider: this.name,
        expiresInSeconds: 300,
        devOtp: otp,
        error: err.message
      };
    }
  }

  /**
   * Verifies OTP via MSG91 Verify OTP API
   * Endpoint: GET / POST https://control.msg91.com/api/v5/otp/verify
   */
  public async verifyOTP(mobileNumber: string, otp: string): Promise<VerifyOTPResult> {
    const authKey = this.getAuthKey();
    const formattedMobile = this.formatMobileNumber(mobileNumber);

    if (!authKey) {
      return {
        success: false,
        message: 'MSG91_API_KEY is not configured',
        provider: this.name,
        error: 'MSG91_API_KEY missing'
      };
    }

    try {
      console.log(`[MSG91] Verifying OTP with MSG91 API for ${formattedMobile}...`);

      const url = new URL('https://control.msg91.com/api/v5/otp/verify');
      url.searchParams.append('mobile', formattedMobile);
      url.searchParams.append('otp', otp.trim());
      url.searchParams.append('authkey', authKey);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'authkey': authKey
        }
      });

      const data = (await response.json()) as any;
      console.log('[MSG91] Verify OTP API Response:', data);

      if (data.type === 'success' || data.type === 'SUCCESS' || data.message === 'OTP verified success' || data.message === 'Mobile no. already verified') {
        return {
          success: true,
          message: 'OTP verified successfully by MSG91.',
          provider: this.name
        };
      } else {
        const errorMsg = data.message || 'Invalid or expired OTP';
        return {
          success: false,
          message: errorMsg,
          provider: this.name,
          error: errorMsg
        };
      }
    } catch (err: any) {
      console.error('[MSG91] Verify OTP network failure:', err);
      return {
        success: false,
        message: `Network error connecting to MSG91 verify API: ${err.message}`,
        provider: this.name,
        error: err.message
      };
    }
  }

  /**
   * Resends OTP via MSG91 Resend OTP API with retry type (voice / text)
   * Endpoint: POST https://control.msg91.com/api/v5/otp/retry
   */
  public async resendOTP(mobileNumber: string): Promise<ResendOTPResult> {
    const authKey = this.getAuthKey();
    const formattedMobile = this.formatMobileNumber(mobileNumber);

    if (!authKey) {
      return {
        success: false,
        message: 'MSG91_API_KEY is not configured',
        provider: this.name,
        error: 'MSG91_API_KEY missing'
      };
    }

    try {
      console.log(`[MSG91] Requesting OTP resend via MSG91 retry API for ${formattedMobile}...`);

      const url = new URL('https://control.msg91.com/api/v5/otp/retry');
      url.searchParams.append('mobile', formattedMobile);
      url.searchParams.append('retrytype', 'text');
      url.searchParams.append('authkey', authKey);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'authkey': authKey
        }
      });

      const data = (await response.json()) as any;
      console.log('[MSG91] Resend OTP API Response:', data);

      if (data.type === 'success' || data.type === 'SUCCESS') {
        return {
          success: true,
          message: 'OTP resent successfully via MSG91.',
          provider: this.name
        };
      } else {
        return {
          success: false,
          message: data.message || 'Failed to resend OTP via MSG91',
          provider: this.name,
          error: data.message
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Network failure: ${err.message}`,
        provider: this.name,
        error: err.message
      };
    }
  }
}
