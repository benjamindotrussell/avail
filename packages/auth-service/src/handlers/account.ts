import type { Request, Response } from 'express';
import { prisma } from '../lib/db';

export async function deleteAccount(req: Request, res: Response): Promise<void> {
  const userId = req.userId;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Account not found' },
    });
    return;
  }

  // Soft delete — required by App Store guidelines
  // All refresh tokens are deleted so no further API access is possible
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    }),
    prisma.refreshToken.deleteMany({ where: { userId } }),
  ]);

  res.status(204).send();
}
