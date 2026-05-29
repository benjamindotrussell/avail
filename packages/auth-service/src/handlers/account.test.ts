import request from 'supertest';
import express from 'express';

jest.mock('../lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(),
    refreshToken: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

import { prisma } from '../lib/db';
import { deleteAccount } from './account';

const p = prisma as unknown as Record<string, jest.Mock> & { user: Record<string, jest.Mock>; $transaction: jest.Mock };

function makeApp(userId = 'user-1') {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request & { userId?: string }, _res, next) => { req.userId = userId; next(); });
  app.delete('/account', deleteAccount);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe('DELETE /account', () => {
  it('returns 404 when user not found', async () => {
    p.user.findUnique.mockResolvedValue(null);

    const res = await request(makeApp()).delete('/account');
    expect(res.status).toBe(404);
  });

  it('returns 404 when account already deleted', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'user-1', deletedAt: new Date() });

    const res = await request(makeApp()).delete('/account');
    expect(res.status).toBe(404);
  });

  it('soft-deletes the user and clears refresh tokens', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'user-1', deletedAt: null });
    p.$transaction.mockResolvedValue([{}, {}]);

    const res = await request(makeApp()).delete('/account');
    expect(res.status).toBe(204);
    expect(p.$transaction).toHaveBeenCalled();
  });
});
