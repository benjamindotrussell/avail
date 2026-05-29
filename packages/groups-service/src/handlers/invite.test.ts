import request from 'supertest';
import express from 'express';

jest.mock('../lib/db', () => ({
  prisma: {
    groupMember: { findUnique: jest.fn(), create: jest.fn() },
    inviteLink: { create: jest.fn(), findUnique: jest.fn() },
    group: { findUniqueOrThrow: jest.fn() },
  },
  redis: {},
}));

import { prisma } from '../lib/db';
import { createInvite, joinGroup } from './invite';

const p = prisma as unknown as Record<string, Record<string, jest.Mock>>;

const USER_ID = 'user-1';
const GROUP_ID = 'group-1';
const NOW = new Date();
const FUTURE = new Date(Date.now() + 86_400_000 * 7);
const PAST = new Date(Date.now() - 1000);

function makeApp(userId = USER_ID) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.userId = userId; next(); });
  app.post('/groups/:groupId/invite', createInvite);
  app.post('/groups/join/:code', joinGroup);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe('POST /groups/:groupId/invite', () => {
  it('returns 201 with inviteUrl for a group member', async () => {
    p.groupMember.findUnique.mockResolvedValue({ groupId: GROUP_ID, userId: USER_ID, role: 'admin' });
    p.inviteLink.create.mockResolvedValue({});

    const res = await request(makeApp()).post(`/groups/${GROUP_ID}/invite`);
    expect(res.status).toBe(201);
    expect(res.body.inviteUrl).toMatch(/\/join\//);
    expect(res.body.expiresAt).toBeDefined();
  });

  it('returns 404 when caller is not a member', async () => {
    p.groupMember.findUnique.mockResolvedValue(null);

    const res = await request(makeApp()).post(`/groups/${GROUP_ID}/invite`);
    expect(res.status).toBe(404);
  });
});

describe('POST /groups/join/:code', () => {
  it('joins a group with a valid invite code', async () => {
    p.inviteLink.findUnique.mockResolvedValue({ code: 'abc12345', groupId: GROUP_ID, expiresAt: FUTURE });
    p.groupMember.findUnique.mockResolvedValue(null);
    p.groupMember.create.mockResolvedValue({});
    p.group.findUniqueOrThrow.mockResolvedValue({ id: GROUP_ID, name: 'Crew', avatarUrl: null, createdAt: NOW });

    const res = await request(makeApp()).post('/groups/join/abc12345');
    expect(res.status).toBe(200);
    expect(res.body.group.id).toBe(GROUP_ID);
    expect(p.groupMember.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: USER_ID, role: 'member' }),
    }));
  });

  it('returns 404 for an expired invite code', async () => {
    p.inviteLink.findUnique.mockResolvedValue({ code: 'abc12345', groupId: GROUP_ID, expiresAt: PAST });

    const res = await request(makeApp()).post('/groups/join/abc12345');
    expect(res.status).toBe(404);
  });

  it('returns 404 for an unknown invite code', async () => {
    p.inviteLink.findUnique.mockResolvedValue(null);

    const res = await request(makeApp()).post('/groups/join/badcode');
    expect(res.status).toBe(404);
  });

  it('returns 409 when user is already a member', async () => {
    p.inviteLink.findUnique.mockResolvedValue({ code: 'abc12345', groupId: GROUP_ID, expiresAt: FUTURE });
    p.groupMember.findUnique.mockResolvedValue({ groupId: GROUP_ID, userId: USER_ID });

    const res = await request(makeApp()).post('/groups/join/abc12345');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});
