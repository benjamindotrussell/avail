import { createClient } from 'redis';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export const redis = createClient({ url: process.env.REDIS_URL });
