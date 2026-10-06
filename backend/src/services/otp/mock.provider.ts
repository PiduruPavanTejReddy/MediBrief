import { OTPProvider, SendOTPResult, VerifyOTPResult, ResendOTPResult } from './otp.provider.interface';

export class MockOTPProvider implements OTPProvider {
  public name = 'mock';

  public async sendOTP(mobileNumber: string, otp: string): Promise<SendOTPResult> {
    console.log(`[MockOTPProvider] Dispatched mock OTP for ${mobileNumber}: ${otp}`);
    return {
      success: true,
      message: 'OTP sent (Dev/Mock Mode).',
      provider: this.name,
      messageId: 'mock_' + Date.now(),
      expiresInSeconds: 300,
      devOtp: otp
    };
  }

  public async verifyOTP(_mobileNumber: string, _otp: string): Promise<VerifyOTPResult> {
    return {
      success: true,
      message: 'Verified locally.',
      provider: this.name
    };
  }

  public async resendOTP(mobileNumber: string): Promise<ResendOTPResult> {
    return {
      success: true,
      message: `Mock OTP resent for ${mobileNumber}.`,
      provider: this.name
    };
  }
}
