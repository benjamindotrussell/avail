import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import type {
  GroupWithMembersDTO, GroupMemberDTO, StatusDTO, UserDTO,
  Availability, Location, Vibe,
} from '@avail/shared';

// ─── Firestore document shapes ────────────────────────────────────────────────

type Timestamp = FirebaseFirestoreTypes.Timestamp;

interface FSUser {
  displayName: string;
  avatarUrl: string | null;
  notifyOnlyWhenActive: boolean;
  defaultExpiryHours?: number;
  memberGroupIds: string[];
  createdAt: Timestamp;
}

interface FSGroup {
  name: string;
  createdBy: string;
  createdAt: Timestamp;
}

interface FSMember {
  uid: string;
  role: 'admin' | 'member';
  displayName: string;
  avatarUrl: string | null;
  joinedAt: Timestamp;
}

interface FSStatus {
  uid: string;
  availability: Availability;
  location: Location | null;
  locationNote: string | null;
  vibe: Vibe | null;
  vibeNote: string | null;
  expiresAt: Timestamp;
  updatedAt: Timestamp;
}

interface FSInviteCode {
  groupId: string;
  createdBy: string;
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

// ─── Converters ───────────────────────────────────────────────────────────────

const tsToDate = (ts: Timestamp | null | undefined): Date =>
  ts?.toDate() ?? new Date();

function fsStatusToDTO(uid: string, groupId: string, s: FSStatus): StatusDTO | null {
  if (!s.expiresAt) return null;
  const now = new Date();
  if (s.expiresAt.toDate() <= now) return null;
  return {
    id: `${uid}_${groupId}`,
    userId: uid,
    groupId,
    availability: s.availability,
    location: s.location,
    locationNote: s.locationNote,
    vibe: s.vibe,
    vibeNote: s.vibeNote,
    expiresAt: s.expiresAt.toDate().toISOString(),
    updatedAt: tsToDate(s.updatedAt).toISOString(),
  };
}

function buildGroupDTO(
  groupId: string,
  groupMeta: FSGroup,
  membersMap: Map<string, FSMember>,
  statusesMap: Map<string, FSStatus>,
): GroupWithMembersDTO {
  const members: GroupMemberDTO[] = [];
  for (const [uid, m] of membersMap) {
    const fsStatus = statusesMap.get(uid) ?? null;
    const status = fsStatus ? fsStatusToDTO(uid, groupId, fsStatus) : null;
    const joinedAt = tsToDate(m.joinedAt).toISOString();
    const userDTO: UserDTO = {
      id: uid,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl,
      createdAt: joinedAt,
      notifyOnlyWhenActive: false,
    };
    members.push({ user: userDTO, role: m.role, joinedAt, status });
  }
  return {
    id: groupId,
    name: groupMeta.name,
    avatarUrl: null,
    createdAt: tsToDate(groupMeta.createdAt).toISOString(),
    members,
    freeCount: members.filter(m => m.status?.availability === 'free').length,
    maybeCount: members.filter(m => m.status?.availability === 'maybe').length,
  };
}

// ─── User ─────────────────────────────────────────────────────────────────────

export async function getUser(uid: string): Promise<UserDTO | null> {
  const snap = await firestore().collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const d = snap.data() as FSUser | undefined;
  if (!d) return null;
  return {
    id: uid,
    displayName: d.displayName,
    avatarUrl: d.avatarUrl,
    createdAt: tsToDate(d.createdAt).toISOString(),
    notifyOnlyWhenActive: d.notifyOnlyWhenActive,
    defaultExpiryHours: d.defaultExpiryHours ?? 8,
  };
}

export async function upsertUser(uid: string, data: {
  displayName?: string;
  avatarUrl?: string | null;
  notifyOnlyWhenActive?: boolean;
}): Promise<void> {
  const ref = firestore().collection('users').doc(uid);

  const fullDoc = {
    displayName: data.displayName ?? '',
    avatarUrl: data.avatarUrl ?? null,
    notifyOnlyWhenActive: false,
    memberGroupIds: [],
    createdAt: new Date(),
    ...data,
  };

  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set(fullDoc);
    return;
  }

  try {
    await ref.update(data);
  } catch (e: any) {
    // Offline cache reported exists=true but server disagrees — create the doc.
    if (e?.code === 'firestore/not-found') {
      await ref.set(fullDoc);
    } else {
      throw e;
    }
  }
}

