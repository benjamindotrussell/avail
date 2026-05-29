import {
  doc, collection, getDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, serverTimestamp, writeBatch,
  Timestamp, arrayUnion, arrayRemove, getDocs,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  GroupWithMembersDTO, GroupMemberDTO, StatusDTO, UserDTO,
  Availability, Location, Vibe,
} from '@avail/shared';

// ─── Firestore document shapes ────────────────────────────────────────────────

interface FSUser {
  displayName: string;
  avatarUrl: string | null;
  notifyOnlyWhenActive: boolean;
  phone: string | null;
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
  if (!s.expiresAt) return null; // pending server timestamp — skip until resolved
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
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const d = snap.data() as FSUser;
  return {
    id: uid,
    displayName: d.displayName,
    avatarUrl: d.avatarUrl,
    createdAt: tsToDate(d.createdAt).toISOString(),
    notifyOnlyWhenActive: d.notifyOnlyWhenActive,
  };
}

export async function upsertUser(uid: string, data: {
  displayName?: string;
  avatarUrl?: string | null;
  phone?: string | null;
  notifyOnlyWhenActive?: boolean;
}): Promise<void> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, data);
  } else {
    await setDoc(ref, {
      displayName: data.displayName ?? '',
      avatarUrl: data.avatarUrl ?? null,
      phone: data.phone ?? null,
      notifyOnlyWhenActive: false,
      memberGroupIds: [],
      createdAt: serverTimestamp(),
      ...data,
    });
  }
}

export async function updateUser(uid: string, data: {
  displayName?: string;
  avatarUrl?: string | null;
  notifyOnlyWhenActive?: boolean;
}): Promise<void> {
  await updateDoc(doc(db, 'users', uid), data);
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

    // On permission-denied, the batch write hasn't landed on the server yet.
    // Tear down and retry after a short delay — by then it will have committed.
    const onError = (err: Error) => {
      if ((err as any).code === 'permission-denied') {
        teardown();
        retryTimer = setTimeout(setup, 1500);
      }
    };

    activeUnsubs.push(
      onSnapshot(doc(db, 'groups', groupId), snap => {
        if (!snap.exists()) { onUpdate(null); return; }
        groupMeta = snap.data() as FSGroup;
        merge();
      }, onError),

      onSnapshot(collection(db, 'groups', groupId, 'members'), snap => {
        snap.docChanges().forEach(change => {
          if (change.type === 'removed') membersMap.delete(change.doc.id);
          else membersMap.set(change.doc.id, change.doc.data() as FSMember);
        });
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
    if (!snap.exists()) return;
    const memberGroupIds: string[] = snap.data().memberGroupIds ?? [];

    // Remove listeners for groups user left
    for (const gid of [...groupListeners.keys()]) {
      if (!memberGroupIds.includes(gid)) {
        groupListeners.get(gid)!();
        groupListeners.delete(gid);
        groupData.delete(gid);
      }
    }

    // Add listeners for new groups
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
  const batch = writeBatch(db);

  const groupRef = doc(collection(db, 'groups'));
  batch.set(groupRef, { name, createdBy: uid, createdAt: serverTimestamp() } as Omit<FSGroup, 'createdAt'> & { createdAt: ReturnType<typeof serverTimestamp> });

  const memberRef = doc(db, 'groups', groupRef.id, 'members', uid);
  batch.set(memberRef, { uid, role: 'admin', displayName, avatarUrl: null, joinedAt: serverTimestamp() });

  const userRef = doc(db, 'users', uid);
  batch.update(userRef, { memberGroupIds: arrayUnion(groupRef.id) });

  await batch.commit();
  return groupRef.id;
}

export async function deleteGroup(groupId: string, uid: string): Promise<void> {
  // Verify admin
  const memberSnap = await getDoc(doc(db, 'groups', groupId, 'members', uid));
  if (!memberSnap.exists() || memberSnap.data().role !== 'admin') {
    throw new Error('Only admins can delete a group');
  }

  // Get all members to remove groupId from their memberGroupIds
  const membersSnap = await getDocs(collection(db, 'groups', groupId, 'members'));
  const batch = writeBatch(db);

  membersSnap.docs.forEach(m => {
    batch.update(doc(db, 'users', m.id), { memberGroupIds: arrayRemove(groupId) });
    batch.delete(m.ref);
  });

  // Delete statuses
  const statusesSnap = await getDocs(collection(db, 'groups', groupId, 'statuses'));
  statusesSnap.docs.forEach(s => batch.delete(s.ref));

  batch.delete(doc(db, 'groups', groupId));
  await batch.commit();
}

export async function leaveGroup(groupId: string, uid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'groups', groupId, 'members', uid));
  batch.delete(doc(db, 'groups', groupId, 'statuses', uid));
  batch.update(doc(db, 'users', uid), { memberGroupIds: arrayRemove(groupId) });
  await batch.commit();
}

// ─── Status ───────────────────────────────────────────────────────────────────

const STATUS_EXPIRY_HOURS = 8;

export async function setStatus(
  groupId: string,
  uid: string,
  payload: {
    availability: Availability;
    location?: Location | null;
    locationNote?: string | null;
    vibe?: Vibe | null;
    vibeNote?: string | null;
  }
): Promise<StatusDTO> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + STATUS_EXPIRY_HOURS);

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
  // Check membership
  const memberSnap = await getDoc(doc(db, 'groups', groupId, 'members', uid));
  if (!memberSnap.exists()) throw new Error('Not a member of this group');

  const code = generateCode();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await setDoc(doc(db, 'inviteCodes', code), {
    groupId,
    createdBy: uid,
    expiresAt: Timestamp.fromDate(expiresAt),
    createdAt: serverTimestamp(),
  } as Omit<FSInviteCode, 'expiresAt' | 'createdAt'> & { expiresAt: Timestamp; createdAt: ReturnType<typeof serverTimestamp> });

  return `avail://join/${code}`;
}

export async function joinGroupByCode(
  code: string,
  uid: string,
  displayName: string,
  avatarUrl: string | null,
): Promise<string> {
  const inviteSnap = await getDoc(doc(db, 'inviteCodes', code));
  if (!inviteSnap.exists()) throw new Error('Invalid invite link');

  const invite = inviteSnap.data() as FSInviteCode;
  if (invite.expiresAt.toDate() < new Date()) throw new Error('Invite link has expired');

  const groupId = invite.groupId;

  // Already a member — nothing to do
  const existingMember = await getDoc(doc(db, 'groups', groupId, 'members', uid));
  if (existingMember.exists()) return groupId;

  const batch = writeBatch(db);
  batch.set(doc(db, 'groups', groupId, 'members', uid), {
    uid,
    role: 'member',
    displayName,
    avatarUrl,
    joinedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'users', uid), { memberGroupIds: arrayUnion(groupId) });
  await batch.commit();

  return groupId;
}

// ─── Device tokens ────────────────────────────────────────────────────────────

export async function registerDeviceToken(uid: string, token: string, platform: 'ios' | 'android'): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'deviceTokens', token), { token, platform, createdAt: serverTimestamp() });
}

export async function removeDeviceToken(uid: string, token: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'deviceTokens', token));
}
