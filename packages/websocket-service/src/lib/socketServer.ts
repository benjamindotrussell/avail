import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as HttpServer } from 'http';
import { prisma, redisPub, redisSub } from './db';
import { verifyAccessToken } from './jwt';
import { RedisKeys } from '@avail/shared';
import type { StatusDTO, StatusUpdateEvent } from '@avail/shared';

interface ServerToClientEvents {
  'status:update': (event: StatusUpdateEvent) => void;
  'connected': (data: { groups: { groupId: string; statuses: { userId: string; status: StatusDTO | null }[] }[] }) => void;
  'error': (error: { code: string; message: string }) => void;
  'pong': () => void;
}

interface ClientToServerEvents {
  'ping': () => void;
}

interface SocketData {
  userId: string;
}

export function createSocketServer(httpServer: HttpServer): Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData> {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket'],
  });

  io.adapter(createAdapter(redisPub, redisSub));

  // ─── Auth middleware ────────────────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error('Unauthorized'));
      return;
    }
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.userId;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  // ─── Connection handler ─────────────────────────────────────────────────────
  io.on('connection', async (socket) => {
    const userId = socket.data.userId;

    try {
      // Fetch user's groups with member lists
      const groups = await prisma.group.findMany({
        where: { members: { some: { userId } } },
        include: { members: { select: { userId: true } } },
      });

      // Join a Socket.io room for each group
      const roomNames = groups.map(g => `group:${g.id}`);
      await socket.join(roomNames);

      // Batch-fetch current statuses from Redis for all members across all groups
      const allUserIds = [...new Set(groups.flatMap(g => g.members.map(m => m.userId)))];
      const statusValues = allUserIds.length > 0
        ? await redisPub.mGet(allUserIds.map(RedisKeys.userStatus))
        : [];

      const statusMap = new Map<string, StatusDTO | null>();
      allUserIds.forEach((id, i) => {
        const raw = statusValues[i];
        if (raw) {
          try { statusMap.set(id, JSON.parse(raw) as StatusDTO); } catch { statusMap.set(id, null); }
        } else {
          statusMap.set(id, null);
        }
      });

      // Emit snapshot to the connecting client
      socket.emit('connected', {
        groups: groups.map(g => ({
          groupId: g.id,
          statuses: g.members.map(m => ({
            userId: m.userId,
            status: statusMap.get(m.userId) ?? null,
          })),
        })),
      });
    } catch (err) {
      console.error('Error setting up connection for user', userId, err);
      socket.emit('error', { code: 'INTERNAL_ERROR', message: 'Failed to initialise connection' });
      socket.disconnect();
      return;
    }

    // Keepalive
    socket.on('ping', () => socket.emit('pong'));

    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}
