/**
 * Single in-window store for TftGameState.
 * - Mock mode: seeded sample state, mutated by the Simulator bar via `mockActions`.
 * - Live mode: empty until the GEP service (Step 2) pushes state with `gameStore.set`.
 */
import { useSyncExternalStore } from 'react';
import type { StarLevel, TftGameState, TftUnit } from '../types/tft';
import { generateMockLobby } from './mockLobby';

const emptyState = (source: TftGameState['source']): TftGameState => ({
  source,
  inMatch: false,
  level: 1,
  gold: 0,
  hp: 100,
  stage: '1-1',
  board: [],
  bench: [],
  items: [],
  shop: [],
  opponents: [],
  updatedAt: Date.now(),
});

const unit = (id: string, star: StarLevel = 1, items: string[] = []): TftUnit => ({ id, star, items });

export function createMockState(): TftGameState {
  return {
    ...emptyState('mock'),
    gameMode: 'TFT',
    inMatch: true,
    level: 4,
    gold: 24,
    hp: 86,
    stage: '2-5',
    board: [unit('DA_Karma18', 2), unit('DA_18_Yorick'), unit('DA_18_Teemo'), unit('DA_18_Kayle')],
    bench: [unit('DA_18_Kobuko')],
    items: ['TFT_Item_NeedlesslyLargeRod', 'TFT_Item_TearOfTheGoddess', 'TFT_Item_SparringGloves', 'TFT_Item_GiantsBelt'],
    opponents: generateMockLobby(),
  };
}

let state: TftGameState = emptyState('live');
const listeners = new Set<() => void>();

export const gameStore = {
  get: (): TftGameState => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  set(next: Partial<TftGameState>): void {
    state = { ...state, ...next, updatedAt: Date.now() };
    listeners.forEach((l) => l());
  },
  reset(source: TftGameState['source']): void {
    state = source === 'mock' ? createMockState() : emptyState('live');
    listeners.forEach((l) => l());
  },
};

export const useGameState = (): TftGameState => useSyncExternalStore(gameStore.subscribe, gameStore.get);

// ---------- simulator actions (mock mode) ----------

const allUnits = () => [...state.board, ...state.bench];

export const mockActions = {
  setLevel(level: number) {
    gameStore.set({ level });
  },
  addItem(itemId: string) {
    gameStore.set({ items: [...state.items, itemId] });
  },
  removeItem(itemId: string) {
    const i = state.items.lastIndexOf(itemId);
    if (i >= 0) gameStore.set({ items: state.items.filter((_, j) => j !== i) });
  },
  /** Adds to the board while it has room (board size = level), otherwise to the bench. */
  addUnit(id: string, star: StarLevel = 1) {
    if (allUnits().some((u) => u.id === id)) return mockActions.cycleStar(id);
    if (state.board.length < Math.max(state.level, 1)) gameStore.set({ board: [...state.board, unit(id, star)] });
    else gameStore.set({ bench: [...state.bench, unit(id, star)] });
  },
  removeUnit(id: string) {
    gameStore.set({ board: state.board.filter((u) => u.id !== id), bench: state.bench.filter((u) => u.id !== id) });
  },
  cycleStar(id: string) {
    const bump = (u: TftUnit): TftUnit => (u.id === id ? { ...u, star: ((u.star % 3) + 1) as StarLevel } : u);
    gameStore.set({ board: state.board.map(bump), bench: state.bench.map(bump) });
  },
  reshuffleLobby() {
    gameStore.set({ opponents: generateMockLobby() });
  },
  reset() {
    gameStore.reset('mock');
  },
};
