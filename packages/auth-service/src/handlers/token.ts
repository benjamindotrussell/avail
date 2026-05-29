import type { Request, Response } from 'express';
import { prisma } from '../lib/db';
import { issueTokenPair, hashToken } from '../lib/tokens';
import { refreshSchema, logoutSchema } from '../validators/auth';
import type { TokenPair } from '@avail/shared';

export async function refreshToken(req: Request, res: Response): Promise<void> {
  const parsed = refreshSchema.safeParse(req.body);
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

  const { refreshToken: token } = parsed.data;
  const tokenHash = hashToken(token);

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' },
    });
    return;
  }

  if (stored.expiresAt < new Date()) {
    await prisma.refreshToken.deleteMany({ where: { tokenHash } });
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Refresh token expired' },
    });
    return;
  }

  // Verify user is still active
  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user || user.deletedAt) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Account not found or deleted' },
    });
    return;
  }

  // Rotate: delete old token atomically — if count is 0 another request already used it
  const { count } = await prisma.refreshToken.deleteMany({ where: { tokenHash } });
  if (count === 0) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Refresh token already used' } });
    return;
  }
  const newPair = await issueTokenPair(stored.userId);

  const response: TokenPair = {
    accessToken: newPair.accessToken,
    refreshToken: newPair.refreshToken,
  };

  res.status(200).json(response);
}

export async function logout(req: Request, res: Response): Promise<void> {
  const parsed = logoutSchema.safeParse(req.body);
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

  const tokenHash = hashToken(parsed.data.refreshToken);

  // Delete the specific session's refresh token; no error if already gone
  await prisma.refreshToken.deleteMany({
    where: { tokenHash, userId: req.userId },
  });

  res.status(204).send();
}
