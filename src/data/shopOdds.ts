/**
 * Shop roll odds (% chance per shop slot to roll a 1/2/3/4/5-cost) by player level.
 *
 * Source: game data — map22.bin `TFTSet18.DropRateTables.Shop` (table {1ee21754}) via
 * CommunityDragon, patch 16.23. Row index = level − 1. Every row sums to 100.
 * Set-specific modifiers (e.g. "PlusOneLevel" effects) are not applied here.
 */
export type CostOdds = readonly [number, number, number, number, number];

export const SHOP_ODDS_SET = 18;

const ODDS_BY_LEVEL: readonly CostOdds[] = [
  [100, 0, 0, 0, 0], // 1
  [100, 0, 0, 0, 0], // 2
  [75, 25, 0, 0, 0], // 3
  [55, 30, 15, 0, 0], // 4
  [45, 33, 20, 2, 0], // 5
  [30, 40, 25, 5, 0], // 6
  [19, 30, 40, 10, 1], // 7
  [15, 20, 32, 30, 3], // 8
  [10, 17, 25, 33, 15], // 9
  [5, 10, 20, 40, 25], // 10
  [1, 2, 12, 50, 35], // 11
];

export const MAX_LEVEL = ODDS_BY_LEVEL.length;

/** Odds for a level (clamped to 1…MAX_LEVEL). */
export const shopOdds = (level: number): CostOdds =>
  ODDS_BY_LEVEL[Math.min(MAX_LEVEL, Math.max(1, Math.round(level))) - 1];
