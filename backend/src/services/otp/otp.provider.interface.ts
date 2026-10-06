export interface SendOTPResult {
  success: boolean;
  message: string;
  provider: string;
  messageId?: string;
  expiresInSeconds: number;
  devOtp?: string;
  error?: string;
}

export interface VerifyOTPResult {
  success: boolean;
  message: string;
  provider: string;
  error?: string;
}

export interface ResendOTPResult {
  success: boolean;
  message: string;
  provider: string;
  error?: string;
}

export interface OTPProvider {
  name: string;
  sendOTP(mobileNumber: string, otp: string): Promise<SendOTPResult>;
  verifyOTP(mobileNumber: string, otp: string): Promise<VerifyOTPResult>;
  resendOTP(mobileNumber: string): Promise<ResendOTPResult>;
}
