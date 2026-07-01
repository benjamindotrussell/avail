// ─── Status types ─────────────────────────────────────────────────────────────

export type Availability = 'free' | 'maybe' | 'busy';
export type Location = 'my_place' | 'pub' | 'out' | 'someones_place' | 'anywhere' | 'other';
export type Vibe = 'im_paying' | 'buying_own' | 'suggest' | 'free_cheap' | 'other';

export interface StatusPayload {
  availability: Availability;
  location?: Location | null;
  locationNote?: string | null;
  vibe?: Vibe | null;
  vibeNote?: string | null;
  expiresAt?: string; // ISO 8601 — defaults to now + 8h
}

export interface StatusDTO {
  id: string;
  userId: string;
  groupId: string;
  availability: Availability;
  location: Location | null;
  locationNote: string | null;
  vibe: Vibe | null;
  vibeNote: string | null;
  expiresAt: string;
  updatedAt: string;
}

// ─── User types ───────────────────────────────────────────────────────────────

export interface UserDTO {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  notifyOnlyWhenActive: boolean;
  defaultExpiryHours: number;
}

// ─── Group types ──────────────────────────────────────────────────────────────

export interface GroupDTO {
  id: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
  createdBy: string;
}

export interface GroupMemberDTO {
  user: UserDTO;
  role: 'admin' | 'member';
  joinedAt: string;
  status: StatusDTO | null; // current status, fetched from Redis
}

export interface GroupWithMembersDTO extends GroupDTO {
  members: GroupMemberDTO[];
  freeCount: number;
  maybeCount: number;
}

// ─── Auth types ───────────────────────────────────────────────────────────────

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends TokenPair {
  user: UserDTO;
  firebaseToken?: string;
}

export interface JWTPayload {
  userId: string;
  iat: number;
  exp: number;
}

// ─── Redis event types ────────────────────────────────────────────────────────

export interface StatusUpdateEvent {
  userId: string;
  groupId: string;
  status: StatusDTO;
  updatedAt: string;
}

// IMPORTANT: Only published when availability === 'free' or 'maybe'
// Never published for 'busy'
export interface PushNotificationEvent {
  triggerUserId: string;
  triggerUserName: string;
  groupIds: string[];
  status: {
    availability: 'free' | 'maybe'; // typed as literal union — enforces the rule at compile time
    location: Location | null;
    vibe: Vibe | null;
  };
}

// ─── API error types ──────────────────────────────────────────────────────────

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface APIError {
  error: {
    code: ErrorCode;
    message: string;
    fields?: Record<string, string>;
  };
}

// ─── Redis key helpers ────────────────────────────────────────────────────────

export const RedisKeys = {
  userStatus: (userId: string, groupId: string) => `status:${userId}:${groupId}`,
  otpKey: (phone: string) => `otp:${phone}`,
  groupStatusChannel: (groupId: string) => `group:${groupId}:status`,
  pushNotificationChannel: () => 'notifications:push',
} as const;

// ─── Constants ────────────────────────────────────────────────────────────────

export const STATUS_DEFAULT_EXPIRY_HOURS = 8;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const INVITE_LINK_EXPIRY_DAYS = 7;
