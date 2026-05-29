import crypto from 'crypto';
import type { Request, Response } from 'express';
import { prisma } from '../lib/db';
import { INVITE_LINK_EXPIRY_DAYS } from '@avail/shared';
import type { GroupDTO } from '@avail/shared';

const INVITE_BASE_URL = process.env.INVITE_BASE_URL || 'https://avail.app/join';

function generateInviteCode(): string {
  return crypto.randomBytes(8).toString('base64url').slice(0, 8);
}

function toGroupDTO(group: { id: string; name: string; avatarUrl: string | null; createdAt: Date }): GroupDTO {
  return {
    id: group.id,
    name: group.name,
    avatarUrl: group.avatarUrl,
    createdAt: group.createdAt.toISOString(),
  };
}

export async function createInvite(req: Request, res: Response): Promise<void> {
  const { groupId } = req.params;

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: req.userId } },
  });

  if (!membership) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });
    return;
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_LINK_EXPIRY_DAYS);

  const code = generateInviteCode();

  await prisma.inviteLink.create({
    data: { groupId, code, createdBy: req.userId, expiresAt },
  });

  res.status(201).json({
    inviteUrl: `${INVITE_BASE_URL}/${code}`,
    expiresAt: expiresAt.toISOString(),
  });
}

export async function joinGroup(req: Request, res: Response): Promise<void> {
  const { code } = req.params;

  const invite = await prisma.inviteLink.findUnique({ where: { code } });

  if (!invite || invite.expiresAt < new Date()) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invite link is invalid or has expired' } });
    return;
  }

  const existing = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: invite.groupId, userId: req.userId } },
  });

  if (existing) {
    res.status(409).json({ error: { code: 'CONFLICT', message: 'You are already a member of this group' } });
    return;
  }

  await prisma.groupMember.create({
    data: { groupId: invite.groupId, userId: req.userId, role: 'member' },
  });

  const group = await prisma.group.findUniqueOrThrow({ where: { id: invite.groupId } });

  res.status(200).json({ group: toGroupDTO(group) });
}
