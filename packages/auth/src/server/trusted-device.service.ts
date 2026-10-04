import crypto from "crypto";
import { prisma } from "@repo/database";

const MAX_DEVICES = 6;
const EXPIRATION_DAYS = 90;

export interface FingerprintPayload {
  userAgent?: string;
  platform?: string;
  language?: string;
  timezone?: string;
}

export const trustedDeviceService = {
  generateFingerprintHash(payload: FingerprintPayload): string {
    const normalized = JSON.stringify({
      userAgent: payload.userAgent || "",
      platform: payload.platform || "",
      language: payload.language || "",
      timezone: payload.timezone || "",
    });
    return crypto.createHash("sha256").update(normalized).digest("hex");
  },

  hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  },

  async trustDevice(
    userId: string,
    fingerprintPayload: FingerprintPayload,
    deviceName?: string,
  ): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = this.hashToken(rawToken);
    const fingerprintHash = this.generateFingerprintHash(fingerprintPayload);

    // Enforce max 6 devices
    const existingDevices = await prisma.trustedDevice.findMany({
      where: { userId },
      orderBy: { lastUsedAt: "asc" },
    });

    if (existingDevices.length >= MAX_DEVICES) {
      // Remove oldest devices to make room
      const devicesToDelete = existingDevices.slice(
        0,
        existingDevices.length - MAX_DEVICES + 1,
      );
      await prisma.trustedDevice.deleteMany({
        where: { id: { in: devicesToDelete.map((d) => d.id) } },
      });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + EXPIRATION_DAYS);

    await prisma.trustedDevice.create({
      data: {
        userId,
        hashedToken,
        fingerprintHash,
        deviceName,
        expiresAt,
      },
    });

    return rawToken;
  },

  async validateTrustedDevice(
    phoneNumber: string,
    rawToken: string,
    fingerprintPayload: FingerprintPayload,
  ): Promise<string | null> {
    const hashedToken = this.hashToken(rawToken);

    const device = await prisma.trustedDevice.findUnique({
      where: { hashedToken },
      include: { user: true },
    });

    if (!device) return null;
    if (device.user.phoneNumber !== phoneNumber) return null;

    if (device.revokedAt || device.expiresAt < new Date()) {
      return null;
    }

    const fingerprintHash = this.generateFingerprintHash(fingerprintPayload);
    if (device.fingerprintHash !== fingerprintHash) {
      return null;
    }

    // Update lastUsedAt
    await prisma.trustedDevice.update({
      where: { id: device.id },
      data: { lastUsedAt: new Date() },
    });

    return device.userId;
  },
};
