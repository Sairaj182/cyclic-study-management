import {
  OTPProvider,
  SendOTPParams,
  SendOTPResult,
} from "./providers.interface";

const AISENSY_API_URL = "https://backend.aisensy.com/campaign/t1/api/v2";

// Convert E.164 (+919876543210) → 919876543210 (AiSensy format)
function toAiSensyPhone(phone: string): string {
  return phone.replace(/^\+/, "");
}

interface AiSensyProviderOptions {
  apiKey?: string;
  timeout?: number;
}

export class WhatsAppProvider implements OTPProvider {
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(options: AiSensyProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.AISENSY_API_KEY ?? "";
    this.timeout = options.timeout ?? 10_000;
  }

  async sendOTP({ phone, otp }: SendOTPParams): Promise<SendOTPResult> {
    if (process.env.NODE_ENV !== "production") {
      console.log(`
============================

IC DEV WHATSAPP

Phone : ${phone}

OTP   : ${otp}

============================
`);
      return { success: true, provider: "console" };
    }

    if (!this.apiKey) {
      return {
        success: false,
        provider: "aisensy",
        error: "AISENSY_API_KEY is not set",
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const payload = {
        apiKey: this.apiKey,
        campaignName: "auth_otp_new",
        destination: toAiSensyPhone(phone),
        userName: "incubationcenter",
        templateParams: [otp],
        source: "web-auth",
        media: {},
        buttons: [
          {
            type: "button",
            sub_type: "url",
            index: 0,
            parameters: [{ type: "text", text: otp }],
          },
        ],
        carouselCards: [],
        location: {},
        paramsFallbackValue: { FirstName: "Student" },
      };

      const response = await fetch(AISENSY_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const data = (await response.json()) as Record<string, unknown>;

      if (data?.error || data?.success === false) {
        return {
          success: false,
          provider: "aisensy",
          error: String(
            data?.error ?? data?.message ?? "AiSensy rejected the request",
          ),
        };
      }

      return {
        success: true,
        provider: "aisensy",
        messageId: data?.messageId as string | undefined,
      };
    } catch (error) {
      return {
        success: false,
        provider: "aisensy",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
