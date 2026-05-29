import { io, Socket } from 'socket.io-client';
import { AppState, AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useGroupsStore } from '../store/groupsStore';
import { useAuthStore } from '../store/authStore';
import type { StatusUpdateEvent } from '@avail/shared';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? 'ws://localhost:3005';

let socket: Socket | null = null;
let appStateSubscription: { remove: () => void } | null = null;

// ─── Connect ──────────────────────────────────────────────────────────────────
export const connectSocket = async (): Promise<void> => {
  const token = useAuthStore.getState().accessToken
    ?? await SecureStore.getItemAsync('accessToken');

  if (!token) return;
  if (socket?.connected) return; // already connected

  socket = io(WS_URL, {
    auth: { token },
    transports: ['websocket'], // skip long-polling on mobile
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
  });

  // Server sends full status snapshot for all groups on connect
  socket.on('connected', ({ groups }: { groups: Array<{ groupId: string; statuses: Array<{ userId: string; status: import('@avail/shared').StatusDTO | null }> }> }) => {
    groups.forEach(({ groupId, statuses }) => {
      statuses.forEach(({ userId, status }) => {
        useGroupsStore.getState().updateMemberStatus(groupId, userId, status);
      });
    });
  });

  // Real-time status update from a group member
  socket.on('status:update', ({ userId, groupId, status }: StatusUpdateEvent) => {
    useGroupsStore.getState().updateMemberStatus(groupId, userId, status);
  });

  socket.on('disconnect', (reason: string) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', async (err: Error) => {
    console.warn('[Socket] Connection error:', err.message);
    if (err.message === 'Unauthorized') {
      // Access token expired — refresh and reconnect
      await refreshAndReconnect();
    }
  });
};

// ─── Refresh token and reconnect ──────────────────────────────────────────────
const refreshAndReconnect = async (): Promise<void> => {
  try {
    const { api } = await import('./api');
    const refreshToken = await SecureStore.getItemAsync('refreshToken');
    if (!refreshToken) throw new Error('No refresh token');

    const { data } = await api.post('/v1/auth/refresh', { refreshToken });
    await SecureStore.setItemAsync('accessToken', data.accessToken);
    useAuthStore.getState().setAuth(
      useAuthStore.getState().userId!,
      data.accessToken,
      useAuthStore.getState().user!
    );

    disconnectSocket();
    await connectSocket();
  } catch {
    // Refresh failed — clear auth
    useAuthStore.getState().clearAuth();
  }
};

// ─── Disconnect ───────────────────────────────────────────────────────────────
export const disconnectSocket = (): void => {
  socket?.disconnect();
  socket = null;
};

// ─── AppState listener — reconnect on foreground ─────────────────────────────
export const initSocketWithAppState = async (): Promise<void> => {
  await connectSocket();

  appStateSubscription?.remove();
  appStateSubscription = AppState.addEventListener(
    'change',
    async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        // App came to foreground — reconnect socket and refresh status snapshot
        if (!socket?.connected) {
          await connectSocket();
        }
        // Also refresh groups via REST to catch any missed updates
        try {
          const { api } = await import('./api');
          const { data } = await api.get('/v1/groups');
          useGroupsStore.getState().setGroups(data.groups);
        } catch {
          // Ignore — WebSocket will catch up
        }
      }
    }
  );
};

export const cleanupSocket = (): void => {
  appStateSubscription?.remove();
  appStateSubscription = null;
  disconnectSocket();
};
