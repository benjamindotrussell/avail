import { create } from 'zustand';

interface AliasStore {
  aliases: Record<string, string>; // groupId → display alias
  setAliases: (aliases: Record<string, string>) => void;
  setAlias: (groupId: string, alias: string) => void;
  clearAliases: () => void;
}

export const useAliasStore = create<AliasStore>((set) => ({
  aliases: {},
  setAliases: (aliases) => set({ aliases }),
  setAlias: (groupId, alias) =>
    set((s) => ({ aliases: { ...s.aliases, [groupId]: alias } })),
  clearAliases: () => set({ aliases: {} }),
}));
