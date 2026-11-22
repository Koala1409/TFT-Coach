import { HOTKEY_TOGGLE_DEFAULT, HOTKEY_TOGGLE_OVERLAY, TFT_GAME_CLASS_ID } from './constants';

/** True when running inside the Overwolf client (false in a plain browser / `npm run dev`). */
export const isOverwolf = (): boolean => typeof overwolf !== 'undefined';

export const isTftGame = (info: Overwolf.GameInfo | null | undefined): boolean =>
  !!info && info.isRunning && info.classId === TFT_GAME_CLASS_ID;

/** Promisified window helpers. All are no-ops outside Overwolf. */
export const ow = {
  async windowId(name: string): Promise<string | null> {
    if (!isOverwolf()) return null;
    return new Promise((resolve) =>
      overwolf.windows.obtainDeclaredWindow(name, (r) => resolve(r.success ? r.window.id : null)),
    );
  },

  async currentWindow(): Promise<Overwolf.WindowInfo | null> {
    if (!isOverwolf()) return null;
    return new Promise((resolve) =>
      overwolf.windows.getCurrentWindow((r) => resolve(r.success ? r.window : null)),
    );
  },

  async state(name: string): Promise<Overwolf.WindowStateEx> {
    if (!isOverwolf()) return 'closed';
    return new Promise((resolve) =>
      overwolf.windows.getWindowState(name, (r) => resolve(r.success ? r.window_state_ex : 'closed')),
    );
  },

  async isVisible(name: string): Promise<boolean> {
    const s = await this.state(name);
    return s === 'normal' || s === 'maximized';
  },

  async show(name: string): Promise<void> {
    const id = await this.windowId(name);
    if (id) await new Promise<void>((resolve) => overwolf.windows.restore(id, () => resolve()));
  },

  async hide(name: string): Promise<void> {
    const id = await this.windowId(name);
    if (id) await new Promise<void>((resolve) => overwolf.windows.hide(id, () => resolve()));
  },

  async close(name: string): Promise<void> {
    const id = await this.windowId(name);
    if (id) await new Promise<void>((resolve) => overwolf.windows.close(id, () => resolve()));
  },

  async toggle(name: string): Promise<void> {
    if (await this.isVisible(name)) await this.hide(name);
    else await this.show(name);
  },

  async runningGame(): Promise<Overwolf.GameInfo | null> {
    if (!isOverwolf()) return null;
    return new Promise((resolve) => overwolf.games.getRunningGameInfo((info) => resolve(info ?? null)));
  },

  /** Current user binding for the overlay toggle hotkey (users can rebind it in Overwolf settings). */
  async toggleHotkey(): Promise<string> {
    if (!isOverwolf()) return HOTKEY_TOGGLE_DEFAULT;
    return new Promise((resolve) =>
      overwolf.settings.hotkeys.get((r) => {
        const all = [...(r.globals ?? []), ...Object.values(r.games ?? {}).flat()];
        resolve(all.find((h) => h.name === HOTKEY_TOGGLE_OVERLAY)?.binding || HOTKEY_TOGGLE_DEFAULT);
      }),
    );
  },

  /** Start dragging the current window (call from onMouseDown on a drag handle). */
  async dragCurrent(): Promise<void> {
    const w = await this.currentWindow();
    if (w) overwolf.windows.dragMove(w.id);
  },
};