export async function updateUser(uid: string, data: {
  displayName?: string;
  avatarUrl?: string | null;
  notifyOnlyWhenActive?: boolean;
  defaultExpiryHours?: number;
}): Promise<void> {
  // Write user doc first — must always succeed.
  await firestore().collection('users').doc(uid).update(data);

  // Propagate display name / avatar to group member docs (best-effort).
  if (data.displayName !== undefined || data.avatarUrl !== undefined) {
    try {
      const userSnap = await firestore().collection('users').doc(uid).get();
      const memberGroupIds: string[] = (userSnap.data() as FSUser)?.memberGroupIds ?? [];
      if (memberGroupIds.length === 0) return;

      const memberUpdate: Partial<FSMember> = {};
      if (data.displayName !== undefined) memberUpdate.displayName = data.displayName;
      if (data.avatarUrl !== undefined) memberUpdate.avatarUrl = data.avatarUrl;

      const batch = firestore().batch();
      for (const groupId of memberGroupIds) {
        batch.update(
          firestore().collection('groups').doc(groupId).collection('members').doc(uid),
          memberUpdate,
        );
      }
      await batch.commit();
    } catch {
      // Member doc updates are best-effort — user doc write already succeeded.
    }
  }
}

// ─── Groups — real-time subscription ─────────────────────────────────────────

function subscribeToGroup(
  groupId: string,
  onUpdate: (group: GroupWithMembersDTO | null) => void,
): () => void {
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let activeUnsubs: Array<() => void> = [];

  const teardown = () => {
    activeUnsubs.forEach(u => u());
    activeUnsubs = [];
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  };

  const setup = () => {
    if (stopped) return;
    teardown();

    let groupMeta: FSGroup | null = null;
    const membersMap = new Map<string, FSMember>();
    const statusesMap = new Map<string, FSStatus>();

    const merge = () => {
      if (!groupMeta) return;
      onUpdate(buildGroupDTO(groupId, groupMeta, membersMap, statusesMap));
    };

    const onError = (err: any) => {
      if (err?.code === 'firestore/permission-denied') {
        teardown();
        retryTimer = setTimeout(setup, 1500);
      }
    };

    activeUnsubs.push(
      firestore().collection('groups').doc(groupId).onSnapshot(snap => {
        if (!snap.exists) { onUpdate(null); return; }
        groupMeta = snap.data() as FSGroup;
        merge();
      }, onError),

      firestore().collection('groups').doc(groupId).collection('members').onSnapshot(snap => {
        snap.docChanges().forEach(change => {
          if (change.type === 'removed') membersMap.delete(change.doc.id);
          else membersMap.set(change.doc.id, change.doc.data() as FSMember);
        });
        merge();
      }, onError),

      firestore().collection('groups').doc(groupId).collection('statuses').onSnapshot(snap => {
        snap.docChanges().forEach(change => {
          if (change.type === 'removed') statusesMap.delete(change.doc.id);
          else statusesMap.set(change.doc.id, change.doc.data() as FSStatus);
        });
        merge();
      }, onError),
    );
  };

  setup();
  return () => { stopped = true; teardown(); };
}

