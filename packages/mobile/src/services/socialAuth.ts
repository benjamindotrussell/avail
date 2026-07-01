import {
  getAuth,
  signInWithCredential,
  GoogleAuthProvider,
  AppleAuthProvider,
} from '@react-native-firebase/auth';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { upsertUser, getUser } from './firestoreService';
import { useAuthStore } from '../store/authStore';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});

export async function signInWithApple(): Promise<void> {
  const result = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  const { identityToken, fullName } = result;
  if (!identityToken) throw new Error('No identity token returned from Apple');

  const appleCredential = AppleAuthProvider.credential(identityToken);
  const { user } = await signInWithCredential(getAuth(), appleCredential);

  const displayName = fullName?.givenName
    ? [fullName.givenName, fullName.familyName].filter(Boolean).join(' ')
    : user.displayName ?? 'Avail user';

  await upsertUser(user.uid, { displayName, avatarUrl: user.photoURL ?? null });

  const stored = await getUser(user.uid);
  useAuthStore.getState().setUser(stored ?? {
    id: user.uid,
    displayName,
    avatarUrl: user.photoURL ?? null,
    createdAt: new Date().toISOString(),
    notifyOnlyWhenActive: false,
    defaultExpiryHours: 8,
  });
}

export async function signInWithGoogle(): Promise<void> {
  await GoogleSignin.hasPlayServices();
  const result = await GoogleSignin.signIn();
  if (result.type !== 'success') return;

  const idToken = result.data?.idToken;
  if (!idToken) throw new Error('No ID token returned from Google');

  const googleCredential = GoogleAuthProvider.credential(idToken);
  const { user } = await signInWithCredential(getAuth(), googleCredential);

  const displayName = user.displayName ?? result.data?.user?.name ?? 'Avail user';
  const avatarUrl = user.photoURL ?? result.data?.user?.photo ?? null;

  await upsertUser(user.uid, { displayName, avatarUrl });

  const stored = await getUser(user.uid);
  useAuthStore.getState().setUser(stored ?? {
    id: user.uid,
    displayName,
    avatarUrl,
    createdAt: new Date().toISOString(),
    notifyOnlyWhenActive: false,
    defaultExpiryHours: 8,
  });
}
