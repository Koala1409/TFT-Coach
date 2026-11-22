/**
 * Riot Data Dragon client for TFT static data (champions, items, traits).
 *
 * - Resolves the latest live patch from versions.json.
 * - Fetches tft-champion / tft-item / tft-trait JSON, slims it down and caches it in
 *   localStorage keyed by patch version (`tft.ddragon:<version>`). All Overwolf windows
 *   share one origin, so the background window warms the cache for the overlay.
 * - Cached data is available synchronously at import time; the network is only hit
 *   when there is no cache, or at most every few hours to check for a new patch.
 */
import { CANONICAL_ITEM_IDS, lookupRecipe } from '../data/itemRecipes';

const DDRAGON = 'https://ddragon.leagueoflegends.com';
const LOCALE = 'en_US';
const CACHE_PREFIX = 'tft.ddragon:';
const META_KEY = `${CACHE_PREFIX}meta`;
const SCHEMA = 1;
const VERSION_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

// ---------- types ----------

export interface DdSprite {
  sheet: string; // sprite sheet file, e.g. "tft-champion11.png"
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DdEntry {
  id: string;
  name: string;
  /** Individual image file name (img/<group>/<full>). */
  full: string;
  sprite: DdSprite;
}

export interface DdChampion extends DdEntry {
  cost: number;
  /** TFT set number parsed from the Data Dragon key (0 = tutorial/unknown). */
  set: number;
}

export interface DdragonData {
  schema: number;
  version: string;
  /** Highest set number present in the champion data (the live set). */
  currentSet: number;
  champions: Record<string, DdChampion>;
  items: Record<string, DdEntry>;
  traits: Record<string, DdEntry>;
}

interface RawImage {
  full: string;
  sprite: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface RawEntry {
  id: string;
  name: string;
  cost?: number;
  image: RawImage;
}
interface RawFile {
  data: Record<string, RawEntry>;
}
interface CacheMeta {
  version: string;
  checkedAt: number;
}

// ---------- storage (all access guarded: storage can be unavailable) ----------

const storage = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('[ddragon] cache write failed', e);
    }
  },
  /** Drop cached patches other than `keepVersion`. */
  prune(keepVersion: string): void {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(CACHE_PREFIX) && k !== META_KEY && k !== CACHE_PREFIX + keepVersion) {
          localStorage.removeItem(k);
        }
      }
    } catch {
      /* ignore */
    }
  },
};

function readCache(): DdragonData | null {
  const meta = storage.get<CacheMeta>(META_KEY);
  if (!meta) return null;
  const cached = storage.get<DdragonData>(CACHE_PREFIX + meta.version);
  return cached?.schema === SCHEMA ? cached : null;
}

// ---------- reactive store ----------

let data: DdragonData | null = readCache();
let championAliases = buildChampionAliases(data);
let itemCanon = buildItemCanon(data);
const listeners = new Set<() => void>();

function setData(next: DdragonData): void {
  data = next;
  championAliases = buildChampionAliases(next);
  itemCanon = buildItemCanon(next);
  listeners.forEach((l) => l());
}

export const ddragonStore = {
  get: (): DdragonData | null => data,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

// ---------- fetching ----------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return (await res.json()) as T;
}

export async function fetchLatestVersion(): Promise<string> {
  const versions = await fetchJson<string[]>(`${DDRAGON}/api/versions.json`);
  if (!versions[0]) throw new Error('versions.json is empty');
  return versions[0];
}

const slim = (e: RawEntry): DdEntry => ({
  id: e.id,
  name: e.name,
  full: e.image.full,
  sprite: { sheet: e.image.sprite, x: e.image.x, y: e.image.y, w: e.image.w, h: e.image.h },
});

const index = (file: RawFile): Record<string, DdEntry> =>
  Object.fromEntries(Object.values(file.data).map((e) => [e.id, slim(e)]));

async function fetchPatch(version: string): Promise<DdragonData> {
  const base = `${DDRAGON}/cdn/${version}/data/${LOCALE}`;
  const [champs, items, traits] = await Promise.all([
    fetchJson<RawFile>(`${base}/tft-champion.json`),
    fetchJson<RawFile>(`${base}/tft-item.json`),
    fetchJson<RawFile>(`${base}/tft-trait.json`),
  ]);

  // Champion keys look like "Maps/Shipping/Map22/Sets/TFTSet18/Shop/<id>" — the set lives in the key.
  const champions: Record<string, DdChampion> = {};
  let currentSet = 0;
  for (const [key, e] of Object.entries(champs.data)) {
    const set = Number(/TFTSet(\d+)/.exec(key)?.[1] ?? 0);
    currentSet = Math.max(currentSet, set);
    champions[e.id] = { ...slim(e), cost: e.cost ?? 0, set };
  }

  return { schema: SCHEMA, version, currentSet, champions, items: index(items), traits: index(traits) };
}

let initPromise: Promise<DdragonData | null> | null = null;

/**
 * Load Data Dragon data (idempotent). Resolves immediately from cache when it is
 * fresh; otherwise checks for a new patch. Never rejects — falls back to cache/null.
 */
