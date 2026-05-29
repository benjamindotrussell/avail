import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db';
import type { UserDTO } from '@avail/shared';

const userSelect = {
  id: true,
  displayName: true,
  avatarUrl: true,
  createdAt: true,
  deletedAt: true,
  notifyOnlyWhenActive: true,
} as const;

function toUserDTO(user: { id: string; displayName: string; avatarUrl: string | null; createdAt: Date; notifyOnlyWhenActive: boolean }): UserDTO {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
    notifyOnlyWhenActive: user.notifyOnlyWhenActive,
  };
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: userSelect,
  });

  if (!user || user.deletedAt) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    return;
  }

  res.json({ user: toUserDTO(user) });
}

const updateMeSchema = z.object({
  notifyOnlyWhenActive: z.boolean().optional(),
  displayName: z.string().min(1).max(50).optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

export async function updateMe(req: Request, res: Response): Promise<void> {
  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', fields: parsed.error.flatten().fieldErrors as Record<string, string> } });
    return;
  }

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: parsed.data,
    select: userSelect,
  });

  res.json({ user: toUserDTO(user) });
}
