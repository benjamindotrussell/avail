import { redisSub } from './db';
import { sendPushNotifications } from './push';
import { RedisKeys } from '@avail/shared';
import type { PushNotificationEvent } from '@avail/shared';

export async function startSubscriber(): Promise<void> {
  await redisSub.subscribe(RedisKeys.pushNotificationChannel(), async (message) => {
    let event: PushNotificationEvent;
    try {
      event = JSON.parse(message) as PushNotificationEvent;
    } catch {
      console.error('Failed to parse push notification event:', message);
      return;
    }

    try {
      await sendPushNotifications(event);
    } catch (err) {
      console.error('Failed to send push notifications:', err);
    }
  });

  console.log(`Subscribed to ${RedisKeys.pushNotificationChannel()}`);
}
