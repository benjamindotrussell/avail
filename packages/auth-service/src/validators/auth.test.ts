import { otpRequestSchema, otpVerifySchema, socialAuthSchema, refreshSchema, logoutSchema } from './auth';

describe('otpRequestSchema', () => {
  it.each(['+447911123456', '+12025551234', '+353861234567'])('accepts valid E.164 %s', (phone) => {
    expect(otpRequestSchema.safeParse({ phone }).success).toBe(true);
  });

  it.each(['07911123456', '447911123456', '+0123456789', '+1', 'not-a-number', ''])('rejects invalid %s', (phone) => {
    expect(otpRequestSchema.safeParse({ phone }).success).toBe(false);
  });
});

describe('otpVerifySchema', () => {
  const base = { phone: '+447911123456', code: '123456' };

  it('accepts valid phone and 6-digit code', () => {
    expect(otpVerifySchema.safeParse(base).success).toBe(true);
  });

  it.each(['12345', '1234567', 'abcdef', ''])('rejects code %s', (code) => {
    expect(otpVerifySchema.safeParse({ ...base, code }).success).toBe(false);
  });

  it('rejects invalid phone', () => {
    expect(otpVerifySchema.safeParse({ ...base, phone: '07911123456' }).success).toBe(false);
  });
});

describe('socialAuthSchema', () => {
  it('accepts apple provider with idToken', () => {
    expect(socialAuthSchema.safeParse({ provider: 'apple', idToken: 'tok' }).success).toBe(true);
  });

  it('accepts google provider with optional displayName', () => {
    expect(socialAuthSchema.safeParse({ provider: 'google', idToken: 'tok', displayName: 'Ben' }).success).toBe(true);
  });

  it('rejects unknown provider', () => {
    expect(socialAuthSchema.safeParse({ provider: 'facebook', idToken: 'tok' }).success).toBe(false);
  });

  it('rejects missing idToken', () => {
    expect(socialAuthSchema.safeParse({ provider: 'apple', idToken: '' }).success).toBe(false);
  });
});

describe('refreshSchema', () => {
  it('accepts a refresh token', () => {
    expect(refreshSchema.safeParse({ refreshToken: 'abc123' }).success).toBe(true);
  });

  it('rejects missing token', () => {
    expect(refreshSchema.safeParse({ refreshToken: '' }).success).toBe(false);
  });
});

describe('logoutSchema', () => {
  it('accepts a refresh token', () => {
    expect(logoutSchema.safeParse({ refreshToken: 'abc123' }).success).toBe(true);
  });
});
