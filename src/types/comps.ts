/** Schema of src/data/comps.json. All ids are Data Dragon ids. */

export type CompTier = 'S' | 'A' | 'B';
export type Phase = 'early' | 'mid' | 'late';

export interface CoreItem {
  /** Completed item id, e.g. "TFT_Item_JeweledGauntlet". */
  item: string;
  /** The two base components it is built from. */
  components: [string, string];
}

/**
 * Itemized roles, in slam priority order:
 *  carry     — MAIN CARRY, 3 BiS items
 *  tank      — MAIN TANK, 3 BiS items
 *  secondary — DUO / 2ND CARRY, 2–3 damage/flex items
 *  utility   — UTILITY / OFF-TANK, 2–3 utility items (anti-heal, shred, Sunfire, Evenshroud…)
 */
export type ItemRole = 'carry' | 'tank' | 'secondary' | 'utility';
export const ITEM_ROLE_ORDER: readonly ItemRole[] = ['carry', 'tank', 'secondary', 'utility'];
export const ITEM_ROLE_LABEL: Record<ItemRole, string> = {
  carry: 'Main carry',
  tank: 'Main tank',
  secondary: 'Duo carry',
  utility: 'Utility',
};

export interface CoreItemSet {
  unit: string;
  role: ItemRole;
  items: CoreItem[];
}

export interface ItemHolder {
  unit: string;
  /** Completed item ids to slam on this unit. */
  items: string[];
  note?: string;
}

export interface ItemTransfer {
  /** Unit to sell. */
  from: string;
  /** Unit that receives the items. */
  to: string;
  items: string[];
}

export interface SynergyBreakpoint {
  trait: string;
  count: number;
}

export interface PhaseGuide {
  /** Inclusive player level range this phase covers. */
  levels: [number, number];
  stage: string;
  /** Units to field / buy in this phase, most important first. */
  units: string[];
  /** Subset of `units` that stands in the front rows (melee, range ≤ 2). Everything else is backline. */
  frontline?: string[];
  item_holder?: ItemHolder;
  tip: string;
  /** Mid: when and how deep to roll. */
  rolldown?: string;
  /** Mid: econ guidance. */
  econ?: string;
  /** Late: who to sell and where the items go. */
  item_transfers?: ItemTransfer[];
  /** Late: target trait breakpoints. */
  synergies?: SynergyBreakpoint[];
}

export interface Comp {
  id: string;
  name: string;
  tier: CompTier;
  playstyle: string;
  /** Main carry — used for lobby contest detection. */
  carry: string;
  tank: string;
  core_items: CoreItemSet[];
  phases: Record<Phase, PhaseGuide>;
}

export interface CompDatabase {
  schemaVersion: number;
  set: number;
  patch: string;
  /** ISO timestamp, set by scripts/fetch-riot-meta.mjs. */
  generatedAt?: string;
  /** Note when the generated file was hand-edited afterwards. */
  reviewed?: string;
  /** Provenance, set by scripts/fetch-riot-meta.mjs. */
  source?: { api: string; platform: string; matches: number; boards: number };
  /** Tiers are hand-curated editorial labels — never derived from win-rate/placement data. */
  comps: Comp[];
}
