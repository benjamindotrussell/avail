import { createClient } from 'redis';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// Used for regular commands (mGet status snapshots) and as the Socket.io adapter pub client
export const redisPub = createClient({ url: process.env.REDIS_URL });

// Dedicated sub client for the Socket.io Redis adapter (cross-pod room broadcasting)
export const redisSub = redisPub.duplicate();

// Dedicated pattern-subscriber for group:{groupId}:status channels from the Status service
export const redisGroupSub = redisPub.duplicate();
