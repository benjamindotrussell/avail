import { z } from 'zod';

export const createGroupSchema = z.object({
  name: z.string().min(1).max(50),
  avatarUrl: z.string().url().max(500).optional(),
});

export const updateGroupSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
}).refine(data => data.name !== undefined || data.avatarUrl !== undefined, {
  message: 'At least one field must be provided',
});
