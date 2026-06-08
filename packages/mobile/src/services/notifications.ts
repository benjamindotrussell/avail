import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { registerDeviceToken, removeDeviceToken } from './firestoreService';

// ─── Notification handler — show alerts when app is foregrounded ──────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ─── Android notification channel ─────────────────────────────────────────────
export const setupAndroidChannel = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('avail-status', {
    name: 'Avail status updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF6B35',
    sound: true,
  });
};

// ─── Register device for push notifications ───────────────────────────────────
export const registerForPushNotifications = async (uid: string): Promise<string | null> => {
  if (!Device.isDevice) {
    console.log('[Push] Skipping — not a physical device');
    return null;
  }

  await setupAndroidChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Permission denied');
    return null;
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync();

  try {
    await registerDeviceToken(uid, token, Platform.OS === 'ios' ? 'ios' : 'android');
    console.log('[Push] Token registered:', token);
  } catch (err) {
    console.warn('[Push] Token registration failed:', err);
  }

  return token;
};

// ─── Deregister token on logout ───────────────────────────────────────────────
export const deregisterPushToken = async (uid: string, token: string): Promise<void> => {
  try {
    await removeDeviceToken(uid, token);
  } catch (err) {
    console.warn('[Push] Token deregistration failed:', err);
  }
};

// ─── Handle notification tap (deep link to group) ─────────────────────────────
export type NotificationData = {
  type: 'status_update';
  userId: string;
  groupId: string;
};

export const getLastNotificationResponse =
  Notifications.getLastNotificationResponseAsync;

export const addNotificationTapListener = (
  onTap: (data: NotificationData) => void
): { remove: () => void } => {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as NotificationData;
    if (data?.groupId) onTap(data);
  });
  return sub;
};
