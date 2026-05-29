import request from 'supertest';
import express from 'express';

jest.mock('../lib/db', () => ({
  prisma: {
    deviceToken: { upsert: jest.fn(), deleteMany: jest.fn() },
  },
}));

import { prisma } from '../lib/db';
import { registerToken, removeToken } from './tokens';

const p = prisma as unknown as Record<string, Record<string, jest.Mock>>;

const USER_ID = 'user-1';

function makeApp(userId = USER_ID) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.userId = userId; next(); });
  app.post('/notifications/token', registerToken);
  app.delete('/notifications/token', removeToken);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe('POST /notifications/token', () => {
  it('upserts iOS token and returns 204', async () => {
    p.deviceToken.upsert.mockResolvedValue({});

    const res = await request(makeApp()).post('/notifications/token').send({ token: 'ios-tok', platform: 'ios' });
    expect(res.status).toBe(204);
    expect(p.deviceToken.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ userId: USER_ID, token: 'ios-tok', platform: 'ios' }),
    }));
  });

  it('upserts Android token and returns 204', async () => {
    p.deviceToken.upsert.mockResolvedValue({});

    const res = await request(makeApp()).post('/notifications/token').send({ token: 'android-tok', platform: 'android' });
    expect(res.status).toBe(204);
  });

  it('returns 400 on invalid platform', async () => {
    const res = await request(makeApp()).post('/notifications/token').send({ token: 'tok', platform: 'windows' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when token is missing', async () => {
    const res = await request(makeApp()).post('/notifications/token').send({ platform: 'ios' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /notifications/token', () => {
  it('removes the token and returns 204', async () => {
    p.deviceToken.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(makeApp()).delete('/notifications/token').send({ token: 'ios-tok' });
    expect(res.status).toBe(204);
    expect(p.deviceToken.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: USER_ID, token: 'ios-tok' },
    }));
  });

  it('returns 204 even if token was not found (idempotent)', async () => {
    p.deviceToken.deleteMany.mockResolvedValue({ count: 0 });

    const res = await request(makeApp()).delete('/notifications/token').send({ token: 'gone-tok' });
    expect(res.status).toBe(204);
  });

  it('returns 400 when token is missing', async () => {
    const res = await request(makeApp()).delete('/notifications/token').send({});
    expect(res.status).toBe(400);
  });
});
