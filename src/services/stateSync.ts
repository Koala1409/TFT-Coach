/**
 * Background → overlay state transport.
 *
 * All Overwolf windows of one app share an origin, so the background window writes the
 * latest TftGameState to localStorage and other windows receive it via the `storage`
 * event (fired in every *other* same-origin document). No polling, works in Chrome too.
 */
import type { TftGameState } from '../types/tft';

const KEY = 'tft.gameState';

export function publishGameState(state: TftGameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[stateSync] publish failed', e);
  }
}

export function clearGameState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function readGameState(): TftGameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TftGameState) : null;
  } catch {
    return null;
  }
}

/** Calls `onState` with the current state (if any) and on every update. Returns an unsubscribe fn. */
export function subscribeGameState(onState: (s: TftGameState) => void): () => void {
  const current = readGameState();
  if (current) onState(current);
  const handler = (e: StorageEvent) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      onState(JSON.parse(e.newValue) as TftGameState);
    } catch {
      /* ignore malformed */
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
