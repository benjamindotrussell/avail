import jwt from 'jsonwebtoken';
import type { JWTPayload } from '@avail/shared';

// RS256 — private key signs (auth-service only), public key verifies (all services)
// Keys may be stored with literal \n in env vars (common in CI/CD) — normalise them
function getPrivateKey(): string {
  const key = process.env.JWT_PRIVATE_KEY;
  if (!key) throw new Error('JWT_PRIVATE_KEY is not set');
  return key.replace(/\\n/g, '\n');
}

function getPublicKey(): string {
  const key = process.env.JWT_PUBLIC_KEY;
  if (!key) throw new Error('JWT_PUBLIC_KEY is not set');
  return key.replace(/\\n/g, '\n');
}

const ACCESS_EXPIRY = (process.env.JWT_ACCESS_EXPIRY || '15m') as jwt.SignOptions['expiresIn'];

export function signAccessToken(userId: string): string {
  return jwt.sign({ userId }, getPrivateKey(), {
    algorithm: 'RS256',
    expiresIn: ACCESS_EXPIRY,
  });
}

export function verifyAccessToken(token: string): JWTPayload {
  return jwt.verify(token, getPublicKey(), { algorithms: ['RS256'] }) as JWTPayload;
}
