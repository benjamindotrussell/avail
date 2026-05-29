import request from 'supertest';
import express from 'express';

jest.mock('../lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../lib/firebase', () => ({
  verifyFirebaseToken: jest.fn(),
}));

jest.mock('../lib/tokens', () => ({
  issueTokenPair: jest.fn().mockResolvedValue({ accessToken: 'access-tok', refreshToken: 'refresh-tok' }),
}));

import { prisma } from '../lib/db';
import { verifyFirebaseToken } from '../lib/firebase';
import { socialAuth } from './social';

const p = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const mockVerify = verifyFirebaseToken as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.post('/social', socialAuth);
  return app;
}

const DECODED = { uid: 'firebase-uid-123', name: 'Ben Russell' };

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockResolvedValue(DECODED);
});

describe('POST /social', () => {
  it('returns 400 on missing idToken', async () => {
    const res = await request(makeApp()).post('/social').send({ provider: 'apple' });
    expect(res.status).toBe(400);
  });

  it('returns 401 on invalid Firebase token', async () => {
    mockVerify.mockRejectedValue(new Error('Invalid token'));
    const res = await request(makeApp()).post('/social').send({ provider: 'apple', idToken: 'bad-tok' });
    expect(res.status).toBe(401);
  });

  it('creates new Apple user and returns tokens', async () => {
    p.user.findUnique.mockResolvedValue(null);
    p.user.create.mockResolvedValue({ id: 'new-id', displayName: 'Apple User', avatarUrl: null, createdAt: new Date() });

    const res = await request(makeApp()).post('/social').send({ provider: 'apple', idToken: 'valid-tok' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe('access-tok');
    expect(p.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ appleId: 'firebase-uid-123' }) }));
  });

  it('creates new Google user and returns tokens', async () => {
    p.user.findUnique.mockResolvedValue(null);
    p.user.create.mockResolvedValue({ id: 'new-id', displayName: 'Google User', avatarUrl: null, createdAt: new Date() });

    const res = await request(makeApp()).post('/social').send({ provider: 'google', idToken: 'valid-tok' });
    expect(res.status).toBe(200);
    expect(p.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ googleId: 'firebase-uid-123' }) }));
  });

  it('returns tokens for existing user without creating new one', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'existing-id', displayName: 'Ben', avatarUrl: null, createdAt: new Date(), deletedAt: null });

    const res = await request(makeApp()).post('/social').send({ provider: 'apple', idToken: 'valid-tok' });
    expect(res.status).toBe(200);
    expect(p.user.create).not.toHaveBeenCalled();
  });

  it('uses provided displayName over Firebase name', async () => {
    p.user.findUnique.mockResolvedValue(null);
    p.user.create.mockResolvedValue({ id: 'new-id', displayName: 'Custom Name', avatarUrl: null, createdAt: new Date() });

    await request(makeApp()).post('/social').send({ provider: 'apple', idToken: 'valid-tok', displayName: 'Custom Name' });
    expect(p.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ displayName: 'Custom Name' }) }));
  });

  it('reactivates soft-deleted account', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'del-id', displayName: 'Ben', avatarUrl: null, createdAt: new Date(), deletedAt: new Date() });
    p.user.update.mockResolvedValue({ id: 'del-id', displayName: 'Ben', avatarUrl: null, createdAt: new Date(), deletedAt: null });

    const res = await request(makeApp()).post('/social').send({ provider: 'apple', idToken: 'valid-tok' });
    expect(res.status).toBe(200);
    expect(p.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { deletedAt: null } }));
  });
});
