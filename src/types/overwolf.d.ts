/**
 * Minimal, hand-written typings for the subset of the Overwolf API this app uses.
 * Keep this file small: add members only when they are actually called.
 * Reference: https://dev.overwolf.com/ow-native/reference/overwolf-api-overview
 */

declare namespace Overwolf {
  interface Result {
    success: boolean;
    error?: string;
    status?: 'success' | 'error';
  }

  type Callback<T extends Result = Result> = (result: T) => void;

  interface Event<T> {
    addListener(cb: (payload: T) => void): void;
    removeListener(cb: (payload: T) => void): void;
  }

  // ---------- windows ----------
  type WindowStateEx = 'normal' | 'minimized' | 'maximized' | 'hidden' | 'closed';

  interface WindowInfo {
    id: string;
    name: string;
    width: number;
    height: number;
    top: number;
    left: number;
    isVisible: boolean;
    stateEx: WindowStateEx;
  }

  interface WindowResult extends Result {
    window: WindowInfo;
  }

  interface WindowStateResult extends Result {
    window_id: string;
    window_state: string;
    window_state_ex: WindowStateEx;
  }

  interface Windows {
    obtainDeclaredWindow(name: string, cb: Callback<WindowResult>): void;
    getCurrentWindow(cb: Callback<WindowResult>): void;
    getWindowState(windowIdOrName: string, cb: Callback<WindowStateResult>): void;
    restore(windowIdOrName: string, cb?: Callback): void;
    minimize(windowIdOrName: string, cb?: Callback): void;
    hide(windowIdOrName: string, cb?: Callback): void;
    close(windowIdOrName: string, cb?: Callback): void;
    dragMove(windowIdOrName: string, cb?: Callback): void;
  }

  // ---------- games ----------
  interface GameInfo {
    isRunning: boolean;
    isInFocus: boolean;
    /** Game class id — 5426 for League of Legends / TFT. */
    classId: number;
    id: number;
    title: string;
  }

  interface GameInfoUpdatedEvent {
    gameInfo: GameInfo | null;
    runningChanged: boolean;
    gameChanged: boolean;
    focusChanged: boolean;
    resolutionChanged: boolean;
  }

  // ---------- game events (GEP) ----------
  interface SetRequiredFeaturesResult extends Result {
    supportedFeatures?: string[];
  }

  interface GetInfoResult extends Result {
    res: Record<string, Record<string, string> | undefined>;
  }

  interface InfoUpdates2Event {
    feature: string;
    info: Record<string, Record<string, string> | undefined>;
  }

  interface NewGameEvent {
    name: string;
    data: string;
  }

  interface NewGameEvents {
    events: NewGameEvent[];
  }

  interface GameEventError {
    reason: string;
  }

  interface GameEvents {
    setRequiredFeatures(features: string[], cb: Callback<SetRequiredFeaturesResult>): void;
    getInfo(cb: Callback<GetInfoResult>): void;
    onInfoUpdates2: Event<InfoUpdates2Event>;
    onNewEvents: Event<NewGameEvents>;
    onError: Event<GameEventError>;
  }

  interface Games {
    getRunningGameInfo(cb: (info: GameInfo | null) => void): void;
    onGameInfoUpdated: Event<GameInfoUpdatedEvent>;
    events: GameEvents;
  }

  // ---------- settings / hotkeys ----------
  interface Hotkey {
    name: string;
    title: string;
    binding: string;
  }

  interface HotkeysResult extends Result {
    globals: Hotkey[];
    games?: Record<string, Hotkey[]>;
  }

  interface HotkeyPressedEvent {
    name: string;
    state?: 'up' | 'down';
  }

  interface Settings {
    hotkeys: {
      get(cb: Callback<HotkeysResult>): void;
      onPressed: Event<HotkeyPressedEvent>;
    };
  }

  // ---------- extensions ----------
  interface AppLaunchTriggeredEvent {
    origin: string;
    parameter?: string;
  }

  interface Extensions {
    onAppLaunchTriggered: Event<AppLaunchTriggeredEvent>;
  }

  interface API {
    windows: Windows;
    games: Games;
    settings: Settings;
    extensions: Extensions;
  }
}

/** Present only inside the Overwolf client — always guard with `isOverwolf()`. */
declare const overwolf: Overwolf.API;
