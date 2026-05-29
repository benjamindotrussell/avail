import { z } from 'zod';

const availabilitySchema = z.enum(['free', 'maybe', 'busy']);
const locationSchema = z.enum(['my_place', 'pub', 'out', 'someones_place', 'other']).nullable().optional();
const vibeSchema = z.enum(['im_paying', 'buying_own', 'suggest', 'free_cheap', 'other']).nullable().optional();

export const setStatusSchema = z.object({
  groupId: z.string().uuid(),
  availability: availabilitySchema,
  location: locationSchema,
  locationNote: z.string().max(100).nullable().optional(),
  vibe: vibeSchema,
  vibeNote: z.string().max(100).nullable().optional(),
  expiresAt: z.string().datetime().optional(),
}).refine(
  data => {
    if (data.availability === 'busy') {
      return data.location == null && data.vibe == null;
    }
    return true;
  },
  { message: 'location and vibe are only valid when availability is free or maybe' }
).refine(
  data => data.location !== 'other' || (typeof data.locationNote === 'string' && data.locationNote.trim().length > 0),
  { message: 'locationNote is required when location is other' }
).refine(
  data => data.vibe !== 'other' || (typeof data.vibeNote === 'string' && data.vibeNote.trim().length > 0),
  { message: 'vibeNote is required when vibe is other' }
);
