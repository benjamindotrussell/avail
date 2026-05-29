import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma, redis } from '../lib/db';
import { createGroupSchema, updateGroupSchema } from '../validators/groups';
import { RedisKeys } from '@avail/shared';
import type { GroupDTO, GroupWithMembersDTO, GroupMemberDTO, StatusDTO, UserDTO } from '@avail/shared';

type MemberWithUser = Prisma.GroupMemberGetPayload<{ include: { user: true } }>;
type GroupWithMembers = Prisma.GroupGetPayload<{ include: { members: { include: { user: true } } } }>;

const memberInclude = { members: { include: { user: true } } } as const;

async function fetchStatusMap(userIds: string[], groupId: string): Promise<Map<string, StatusDTO | null>> {
  const map = new Map<string, StatusDTO | null>();
  if (userIds.length === 0) return map;

  const values = await redis.mGet(userIds.map(id => RedisKeys.userStatus(id, groupId)));
  userIds.forEach((id, i) => {
    const raw = values[i];
    if (raw) {
      try { map.set(id, JSON.parse(raw) as StatusDTO); } catch { map.set(id, null); }
    } else {
      map.set(id, null);
    }
  });
  return map;
}

function toUserDTO(m: MemberWithUser): UserDTO {
  return {
    id: m.user.id,
    displayName: m.user.displayName,
    avatarUrl: m.user.avatarUrl,
    createdAt: m.user.createdAt.toISOString(),
  };
}

function toGroupDTO(group: { id: string; name: string; avatarUrl: string | null; createdAt: Date }): GroupDTO {
  return {
    id: group.id,
    name: group.name,
    avatarUrl: group.avatarUrl,
    createdAt: group.createdAt.toISOString(),
  };
}

function toGroupWithMembersDTO(group: GroupWithMembers, statusMap: Map<string, StatusDTO | null>): GroupWithMembersDTO {
  const members: GroupMemberDTO[] = group.members.map(m => ({
    user: toUserDTO(m),
    role: m.role as 'admin' | 'member',
    joinedAt: m.joinedAt.toISOString(),
    status: statusMap.get(m.userId) ?? null,
  }));

  return {
    ...toGroupDTO(group),
    members,
    freeCount: members.filter(m => m.status?.availability === 'free').length,
    maybeCount: members.filter(m => m.status?.availability === 'maybe').length,
  };
}

export async function createGroup(req: Request, res: Response): Promise<void> {
  const parsed = createGroupSchema.safeParse(req.body);
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

  const { name, avatarUrl } = parsed.data;

  const group = await prisma.group.create({
    data: {
      name,
      avatarUrl,
      createdBy: req.userId,
      members: {
        create: { userId: req.userId, role: 'admin' },
      },
    },
  });

  res.status(201).json({ group: toGroupDTO(group) });
}

export async function listGroups(req: Request, res: Response): Promise<void> {
  const groups = await prisma.group.findMany({
    where: { members: { some: { userId: req.userId } } },
    include: memberInclude,
    orderBy: { createdAt: 'desc' },
  });

  // One mGet across all (userId, groupId) pairs to avoid N+1 Redis calls
  const keyEntries = groups.flatMap(g => g.members.map(m => ({ userId: m.userId, groupId: g.id })));
  const rawValues = keyEntries.length > 0
    ? await redis.mGet(keyEntries.map(e => RedisKeys.userStatus(e.userId, e.groupId)))
    : [];

  const statusLookup = new Map<string, StatusDTO | null>();
  keyEntries.forEach((e, i) => {
    const raw = rawValues[i];
    let status: StatusDTO | null = null;
    if (raw) { try { status = JSON.parse(raw) as StatusDTO; } catch { /* leave null */ } }
    statusLookup.set(`${e.userId}:${e.groupId}`, status);
  });

  const groupDTOs = groups.map(g => {
    const statusMap = new Map<string, StatusDTO | null>(
      g.members.map(m => [m.userId, statusLookup.get(`${m.userId}:${g.id}`) ?? null])
    );
    return toGroupWithMembersDTO(g, statusMap);
  });

  res.status(200).json({ groups: groupDTOs });
}

export async function getGroup(req: Request, res: Response): Promise<void> {
  const { groupId } = req.params;

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: memberInclude,
  });

  if (!group) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });
    return;
  }

  const isMember = group.members.some(m => m.userId === req.userId);
  if (!isMember) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You are not a member of this group' } });
    return;
  }

  const statusMap = await fetchStatusMap(group.members.map(m => m.userId), groupId);

  res.status(200).json({ group: toGroupWithMembersDTO(group, statusMap) });
}

export async function updateGroup(req: Request, res: Response): Promise<void> {
  const { groupId } = req.params;

  const parsed = updateGroupSchema.safeParse(req.body);
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

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: req.userId } },
  });

  if (!membership) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });
    return;
  }

  if (membership.role !== 'admin') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only admins can update group settings' } });
    return;
  }

  const group = await prisma.group.update({
    where: { id: groupId },
    data: parsed.data,
  });

  res.status(200).json({ group: toGroupDTO(group) });
}

export async function deleteGroup(req: Request, res: Response): Promise<void> {
  const { groupId } = req.params;

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: req.userId } },
  });

  if (!membership) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });
    return;
  }

  if (membership.role !== 'admin') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only admins can delete a group' } });
    return;
  }

  await prisma.group.delete({ where: { id: groupId } });

  res.status(200).json({ message: 'Group deleted' });
}
