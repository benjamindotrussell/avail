import type { Message } from 'firebase-admin/messaging';
import { getMessaging } from './firebase';
import { prisma, redis } from './db';
import type { PushNotificationEvent, Location, Vibe } from '@avail/shared';
import { RedisKeys } from '@avail/shared';

const LOCATION_LABELS: Record<NonNullable<Location>, string> = {
  my_place: 'My place',
  pub: 'The pub',
  out: 'Out and about',
  someones_place: "Someone's place",
  other: 'Custom location',
};

const VIBE_LABELS: Record<NonNullable<Vibe>, string> = {
  im_paying: "I'm paying",
  buying_own: 'Buying my own',
  suggest: 'Suggest something',
  free_cheap: 'Going free/cheap',
  other: 'Custom vibe',
};

export function buildNotificationBody(location: Location | null, vibe: Vibe | null): string {
  const parts = [
    location ? LOCATION_LABELS[location] : null,
    vibe ? VIBE_LABELS[vibe] : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : "They're up for it";
}

export function buildTitle(displayName: string, availability: 'free' | 'maybe'): string {
  return availability === 'free'
    ? `${displayName} is free`
    : `${displayName} might be free`;
}

function buildMessage(token: string, title: string, body: string, userId: string, groupId: string, platform: string): Message {
  const base = {
    token,
    notification: { title, body },
    data: { type: 'status_update', userId, groupId },
  };

  if (platform === 'ios') {
    return { ...base, apns: { payload: { aps: { sound: 'default', badge: 1 } } } };
  }

  return { ...base, android: { priority: 'high' as const } };
}

export async function sendPushNotifications(event: PushNotificationEvent): Promise<void> {
  // Defend the rule: only free and maybe trigger pushes
  if (event.status.availability !== 'free' && event.status.availability !== 'maybe') return;

  const title = buildTitle(event.triggerUserName, event.status.availability);
  const body = buildNotificationBody(event.status.location, event.status.vibe);

  // Collect unique recipient userIds across all groups (exclude the trigger user)
  const memberships = await prisma.groupMember.findMany({
    where: {
      groupId: { in: event.groupIds },
      userId: { not: event.triggerUserId },
    },
    select: { userId: true },
    distinct: ['userId'],
  });

  let recipientIds = memberships.map(m => m.userId);
  if (recipientIds.length === 0) return;

  // Available mode: skip users who opted in but have no active status in any shared group
  const availableModeUsers = await prisma.user.findMany({
    where: { id: { in: recipientIds }, notifyOnlyWhenActive: true },
    select: { id: true },
  });

  if (availableModeUsers.length > 0) {
    const filteredIds = availableModeUsers.map(u => u.id);
    const keys = filteredIds.flatMap(userId =>
      event.groupIds.map(groupId => RedisKeys.userStatus(userId, groupId))
    );
    const values = await redis.mGet(keys);

    const activeUsers = new Set<string>();
    filteredIds.forEach((userId, ui) => {
      for (let gi = 0; gi < event.groupIds.length; gi++) {
        const raw = values[ui * event.groupIds.length + gi];
        if (raw) {
          try {
            const s = JSON.parse(raw) as { availability: string };
            if (s.availability === 'free' || s.availability === 'maybe') {
              activeUsers.add(userId);
              break;
            }
          } catch { /* skip */ }
        }
      }
    });

    const filteredSet = new Set(filteredIds);
    recipientIds = recipientIds.filter(id => !filteredSet.has(id) || activeUsers.has(id));
    if (recipientIds.length === 0) return;
  }

  const deviceTokens = await prisma.deviceToken.findMany({
    where: { userId: { in: recipientIds } },
    select: { token: true, platform: true, userId: true },
  });

  if (deviceTokens.length === 0) return;

  const messaging = getMessaging();

  // Send to each token; clean up invalid ones
  await Promise.allSettled(
    deviceTokens.map(async ({ token, platform, userId }) => {
      // Use the first groupId the user shares with the trigger user for the deep link
      const groupId = event.groupIds[0] ?? '';
      const message = buildMessage(token, title, body, event.triggerUserId, groupId, platform);

      try {
        await messaging.send(message);
      } catch (err: unknown) {
        const code = (err as { errorInfo?: { code?: string } })?.errorInfo?.code;
        if (code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token') {
          await prisma.deviceToken.deleteMany({ where: { token, userId } });
        }
      }
    })
  );
}
