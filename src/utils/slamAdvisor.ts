/**
 * "Recommended slam": which BiS item to craft (or equip) right now, and on whom.
 *
 * Priority: Main Carry → Main Tank → Duo Carry → Utility, in each set's listed order.
 * Components are consumed as items are assigned, so two suggestions never share a component.
 *
 * Who gets the item now:
 *  - the final target, if it is already on board/bench, or the player is in the late phase (Lvl 8+);
 *  - otherwise (Lvl 3–7, target not owned):
 *      carry / duo items  → the phase's designated item_holder (mid falls back to the early holder);
 *      tank / utility     → an owned frontline unit of the phase as a stand-in
 *                           (a ranged item holder would waste defensive items);
 *      nobody suitable    → keep it on the bench until the target shows up.
 */
import { isComponent, lookupRecipe } from '../data/itemRecipes';
import { ITEM_ROLE_ORDER, type Comp, type ItemRole, type Phase } from '../types/comps';
import type { TftGameState } from '../types/tft';
import { phaseForLevel, playerUnits } from './compMatcher';

export type EquipReason = 'target-owned' | 'late' | 'holder' | 'stand-in' | 'hold';

export interface SlamSuggestion {
  /** craft = combine two components now · equip = completed item already on the bench */
  kind: 'craft' | 'equip';
  item: string;
  components?: [string, string];
  role: ItemRole;
  /** Final champion this BiS item belongs to. */
  target: string;
  /** Champion to put it on right now. */
  equipOn: string;
  reason: EquipReason;
}

export interface NextNeed {
  item: string;
  role: ItemRole;
  target: string;
  have: string;
  need: string;
}

export interface SlamPlan {
  phase: Phase;
  suggestions: SlamSuggestion[];
  /** BiS item → the champion/role it belongs to (first in priority order). */
  itemTargets: Map<string, { unit: string; role: ItemRole }>;
  /** When nothing is craftable: the closest BiS item (one component owned). */
  nextNeed?: NextNeed;
}

const takeFrom = (bag: Map<string, number>, id: string): boolean => {
  const n = bag.get(id) ?? 0;
  if (n <= 0) return false;
  bag.set(id, n - 1);
  return true;
};

export function holderForPhase(comp: Comp, phase: Phase): string | undefined {
  if (phase === 'late') return undefined;
  return comp.phases[phase].item_holder?.unit ?? (phase === 'mid' ? comp.phases.early.item_holder?.unit : undefined);
}

export function slamPlan(comp: Comp | undefined, state: TftGameState): SlamPlan {
  const phase = phaseForLevel(state.level);
  const itemTargets = new Map<string, { unit: string; role: ItemRole }>();
  if (!comp) return { phase, suggestions: [], itemTargets };

  const sets = [...comp.core_items].sort((a, b) => ITEM_ROLE_ORDER.indexOf(a.role) - ITEM_ROLE_ORDER.indexOf(b.role));
  for (const s of sets) for (const ci of s.items) if (!itemTargets.has(ci.item)) itemTargets.set(ci.item, { unit: s.unit, role: s.role });

  const owned = playerUnits(state);
  const components = new Map<string, number>();
  const benchBuilt = new Map<string, number>();
  for (const id of state.items) {
    const bag = isComponent(id) ? components : benchBuilt;
    bag.set(id, (bag.get(id) ?? 0) + 1);
  }
  // Items already equipped on units count as done.
  const equipped = new Map<string, number>();
  for (const u of [...state.board, ...state.bench]) for (const id of u.items) equipped.set(id, (equipped.get(id) ?? 0) + 1);

  const phaseUnits = comp.phases[phase].units;
  const front = new Set(comp.phases[phase].frontline ?? []);
  const holder = holderForPhase(comp, phase);

  const equipTarget = (target: string, role: ItemRole): { equipOn: string; reason: EquipReason } => {
    if (owned.has(target)) return { equipOn: target, reason: 'target-owned' };
    if (phase === 'late') return { equipOn: target, reason: 'late' };
    if (role === 'carry' || role === 'secondary') {
      if (holder && holder !== target) return { equipOn: holder, reason: 'holder' };
      return { equipOn: target, reason: 'hold' };
    }
    // Defensive items: best owned frontliner of this phase (highest star), else any owned frontliner.
    const standIn =
      [...owned.entries()]
        .filter(([id]) => front.has(id) && phaseUnits.includes(id))
        .sort((a, b) => b[1] - a[1])[0]?.[0] ??
      [...owned.entries()].filter(([id]) => front.has(id)).sort((a, b) => b[1] - a[1])[0]?.[0];
    return standIn ? { equipOn: standIn, reason: 'stand-in' } : { equipOn: target, reason: 'hold' };
  };

  const suggestions: SlamSuggestion[] = [];
  for (const s of sets) {
    for (const ci of s.items) {
      if (takeFrom(equipped, ci.item)) continue; // already built & equipped
      if (takeFrom(benchBuilt, ci.item)) {
        suggestions.push({ kind: 'equip', item: ci.item, role: s.role, target: s.unit, ...equipTarget(s.unit, s.role) });
        continue;
      }
      const [a, b] = ci.components;
      const canCraft = a === b ? (components.get(a) ?? 0) >= 2 : (components.get(a) ?? 0) >= 1 && (components.get(b) ?? 0) >= 1;
      if (!canCraft || !lookupRecipe(a, b)) continue;
      takeFrom(components, a);
      takeFrom(components, b);
      suggestions.push({ kind: 'craft', item: ci.item, components: [a, b], role: s.role, target: s.unit, ...equipTarget(s.unit, s.role) });
    }
  }
  // Ready-made items first (free value), then crafts — each group already in role priority.
  suggestions.sort((x, y) => Number(x.kind === 'craft') - Number(y.kind === 'craft'));

  let nextNeed: NextNeed | undefined;
  if (!suggestions.length) {
    outer: for (const s of sets)
      for (const ci of s.items) {
        const [a, b] = ci.components;
        if ((components.get(a) ?? 0) > 0 && a !== b) {
          nextNeed = { item: ci.item, role: s.role, target: s.unit, have: a, need: b };
          break outer;
        }
        if ((components.get(b) ?? 0) > 0 && a !== b) {
          nextNeed = { item: ci.item, role: s.role, target: s.unit, have: b, need: a };
          break outer;
        }
      }
  }

  return { phase, suggestions, itemTargets, nextNeed };
}
