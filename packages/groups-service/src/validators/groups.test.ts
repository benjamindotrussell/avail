import { createGroupSchema, updateGroupSchema } from './groups';

describe('createGroupSchema', () => {
  it('accepts a valid name', () => {
    expect(createGroupSchema.safeParse({ name: 'Saturday crew' }).success).toBe(true);
  });

  it('accepts name with optional avatarUrl', () => {
    expect(createGroupSchema.safeParse({ name: 'Crew', avatarUrl: 'https://example.com/img.png' }).success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(createGroupSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects name over 50 characters', () => {
    expect(createGroupSchema.safeParse({ name: 'a'.repeat(51) }).success).toBe(false);
  });

  it('rejects invalid avatarUrl', () => {
    expect(createGroupSchema.safeParse({ name: 'Crew', avatarUrl: 'not-a-url' }).success).toBe(false);
  });
});

describe('updateGroupSchema', () => {
  it('accepts name only', () => {
    expect(updateGroupSchema.safeParse({ name: 'New name' }).success).toBe(true);
  });

  it('accepts avatarUrl only', () => {
    expect(updateGroupSchema.safeParse({ avatarUrl: 'https://example.com/img.png' }).success).toBe(true);
  });

  it('accepts null avatarUrl to clear it', () => {
    expect(updateGroupSchema.safeParse({ avatarUrl: null }).success).toBe(true);
  });

  it('rejects empty object (no fields)', () => {
    expect(updateGroupSchema.safeParse({}).success).toBe(false);
  });

  it('rejects name over 50 characters', () => {
    expect(updateGroupSchema.safeParse({ name: 'a'.repeat(51) }).success).toBe(false);
  });
});
