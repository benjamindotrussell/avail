import type { Request, Response } from 'express';
import { prisma, redis } from '../lib/db';
import { setStatusSchema } from '../validators/status';
import {
  RedisKeys,
  STATUS_DEFAULT_EXPIRY_HOURS,
} from '@avail/shared';
import type { StatusDTO, StatusUpdateEvent, PushNotificationEvent, Availability, Location, Vibe } from '@avail/shared';

function toStatusDTO(status: {
  id: string;
  userId: string;
  groupId: string;
  availability: string;
  location: string | null;
  locationNote: string | null;
  vibe: string | null;
  vibeNote: string | null;
  expiresAt: Date;
  createdAt: Date;
}): StatusDTO {
  return {
    id: status.id,
    userId: status.userId,
    groupId: status.groupId,
    availability: status.availability as Availability,
    location: status.location as Location | null,
    locationNote: status.locationNote,
    vibe: status.vibe as Vibe | null,
    vibeNote: status.vibeNote,
    expiresAt: status.expiresAt.toISOString(),
    updatedAt: status.createdAt.toISOString(),
  };
}

export async function setStatus(req: Request, res: Response): Promise<void> {
  const parsed = setStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.errors[0]?.message ?? 'Invalid request',
        fields: parsed.error.flatten().fieldErrors as Record<string, string>,
      },
    });
    return;
  }

  const { groupId, availability, location, locationNote, vibe, vibeNote } = parsed.data;

  // Verify caller is a member of the group
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: req.userId } },
  });
  if (!membership) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You are not a member of this group' } });
    return;
  }

  const expiresAt = parsed.data.expiresAt
    ? new Date(parsed.data.expiresAt)
    : new Date(Date.now() + STATUS_DEFAULT_EXPIRY_HOURS * 60 * 60 * 1000);

  // 1. Write to DB
  const status = await prisma.status.create({
    data: { userId: req.userId, groupId, availability, location: location ?? null, locationNote: locationNote ?? null, vibe: vibe ?? null, vibeNote: vibeNote ?? null, expiresAt },
  });

  const statusDTO = toStatusDTO(status);

  // 2. Write to Redis cache with TTL — keyed per user+group
  const ttlSeconds = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  await redis.set(RedisKeys.userStatus(req.userId, groupId), JSON.stringify(statusDTO), { EX: ttlSeconds });

  // 3. Fetch display name for notification
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { displayName: true } });

  // 4. Publish status update to the group channel
  const updatedAt = new Date().toISOString();
  const event: StatusUpdateEvent = { userId: req.userId, groupId, status: statusDTO, updatedAt };
  await redis.publish(RedisKeys.groupStatusChannel(groupId), JSON.stringify(event));

  // 5. Push notification — free and maybe only, busy is silent
  if ((availability === 'free' || availability === 'maybe') && user) {
    const pushEvent: PushNotificationEvent = {
      triggerUserId: req.userId,
      triggerUserName: user.displayName,
      groupIds: [groupId],
      status: {
        availability,
        location: (location ?? null) as Location | null,
        vibe: (vibe ?? null) as Vibe | null,
      },
    };
    await redis.publish(RedisKeys.pushNotificationChannel(), JSON.stringify(pushEvent));
  }

  res.status(200).json({ status: statusDTO });
}

export async function getMyStatus(req: Request, res: Response): Promise<void> {
  const { groupId } = req.query;
  if (typeof groupId !== 'string') {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'groupId query param required' } });
    return;
  }

  const cached = await redis.get(RedisKeys.userStatus(req.userId, groupId));
  if (cached) {
    res.status(200).json({ status: JSON.parse(cached) as StatusDTO });
    return;
  }

  const status = await prisma.status.findFirst({
    where: { userId: req.userId, groupId, deletedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json({ status: status ? toStatusDTO(status) : null });
}

export async function getGroupStatuses(req: Request, res: Response): Promise<void> {
  const { groupId } = req.params;

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: req.userId } },
  });
  if (!membership) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You are not a member of this group' } });
    return;
  }

  const members = await prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } });
  const userIds = members.map(m => m.userId);
  const values = await redis.mGet(userIds.map(id => RedisKeys.userStatus(id, groupId)));

  const statuses = userIds.map((userId, i) => {
    const raw = values[i];
    let status: StatusDTO | null = null;
    if (raw) { try { status = JSON.parse(raw) as StatusDTO; } catch { /* leave null */ } }
    return { userId, status };
  });

  res.status(200).json({ statuses });
}

export async function clearStatus(req: Request, res: Response): Promise<void> {
  const { groupId } = req.body;
  if (typeof groupId !== 'string') {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'groupId required' } });
    return;
  }

  await redis.del(RedisKeys.userStatus(req.userId, groupId));

  const latest = await prisma.status.findFirst({
    where: { userId: req.userId, groupId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (latest) {
    await prisma.status.update({ where: { id: latest.id }, data: { deletedAt: new Date() } });

    const updatedAt = new Date().toISOString();
    const event = { userId: req.userId, groupId, status: null, updatedAt };
    await redis.publish(RedisKeys.groupStatusChannel(groupId), JSON.stringify(event));
  }

  res.status(200).json({ message: 'Status cleared' });
}