export function subscribeToGroups(
  uid: string,
  onUpdate: (groups: GroupWithMembersDTO[]) => void,
): () => void {
  const groupListeners = new Map<string, () => void>();
  const groupData = new Map<string, GroupWithMembersDTO>();

  const notify = () => {
    const sorted = [...groupData.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    onUpdate(sorted);
  };

  const unsubUser = firestore().collection('users').doc(uid).onSnapshot(snap => {
    if (!snap.exists) return;
    const memberGroupIds: string[] = (snap.data() as FSUser).memberGroupIds ?? [];

    for (const gid of [...groupListeners.keys()]) {
      if (!memberGroupIds.includes(gid)) {
        groupListeners.get(gid)!();
        groupListeners.delete(gid);
        groupData.delete(gid);
      }
    }

    for (const gid of memberGroupIds) {
      if (!groupListeners.has(gid)) {
        const unsub = subscribeToGroup(gid, group => {
          if (group) groupData.set(gid, group);
          else groupData.delete(gid);
          notify();
        });
        groupListeners.set(gid, unsub);
      }
    }

    notify();
  });

  return () => {
    unsubUser();
    for (const unsub of groupListeners.values()) unsub();
  };
}

// ─── Groups — writes ──────────────────────────────────────────────────────────

export async function createGroup(uid: string, displayName: string, name: string): Promise<string> {
  const batch = firestore().batch();

  const groupRef = firestore().collection('groups').doc();
  batch.set(groupRef, { name, createdBy: uid, createdAt: new Date() });

  const memberRef = firestore().collection('groups').doc(groupRef.id).collection('members').doc(uid);
  batch.set(memberRef, { uid, role: 'admin', displayName, avatarUrl: null, joinedAt: new Date() });

  batch.update(firestore().collection('users').doc(uid), { memberGroupIds: firestore.FieldValue.arrayUnion(groupRef.id) });

  await batch.commit();
  return groupRef.id;
}

export async function deleteGroup(groupId: string, uid: string): Promise<void> {
  const memberSnap = await firestore().collection('groups').doc(groupId).collection('members').doc(uid).get();
  if (!memberSnap.exists || memberSnap.data()?.role !== 'admin') {
    throw new Error('Only admins can delete a group');
  }

  const membersSnap = await firestore().collection('groups').doc(groupId).collection('members').get();
  const batch = firestore().batch();

  membersSnap.docs.forEach(m => {
    batch.update(firestore().collection('users').doc(m.id), { memberGroupIds: firestore.FieldValue.arrayRemove(groupId) });
    batch.delete(m.ref);
  });

  const statusesSnap = await firestore().collection('groups').doc(groupId).collection('statuses').get();
  statusesSnap.docs.forEach(s => batch.delete(s.ref));

  batch.delete(firestore().collection('groups').doc(groupId));
  await batch.commit();
}

export async function leaveGroup(groupId: string, uid: string): Promise<void> {
  const batch = firestore().batch();
  batch.delete(firestore().collection('groups').doc(groupId).collection('members').doc(uid));
  batch.delete(firestore().collection('groups').doc(groupId).collection('statuses').doc(uid));
  batch.update(firestore().collection('users').doc(uid), { memberGroupIds: firestore.FieldValue.arrayRemove(groupId) });
  await batch.commit();
}

// ─── Status ───────────────────────────────────────────────────────────────────

export async function setStatus(
  groupId: string,
  uid: string,
  payload: {
    availability: Availability;
    location?: Location | null;
    locationNote?: string | null;
    vibe?: Vibe | null;
    vibeNote?: string | null;
    expiryHours?: number;
  }
): Promise<StatusDTO> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + (payload.expiryHours ?? 8));

  const statusData: FSStatus = {
    uid,
    availability: payload.availability,
    location: payload.location ?? null,
    locationNote: payload.locationNote ?? null,
    vibe: payload.vibe ?? null,
    vibeNote: payload.vibeNote ?? null,
    expiresAt: firestore.Timestamp.fromDate(expiresAt),
    updatedAt: firestore.Timestamp.fromDate(new Date()),
  };

  await firestore().collection('groups').doc(groupId).collection('statuses').doc(uid).set(statusData);
  return fsStatusToDTO(uid, groupId, statusData)!;
}

// ─── Invite codes ─────────────────────────────────────────────────────────────

function generateCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function createInviteCode(groupId: string, uid: string): Promise<string> {
  const memberSnap = await firestore().collection('groups').doc(groupId).collection('members').doc(uid).get();
  if (!memberSnap.exists) throw new Error('Not a member of this group');

  const code = generateCode();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await firestore().collection('inviteCodes').doc(code).set({
    groupId,
    createdBy: uid,
    expiresAt: firestore.Timestamp.fromDate(expiresAt),
    createdAt: new Date(),
  });

  return `https://avail-app-b71d4.web.app/join/${code}`;
}

export async function joinGroupByCode(
  code: string,
  uid: string,
  displayName: string,
  avatarUrl: string | null,
): Promise<string> {
  const inviteSnap = await firestore().collection('inviteCodes').doc(code).get();
  if (!inviteSnap.exists) throw new Error('Invalid invite link');

  const invite = inviteSnap.data() as FSInviteCode;
  if (invite.expiresAt.toDate() < new Date()) throw new Error('Invite link has expired');

  const groupId = invite.groupId;

  const existingMember = await firestore().collection('groups').doc(groupId).collection('members').doc(uid).get();
  if (existingMember.exists) return groupId;

  const batch = firestore().batch();
  batch.set(firestore().collection('groups').doc(groupId).collection('members').doc(uid), {
    uid, role: 'member', displayName, avatarUrl, joinedAt: new Date(),
  });
  batch.update(firestore().collection('users').doc(uid), { memberGroupIds: firestore.FieldValue.arrayUnion(groupId) });
  await batch.commit();

  return groupId;
}

// ─── Device tokens ────────────────────────────────────────────────────────────

export async function registerDeviceToken(uid: string, token: string, platform: 'ios' | 'android'): Promise<void> {
  await firestore().collection('users').doc(uid).collection('deviceTokens').doc(token).set({
    token, platform, createdAt: new Date(),
  });
}

export async function removeDeviceToken(uid: string, token: string): Promise<void> {
  await firestore().collection('users').doc(uid).collection('deviceTokens').doc(token).delete();
}
