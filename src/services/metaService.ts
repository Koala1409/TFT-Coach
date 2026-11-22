/**
 * Meta comp loader: remote comps.json → 6 h localStorage cache → bundled fallback.
 *
 * - Remote URL: `VITE_META_URL` (build-time, e.g. a GitHub Raw URL) or a runtime override in
 *   localStorage `tft.metaUrl`. The URL is baked in, the *content* is fetched at runtime — so
 *   pushing a new comps.json updates every install without rebuilding the Overwolf package.
 * - Cached data is available synchronously at startup (overlay renders instantly).
 * - Offline / unconfigured / invalid payload → last good cache, else the bundled src/data/comps.json.
 */
import bundled from '../data/comps.json';
import type { Comp, CompDatabase } from '../types/comps';

const CACHE_KEY = 'tft.meta.v1';
const URL_OVERRIDE_KEY = 'tft.metaUrl';
export const META_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const SUPPORTED_SCHEMA = 1;

export type MetaSource = 'remote' | 'cache' | 'bundled';

export interface MetaState {
  db: CompDatabase;
  source: MetaSource;
  /** When the remote copy was fetched (remote/cache), undefined for bundled. */
  fetchedAt?: number;
  url?: string;
}

interface CachedMeta {
  db: CompDatabase;
  fetchedAt: number;
  url: string;
}

const BUNDLED = bundled as CompDatabase;

// ---------- validation ----------

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

function isComp(c: unknown): c is Comp {
  const x = c as Partial<Comp> | null;
  if (!x || !isStr(x.id) || !isStr(x.name) || !isStr(x.carry) || !isStr(x.tank)) return false;
  if (!['S', 'A', 'B'].includes(x.tier as string) || !isStr(x.playstyle)) return false;
  if (!Array.isArray(x.core_items)) return false;
  return (['early', 'mid', 'late'] as const).every((p) => {
    const g = x.phases?.[p];
    return !!g && isStrArr(g.units) && Array.isArray(g.levels) && isStr(g.tip);
  });
}

/** Structural check so a broken remote file can never crash the overlay. */
export function isCompDatabase(v: unknown): v is CompDatabase {
  const db = v as Partial<CompDatabase> | null;
  return !!db && db.schemaVersion === SUPPORTED_SCHEMA && Array.isArray(db.comps) && db.comps.length > 0 && db.comps.every(isComp);
}

// ---------- config & cache ----------

export function getMetaUrl(): string | undefined {
  try {
    const override = localStorage.getItem(URL_OVERRIDE_KEY);
    if (override) return override;
  } catch {
    /* ignore */
  }
  const env = import.meta.env.VITE_META_URL?.trim();
  return env || undefined;
}

function readCache(): CachedMeta | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const c = raw ? (JSON.parse(raw) as CachedMeta) : null;
    return c && isCompDatabase(c.db) ? c : null;
  } catch {
    return null;
  }
}

function writeCache(c: CachedMeta): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch (e) {
    console.warn('[meta] cache write failed', e);
  }
}

// ---------- store ----------

function initialState(): MetaState {
  const cached = readCache();
  // Only trust a cache that came from the URL currently configured.
  if (cached && cached.url === getMetaUrl()) return { db: cached.db, source: 'cache', fetchedAt: cached.fetchedAt, url: cached.url };
  return { db: BUNDLED, source: 'bundled' };
}

let state: MetaState = initialState();
const listeners = new Set<() => void>();

function setState(next: MetaState): void {
  state = next;
  listeners.forEach((l) => l());
}

export const metaStore = {
  get: (): MetaState => state,
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export const getCompDb = (): CompDatabase => state.db;

// ---------- refresh ----------

let inflight: Promise<MetaState> | null = null;

/**
 * Refresh from the remote URL if configured and the cache is older than 6 h (or `force`).
 * Never rejects; on any failure the current state (cache or bundled) is kept.
 */
export function initMeta(force = false): Promise<MetaState> {
  inflight ??= refresh(force).finally(() => (inflight = null));
  return inflight;
}

async function refresh(force: boolean): Promise<MetaState> {
  const url = getMetaUrl();
  if (!url) return state; // unconfigured → bundled
  const fresh = state.source !== 'bundled' && state.url === url && state.fetchedAt && Date.now() - state.fetchedAt < META_TTL_MS;
  if (fresh && !force) return state;

  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const db: unknown = await res.json();
    if (!isCompDatabase(db)) throw new Error('payload does not match the comps.json schema');
    const fetchedAt = Date.now();
    writeCache({ db, fetchedAt, url });
    setState({ db, source: 'remote', fetchedAt, url });
    console.log(`[meta] loaded ${db.comps.length} comps from ${url}`);
  } catch (e) {
    console.warn(`[meta] remote fetch failed (${String(e)}), using ${state.source}`);
  }
  return state;
}
