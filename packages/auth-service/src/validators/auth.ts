import { z } from 'zod';

export const otpRequestSchema = z.object({
  phone: z
    .string()
    .regex(/^\+[1-9]\d{1,14}$/, 'Phone must be in E.164 format (e.g. +447911123456)'),
});

export const otpVerifySchema = z.object({
  phone: z
    .string()
    .regex(/^\+[1-9]\d{1,14}$/, 'Phone must be in E.164 format'),
  code: z.string().regex(/^\d{6}$/, 'Code must be exactly 6 digits'),
});

export const socialAuthSchema = z.object({
  provider: z.enum(['apple', 'google']),
  idToken: z.string().min(1, 'idToken is required'),
  displayName: z.string().min(1).max(50).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});
