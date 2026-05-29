import crypto from 'crypto';
import type { Request, Response } from 'express';
import { redis, prisma } from '../lib/db';
import { sendOTP } from '../lib/sns';
import { issueTokenPair } from '../lib/tokens';
import { createCustomToken } from '../lib/firebase';
import { otpRequestSchema, otpVerifySchema } from '../validators/auth';
import { RedisKeys, OTP_TTL_MINUTES, OTP_MAX_ATTEMPTS } from '@avail/shared';
import type { AuthResponse } from '@avail/shared';

const OTP_RATE_LIMIT = 3;
const OTP_RATE_WINDOW_SECONDS = OTP_TTL_MINUTES * 60; // 10 minutes

interface StoredOTP {
  codeHash: string;
  attempts: number;
}

function generateOTPCode(): string {
  // cryptographically random 6-digit code, zero-padded
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashOTPCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export async function requestOTP(req: Request, res: Response): Promise<void> {
  const parsed = otpRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid phone number',
        fields: parsed.error.flatten().fieldErrors as Record<string, string>,
      },
    });
    return;
  }

  const { phone } = parsed.data;

  // Per-phone rate limit: 3 requests per 10 minutes
  // INCR + EXPIRE NX is atomic on Redis 7+
  const rateLimitKey = `otp:rate:${phone}`;
  const multi = redis.multi();
  multi.incr(rateLimitKey);
  multi.expire(rateLimitKey, OTP_RATE_WINDOW_SECONDS, 'NX');
  const [requestCount] = (await multi.exec()) as [number, number];

  if (requestCount > OTP_RATE_LIMIT) {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many OTP requests. Please wait 10 minutes.' },
    });
    return;
  }

  const code = generateOTPCode();
  const stored: StoredOTP = { codeHash: hashOTPCode(code), attempts: 0 };

  await redis.set(RedisKeys.otpKey(phone), JSON.stringify(stored), {
    EX: OTP_RATE_WINDOW_SECONDS,
  });

  await sendOTP(phone, code);

  res.status(204).send();
}

export async function verifyOTP(req: Request, res: Response): Promise<void> {
  const parsed = otpVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        fields: parsed.error.flatten().fieldErrors as Record<string, string>,
      },
    });
    return;
  }

  const { phone, code } = parsed.data;
  const otpKey = RedisKeys.otpKey(phone);

  const raw = await redis.get(otpKey);
  if (!raw) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'OTP expired or not found. Please request a new code.' },
    });
    return;
  }

  const stored = JSON.parse(raw) as StoredOTP;

  if (stored.attempts >= OTP_MAX_ATTEMPTS) {
    await redis.del(otpKey);
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many failed attempts. Please request a new code.' },
    });
    return;
  }

  if (hashOTPCode(code) !== stored.codeHash) {
    // Increment attempt counter while preserving TTL
    const ttl = await redis.ttl(otpKey);
    if (ttl > 0) {
      await redis.set(
        otpKey,
        JSON.stringify({ ...stored, attempts: stored.attempts + 1 }),
        { EX: ttl },
      );
    }
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid OTP code' },
    });
    return;
  }

  // Code is correct — consume it
  await redis.del(otpKey);

  // Find or create user; reactivate soft-deleted accounts
  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({
      data: { phone, displayName: 'Avail User' },
    });
  } else if (user.deletedAt) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: null },
    });
  }

  const [{ accessToken, refreshToken }, firebaseToken] = await Promise.all([
    issueTokenPair(user.id),
    createCustomToken(user.id),
  ]);

  const response: AuthResponse = {
    accessToken,
    refreshToken,
    firebaseToken,
    user: {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
      notifyOnlyWhenActive: user.notifyOnlyWhenActive,
    },
  };

  res.status(200).json(response);
}
