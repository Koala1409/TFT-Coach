/**
 * Comp recommendation & scouting engine.
 *
 *   matchScore = 60% Item Fit + 40% Unit Fit   (0–100)
 *
 * Item Fit — how useful the player's items are for the comp's core items:
 *   Each completed core item already built counts as both its components.
 *   Loose components are matched (multiset) against the components still needed.
 *   fit = 0.7 · precision (matched / owned) + 0.3 · coverage (matched / all core components)
 *
 * Unit Fit — owned units (board + bench) that appear in the comp's early/mid boards or are its carry/tank.
 *   Star-weighted (1★ = 1, 2★ = 1.5, 3★ = 2).
 *   fit = 0.6 · precision (weight in comp / owned weight) + 0.4 · coverage (vs. current phase board size)
 *
 * With nothing owned in a category the fit is neutral (0.5) so it doesn't skew the ranking.
 * Lobby contest = number of opponents holding the comp's main carry on board or bench.
 *
 * Pure functions only — no stats from external sources (Riot third-party policy).
 */
import { isComponent } from '../data/itemRecipes';
import { getCompDb } from '../services/metaService';
import type { Comp, CoreItem, Phase } from '../types/comps';
import type { StarLevel, TftGameState, TftUnit } from '../types/tft';

/** Current comp list: remote meta if loaded, else cache, else bundled (see metaService). */
export const getComps = (): readonly Comp[] => getCompDb().comps;

export const ITEM_WEIGHT = 0.6;
export const UNIT_WEIGHT = 0.4;
const NEUTRAL_FIT = 0.5;
const STAR_WEIGHT: Record<StarLevel, number> = { 1: 1, 2: 1.5, 3: 2 };

export const phaseForLevel = (level: number): Phase => (level <= 5 ? 'early' : level <= 7 ? 'mid' : 'late');

export interface ContestInfo {
  count: number;
  opponents: string[];
}

export interface CompMatch {
  comp: Comp;
  /** 0–100 */
  matchScore: number;
  /** 0–1 */
  itemFit: number;
  /** 0–1 */
  unitFit: number;
  /** Core completed items the player already has built. */
  completedOwned: string[];
  /** Loose components that go toward this comp's core items. */
  ownedComponents: string[];
  /** Components still needed to finish every remaining core item. */
  missingComponents: string[];
  /** Loose components the player holds in total (for "uses X/Y components"). */
  playerComponentCount: number;
  /** Owned units that belong to the comp, with their star level. */
  ownedUnits: { id: string; star: StarLevel }[];
  contest: ContestInfo;
}

// ---------- helpers ----------

const countMap = (ids: readonly string[]) => {
  const m = new Map<string, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
};

/** Every item the player holds: item bench + items equipped on units. */
export const playerItems = (s: TftGameState): string[] => [
  ...s.items,
  ...s.board.flatMap((u) => u.items),
  ...s.bench.flatMap((u) => u.items),
];

/** Distinct owned units with their highest star level. */
export const playerUnits = (s: TftGameState): Map<string, StarLevel> => {
  const m = new Map<string, StarLevel>();
  for (const u of [...s.board, ...s.bench]) m.set(u.id, Math.max(m.get(u.id) ?? 1, u.star) as StarLevel);
  return m;
};

const coreItems = (comp: Comp): CoreItem[] => comp.core_items.flatMap((s) => s.items);

// ---------- scoring ----------

export function scoreItems(comp: Comp, items: readonly string[]) {
  const remaining = [...coreItems(comp)];
  const totalComponents = remaining.length * 2;

  const completedOwned: string[] = [];
  let ownedWeight = 0;
  for (const id of items) {
    if (isComponent(id)) {
      ownedWeight += 1;
      continue;
    }
    ownedWeight += 2; // completed item = two components' worth
    const idx = remaining.findIndex((ci) => ci.item === id);
    if (idx >= 0) {
      completedOwned.push(id);
      remaining.splice(idx, 1);
    }
  }

  const needed = countMap(remaining.flatMap((ci) => ci.components));
  const ownedComponents: string[] = [];
  for (const id of items) {
    const n = needed.get(id) ?? 0;
    if (isComponent(id) && n > 0) {
      ownedComponents.push(id);
      needed.set(id, n - 1);
    }
  }
  const missingComponents = [...needed].flatMap(([id, n]) => Array<string>(n).fill(id));

  const matched = completedOwned.length * 2 + ownedComponents.length;
  const fit =
    ownedWeight === 0 ? NEUTRAL_FIT : 0.7 * (matched / ownedWeight) + 0.3 * (matched / Math.max(totalComponents, 1));

  const playerComponentCount = items.filter(isComponent).length;
  return { fit, completedOwned, ownedComponents, missingComponents, playerComponentCount };
}

export function scoreUnits(comp: Comp, owned: Map<string, StarLevel>, level: number) {
  const pool = new Set([...comp.phases.early.units, ...comp.phases.mid.units, comp.carry, comp.tank]);
  const ownedUnits: { id: string; star: StarLevel }[] = [];
  let ownedWeight = 0;
  let hitWeight = 0;
  for (const [id, star] of owned) {
    ownedWeight += STAR_WEIGHT[star];
    if (pool.has(id)) {
      hitWeight += STAR_WEIGHT[star];
      ownedUnits.push({ id, star });
    }
  }
  if (ownedWeight === 0) return { fit: NEUTRAL_FIT, ownedUnits };

  const target = comp.phases[phaseForLevel(level)].units.length;
  const fit = 0.6 * (hitWeight / ownedWeight) + 0.4 * Math.min(1, hitWeight / Math.max(target, 1));
  return { fit, ownedUnits };
}

export function lobbyContest(comp: Comp, state: TftGameState): ContestInfo {
  const has = (units: TftUnit[]) => units.some((u) => u.id === comp.carry);
  const opponents = state.opponents.filter((o) => has(o.board) || has(o.bench)).map((o) => o.name);
  return { count: opponents.length, opponents };
}

export function matchComp(comp: Comp, state: TftGameState): CompMatch {
  const items = scoreItems(comp, playerItems(state));
  const units = scoreUnits(comp, playerUnits(state), state.level);
  const score = ITEM_WEIGHT * items.fit + UNIT_WEIGHT * units.fit;
  return {
    comp,
    matchScore: Math.round(Math.min(1, Math.max(0, score)) * 100),
    itemFit: items.fit,
    unitFit: units.fit,
    completedOwned: items.completedOwned,
    ownedComponents: items.ownedComponents,
    missingComponents: items.missingComponents,
    playerComponentCount: items.playerComponentCount,
    ownedUnits: units.ownedUnits,
    contest: lobbyContest(comp, state),
  };
}

/** Top N comps by matchScore (ties: fewer contesting players, then tier). */
export function recommendComps(state: TftGameState, limit = 4, comps: readonly Comp[] = getComps()): CompMatch[] {
  const tierRank = { S: 0, A: 1, B: 2 } as const;
  return comps
    .map((c) => matchComp(c, state))
    .sort(
      (a, b) =>
        b.matchScore - a.matchScore ||
        a.contest.count - b.contest.count ||
        tierRank[a.comp.tier] - tierRank[b.comp.tier],
    )
    .slice(0, limit);
}

export const getComp = (id: string | null | undefined): Comp | undefined => getComps().find((c) => c.id === id);
