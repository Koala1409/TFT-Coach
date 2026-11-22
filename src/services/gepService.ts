/**
 * Overwolf GEP service for TFT (runs in the background window).
 *
 * - Registers the required features, retrying while GEP is still starting up.
 * - Feeds onInfoUpdates2 / onNewEvents / getInfo into the pure gepParser.
 * - Emits a throttled TftGameState plus "is this TFT?" to its listener.
 *
 * Augments are intentionally NOT registered: Overwolf's TFT docs state augment data must not
 * be displayed by apps (Riot policy).
 */
import { applyEvent, applyInfo, createAccumulator, isTftMatch, toGameState } from './gepParser';
import { canonicalItemId } from './ddragonService';
import type { TftGameState } from '../types/tft';

export const REQUIRED_FEATURES = [
  'gep_internal',
  'game_info',
  'me',
  'match_info',
  'roster',
  'store',
  'board',
  'bench',
  'match_stats',
] as const;

const MAX_FEATURE_RETRIES = 20;
const RETRY_DELAY_MS = 3000;
const EMIT_THROTTLE_MS = 150;

const log = (...args: unknown[]) => console.log('[gep]', ...args);

export interface GepUpdate {
  state: TftGameState;
  isTft: boolean;
}

export class GepService {
  private acc = createAccumulator();
  private running = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private emitTimer: ReturnType<typeof setTimeout> | undefined;
  private onUpdate: (u: GepUpdate) => void;

  constructor(onUpdate: (u: GepUpdate) => void) {
    this.onUpdate = onUpdate;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.acc = createAccumulator();
    overwolf.games.events.onInfoUpdates2.addListener(this.handleInfo);
    overwolf.games.events.onNewEvents.addListener(this.handleEvents);
    overwolf.games.events.onError.addListener(this.handleError);
    this.registerFeatures(1);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    clearTimeout(this.retryTimer);
    clearTimeout(this.emitTimer);
    overwolf.games.events.onInfoUpdates2.removeListener(this.handleInfo);
    overwolf.games.events.onNewEvents.removeListener(this.handleEvents);
    overwolf.games.events.onError.removeListener(this.handleError);
  }

  /** GEP is often not ready right after game launch — retry until it accepts the features. */
  private registerFeatures(attempt: number): void {
    if (!this.running) return;
    overwolf.games.events.setRequiredFeatures([...REQUIRED_FEATURES], (r) => {
      if (!this.running) return;
      if (r.success) {
        log('features registered:', r.supportedFeatures?.join(', ') ?? '(none reported)');
        overwolf.games.events.getInfo((info) => info.success && info.res && this.handleInfo({ feature: 'getInfo', info: info.res }));
        return;
      }
      if (attempt >= MAX_FEATURE_RETRIES) {
        log(`setRequiredFeatures failed after ${attempt} attempts:`, r.error);
        return;
      }
      log(`setRequiredFeatures attempt ${attempt} failed (${r.error ?? 'unknown'}), retrying…`);
      this.retryTimer = setTimeout(() => this.registerFeatures(attempt + 1), RETRY_DELAY_MS);
    });
  }

  private handleInfo = (e: Overwolf.InfoUpdates2Event): void => {
    applyInfo(this.acc, e.info ?? {});
    this.scheduleEmit();
  };

  private handleEvents = (e: Overwolf.NewGameEvents): void => {
    for (const ev of e.events ?? []) {
      if (applyEvent(this.acc, ev.name)) log('new match — state reset');
    }
    this.scheduleEmit();
  };

  private handleError = (e: Overwolf.GameEventError): void => log('error:', e.reason);

  /** Coalesce bursts of updates (GEP sends many keys per tick) into one state publish. */
  private scheduleEmit(): void {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = undefined;
      this.onUpdate({ state: toGameState(this.acc, canonicalItemId), isTft: isTftMatch(this.acc) });
    }, EMIT_THROTTLE_MS);
  }
}
