/** Normalized TFT game state shared by the GEP service (live) and the mock provider. */

export type StarLevel = 1 | 2 | 3;

export interface TftUnit {
  /** Champion id (Data Dragon id, or a GEP id resolvable via ddragonService.getChampion). */
  id: string;
  star: StarLevel;
  /** Completed items / components equipped on the unit (canonical item ids). */
  items: string[];
}

export interface TftOpponent {
  name: string;
  level: number;
  hp: number;
  board: TftUnit[];
  bench: TftUnit[];
}

export interface TftGameState {
  source: 'live' | 'mock';
  /** From GEP match_info.game_mode. TFT and League share game id 5426. */
  gameMode?: 'TFT' | 'LOL';
  /** True between match_start and match_end / local player elimination. */
  inMatch: boolean;
  level: number;
  gold: number;
  hp: number;
  /** "<stage>-<round>", e.g. "3-2". */
  stage: string;
  board: TftUnit[];
  bench: TftUnit[];
  /** Unequipped items on the item bench (components and completed items, canonical ids). */
  items: string[];
  /** Champion ids currently in the shop (empty slot = sold). */
  shop: string[];
  opponents: TftOpponent[];
  updatedAt: number;
}
