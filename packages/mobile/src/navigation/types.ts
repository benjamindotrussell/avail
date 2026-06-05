import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

// ─── Auth stack ───────────────────────────────────────────────────────────────
export type AuthStackParamList = {
  Onboarding: undefined;
};

// ─── App stack ────────────────────────────────────────────────────────────────
export type AppStackParamList = {
  Home: undefined;
  GroupsList: undefined;
  GroupDetail: { groupId: string; groupName: string };
  JoinGroup: { code: string };
  Invite: { groupId: string; groupName: string };
  CreateGroup: undefined;
  StatusPicker: { groupId: string; groupName: string };
  Profile: undefined;
  EditProfile: undefined;
};

// ─── Navigation prop helpers ──────────────────────────────────────────────────
export type AuthNavProp<T extends keyof AuthStackParamList> =
  NativeStackNavigationProp<AuthStackParamList, T>;

export type AuthRouteProp<T extends keyof AuthStackParamList> =
  RouteProp<AuthStackParamList, T>;

export type AppNavProp<T extends keyof AppStackParamList> =
  NativeStackNavigationProp<AppStackParamList, T>;

export type AppRouteProp<T extends keyof AppStackParamList> =
  RouteProp<AppStackParamList, T>;
