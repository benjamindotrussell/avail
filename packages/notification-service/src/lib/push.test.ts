import { buildNotificationBody, buildTitle, sendPushNotifications } from './push';
import type { PushNotificationEvent } from '@avail/shared';

jest.mock('./db', () => ({
  prisma: {
    groupMember: { findMany: jest.fn() },
    deviceToken: { findMany: jest.fn(), deleteMany: jest.fn() },
  },
}));

jest.mock('./firebase', () => ({
  getMessaging: jest.fn(() => ({ send: jest.fn().mockResolvedValue('message-id') })),
}));

import { prisma } from './db';
import { getMessaging } from './firebase';

const p = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const mockGetMessaging = getMessaging as jest.Mock;

beforeEach(() => jest.clearAllMocks());

// ─── Pure helper tests ─────────────────────────────────────────────────────────

describe('buildNotificationBody', () => {
  it('combines location and vibe with separator', () => {
    expect(buildNotificationBody('pub', 'im_paying')).toBe("The pub · I'm paying");
  });

  it('returns location label only', () => {
    expect(buildNotificationBody('my_place', null)).toBe('My place');
  });

  it('returns vibe label only', () => {
    expect(buildNotificationBody(null, 'suggest')).toBe('Suggest something');
  });

  it('returns fallback when both are null', () => {
    expect(buildNotificationBody(null, null)).toBe("They're up for it");
  });

  it('handles all location values', () => {
    expect(buildNotificationBody('out', null)).toBe('Out and about');
    expect(buildNotificationBody('someones_place', null)).toBe("Someone's place");
    expect(buildNotificationBody('pub', null)).toBe('The pub');
    expect(buildNotificationBody('my_place', null)).toBe('My place');
  });

  it('handles all vibe values', () => {
    expect(buildNotificationBody(null, 'im_paying')).toBe("I'm paying");
    expect(buildNotificationBody(null, 'buying_own')).toBe('Buying my own');
    expect(buildNotificationBody(null, 'suggest')).toBe('Suggest something');
  });
});

describe('buildTitle', () => {
  it('returns "is free" for free availability', () => {
    expect(buildTitle('Jamie', 'free')).toBe('Jamie is free');
  });

  it('returns "might be free" for maybe availability', () => {
    expect(buildTitle('Sam', 'maybe')).toBe('Sam might be free');
  });
});

// ─── sendPushNotifications ─────────────────────────────────────────────────────

const FREE_EVENT: PushNotificationEvent = {
  triggerUserId: 'user-1',
  triggerUserName: 'Jamie',
  groupIds: ['group-1'],
  status: { availability: 'free', location: 'pub', vibe: 'im_paying' },
};

const MAYBE_EVENT: PushNotificationEvent = {
  triggerUserId: 'user-1',
  triggerUserName: 'Jamie',
  groupIds: ['group-1'],
  status: { availability: 'maybe', location: null, vibe: null },
};

