/**
 * TFT component → completed item recipes.
 *
 * Data Dragon's tft-item.json only ships id/name/image — it has NO recipe data —
 * so the matrix is maintained here using Data Dragon item ids. At runtime the
 * ddragon service drops any recipe whose result id is missing from the live patch.
 * Last verified against patch 16.23.1.
 */

export const COMPONENTS = [
  { id: 'TFT_Item_BFSword', short: 'BF' },
  { id: 'TFT_Item_RecurveBow', short: 'Bow' },
  { id: 'TFT_Item_NeedlesslyLargeRod', short: 'Rod' },
  { id: 'TFT_Item_TearOfTheGoddess', short: 'Tear' },
  { id: 'TFT_Item_ChainVest', short: 'Vest' },
  { id: 'TFT_Item_NegatronCloak', short: 'Cloak' },
  { id: 'TFT_Item_GiantsBelt', short: 'Belt' },
  { id: 'TFT_Item_SparringGloves', short: 'Gloves' },
] as const;

export type ComponentId = (typeof COMPONENTS)[number]['id'];

/** Also components, but their combos are set-specific (emblems) so they have no fixed recipes here. */
export const SPECIAL_COMPONENT_IDS = ['TFT_Item_Spatula', 'TFT_Item_FryingPan'] as const;

const [BF, BOW, ROD, TEAR, VEST, CLOAK, BELT, GLOVES] = COMPONENTS.map((c) => c.id);

/** [componentA, componentB, completedItemId] */
const RECIPE_TABLE: ReadonlyArray<readonly [string, string, string]> = [
  [BF, BF, 'TFT_Item_Deathblade'],
  [BF, BOW, 'TFT_Item_MadredsBloodrazor'], // Giant Slayer
  [BF, ROD, 'TFT_Item_HextechGunblade'],
  [BF, TEAR, 'TFT_Item_SpearOfShojin'],
  [BF, VEST, 'TFT_Item_GuardianAngel'], // Edge of Night
  [BF, CLOAK, 'TFT_Item_Bloodthirster'],
  [BF, BELT, 'TFT_Item_SteraksGage'],
  [BF, GLOVES, 'TFT_Item_InfinityEdge'],
  [BOW, BOW, 'TFT_Item_RapidFireCannon'], // Red Buff
  [BOW, ROD, 'TFT_Item_GuinsoosRageblade'],
  [BOW, TEAR, 'TFT_Item_StatikkShiv'], // Void Staff
  [BOW, VEST, 'TFT_Item_TitansResolve'],
  [BOW, CLOAK, 'TFT_Item_RunaansHurricane'], // Kraken's Fury
  [BOW, BELT, 'TFT_Item_Leviathan'], // Nashor's Tooth
  [BOW, GLOVES, 'TFT_Item_LastWhisper'],
  [ROD, ROD, 'TFT_Item_RabadonsDeathcap'],
  [ROD, TEAR, 'TFT_Item_ArchangelsStaff'],
  [ROD, VEST, 'TFT_Item_Crownguard'],
  [ROD, CLOAK, 'TFT_Item_IonicSpark'],
  [ROD, BELT, 'TFT_Item_Morellonomicon'],
  [ROD, GLOVES, 'TFT_Item_JeweledGauntlet'],
  [TEAR, TEAR, 'TFT_Item_BlueBuff'],
  [TEAR, VEST, 'TFT_Item_FrozenHeart'], // Protector's Vow
  [TEAR, CLOAK, 'TFT_Item_AdaptiveHelm'],
  [TEAR, BELT, 'TFT_Item_Redemption'], // Spirit Visage
  [TEAR, GLOVES, 'TFT_Item_UnstableConcoction'], // Hand of Justice
  [VEST, VEST, 'TFT_Item_BrambleVest'],
  [VEST, CLOAK, 'TFT_Item_GargoyleStoneplate'],
  [VEST, BELT, 'TFT_Item_RedBuff'], // Sunfire Cape
  [VEST, GLOVES, 'TFT_Item_NightHarvester'], // Steadfast Heart
  [CLOAK, CLOAK, 'TFT_Item_DragonsClaw'],
  [CLOAK, BELT, 'TFT_Item_SpectralGauntlet'], // Evenshroud
  [CLOAK, GLOVES, 'TFT_Item_Quicksilver'],
  [BELT, BELT, 'TFT_Item_WarmogsArmor'],
  [BELT, GLOVES, 'TFT_Item_PowerGauntlet'], // Striker's Flail
  [GLOVES, GLOVES, 'TFT_Item_ThiefsGloves'],
];

/** Every item id this table knows (components, specials, completed results) — the canonical id space. */
export const CANONICAL_ITEM_IDS: readonly string[] = [
  ...new Set([...COMPONENTS.map((c) => c.id), ...SPECIAL_COMPONENT_IDS, ...RECIPE_TABLE.map(([, , r]) => r)]),
];

export interface Recipe {
  a: string;
  b: string;
  result: string;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}+${b}` : `${b}+${a}`);

const RECIPES_BY_PAIR = new Map<string, Recipe>(
  RECIPE_TABLE.map(([a, b, result]) => [pairKey(a, b), { a, b, result }]),
);

const COMPONENT_SET = new Set<string>([...COMPONENTS.map((c) => c.id), ...SPECIAL_COMPONENT_IDS]);

export const isComponent = (itemId: string): boolean => COMPONENT_SET.has(itemId);

export const componentShortName = (itemId: string): string =>
  COMPONENTS.find((c) => c.id === itemId)?.short ?? itemId.replace(/^TFT_Item_/, '');

/** Order-independent recipe lookup on the static table (no patch validation). */
export const lookupRecipe = (a: string, b: string): Recipe | undefined => RECIPES_BY_PAIR.get(pairKey(a, b));

const RECIPES_BY_RESULT = new Map<string, Recipe>(RECIPE_TABLE.map(([a, b, result]) => [result, { a, b, result }]));

/** Components of a completed item, if it is a standard recipe. */
export const lookupRecipeByResult = (itemId: string): Recipe | undefined => RECIPES_BY_RESULT.get(itemId);

/** All recipes that use the given component (each pair once). */
export const recipesUsing = (componentId: string): Recipe[] =>
  RECIPE_TABLE.filter(([a, b]) => a === componentId || b === componentId).map(([a, b, result]) => ({
    a,
    b,
    result,
  }));

/** Every distinct completed item buildable right now from an inventory (respects duplicate counts). */
export const craftableFrom = (inventory: readonly string[]): Recipe[] => {
  const counts = new Map<string, number>();
  for (const id of inventory) counts.set(id, (counts.get(id) ?? 0) + 1);
  return RECIPE_TABLE.filter(([a, b]) =>
    a === b ? (counts.get(a) ?? 0) >= 2 : counts.has(a) && counts.has(b),
  ).map(([a, b, result]) => ({ a, b, result }));
};
