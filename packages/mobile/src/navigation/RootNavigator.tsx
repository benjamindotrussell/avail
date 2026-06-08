import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer, LinkingOptions, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import auth from '@react-native-firebase/auth';
import { getUser, subscribeToGroups } from '../services/firestoreService';
import { useAuthStore } from '../store/authStore';
import { useGroupsStore } from '../store/groupsStore';
import {
  registerForPushNotifications,
  addNotificationTapListener,
  getLastNotificationResponse,
  type NotificationData,
} from '../services/notifications';

import type { AuthStackParamList, AppStackParamList } from './types';

// ─── Screen imports ───────────────────────────────────────────────────────────
import OnboardingScreen    from '../screens/OnboardingScreen';
import HomeScreen          from '../screens/HomeScreen';
import GroupsListScreen    from '../screens/GroupsListScreen';
import GroupDetailScreen   from '../screens/GroupDetailScreen';
import JoinScreen          from '../screens/JoinScreen';
import InviteScreen        from '../screens/InviteScreen';
import CreateGroupScreen   from '../screens/CreateGroupScreen';
import StatusPickerScreen  from '../screens/StatusPickerScreen';
import ProfileScreen       from '../screens/ProfileScreen';
import EditProfileScreen   from '../screens/EditProfileScreen';
import SplashScreen        from '../screens/SplashScreen';

const AuthStack  = createNativeStackNavigator<AuthStackParamList>();
const AppStack   = createNativeStackNavigator<AppStackParamList>();
const navigationRef = createNavigationContainerRef<AppStackParamList>();

const linking: LinkingOptions<AppStackParamList> = {
  prefixes: [
    Linking.createURL('/'),
    'avail://',
    'https://avail-app-b71d4.web.app',
  ],
  config: { screens: { JoinGroup: 'join/:code' } },
};

const AuthNavigator: React.FC = () => (
  <AuthStack.Navigator screenOptions={{ headerShown: false }}>
    <AuthStack.Screen name="Onboarding" component={OnboardingScreen} />
  </AuthStack.Navigator>
);

const AppNavigator: React.FC<{ pendingCode?: string | null }> = ({ pendingCode }) => (
  <AppStack.Navigator
    screenOptions={{ headerShown: false }}
    initialRouteName={pendingCode ? 'JoinGroup' : 'Home'}
  >
    <AppStack.Screen name="Home"         component={HomeScreen} />
    <AppStack.Screen name="GroupsList"   component={GroupsListScreen} />
    <AppStack.Screen name="GroupDetail"  component={GroupDetailScreen} />
    <AppStack.Screen
      name="JoinGroup"
      component={JoinScreen}
      initialParams={pendingCode ? { code: pendingCode } : undefined}
    />
    <AppStack.Screen name="Invite"       component={InviteScreen} />
    <AppStack.Screen name="CreateGroup"  component={CreateGroupScreen} />
    <AppStack.Screen name="Profile"      component={ProfileScreen} />
    <AppStack.Screen name="EditProfile"  component={EditProfileScreen} />
    <AppStack.Screen
      name="StatusPicker"
      component={StatusPickerScreen}
      options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
    />
  </AppStack.Navigator>
);

const RootNavigator: React.FC = () => {
  const { isAuthenticated, setUser, clearAuth, user } = useAuthStore();
  const { setGroups, clearGroups } = useGroupsStore();
  const [authReady, setAuthReady]   = useState(false);
  const [animDone, setAnimDone]     = useState(false);
  const [navReady, setNavReady]     = useState(false);
  // Invite code captured from a deep link while the user was unauthenticated
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const pendingCodeRef = useRef<string | null>(null);

  const extractInviteCode = (url: string): string | null =>
    url.match(/\/join\/([^/?&#]+)/)?.[1] ?? null;

  useEffect(() => {
    // Check if the app was cold-launched via an invite link
    Linking.getInitialURL().then(url => {
      if (!url) return;
      const code = extractInviteCode(url);
      if (code) {
        pendingCodeRef.current = code;
        setPendingCode(code);
      }
    });

    // Deferred deep link — check clipboard for an invite URL copied by the web fallback page
    Clipboard.getStringAsync().then(text => {
      if (!text) return;
      const code = extractInviteCode(text);
      if (code && !pendingCodeRef.current) {
        pendingCodeRef.current = code;
        setPendingCode(code);
        Clipboard.setStringAsync(''); // consume it so it doesn't re-trigger
      }
    }).catch(() => {});

    // Handle links received while the app is open and user is not yet authed
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (isAuthenticated) return; // NavigationContainer linking handles it
      const code = extractInviteCode(url);
      if (code) {
        pendingCodeRef.current = code;
        setPendingCode(code);
      }
    });

    return () => sub.remove();
  }, []);

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDTO = await getUser(firebaseUser.uid);
          if (userDTO) {
            setUser(userDTO);
          }
          // No profile yet — auth flow (socialAuth / OTPScreen) is mid-write.
          // It will call setUser directly when done. Don't clearAuth here or we
          // race and undo that setUser call.
        } catch {
          clearAuth();
        }
      } else {
        clearAuth();
      }
      setAuthReady(true);
    });
    return unsubscribe;
  }, []);

  const navigateToGroup = (groupId: string) => {
    if (!navigationRef.isReady()) return;
    const groups = useGroupsStore.getState().groups;
    const groupName = groups.find(g => g.id === groupId)?.name ?? 'Group';
    navigationRef.navigate('GroupDetail', { groupId, groupName });
  };

  // Groups subscription — lives here so it runs regardless of which screen is active
  // (critical for the invite link join flow where HomeScreen may not be mounted)
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    const unsubscribe = subscribeToGroups(user.id, setGroups);
    return () => {
      unsubscribe();
      clearGroups();
    };
  }, [isAuthenticated, user?.id]);

  // Push notifications when authenticated
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    registerForPushNotifications(user.id);

    const notifSub = addNotificationTapListener(({ groupId }) => {
      navigateToGroup(groupId);
    });

    return () => notifSub.remove();
  }, [isAuthenticated]);

  // Handle notification tap from killed/background state
  useEffect(() => {
    if (!isAuthenticated || !navReady) return;
    getLastNotificationResponse().then(response => {
      if (!response) return;
      const data = response.notification.request.content.data as NotificationData;
      if (data?.groupId) navigateToGroup(data.groupId);
    });
  }, [isAuthenticated, navReady]);

  // Consume pending code on login; discard it on logout so it can't re-fire
  useEffect(() => {
    if (!isAuthenticated) {
      setPendingCode(null);
      pendingCodeRef.current = null;
      return;
    }
    if (pendingCodeRef.current) {
      setPendingCode(pendingCodeRef.current);
      pendingCodeRef.current = null;
    }
  }, [isAuthenticated]);

  if (!authReady || !animDone) return <SplashScreen onFinish={() => setAnimDone(true)} />;

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={isAuthenticated ? linking : undefined}
      onReady={() => setNavReady(true)}
    >
      {isAuthenticated ? <AppNavigator pendingCode={pendingCode} /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

export default RootNavigator;
