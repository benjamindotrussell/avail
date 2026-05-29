import crypto from 'crypto';
import { prisma } from './db';
import { signAccessToken } from './jwt';

const REFRESH_EXPIRY_DAYS = 30;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function issueTokenPair(userId: string): Promise<TokenPair> {
  const accessToken = signAccessToken(userId);

  // Refresh token is a random opaque value; only the SHA-256 hash is stored
  const refreshToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });

  return { accessToken, refreshToken };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