describe('sendPushNotifications', () => {
  it('sends push for free status', async () => {
    p.groupMember.findMany.mockResolvedValue([{ userId: 'user-2' }]);
    p.deviceToken.findMany.mockResolvedValue([{ token: 'tok-ios', platform: 'ios', userId: 'user-2' }]);
    const mockSend = jest.fn().mockResolvedValue('ok');
    mockGetMessaging.mockReturnValue({ send: mockSend });

    await sendPushNotifications(FREE_EVENT);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const msg = mockSend.mock.calls[0][0];
    expect(msg.notification.title).toBe('Jamie is free');
    expect(msg.notification.body).toBe("The pub · I'm paying");
  });

  it('sends push for maybe status (new rule)', async () => {
    p.groupMember.findMany.mockResolvedValue([{ userId: 'user-2' }]);
    p.deviceToken.findMany.mockResolvedValue([{ token: 'tok-android', platform: 'android', userId: 'user-2' }]);
    const mockSend = jest.fn().mockResolvedValue('ok');
    mockGetMessaging.mockReturnValue({ send: mockSend });

    await sendPushNotifications(MAYBE_EVENT);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const msg = mockSend.mock.calls[0][0];
    expect(msg.notification.title).toBe('Jamie might be free');
  });

  it('excludes the trigger user from recipients', async () => {
    p.groupMember.findMany.mockResolvedValue([]);
    p.deviceToken.findMany.mockResolvedValue([]);

    await sendPushNotifications(FREE_EVENT);
    expect(p.groupMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: { not: 'user-1' } }),
    }));
  });

  it('does nothing when there are no recipients', async () => {
    p.groupMember.findMany.mockResolvedValue([]);
    const mockSend = jest.fn();
    mockGetMessaging.mockReturnValue({ send: mockSend });

    await sendPushNotifications(FREE_EVENT);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('does nothing when recipients have no device tokens', async () => {
    p.groupMember.findMany.mockResolvedValue([{ userId: 'user-2' }]);
    p.deviceToken.findMany.mockResolvedValue([]);
    const mockSend = jest.fn();
    mockGetMessaging.mockReturnValue({ send: mockSend });

    await sendPushNotifications(FREE_EVENT);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('applies correct iOS payload shape', async () => {
    p.groupMember.findMany.mockResolvedValue([{ userId: 'user-2' }]);
    p.deviceToken.findMany.mockResolvedValue([{ token: 'ios-tok', platform: 'ios', userId: 'user-2' }]);
    const mockSend = jest.fn().mockResolvedValue('ok');
    mockGetMessaging.mockReturnValue({ send: mockSend });

    await sendPushNotifications(FREE_EVENT);
    const msg = mockSend.mock.calls[0][0];
    expect(msg.apns).toBeDefined();
    expect(msg.android).toBeUndefined();
    expect(msg.apns.payload.aps.sound).toBe('default');
  });

  it('applies correct Android payload shape', async () => {
    p.groupMember.findMany.mockResolvedValue([{ userId: 'user-2' }]);
    p.deviceToken.findMany.mockResolvedValue([{ token: 'android-tok', platform: 'android', userId: 'user-2' }]);
    const mockSend = jest.fn().mockResolvedValue('ok');
    mockGetMessaging.mockReturnValue({ send: mockSend });

    await sendPushNotifications(FREE_EVENT);
    const msg = mockSend.mock.calls[0][0];
    expect(msg.android).toBeDefined();
    expect(msg.android.priority).toBe('high');
    expect(msg.apns).toBeUndefined();
  });

  it('removes invalid tokens on Firebase error', async () => {
    p.groupMember.findMany.mockResolvedValue([{ userId: 'user-2' }]);
    p.deviceToken.findMany.mockResolvedValue([{ token: 'stale-tok', platform: 'ios', userId: 'user-2' }]);
    p.deviceToken.deleteMany.mockResolvedValue({ count: 1 });
    const mockSend = jest.fn().mockRejectedValue({ errorInfo: { code: 'messaging/registration-token-not-registered' } });
    mockGetMessaging.mockReturnValue({ send: mockSend });

    await sendPushNotifications(FREE_EVENT);
    expect(p.deviceToken.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { token: 'stale-tok', userId: 'user-2' },
    }));
  });

  it('does not remove tokens on non-registration errors', async () => {
    p.groupMember.findMany.mockResolvedValue([{ userId: 'user-2' }]);
    p.deviceToken.findMany.mockResolvedValue([{ token: 'tok', platform: 'ios', userId: 'user-2' }]);
    p.deviceToken.deleteMany.mockResolvedValue({ count: 0 });
    const mockSend = jest.fn().mockRejectedValue({ errorInfo: { code: 'messaging/internal-error' } });
    mockGetMessaging.mockReturnValue({ send: mockSend });

    await sendPushNotifications(FREE_EVENT);
    expect(p.deviceToken.deleteMany).not.toHaveBeenCalled();
  });
});
