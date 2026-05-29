import type { Request, Response } from 'express';
import { prisma } from '../lib/db';

export async function removeMember(req: Request, res: Response): Promise<void> {
  const { groupId, userId } = req.params;

  const adminMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: req.userId } },
  });

  if (!adminMembership) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });
    return;
  }

  if (adminMembership.role !== 'admin') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only admins can remove members' } });
    return;
  }

  if (userId === req.userId) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Use the leave endpoint to remove yourself' } });
    return;
  }

  const targetMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });

  if (!targetMembership) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Member not found in this group' } });
    return;
  }

  await prisma.groupMember.delete({ where: { groupId_userId: { groupId, userId } } });

  res.status(200).json({ message: 'Member removed' });
}

export async function leaveGroup(req: Request, res: Response): Promise<void> {
  const { groupId } = req.params;

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: req.userId } },
  });

  if (!membership) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });
    return;
  }

  const memberCount = await prisma.groupMember.count({ where: { groupId } });

  if (memberCount === 1) {
    // Last member — delete the group entirely (cascades to members + invite links)
    await prisma.group.delete({ where: { id: groupId } });
  } else {
    await prisma.groupMember.delete({ where: { groupId_userId: { groupId, userId: req.userId } } });
  }

  res.status(200).json({ message: 'Left group' });
}
