import request from 'supertest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';

jest.mock('../lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
    },
  },
  redis: {
    multi: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    ttl: jest.fn(),
  },
}));

jest.mock('../lib/sns', () => ({ sendOTP: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/tokens', () => ({
  issueTokenPair: jest.fn().mockResolvedValue({ accessToken: 'access-tok', refreshToken: 'refresh-tok' }),
}));

import { prisma, redis } from '../lib/db';
import { requestOTP, verifyOTP } from './otp';

const p = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const r = redis as unknown as Record<string, jest.Mock>;

function multiReturning(count: number) {
  const chain = { incr: jest.fn().mockReturnThis(), expire: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([count, 1]) };
  r.multi.mockReturnValue(chain);
  return chain;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.post('/otp/request', requestOTP);
  app.post('/otp/verify', verifyOTP);
  return app;
}

const VALID_PHONE = '+447911123456';
const STORED_OTP = JSON.stringify({ codeHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', attempts: 0 }); // sha256 of "123456"

beforeEach(() => jest.clearAllMocks());

describe('POST /otp/request', () => {
  it('returns 204 on valid phone', async () => {
    multiReturning(1);
    r.set.mockResolvedValue('OK');

    const res = await request(makeApp()).post('/otp/request').send({ phone: VALID_PHONE });
    expect(res.status).toBe(204);
  });

  it('returns 400 on invalid phone format', async () => {
    const res = await request(makeApp()).post('/otp/request').send({ phone: '07911123456' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 429 when rate limit exceeded', async () => {
    multiReturning(4); // 4 > limit of 3

    const res = await request(makeApp()).post('/otp/request').send({ phone: VALID_PHONE });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('POST /otp/verify', () => {
  const base = { phone: VALID_PHONE, code: '123456' };

  it('returns 401 if no OTP in Redis', async () => {
    r.get.mockResolvedValue(null);

    const res = await request(makeApp()).post('/otp/verify').send(base);
    expect(res.status).toBe(401);
  });

  it('returns 401 on wrong code and increments attempt counter', async () => {
    r.get.mockResolvedValue(JSON.stringify({ codeHash: 'wrong-hash', attempts: 0 }));
    r.ttl.mockResolvedValue(300);
    r.set.mockResolvedValue('OK');

    const res = await request(makeApp()).post('/otp/verify').send(base);
    expect(res.status).toBe(401);
    expect(r.set).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify({ codeHash: 'wrong-hash', attempts: 1 }),
      { EX: 300 },
    );
  });

  it('returns 429 when max attempts reached', async () => {
    r.get.mockResolvedValue(JSON.stringify({ codeHash: 'wrong-hash', attempts: 5 }));
    r.del.mockResolvedValue(1);

    const res = await request(makeApp()).post('/otp/verify').send(base);
    expect(res.status).toBe(429);
    expect(r.del).toHaveBeenCalled();
  });

  it('creates new user and returns tokens on correct code', async () => {
    r.get.mockResolvedValue(STORED_OTP);
    r.del.mockResolvedValue(1);
    p.user.findUnique.mockResolvedValue(null);
    p.user.create.mockResolvedValue({ id: 'new-user-id', displayName: 'Avail User', avatarUrl: null, createdAt: new Date() });

    const res = await request(makeApp()).post('/otp/verify').send(base);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe('access-tok');
    expect(p.user.create).toHaveBeenCalled();
  });

  it('returns tokens for existing user without creating new one', async () => {
    r.get.mockResolvedValue(STORED_OTP);
    r.del.mockResolvedValue(1);
    p.user.findUnique.mockResolvedValue({ id: 'existing-id', displayName: 'Ben', avatarUrl: null, createdAt: new Date(), deletedAt: null });

    const res = await request(makeApp()).post('/otp/verify').send(base);
    expect(res.status).toBe(200);
    expect(p.user.create).not.toHaveBeenCalled();
  });

  it('reactivates a soft-deleted account', async () => {
    r.get.mockResolvedValue(STORED_OTP);
    r.del.mockResolvedValue(1);
    p.user.findUnique.mockResolvedValue({ id: 'deleted-id', displayName: 'Ben', avatarUrl: null, createdAt: new Date(), deletedAt: new Date() });
    p.user.update.mockResolvedValue({ id: 'deleted-id', displayName: 'Ben', avatarUrl: null, createdAt: new Date(), deletedAt: null });

    const res = await request(makeApp()).post('/otp/verify').send(base);
    expect(res.status).toBe(200);
    expect(p.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { deletedAt: null } }));
  });

  it('returns 400 on invalid code format', async () => {
    const res = await request(makeApp()).post('/otp/verify').send({ phone: VALID_PHONE, code: 'abc' });
    expect(res.status).toBe(400);
  });
});
