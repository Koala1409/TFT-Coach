import { useSyncExternalStore } from 'react';

const KEY = 'tft.lockedComp';

const read = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

let locked: string | null = read();
const listeners = new Set<() => void>();

export const lockedCompStore = {
  get: () => locked,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  set(id: string | null) {
    locked = id;
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  },
};

export const useLockedCompId = () => useSyncExternalStore(lockedCompStore.subscribe, lockedCompStore.get);
