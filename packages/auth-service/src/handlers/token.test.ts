import request from 'supertest';
import express from 'express';

jest.mock('../lib/db', () => ({
  prisma: {
    refreshToken: {
      findUnique: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../lib/tokens', () => ({
  issueTokenPair: jest.fn().mockResolvedValue({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
  hashToken: jest.fn((t: string) => `hashed-${t}`),
}));

import { prisma } from '../lib/db';
import { refreshToken, logout } from './token';

const p = prisma as unknown as Record<string, Record<string, jest.Mock>>;

function makeApp(userId = 'user-1') {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request & { userId?: string }, _res, next) => { req.userId = userId; next(); });
  app.post('/refresh', refreshToken);
  app.post('/logout', logout);
  return app;
}

const FUTURE = new Date(Date.now() + 86_400_000);
const PAST = new Date(Date.now() - 1000);

beforeEach(() => jest.clearAllMocks());

describe('POST /refresh', () => {
  it('returns 400 when refreshToken is missing', async () => {
    const res = await request(makeApp()).post('/refresh').send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 when token not found in DB', async () => {
    p.refreshToken.findUnique.mockResolvedValue(null);
    const res = await request(makeApp()).post('/refresh').send({ refreshToken: 'unknown' });
    expect(res.status).toBe(401);
  });

  it('returns 401 and deletes expired token', async () => {
    p.refreshToken.findUnique.mockResolvedValue({ tokenHash: 'hashed-tok', userId: 'user-1', expiresAt: PAST });
    p.refreshToken.delete.mockResolvedValue({});

    const res = await request(makeApp()).post('/refresh').send({ refreshToken: 'tok' });
    expect(res.status).toBe(401);
    expect(p.refreshToken.delete).toHaveBeenCalled();
  });

  it('returns 401 when user is deleted', async () => {
    p.refreshToken.findUnique.mockResolvedValue({ tokenHash: 'hashed-tok', userId: 'user-1', expiresAt: FUTURE });
    p.user.findUnique.mockResolvedValue({ id: 'user-1', deletedAt: new Date() });

    const res = await request(makeApp()).post('/refresh').send({ refreshToken: 'tok' });
    expect(res.status).toBe(401);
  });

  it('rotates token and returns new pair', async () => {
    p.refreshToken.findUnique.mockResolvedValue({ tokenHash: 'hashed-tok', userId: 'user-1', expiresAt: FUTURE });
    p.user.findUnique.mockResolvedValue({ id: 'user-1', deletedAt: null });
    p.refreshToken.delete.mockResolvedValue({});

    const res = await request(makeApp()).post('/refresh').send({ refreshToken: 'tok' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe('new-access');
    expect(res.body.refreshToken).toBe('new-refresh');
    expect(p.refreshToken.delete).toHaveBeenCalled();
  });
});

describe('POST /logout', () => {
  it('returns 204 and deletes the refresh token', async () => {
    p.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(makeApp('user-1')).post('/logout').send({ refreshToken: 'tok' });
    expect(res.status).toBe(204);
    expect(p.refreshToken.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1' }) })
    );
  });

  it('returns 204 even if token was already gone (idempotent)', async () => {
    p.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

    const res = await request(makeApp()).post('/logout').send({ refreshToken: 'gone' });
    expect(res.status).toBe(204);
  });
});
