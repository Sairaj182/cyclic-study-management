import { WhatsAppProvider } from "./providers/whatsapp.provider";

export interface SMSProviderOptions {
  apiKey?: string;
  timeout?: number;
}

export class SMSService {
  private readonly provider: WhatsAppProvider;

  constructor(options: SMSProviderOptions = {}) {
    this.provider = new WhatsAppProvider({
      apiKey: options.apiKey,
      timeout: options.timeout ?? 10_000,
    });
  }

  /**
   * Sends an OTP to the given phone number.
   *
   * @param phone E.164 formatted phone number (e.g. +919876543210)
   * @param otp One Time Password
   * @returns true if OTP was successfully dispatched
   */
  async sendOTP(phone: string, otp: string): Promise<boolean> {
    try {
      const normalizedPhone = phone.trim();
      const normalizedOtp = otp.trim();

      if (!normalizedPhone) {
        throw new Error("Phone number is required.");
      }

      if (!normalizedOtp) {
        throw new Error("OTP is required.");
      }

      const phoneRegex = /^\+[1-9]\d{7,14}$/;
      if (!phoneRegex.test(normalizedPhone)) {
        throw new Error(
          "Phone number must be in E.164 format (e.g. +919876543210).",
        );
      }

      const otpRegex = /^\d{4,8}$/;
      if (!otpRegex.test(normalizedOtp)) {
        throw new Error("Invalid OTP format.");
      }

      const result = await this.provider.sendOTP({
        phone: normalizedPhone,
        otp: normalizedOtp,
      });

      if (!result.success) {
        console.error(
          `[SMSService] Provider (${result.provider}) failed:`,
          result.error,
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error("[SMSService]", error);
      return false;
    }
  }
}

export const smsService = new SMSService({
  apiKey: process.env.AISENSY_API_KEY,
});
