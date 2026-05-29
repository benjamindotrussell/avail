import type { Server } from 'socket.io';
import { redisGroupSub } from './db';
import type { StatusUpdateEvent } from '@avail/shared';

export async function startStatusSubscriber(io: Server): Promise<void> {
  // Pattern-subscribe to all group status channels published by the Status service
  await redisGroupSub.pSubscribe('group:*:status', (message, channel) => {
    const match = channel.match(/^group:(.+):status$/);
    const groupId = match?.[1];
    if (!groupId) return;

    let event: StatusUpdateEvent;
    try {
      event = JSON.parse(message) as StatusUpdateEvent;
    } catch {
      console.error('Failed to parse status update event:', message);
      return;
    }

    // Broadcast to all sockets in this group's room (Redis adapter handles cross-pod delivery)
    io.to(`group:${groupId}`).emit('status:update', event);
  });

  console.log('Subscribed to group:*:status channels');
}
