import request from 'supertest';
import express from 'express';

jest.mock('../lib/db', () => ({
  prisma: {
    status: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    groupMember: { findUnique: jest.fn(), findMany: jest.fn() },
    user: { findUnique: jest.fn() },
  },
  redis: {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    mGet: jest.fn(),
    publish: jest.fn(),
  },
}));

import { prisma, redis } from '../lib/db';
import { setStatus, getMyStatus, getGroupStatuses, clearStatus } from './status';

const p = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const r = redis as unknown as Record<string, jest.Mock>;

const USER_ID = 'user-1';
const GROUP_ID = 'group-1';
const NOW = new Date();
const EXPIRES = new Date(Date.now() + 8 * 3600_000);

const DB_STATUS = { id: 'status-1', userId: USER_ID, availability: 'free', location: 'pub', vibe: 'im_paying', expiresAt: EXPIRES, createdAt: NOW };

function makeApp(userId = USER_ID) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.userId = userId; next(); });
  app.put('/status', setStatus);
  app.get('/status/me', getMyStatus);
  app.get('/status/group/:groupId', getGroupStatuses);
  app.delete('/status', clearStatus);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  r.set.mockResolvedValue('OK');
  r.del.mockResolvedValue(1);
  r.publish.mockResolvedValue(1);
});

describe('PUT /status', () => {
  beforeEach(() => {
    p.status.create.mockResolvedValue(DB_STATUS);
    p.groupMember.findMany.mockResolvedValue([{ groupId: GROUP_ID }]);
    p.user.findUnique.mockResolvedValue({ displayName: 'Ben' });
  });

  it('returns 200 with status DTO', async () => {
    const res = await request(makeApp()).put('/status').send({ availability: 'free', location: 'pub', vibe: 'im_paying' });
    expect(res.status).toBe(200);
    expect(res.body.status.availability).toBe('free');
  });

  it('writes to Redis cache', async () => {
    await request(makeApp()).put('/status').send({ availability: 'free' });
    expect(r.set).toHaveBeenCalledWith(
      `status:${USER_ID}`,
      expect.any(String),
      expect.objectContaining({ EX: expect.any(Number) }),
    );
  });

  it('publishes to group channel for every group', async () => {
    p.groupMember.findMany.mockResolvedValue([{ groupId: 'g-1' }, { groupId: 'g-2' }]);

    await request(makeApp()).put('/status').send({ availability: 'free' });
    expect(r.publish).toHaveBeenCalledWith('group:g-1:status', expect.any(String));
    expect(r.publish).toHaveBeenCalledWith('group:g-2:status', expect.any(String));
  });

  it('publishes to notifications:push when availability is FREE', async () => {
    await request(makeApp()).put('/status').send({ availability: 'free' });
    expect(r.publish).toHaveBeenCalledWith('notifications:push', expect.any(String));
  });

  it('publishes to notifications:push when availability is MAYBE (new rule)', async () => {
    p.status.create.mockResolvedValue({ ...DB_STATUS, availability: 'maybe', location: null, vibe: null });

    await request(makeApp()).put('/status').send({ availability: 'maybe' });
    expect(r.publish).toHaveBeenCalledWith('notifications:push', expect.any(String));
  });

  it('does NOT publish to notifications:push when availability is BUSY', async () => {
    p.status.create.mockResolvedValue({ ...DB_STATUS, availability: 'busy', location: null, vibe: null });

    await request(makeApp()).put('/status').send({ availability: 'busy' });
    const pushCalls = r.publish.mock.calls.filter((c: string[]) => c[0] === 'notifications:push');
    expect(pushCalls).toHaveLength(0);
  });

  it('returns 400 when location is set with maybe', async () => {
    const res = await request(makeApp()).put('/status').send({ availability: 'maybe', location: 'pub' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when vibe is set with busy', async () => {
    const res = await request(makeApp()).put('/status').send({ availability: 'busy', vibe: 'suggest' });
    expect(res.status).toBe(400);
  });
});

describe('GET /status/me', () => {
  it('returns status from Redis when cached', async () => {
    const cached = JSON.stringify({ id: 'status-1', userId: USER_ID, availability: 'free' });
    r.get.mockResolvedValue(cached);

    const res = await request(makeApp()).get('/status/me');
    expect(res.status).toBe(200);
    expect(res.body.status.availability).toBe('free');
    expect(p.status.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to DB when Redis returns null', async () => {
    r.get.mockResolvedValue(null);
    p.status.findFirst.mockResolvedValue(DB_STATUS);

    const res = await request(makeApp()).get('/status/me');
    expect(res.status).toBe(200);
    expect(p.status.findFirst).toHaveBeenCalled();
  });

  it('returns null when no status exists', async () => {
    r.get.mockResolvedValue(null);
    p.status.findFirst.mockResolvedValue(null);

    const res = await request(makeApp()).get('/status/me');
    expect(res.status).toBe(200);
    expect(res.body.status).toBeNull();
  });
});

describe('GET /status/group/:groupId', () => {
  it('returns member statuses for a group member', async () => {
    p.groupMember.findUnique.mockResolvedValue({ groupId: GROUP_ID, userId: USER_ID });
    p.groupMember.findMany.mockResolvedValue([{ userId: USER_ID }, { userId: 'user-2' }]);
    r.mGet.mockResolvedValue([JSON.stringify(DB_STATUS), null]);

    const res = await request(makeApp()).get(`/status/group/${GROUP_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.statuses).toHaveLength(2);
    expect(res.body.statuses[0].status.availability).toBe('free');
    expect(res.body.statuses[1].status).toBeNull();
  });

  it('returns 403 when caller is not a member', async () => {
    p.groupMember.findUnique.mockResolvedValue(null);

    const res = await request(makeApp()).get(`/status/group/${GROUP_ID}`);
    expect(res.status).toBe(403);
  });
});

describe('DELETE /status', () => {
  it('deletes from Redis and soft-deletes in DB', async () => {
    p.status.findFirst.mockResolvedValue(DB_STATUS);
    p.status.update.mockResolvedValue({});
    p.groupMember.findMany.mockResolvedValue([{ groupId: GROUP_ID }]);

    const res = await request(makeApp()).delete('/status');
    expect(res.status).toBe(200);
    expect(r.del).toHaveBeenCalledWith(`status:${USER_ID}`);
    expect(p.status.update).toHaveBeenCalledWith(expect.objectContaining({ data: { deletedAt: expect.any(Date) } }));
  });

  it('publishes null status to group channels on clear', async () => {
    p.status.findFirst.mockResolvedValue(DB_STATUS);
    p.status.update.mockResolvedValue({});
    p.groupMember.findMany.mockResolvedValue([{ groupId: GROUP_ID }]);

    await request(makeApp()).delete('/status');
    expect(r.publish).toHaveBeenCalledWith(`group:${GROUP_ID}:status`, expect.stringContaining('"status":null'));
  });

  it('returns 200 even when no active status exists', async () => {
    p.status.findFirst.mockResolvedValue(null);

    const res = await request(makeApp()).delete('/status');
    expect(res.status).toBe(200);
  });
});
