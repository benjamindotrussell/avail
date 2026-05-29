import request from 'supertest';
import express from 'express';

jest.mock('../lib/db', () => ({
  prisma: {
    groupMember: { findUnique: jest.fn(), delete: jest.fn(), count: jest.fn() },
    group: { delete: jest.fn() },
  },
  redis: {},
}));

import { prisma } from '../lib/db';
import { removeMember, leaveGroup } from './members';

const p = prisma as unknown as Record<string, Record<string, jest.Mock>>;

const USER_ID = 'user-1';
const OTHER_ID = 'user-2';
const GROUP_ID = 'group-1';

function makeApp(userId = USER_ID) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.userId = userId; next(); });
  app.delete('/groups/:groupId/members/me', leaveGroup);
  app.delete('/groups/:groupId/members/:userId', removeMember);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe('DELETE /groups/:groupId/members/:userId (remove member)', () => {
  it('allows admin to remove another member', async () => {
    p.groupMember.findUnique
      .mockResolvedValueOnce({ role: 'admin' })  // caller
      .mockResolvedValueOnce({ role: 'member' }); // target
    p.groupMember.delete.mockResolvedValue({});

    const res = await request(makeApp()).delete(`/groups/${GROUP_ID}/members/${OTHER_ID}`);
    expect(res.status).toBe(200);
    expect(p.groupMember.delete).toHaveBeenCalled();
  });

  it('returns 403 when caller is not admin', async () => {
    p.groupMember.findUnique.mockResolvedValueOnce({ role: 'member' });

    const res = await request(makeApp()).delete(`/groups/${GROUP_ID}/members/${OTHER_ID}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when caller is not in the group', async () => {
    p.groupMember.findUnique.mockResolvedValueOnce(null);

    const res = await request(makeApp()).delete(`/groups/${GROUP_ID}/members/${OTHER_ID}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 when target member not found', async () => {
    p.groupMember.findUnique
      .mockResolvedValueOnce({ role: 'admin' })
      .mockResolvedValueOnce(null);

    const res = await request(makeApp()).delete(`/groups/${GROUP_ID}/members/${OTHER_ID}`);
    expect(res.status).toBe(404);
  });

  it('returns 400 when admin tries to remove themselves via this endpoint', async () => {
    p.groupMember.findUnique.mockResolvedValueOnce({ role: 'admin' });

    // USER_ID removing USER_ID
    const res = await request(makeApp(USER_ID)).delete(`/groups/${GROUP_ID}/members/${USER_ID}`);
    expect(res.status).toBe(400);
  });
});

describe('DELETE /groups/:groupId/members/me (leave group)', () => {
  it('removes the member when others remain', async () => {
    p.groupMember.findUnique.mockResolvedValue({ groupId: GROUP_ID, userId: USER_ID });
    p.groupMember.count.mockResolvedValue(3);
    p.groupMember.delete.mockResolvedValue({});

    const res = await request(makeApp()).delete(`/groups/${GROUP_ID}/members/me`);
    expect(res.status).toBe(200);
    expect(p.groupMember.delete).toHaveBeenCalled();
    expect(p.group.delete).not.toHaveBeenCalled();
  });

  it('deletes the group when the last member leaves', async () => {
    p.groupMember.findUnique.mockResolvedValue({ groupId: GROUP_ID, userId: USER_ID });
    p.groupMember.count.mockResolvedValue(1);
    p.group.delete.mockResolvedValue({});

    const res = await request(makeApp()).delete(`/groups/${GROUP_ID}/members/me`);
    expect(res.status).toBe(200);
    expect(p.group.delete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: GROUP_ID } }));
    expect(p.groupMember.delete).not.toHaveBeenCalled();
  });

  it('returns 404 when user is not in the group', async () => {
    p.groupMember.findUnique.mockResolvedValue(null);

    const res = await request(makeApp()).delete(`/groups/${GROUP_ID}/members/me`);
    expect(res.status).toBe(404);
  });
});
