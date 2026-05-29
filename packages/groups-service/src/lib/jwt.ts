import jwt from 'jsonwebtoken';
import type { JWTPayload } from '@avail/shared';

// Groups service only verifies tokens — signing is auth-service's responsibility
function getPublicKey(): string {
  const key = process.env.JWT_PUBLIC_KEY;
  if (!key) throw new Error('JWT_PUBLIC_KEY is not set');
  return key.replace(/\\n/g, '\n');
}

export function verifyAccessToken(token: string): JWTPayload {
  return jwt.verify(token, getPublicKey(), { algorithms: ['RS256'] }) as JWTPayload;
}
