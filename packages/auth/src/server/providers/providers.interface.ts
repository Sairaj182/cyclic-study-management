export interface SendOTPParams {
  phone: string;
  otp: string;
}

export interface SendOTPResult {
  success: boolean;
  provider: string;
  messageId?: string;
  error?: string;
}

export interface OTPProvider {
  sendOTP(params: SendOTPParams): Promise<SendOTPResult>;
}
