import { create } from 'zustand';
import type { StatusDTO } from '@avail/shared';

interface StatusStore {
  myStatuses: Record<string, StatusDTO | null>; // keyed by groupId
  setMyStatus: (groupId: string, status: StatusDTO | null) => void;
  clearStatus: (groupId: string) => void;
  clearAll: () => void;
}

export const useStatusStore = create<StatusStore>((set) => ({
  myStatuses: {},
  setMyStatus: (groupId, status) =>
    set(state => ({ myStatuses: { ...state.myStatuses, [groupId]: status } })),
  clearStatus: (groupId) =>
    set(state => { const next = { ...state.myStatuses }; delete next[groupId]; return { myStatuses: next }; }),
  clearAll: () => set({ myStatuses: {} }),
}));
