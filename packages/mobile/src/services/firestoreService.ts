import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  runTransaction,
  Timestamp,
} from '@react-native-firebase/firestore';
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import type {
  GroupWithMembersDTO, GroupMemberDTO, StatusDTO, UserDTO,
  Availability, Location, Vibe,
} from '@avail/shared';
import { useAliasStore } from '../store/aliasStore';

const db = getFirestore();

// ─── Firestore document shapes ────────────────────────────────────────────────

interface FSUser {
  displayName: string;
  avatarUrl: string | null;
  notifyOnlyWhenActive: boolean;
  defaultExpiryHours?: number;
  memberGroupIds: string[];
  groupAliases?: Record<string, string>;
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
    createdBy: groupMeta.createdBy,
    members,
    freeCount: members.filter(m => m.status?.availability === 'free').length,
    maybeCount: members.filter(m => m.status?.availability === 'maybe').length,
  };
}

// ─── User ─────────────────────────────────────────────────────────────────────

export async function getUser(uid: string): Promise<UserDTO | null> {
  const snap = await getDoc(doc(db, 'users', uid));
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
  const ref = doc(db, 'users', uid);

  const fullDoc = {
    displayName: data.displayName ?? '',
    avatarUrl: data.avatarUrl ?? null,
    notifyOnlyWhenActive: false,
    memberGroupIds: [],
    createdAt: new Date(),
    ...data,
  };

  const snap = await getDoc(ref);
  if (!snap.exists) {
    await setDoc(ref, fullDoc);
    return;
  }

  try {
    // Don't overwrite displayName — user may have customised it via EditProfile
    const { displayName: _ignored, ...providerUpdate } = data;
    await updateDoc(ref, providerUpdate);
  } catch (e: any) {
    if (e?.code === 'firestore/not-found') {
      await setDoc(ref, fullDoc);
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
  await updateDoc(doc(db, 'users', uid), data);

  if (data.displayName !== undefined || data.avatarUrl !== undefined) {
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      const memberGroupIds: string[] = (userSnap.data() as FSUser)?.memberGroupIds ?? [];
      if (memberGroupIds.length === 0) return;

      const memberUpdate: Partial<FSMember> = {};
      if (data.displayName !== undefined) memberUpdate.displayName = data.displayName;
      if (data.avatarUrl !== undefined) memberUpdate.avatarUrl = data.avatarUrl;

      const batch = writeBatch(db);
      for (const groupId of memberGroupIds) {
        batch.update(doc(db, 'groups', groupId, 'members', uid), memberUpdate);
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
  let retryDelay = 1500;

  const teardown = () => {
    activeUnsubs.forEach(u => u());
    activeUnsubs = [];
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (expiryTimer) { clearInterval(expiryTimer); expiryTimer = null; }
  };

  let expiryTimer: ReturnType<typeof setInterval> | null = null;

  const setup = () => {
    if (stopped) return;
    teardown();

    let groupMeta: FSGroup | null = null;
    const membersMap = new Map<string, FSMember>();
    const statusesMap = new Map<string, FSStatus>();
    let membersReady = false;

    const merge = () => {
      if (!groupMeta || !membersReady) return;
      retryDelay = 1500;
      onUpdate(buildGroupDTO(groupId, groupMeta, membersMap, statusesMap));
    };

    const onError = (_err: any) => {
      if (stopped) return;
      teardown();
      retryTimer = setTimeout(setup, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30_000);
    };

    activeUnsubs.push(
      onSnapshot(doc(db, 'groups', groupId), snap => {
        if (!snap.exists) { onUpdate(null); return; }
        groupMeta = snap.data() as FSGroup;
        merge();
      }, onError),

      onSnapshot(collection(db, 'groups', groupId, 'members'), snap => {
        snap.docChanges().forEach(change => {
          if (change.type === 'removed') membersMap.delete(change.doc.id);
          else membersMap.set(change.doc.id, change.doc.data() as FSMember);
        });
        membersReady = true;
        merge();
      }, onError),

      onSnapshot(collection(db, 'groups', groupId, 'statuses'), snap => {
        snap.docChanges().forEach(change => {
          if (change.type === 'removed') statusesMap.delete(change.doc.id);
          else statusesMap.set(change.doc.id, change.doc.data() as FSStatus);
        });
        merge();
      }, onError),
    );

    expiryTimer = setInterval(merge, 60_000);
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

  const unsubUser = onSnapshot(doc(db, 'users', uid), snap => {
    if (!snap.exists) return;
    const fsUser = snap.data() as FSUser;
    const memberGroupIds: string[] = fsUser.memberGroupIds ?? [];
    useAliasStore.getState().setAliases(fsUser.groupAliases ?? {});

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

// ─── memberGroupIds helpers ───────────────────────────────────────────────────

async function addToUserGroups(uid: string, groupId: string): Promise<void> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  const ids: string[] = (snap.data() as FSUser)?.memberGroupIds ?? [];
  if (!ids.includes(groupId)) {
    await updateDoc(ref, { memberGroupIds: [...ids, groupId] });
  }
}

async function removeFromUserGroups(uid: string, groupId: string): Promise<void> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  const ids: string[] = (snap.data() as FSUser)?.memberGroupIds ?? [];
  await updateDoc(ref, { memberGroupIds: ids.filter(id => id !== groupId) });
}

// ─── Groups — writes ──────────────────────────────────────────────────────────

export async function createGroup(uid: string, displayName: string, name: string): Promise<string> {
  const batch = writeBatch(db);

  const groupRef = doc(collection(db, 'groups'));
  batch.set(groupRef, { name, createdBy: uid, createdAt: new Date() });
  batch.set(doc(db, 'groups', groupRef.id, 'members', uid), {
    uid, role: 'admin', displayName, avatarUrl: null, joinedAt: new Date(),
  });

  await batch.commit();
  await addToUserGroups(uid, groupRef.id);
  return groupRef.id;
}

export async function deleteGroup(groupId: string, uid: string): Promise<void> {
  const memberSnap = await getDoc(doc(db, 'groups', groupId, 'members', uid));
  if (!memberSnap.exists || memberSnap.data()?.role !== 'admin') {
    throw new Error('Only admins can delete a group');
  }

  const [mSnap, sSnap] = await Promise.all([
    getDocs(collection(db, 'groups', groupId, 'members')),
    getDocs(collection(db, 'groups', groupId, 'statuses')),
  ]);

  const batch = writeBatch(db);
  mSnap.docs.forEach(m => batch.delete(m.ref));
  sSnap.docs.forEach(s => batch.delete(s.ref));
  batch.delete(doc(db, 'groups', groupId));
  await batch.commit();

  await Promise.all(mSnap.docs.map(m => removeFromUserGroups(m.id, groupId)));
}

export async function leaveGroup(groupId: string, uid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'groups', groupId, 'members', uid));
  batch.delete(doc(db, 'groups', groupId, 'statuses', uid));
  await batch.commit();
  await removeFromUserGroups(uid, groupId);
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
    expiresAt: Timestamp.fromDate(expiresAt),
    updatedAt: Timestamp.fromDate(new Date()),
  };

  await setDoc(doc(db, 'groups', groupId, 'statuses', uid), statusData);
  return fsStatusToDTO(uid, groupId, statusData)!;
}

// ─── Invite codes ─────────────────────────────────────────────────────────────

function generateCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function createInviteCode(groupId: string, uid: string): Promise<string> {
  const memberSnap = await getDoc(doc(db, 'groups', groupId, 'members', uid));
  if (!memberSnap.exists) throw new Error('Not a member of this group');

  const code = generateCode();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await setDoc(doc(db, 'inviteCodes', code), {
    groupId,
    createdBy: uid,
    expiresAt: Timestamp.fromDate(expiresAt),
    createdAt: new Date(),
  });

  return `https://avail-app-b71d4.web.app/join/${code}`;
}

export async function saveGroupAlias(uid: string, groupId: string, alias: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { [`groupAliases.${groupId}`]: alias.trim() });
  useAliasStore.getState().setAlias(groupId, alias.trim());
}

export async function joinGroupByCode(
  code: string,
  uid: string,
  displayName: string,
  avatarUrl: string | null,
): Promise<{ groupId: string; alreadyMember: boolean; groupName: string }> {
  const inviteSnap = await getDoc(doc(db, 'inviteCodes', code));
  if (!inviteSnap.exists) throw new Error('Invalid invite link');

  const invite = inviteSnap.data() as FSInviteCode;
  if (invite.expiresAt.toDate() < new Date()) throw new Error('Invite link has expired');

  const groupId = invite.groupId;

  let alreadyMember = false;
  await runTransaction(db, async (tx) => {
    const memberRef = doc(db, 'groups', groupId, 'members', uid);
    const snap = await tx.get(memberRef);
    alreadyMember = snap.data() !== undefined;
    if (!alreadyMember) {
      tx.set(memberRef, { uid, role: 'member', displayName, avatarUrl, joinedAt: new Date() });
    }
  });

  await addToUserGroups(uid, groupId);

  // Read group name now — after joining, isMember() is true so the read is allowed.
  let groupName = '';
  try {
    const groupSnap = await getDoc(doc(db, 'groups', groupId));
    groupName = (groupSnap.data() as FSGroup)?.name ?? '';
  } catch {
    // Falls back to empty string; GroupDetail will show the name once the subscription fires.
  }

  return { groupId, alreadyMember, groupName };
}

// ─── Device tokens ────────────────────────────────────────────────────────────

export async function registerDeviceToken(uid: string, token: string, platform: 'ios' | 'android'): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'deviceTokens', token), {
    token, platform, createdAt: new Date(),
  });
}

export async function removeDeviceToken(uid: string, token: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'deviceTokens', token));
}
