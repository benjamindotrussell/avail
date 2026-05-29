import { create } from 'zustand';
import type { GroupWithMembersDTO, StatusDTO } from '@avail/shared';

interface GroupsStore {
  groups: GroupWithMembersDTO[];
  setGroups: (groups: GroupWithMembersDTO[]) => void;
  updateMemberStatus: (groupId: string, userId: string, status: StatusDTO | null) => void;
  clearGroups: () => void;
}

export const useGroupsStore = create<GroupsStore>((set) => ({
  groups: [],

  setGroups: (groups) => set({ groups }),

  updateMemberStatus: (groupId, userId, status) =>
    set((state) => ({
      groups: state.groups.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          members: group.members.map((member) =>
            member.user.id === userId ? { ...member, status } : member
          ),
          freeCount: group.members.filter(
            (m) => (m.user.id === userId ? status?.availability === 'free' : m.status?.availability === 'free')
          ).length,
          maybeCount: group.members.filter(
            (m) => (m.user.id === userId ? status?.availability === 'maybe' : m.status?.availability === 'maybe')
          ).length,
        };
      }),
    })),

  clearGroups: () => set({ groups: [] }),
}));
