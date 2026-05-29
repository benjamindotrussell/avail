import { createClient } from 'redis';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// Regular client for cache/general ops
export const redis = createClient({ url: process.env.REDIS_URL });

// Dedicated subscriber client — a connection in subscribe mode cannot run other commands
export const redisSub = createClient({ url: process.env.REDIS_URL });
