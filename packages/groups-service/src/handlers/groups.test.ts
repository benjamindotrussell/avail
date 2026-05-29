import request from 'supertest';
import express from 'express';

jest.mock('../lib/db', () => ({
  prisma: {
    group: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    groupMember: { findUnique: jest.fn() },
  },
  redis: { mGet: jest.fn() },
}));

import { prisma, redis } from '../lib/db';
import { createGroup, listGroups, getGroup, updateGroup } from './groups';

const p = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const r = redis as unknown as Record<string, jest.Mock>;

const USER_ID = 'user-1';
const GROUP_ID = 'group-1';
const NOW = new Date();

const GROUP = { id: GROUP_ID, name: 'Saturday crew', avatarUrl: null, createdAt: NOW, updatedAt: NOW };
const MEMBER = { id: 'mem-1', groupId: GROUP_ID, userId: USER_ID, role: 'admin', joinedAt: NOW, user: { id: USER_ID, displayName: 'Ben', avatarUrl: null, createdAt: NOW } };

function makeApp(userId = USER_ID) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.userId = userId; next(); });
  app.post('/groups', createGroup);
  app.get('/groups', listGroups);
  app.get('/groups/:groupId', getGroup);
  app.patch('/groups/:groupId', updateGroup);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe('POST /groups', () => {
  it('creates a group and returns 201', async () => {
    p.group.create.mockResolvedValue(GROUP);

    const res = await request(makeApp()).post('/groups').send({ name: 'Saturday crew' });
    expect(res.status).toBe(201);
    expect(res.body.group.name).toBe('Saturday crew');
    expect(p.group.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'Saturday crew', createdBy: USER_ID }),
    }));
  });

  it('returns 400 when name is empty', async () => {
    const res = await request(makeApp()).post('/groups').send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when name exceeds 50 characters', async () => {
    const res = await request(makeApp()).post('/groups').send({ name: 'a'.repeat(51) });
    expect(res.status).toBe(400);
  });
});

describe('GET /groups', () => {
  it('returns all groups with member statuses', async () => {
    p.group.findMany.mockResolvedValue([{ ...GROUP, members: [MEMBER] }]);
    r.mGet.mockResolvedValue([null]);

    const res = await request(makeApp()).get('/groups');
    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(1);
    expect(res.body.groups[0].members[0].status).toBeNull();
  });
});

describe('GET /groups/:groupId', () => {
  it('returns group for a member', async () => {
    p.group.findUnique.mockResolvedValue({ ...GROUP, members: [MEMBER] });
    r.mGet.mockResolvedValue([null]);

    const res = await request(makeApp()).get(`/groups/${GROUP_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.group.id).toBe(GROUP_ID);
  });

  it('returns 404 when group not found', async () => {
    p.group.findUnique.mockResolvedValue(null);

    const res = await request(makeApp()).get(`/groups/${GROUP_ID}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 when caller is not a member', async () => {
    p.group.findUnique.mockResolvedValue({ ...GROUP, members: [{ ...MEMBER, userId: 'someone-else' }] });
    r.mGet.mockResolvedValue([null]);

    const res = await request(makeApp()).get(`/groups/${GROUP_ID}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /groups/:groupId', () => {
  it('updates group name for admin', async () => {
    p.groupMember.findUnique.mockResolvedValue({ role: 'admin' });
    p.group.update.mockResolvedValue({ ...GROUP, name: 'New name' });

    const res = await request(makeApp()).patch(`/groups/${GROUP_ID}`).send({ name: 'New name' });
    expect(res.status).toBe(200);
    expect(res.body.group.name).toBe('New name');
  });

  it('returns 403 when caller is not admin', async () => {
    p.groupMember.findUnique.mockResolvedValue({ role: 'member' });

    const res = await request(makeApp()).patch(`/groups/${GROUP_ID}`).send({ name: 'New name' });
    expect(res.status).toBe(403);
  });

  it('returns 404 when not a member', async () => {
    p.groupMember.findUnique.mockResolvedValue(null);

    const res = await request(makeApp()).patch(`/groups/${GROUP_ID}`).send({ name: 'New name' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when no fields provided', async () => {
    const res = await request(makeApp()).patch(`/groups/${GROUP_ID}`).send({});
    expect(res.status).toBe(400);
  });
});
