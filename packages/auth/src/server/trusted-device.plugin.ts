import { BetterAuthPlugin } from "better-auth";
import {
  createAuthEndpoint,
  getSessionFromCtx,
  APIError,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

import { z } from "zod";
import { trustedDeviceService } from "./trusted-device.service";

export const trustedDevice = (): BetterAuthPlugin => {
  return {
    id: "trusted-device",
    endpoints: {
      trustedLogin: createAuthEndpoint(
        "/trusted/login",
        {
          method: "POST",
          body: z.object({
            phoneNumber: z.string(),
            fingerprint: z.object({
              userAgent: z.string().optional(),
              platform: z.string().optional(),
              language: z.string().optional(),
              timezone: z.string().optional(),
            }),
          }),
        },
        async (ctx) => {
          const context = ctx.context as any;
          const rawToken = await ctx.getSignedCookie(
            "trusted_device",
            context.secret,
          );
          if (!rawToken) {
            throw new APIError("UNAUTHORIZED", {
              message: "No trusted device token",
            });
          }

          const userId = await trustedDeviceService.validateTrustedDevice(
            ctx.body.phoneNumber,
            rawToken,
            ctx.body.fingerprint,
          );

          if (!userId) {
            throw new APIError("UNAUTHORIZED", {
              message: "Invalid trusted device",
            });
          }

          const user = await context.internalAdapter.findUserById(userId);
          if (!user) {
            throw new APIError("NOT_FOUND", { message: "User not found" });
          }

          const session = await context.internalAdapter.createSession(
            userId,
            ctx.request,
          );
          if (!session) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Failed to create session",
            });
          }

          await setSessionCookie(ctx, { session, user });

          return ctx.json({
            token: session.token,
            user: user,
          });
        },
      ),

      trustDevice: createAuthEndpoint(
        "/trusted/trust",
        {
          method: "POST",
          body: z.object({
            deviceName: z.string().optional(),
            fingerprint: z.object({
              userAgent: z.string().optional(),
              platform: z.string().optional(),
              language: z.string().optional(),
              timezone: z.string().optional(),
            }),
          }),
        },
        async (ctx) => {
          const context = ctx.context as any;
          const session = await getSessionFromCtx(ctx);
          if (!session) {
            throw new APIError("UNAUTHORIZED", { message: "Unauthorized" });
          }

          const rawToken = await trustedDeviceService.trustDevice(
            session.user.id,
            ctx.body.fingerprint,
            ctx.body.deviceName,
          );

          await ctx.setSignedCookie(
            "trusted_device",
            rawToken,
            context.secret,
            {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
              path: "/",
              maxAge: 60 * 60 * 24 * 90, // 90 days
            },
          );

          return ctx.json({ success: true });
        },
      ),
    },
  };
};
