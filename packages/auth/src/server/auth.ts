import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@repo/database";
import { smsService } from "./sms.service";
import { phoneNumber } from "better-auth/plugins";
import { trustedDevice } from "./trusted-device.plugin";

const rawOrigins =
  process.env.CORS_ORIGIN ?? "http://localhost:3000,http://localhost:7030";
const trustedOrigins = rawOrigins
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Google sign-in on the admin login page is restricted to staff Workspace
// domains. Google's own `hd` provider option only supports a single domain,
// so multi-domain restriction is enforced in the user.create hook below
// instead (see the emailVerified check for why this only affects OAuth sign-ups).
const allowedGoogleDomains = (
  process.env.GOOGLE_ALLOWED_DOMAINS ?? "nitp.ac.in"
)
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

function isAllowedGoogleEmail(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && allowedGoogleDomains.includes(domain);
}

// In production the API lives at api.incubationcenter.nitp.ac.in and the web at incubationcenter.nitp.ac.in.
// Without crossSubDomainCookies the session cookie is scoped to api.incubationcenter.nitp.ac.in only,
// so Next.js server-side requests (which forward the browser's incubationcenter.nitp.ac.in cookies)
// never include it and every admin API call returns 401.
const authBaseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:4000";
const authHostname = (() => {
  try {
    return new URL(authBaseUrl).hostname;
  } catch {
    return "localhost";
  }
})();
const isLocalhost =
  authHostname === "localhost" || authHostname.endsWith(".localhost");
const isIP = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(authHostname);
const cookieDomain =
  isLocalhost || isIP
    ? undefined
    : "." + authHostname.split(".").slice(-2).join("."); // api.incubationcenter.nitp.ac.in → .incubationcenter.nitp.ac.in

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins,
  trustedProxies: true,
  advanced: {
    crossSubDomainCookies: {
      enabled: !isLocalhost,
      domain: cookieDomain,
    },
  },
  rateLimit: {
    window: 60, // 60 seconds
    max: 100, // 100 requests per IP per window
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      // Existing admin users were provisioned via phone/credential signup and
      // never went through an email-verification flow, so their local
      // emailVerified is false. Google's own OAuth email is independently
      // verified, so it's safe to link without requiring the local flag too.
      requireLocalEmailVerified: false,
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Only OAuth sign-ups arrive with a pre-verified email (credential
          // and phone signups never set emailVerified: true) - this scopes
          // the domain allowlist to Google sign-ins without touching phone
          // signup, which uses a synthetic @incubationcenter.local email.
          if (user.emailVerified && !isAllowedGoogleEmail(user.email)) {
            throw new APIError("FORBIDDEN", {
              message:
                "Sign-in is restricted to Incubation Center NITP staff Google accounts.",
            });
          }
        },
      },
    },
  },
  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber, code }) => {
        const cooldown = await prisma.otpCooldown.findUnique({
          where: { phoneNumber },
        });
        if (cooldown && cooldown.expiresAt > new Date()) {
          throw new APIError("BAD_REQUEST", {
            message: "Please wait before requesting another OTP",
          });
        }

        const success = await smsService.sendOTP(phoneNumber, code);
        if (!success) {
          throw new APIError("INTERNAL_SERVER_ERROR", {
            message: "Failed to send OTP",
          });
        }

        await prisma.otpCooldown.upsert({
          where: { phoneNumber },
          create: { phoneNumber, expiresAt: new Date(Date.now() + 60000) },
          update: { expiresAt: new Date(Date.now() + 60000) },
        });
      },
      sendPasswordResetOTP: async ({ phoneNumber, code }) => {
        const cooldown = await prisma.otpCooldown.findUnique({
          where: { phoneNumber },
        });
        if (cooldown && cooldown.expiresAt > new Date()) {
          throw new APIError("BAD_REQUEST", {
            message: "Please wait before requesting another OTP",
          });
        }

        const success = await smsService.sendOTP(phoneNumber, code);
        if (!success) {
          throw new APIError("INTERNAL_SERVER_ERROR", {
            message: "Failed to send Password Reset OTP",
          });
        }

        await prisma.otpCooldown.upsert({
          where: { phoneNumber },
          create: { phoneNumber, expiresAt: new Date(Date.now() + 60000) },
          update: { expiresAt: new Date(Date.now() + 60000) },
        });
      },

      signUpOnVerification: {
        getTempName(phoneNumber) {
          return phoneNumber;
        },

        getTempEmail(phoneNumber) {
          return `${phoneNumber}@incubationcenter.local`;
        },
      },
    }),
    trustedDevice(),
  ],
});
