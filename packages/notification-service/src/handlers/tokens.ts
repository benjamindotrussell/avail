import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db';

const registerSchema = z.object({
  token: z.string().min(1).max(500),
  platform: z.enum(['ios', 'android']),
});

const removeSchema = z.object({
  token: z.string().min(1).max(500),
});

export async function registerToken(req: Request, res: Response): Promise<void> {
  const parsed = registerSchema.safeParse(req.body);
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

  const { token, platform } = parsed.data;

  // Upsert — tokens rotate on every app launch so this is called frequently
  await prisma.deviceToken.upsert({
    where: { userId_token: { userId: req.userId, token } },
    create: { userId: req.userId, token, platform },
    update: { platform, updatedAt: new Date() },
  });

  res.status(204).send();
}

export async function removeToken(req: Request, res: Response): Promise<void> {
  const parsed = removeSchema.safeParse(req.body);
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

  await prisma.deviceToken.deleteMany({
    where: { userId: req.userId, token: parsed.data.token },
  });

  res.status(204).send();
}
