import { setStatusSchema } from './status';

describe('setStatusSchema — availability', () => {
  it.each(['free', 'maybe', 'busy'])('accepts %s', (availability) => {
    expect(setStatusSchema.safeParse({ availability }).success).toBe(true);
  });

  it('rejects unknown availability', () => {
    expect(setStatusSchema.safeParse({ availability: 'open' }).success).toBe(false);
  });
});

describe('setStatusSchema — location and vibe rules', () => {
  it('allows location and vibe when free', () => {
    expect(setStatusSchema.safeParse({
      availability: 'free',
      location: 'pub',
      vibe: 'im_paying',
    }).success).toBe(true);
  });

  it('allows free with no location or vibe', () => {
    expect(setStatusSchema.safeParse({ availability: 'free' }).success).toBe(true);
  });

  it('rejects location with maybe', () => {
    const result = setStatusSchema.safeParse({ availability: 'maybe', location: 'pub' });
    expect(result.success).toBe(false);
  });

  it('rejects vibe with maybe', () => {
    const result = setStatusSchema.safeParse({ availability: 'maybe', vibe: 'im_paying' });
    expect(result.success).toBe(false);
  });

  it('rejects location with busy', () => {
    const result = setStatusSchema.safeParse({ availability: 'busy', location: 'my_place' });
    expect(result.success).toBe(false);
  });

  it('rejects vibe with busy', () => {
    const result = setStatusSchema.safeParse({ availability: 'busy', vibe: 'suggest' });
    expect(result.success).toBe(false);
  });

  it('accepts maybe with explicit null location and vibe', () => {
    expect(setStatusSchema.safeParse({
      availability: 'maybe',
      location: null,
      vibe: null,
    }).success).toBe(true);
  });

  it('accepts custom expiresAt ISO timestamp', () => {
    expect(setStatusSchema.safeParse({
      availability: 'free',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    }).success).toBe(true);
  });

  it('rejects invalid expiresAt', () => {
    expect(setStatusSchema.safeParse({
      availability: 'free',
      expiresAt: 'not-a-date',
    }).success).toBe(false);
  });
});