export function initDdragon(): Promise<DdragonData | null> {
  initPromise ??= refresh().catch((e: unknown) => {
    console.warn('[ddragon] refresh failed, using cache:', e);
    initPromise = null; // allow a retry later
    return data;
  });
  return initPromise;
}

async function refresh(): Promise<DdragonData> {
  const meta = storage.get<CacheMeta>(META_KEY);
  if (data && meta && Date.now() - meta.checkedAt < VERSION_CHECK_INTERVAL_MS) return data;

  const version = await fetchLatestVersion();
  if (data?.version !== version) {
    const fresh = await fetchPatch(version);
    storage.set(CACHE_PREFIX + version, fresh);
    storage.prune(version);
    setData(fresh);
  }
  storage.set(META_KEY, { version, checkedAt: Date.now() } satisfies CacheMeta);
  return data!;
}

// ---------- lookup ----------

// Function declarations (hoisted): used at module init when a cache exists.
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** "TFT18_Xayah" / "DA_18_Xayah" / "TFTTutorial_Xayah" → "Xayah" */
function stripSetPrefix(id: string): string {
  return id.replace(/^(?:TFT\d*|DA)_(?:\d+_)?|^TFTTutorial_/i, '');
}

/** Alias → champion. Built oldest set first so the live set wins on name collisions. */
function buildChampionAliases(d: DdragonData | null): Map<string, DdChampion> {
  const map = new Map<string, DdChampion>();
  if (!d) return map;
  const ordered = Object.values(d.champions).sort((a, b) => a.set - b.set);
  for (const c of ordered) {
    map.set(norm(c.id), c);
    map.set(norm(c.name), c);
    map.set(norm(stripSetPrefix(c.id)), c);
  }
  return map;
}

const CANONICAL_SET = new Set(CANONICAL_ITEM_IDS);

/** Normalized display name → canonical (generic TFT_Item_*) id. */
function buildItemCanon(d: DdragonData | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!d) return map;
  for (const id of CANONICAL_ITEM_IDS) {
    const name = d.items[id]?.name;
    if (name) map.set(norm(name), id);
  }
  return map;
}

/**
 * Map a set-specific item id to the generic id used by the recipe table and comps.json.
 * The game reports Set 18 items as e.g. "DA_Component_TearOfTheGoddess" / "DA_RedBuff", while
 * recipes use "TFT_Item_TearOfTheGoddess" / "TFT_Item_RapidFireCannon". Ids can't be matched
 * textually (TFT_Item_RedBuff is Sunfire Cape!), so we match on the Data Dragon display name.
 * Unknown items (radiants, artifacts, emblems…) are returned unchanged.
 */
export function canonicalItemId(id: string): string {
  if (CANONICAL_SET.has(id)) return id;
  const name = data?.items[id]?.name;
  const byName = name ? itemCanon.get(norm(name)) : undefined;
  if (byName) return byName;
  // Offline fallback (no Data Dragon yet): components follow a stable naming scheme.
  const component = /^\w+?_Component_(\w+)$/.exec(id)?.[1];
  return component && CANONICAL_SET.has(`TFT_Item_${component}`) ? `TFT_Item_${component}` : id;
}

/** Accepts a Data Dragon id, a GEP character id (e.g. "TFT18_Xayah") or a display name. */
export function getChampion(idOrName: string): DdChampion | undefined {
  if (!data) return undefined;
  return (
    data.champions[idOrName] ??
    championAliases.get(norm(idOrName)) ??
    championAliases.get(norm(stripSetPrefix(idOrName)))
  );
}

export const getItem = (itemId: string): DdEntry | undefined => data?.items[itemId];
export const getTrait = (traitId: string): DdEntry | undefined => data?.traits[traitId];

const imgUrl = (group: string, file: string) => `${DDRAGON}/cdn/${data!.version}/img/${group}/${file}`;

export const getSpriteUrl = (sheet: string): string | undefined =>
  data ? `${DDRAGON}/cdn/${data.version}/img/sprite/${sheet}` : undefined;

/**
 * Full-size champion art (≈1024×512 splash, ~450 KB). For small portraits prefer
 * `getChampion(id).sprite` + `getSpriteUrl()` — one ~13 KB sheet covers many champions.
 */
export function getChampionIconUrl(championId: string): string | undefined {
  const c = getChampion(championId);
  return c && imgUrl('tft-champion', c.full);
}

export function getItemIconUrl(itemId: string): string | undefined {
  const i = getItem(itemId);
  return i && imgUrl('tft-item', i.full);
}

export function getTraitIconUrl(traitId: string): string | undefined {
  const t = getTrait(traitId);
  return t && imgUrl('tft-trait', t.full);
}

/**
 * Id of the completed item built from two components (order-independent), or undefined.
 * Once data is loaded, recipes whose result no longer exists on the live patch are rejected.
 * Use `getItem(id)` / `getItemIconUrl(id)` for its name and icon.
 */
export function getItemRecipe(componentA: string, componentB: string): string | undefined {
  const result = lookupRecipe(componentA, componentB)?.result;
  return result && (!data || result in data.items) ? result : undefined;
}
