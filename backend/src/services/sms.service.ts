import { config } from '../config/env';

export interface SendSMSResult {
  success: boolean;
  provider: string;
  messageId?: string;
  error?: string;
}

export class SMSService {
  /**
   * Sends real SMS to Indian mobile numbers via Fast2SMS Quick OTP gateway
   */
  public static async sendViaFast2SMS(mobileNumber: string, otp: string): Promise<SendSMSResult> {
    const apiKey = process.env.FAST2SMS_API_KEY || '';
    if (!apiKey) {
      return {
        success: false,
        provider: 'fast2sms',
        error: 'FAST2SMS_API_KEY is not configured in backend/.env'
      };
    }

    // Clean number to 10 digits
    const cleaned = mobileNumber.replace(/[^0-9]/g, '');
    const tenDigit = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;

    if (tenDigit.length !== 10) {
      return {
        success: false,
        provider: 'fast2sms',
        error: 'Fast2SMS requires a valid 10-digit Indian mobile number.'
      };
    }

    try {
      console.log(`[SMSService] Transmitting real OTP to +91${tenDigit} via Fast2SMS telecom gateway...`);

      const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          'authorization': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          variables_values: otp,
          route: 'otp',
          numbers: tenDigit
        })
      });

      const data = (await response.json()) as any;
      console.log('[SMSService] Fast2SMS Gateway Response:', data);

      if (data.return === true) {
        return {
          success: true,
          provider: 'fast2sms',
          messageId: data.request_id || 'fast2sms_sent'
        };
      } else {
        const errMsg = Array.isArray(data.message) ? data.message.join(', ') : (data.message || 'Fast2SMS transmission error');
        return {
          success: false,
          provider: 'fast2sms',
          error: errMsg
        };
      }
    } catch (err: any) {
      console.error('[SMSService] Fast2SMS network error:', err);
      return {
        success: false,
        provider: 'fast2sms',
        error: err.message || 'Network failure connecting to Fast2SMS gateway'
      };
    }
  }

  /**
   * Sends real SMS to any global number via Twilio
   */
  public static async sendViaTwilio(mobileNumber: string, otp: string): Promise<SendSMSResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
    const authToken = process.env.TWILIO_AUTH_TOKEN || '';
    const fromNumber = process.env.TWILIO_PHONE_NUMBER || '';

    if (!accountSid || !authToken || !fromNumber) {
      return {
        success: false,
        provider: 'twilio',
        error: 'Twilio credentials not configured'
      };
    }

    try {
      const normalized = mobileNumber.startsWith('+') ? mobileNumber : `+${mobileNumber}`;
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const body = new URLSearchParams();
      body.append('To', normalized);
      body.append('From', fromNumber);
      body.append('Body', `Your MediBrief verification code is ${otp}. Valid for 5 minutes. Do not share this code.`);

      const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });

      const data = (await response.json()) as any;
      if (response.ok && data.sid) {
        return {
          success: true,
          provider: 'twilio',
          messageId: data.sid
        };
      } else {
        return {
          success: false,
          provider: 'twilio',
          error: data.message || 'Twilio transmission error'
        };
      }
    } catch (err: any) {
      return {
        success: false,
        provider: 'twilio',
        error: err.message
      };
    }
  }

  /**
   * Dispatches real SMS depending on configured provider
   */
  public static async dispatchSMS(mobileNumber: string, otp: string): Promise<SendSMSResult> {
    // If Fast2SMS API key is set, transmit via Fast2SMS
    if (process.env.FAST2SMS_API_KEY) {
      return this.sendViaFast2SMS(mobileNumber, otp);
    }

    // If Twilio is set, transmit via Twilio
    if (process.env.TWILIO_ACCOUNT_SID) {
      return this.sendViaTwilio(mobileNumber, otp);
    }

    // Provider not yet configured
    return {
      success: false,
      provider: 'none',
      error: 'No cellular SMS provider configured yet. Please configure Fast2SMS API Key.'
    };
  }
}
