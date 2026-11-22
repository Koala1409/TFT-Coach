/** Overwolf game class id for League of Legends (TFT runs inside the LoL client). */
export const TFT_GAME_CLASS_ID = 5426;

/** Window names — must match the keys of `data.windows` in public/manifest.json. */
export const WINDOWS = {
  background: 'background',
  desktop: 'desktop',
  inGame: 'in_game',
  overlayPreview: 'overlay_preview',
} as const;

export type WindowName = (typeof WINDOWS)[keyof typeof WINDOWS];

/** Hotkey name — must match `data.hotkeys` in public/manifest.json. */
export const HOTKEY_TOGGLE_OVERLAY = 'toggle_overlay';
export const HOTKEY_TOGGLE_DEFAULT = 'Alt+X';
