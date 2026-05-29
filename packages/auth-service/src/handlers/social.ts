import type { Request, Response } from 'express';
import { prisma } from '../lib/db';
import { verifyFirebaseToken } from '../lib/firebase';
import { verifyGoogleToken } from '../lib/googleAuth';
import { issueTokenPair } from '../lib/tokens';
import { socialAuthSchema } from '../validators/auth';
import type { AuthResponse } from '@avail/shared';

export async function socialAuth(req: Request, res: Response): Promise<void> {
  const parsed = socialAuthSchema.safeParse(req.body);
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

  const { provider, idToken, displayName } = parsed.data;

  let uid: string;
  let nameFromToken: string | undefined;

  try {
    if (provider === 'google') {
      // Google ID token verified directly via google-auth-library
      const payload = await verifyGoogleToken(idToken);
      uid = payload.uid;
      nameFromToken = payload.name;
    } else {
      // Apple identity token verified via Firebase Admin
      const decoded = await verifyFirebaseToken(idToken);
      uid = decoded.uid;
      nameFromToken = decoded.name;
    }
  } catch {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired identity token' },
    });
    return;
  }

  const resolvedDisplayName =
    displayName ?? nameFromToken ?? (provider === 'apple' ? 'Apple User' : 'Google User');

  let user =
    provider === 'apple'
      ? await prisma.user.findUnique({ where: { appleId: uid } })
      : await prisma.user.findUnique({ where: { googleId: uid } });

  if (!user) {
    user =
      provider === 'apple'
        ? await prisma.user.create({ data: { appleId: uid, displayName: resolvedDisplayName } })
        : await prisma.user.create({ data: { googleId: uid, displayName: resolvedDisplayName } });
  } else if (user.deletedAt) {
    user = await prisma.user.update({ where: { id: user.id }, data: { deletedAt: null } });
  }

  const { accessToken, refreshToken } = await issueTokenPair(user.id);

  const response: AuthResponse = {
    accessToken,
    refreshToken,
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
