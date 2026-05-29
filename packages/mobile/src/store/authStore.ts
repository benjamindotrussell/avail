import { create } from 'zustand';
import type { UserDTO } from '@avail/shared';

interface AuthStore {
  user: UserDTO | null;
  isAuthenticated: boolean;
  setUser: (user: UserDTO) => void;
  updateUser: (partial: Partial<UserDTO>) => void;
  setNotifyOnlyWhenActive: (value: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isAuthenticated: false,

  setUser: (user) => set({ user, isAuthenticated: true }),

  updateUser: (partial) => {
    const current = get().user;
    if (current) set({ user: { ...current, ...partial } });
  },

  setNotifyOnlyWhenActive: (value) => {
    const current = get().user;
    if (current) set({ user: { ...current, notifyOnlyWhenActive: value } });
  },

  clearAuth: () => set({ user: null, isAuthenticated: false }),
}));
