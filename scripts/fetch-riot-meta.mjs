#!/usr/bin/env node
/**
 * Generate src/data/comps.json from Riot's official TFT Match API.
 *
 *   npm run fetch-meta                       # EUW, defaults below
 *   npm run fetch-meta -- --players=60 --days=5
 *   npm run fetch-meta -- --offline          # re-cluster cached matches only, no API calls
 *   npm run fetch-meta -- --dry-run          # print the result, don't write the file
 *
 * Pipeline
 *   1. Challenger + Grandmaster ladder (tft-league-v1) → top N players by LP.
 *   2. Their recent ranked match ids (tft-match-v1) → match details (cached in .cache/riot-matches/).
 *   3. Top-4 final boards only → cluster by (main carry, primary trait) → top K most-played clusters.
 *   4. Per cluster: late board, core items (carry + tank), trait breakpoints, playstyle, and
 *      early/mid boards + item holders chosen by shared traits, AD/AP damage profile and range.
 *   5. Validate and write the exact phase-based schema used by the overlay.
 *
 * Data sources: Riot API (matches), Data Dragon (ids, names, costs, items), CommunityDragon
 * (traits, trait breakpoints, attack range — Data Dragon's TFT files do not include these).
 *
 * Policy: augment data in match payloads is ignored entirely. Output contains no win rates or
 * placement numbers — only the comps' structure and an S/A/B label by play frequency.
 *
 * Requires Node ≥ 22.18 (imports src/data/itemRecipes.ts directly via type stripping).
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = join(ROOT, '.cache');
const MATCH_CACHE = join(CACHE_DIR, 'riot-matches');

try {
  process.loadEnvFile(join(ROOT, '.env'));
} catch {
  /* no .env — fine for --offline */
}

// ---------------------------------------------------------------- config

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const num = (v, d) => (v === undefined ? d : Number(v));

const CFG = {
  platform: args.platform ?? 'euw1', // league / summoner routing
  region: args.region ?? 'europe', // match routing
  queue: args.queue ?? 'RANKED_TFT',
  queueIds: [1100], // ranked TFT
  players: num(args.players, 40),
  matchesPerPlayer: num(args['matches-per-player'], 10),
  maxMatches: num(args['max-matches'], 200),
  days: num(args.days, 7),
  comps: num(args.comps, 8),
  minBoards: num(args['min-boards'], 6),
  offline: !!args.offline,
  dryRun: !!args['dry-run'],
  out: args.out ? resolve(process.cwd(), args.out) : join(ROOT, 'src/data/comps.json'),
};

const log = (...a) => console.log('·', ...a);
const warn = (...a) => console.warn('!', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- Riot API client

/** Riot dev keys: 20 req / 1 s and 100 req / 2 min, per routing host. */
class RateLimiter {
  constructor(limits = [[20, 1_000], [100, 120_000]]) {
    this.limits = limits;
    this.stamps = [];
  }
  async take() {
    for (;;) {
      const now = Date.now();
      this.stamps = this.stamps.filter((t) => now - t < 120_000);
      let wait = 0;
      for (const [n, ms] of this.limits) {
        const inWindow = this.stamps.filter((t) => now - t < ms);
        if (inWindow.length >= n) wait = Math.max(wait, ms - (now - inWindow[0]) + 50);
      }
      if (!wait) return void this.stamps.push(now);
      if (wait > 2000) log(`rate limit: waiting ${Math.ceil(wait / 1000)}s…`);
      await sleep(wait);
    }
  }
}
const limiters = new Map();

async function riot(host, path) {
  const key = process.env.RIOT_API_KEY;
  if (!key) throw new Error('RIOT_API_KEY is not set. Add it to .env (see README) or use --offline.');
  const limiter = limiters.get(host) ?? limiters.set(host, new RateLimiter()).get(host);
  for (let attempt = 1; attempt <= 5; attempt++) {
    await limiter.take();
    const res = await fetch(`https://${host}.api.riotgames.com${path}`, { headers: { 'X-Riot-Token': key } });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403)
      throw new Error(`Riot API ${res.status}: key invalid or expired (dev keys expire every 24 h).`);
    if (res.status === 429) {
      const s = Number(res.headers.get('retry-after') ?? 10);
      warn(`429 from ${host}, retrying in ${s}s`);
      await sleep(s * 1000);
      continue;
    }
    if (res.status >= 500) {
      await sleep(1000 * attempt);
      continue;
    }
    throw new Error(`Riot API ${res.status} for ${path}`);
  }
  throw new Error(`Riot API: giving up on ${path}`);
}

async function topPlayers() {
  const tiers = ['challenger', 'grandmaster'];
  const entries = [];
  for (const t of tiers) {
    const league = await riot(CFG.platform, `/tft/league/v1/${t}?queue=${CFG.queue}`);
    entries.push(...(league?.entries ?? []));
    if (entries.length >= CFG.players * 2) break;
  }
  entries.sort((a, b) => b.leaguePoints - a.leaguePoints);
  const top = entries.slice(0, CFG.players);
  const puuids = [];
  for (const e of top) {
    if (e.puuid) puuids.push(e.puuid);
    else if (e.summonerId) {
      // Older league payloads only carry summonerId.
      const s = await riot(CFG.platform, `/tft/summoner/v1/summoners/${e.summonerId}`);
      if (s?.puuid) puuids.push(s.puuid);
    }
  }
  log(`${puuids.length} Challenger/GM players (${CFG.platform})`);
  return puuids;
}

async function fetchMatches() {
  await mkdir(MATCH_CACHE, { recursive: true });
  const puuids = await topPlayers();
  const since = Math.floor(Date.now() / 1000) - CFG.days * 86_400;
  const ids = new Set();
  for (const p of puuids) {
    const list = await riot(CFG.region, `/tft/match/v1/matches/by-puuid/${p}/ids?start=0&count=${CFG.matchesPerPlayer}&startTime=${since}`);
    (list ?? []).forEach((id) => ids.add(id));
    if (ids.size >= CFG.maxMatches) break;
  }
  const todo = [...ids].slice(0, CFG.maxMatches);
  let fetched = 0;
  for (const id of todo) {
    const file = join(MATCH_CACHE, `${id}.json`);
    if (existsSync(file)) continue;
    const m = await riot(CFG.region, `/tft/match/v1/matches/${id}`);
    if (m) await writeFile(file, JSON.stringify(m));
    if (++fetched % 25 === 0) log(`fetched ${fetched}/${todo.length} matches`);
  }
  log(`${todo.length} match ids (${fetched} new, rest from cache)`);
  return todo;
}

async function loadCachedMatches(ids) {
  const files = ids ? ids.map((id) => `${id}.json`) : existsSync(MATCH_CACHE) ? await readdir(MATCH_CACHE) : [];
  const out = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(await readFile(join(MATCH_CACHE, f), 'utf8')));
    } catch {
      /* skip missing/corrupt */
    }
  }
  return out;
}

// ---------------------------------------------------------------- static data

async function cachedFetchJson(name, url) {
  const file = join(CACHE_DIR, name);
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(file, text);
  return JSON.parse(text);
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const stripPrefix = (id) => String(id).replace(/^(?:TFT\d*|DA)_(?:\d+_)?|^TFTTutorial_/i, '');

async function loadStatic() {
  const [version] = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json();
  const dd = (f) => cachedFetchJson(`ddragon-${version}-${f}.json`, `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/${f}.json`);
  const [ddChamps, ddItems] = await Promise.all([dd('tft-champion'), dd('tft-item')]);
  const cdragon = await cachedFetchJson(`cdragon-${version}.json`, 'https://raw.communitydragon.org/latest/cdragon/tft/en_us.json');

  let set = 0;
  for (const k of Object.keys(ddChamps.data)) set = Math.max(set, Number(/TFTSet(\d+)/.exec(k)?.[1] ?? 0));
  const setData = cdragon.setData.find((s) => s.mutator === `TFTSet${set}`);
  if (!setData) throw new Error(`CommunityDragon has no TFTSet${set} data yet`);

  const ddIds = new Set(Object.values(ddChamps.data).map((c) => c.id));
  /** apiName → { id, name, cost, traits[], range } (only champions also in Data Dragon) */
  const champs = new Map();
  for (const c of setData.champions) {
    if (!ddIds.has(c.apiName) || !c.traits?.length || c.cost < 1 || c.cost > 5) continue;
    champs.set(c.apiName, { id: c.apiName, name: c.name, cost: c.cost, traits: c.traits, range: c.stats?.range ?? 4 });
  }
  /** trait display name → { id, name, breakpoints[] } */
  const traitsByName = new Map(
    setData.traits.map((t) => [t.name, { id: t.apiName, name: t.name, breakpoints: [...new Set(t.effects.map((e) => e.minUnits))].sort((a, b) => a - b) }]),
  );

  const recipes = await import(pathToFileURL(join(ROOT, 'src/data/itemRecipes.ts')).href);
  const canonByName = new Map();
  const ddItemById = Object.fromEntries(Object.values(ddItems.data).map((i) => [i.id, i]));
  for (const id of recipes.CANONICAL_ITEM_IDS) if (ddItemById[id]) canonByName.set(norm(ddItemById[id].name), id);

  return { version, patch: version.split('.').slice(0, 2).join('.'), set, champs, traitsByName, recipes, ddItemById, canonByName };
}

// ---------------------------------------------------------------- normalization

function makeResolvers(S) {
  const champAlias = new Map();
  for (const c of S.champs.values()) {
    champAlias.set(norm(c.id), c.id);
    champAlias.set(norm(c.name), c.id);
    champAlias.set(norm(stripPrefix(c.id)), c.id);
  }
  const traitAlias = new Map();
  for (const t of S.traitsByName.values()) {
    traitAlias.set(norm(t.id), t);
    traitAlias.set(norm(t.name), t);
    traitAlias.set(norm(stripPrefix(t.id)), t);
  }
  return {
    champ: (characterId) =>
      champAlias.get(norm(characterId)) ?? champAlias.get(norm(stripPrefix(characterId))) ?? null,
    trait: (name) => traitAlias.get(norm(name)) ?? traitAlias.get(norm(stripPrefix(name))) ?? null,
    /** Same rule as the app's canonicalItemId(): match on Data Dragon display name. */
    item: (id) => {
      if (S.recipes.CANONICAL_ITEM_IDS.includes(id)) return id;
      const name = S.ddItemById[id]?.name;
      // "Radiant X" (Artifact/Radiant reward versions) counts as its base item X.
      const base = name?.replace(/^Radiants+/i, "");
      return (base && S.canonByName.get(norm(base))) ?? id;
    },
  };
}

const COMPONENT_CLASS = {
  TFT_Item_BFSword: 'AD',
  TFT_Item_RecurveBow: 'AD',
  TFT_Item_SparringGloves: 'AD',
  TFT_Item_NeedlesslyLargeRod: 'AP',
  TFT_Item_TearOfTheGoddess: 'AP',
  TFT_Item_ChainVest: 'TANK',
  TFT_Item_NegatronCloak: 'TANK',
  TFT_Item_GiantsBelt: 'TANK',
};

/**
 * Defensive items — what tanks build. Explicit, because a component heuristic misreads
 * Tear-based tank items (Spirit Visage = Tear + Belt, Protector's Vow = Tear + Vest) as half-AP.
 */
const DEFENSIVE_ITEMS = new Set([
  'TFT_Item_BrambleVest',
  'TFT_Item_GargoyleStoneplate',
  'TFT_Item_RedBuff', // Sunfire Cape
  'TFT_Item_NightHarvester', // Steadfast Heart
  'TFT_Item_DragonsClaw',
  'TFT_Item_SpectralGauntlet', // Evenshroud
  'TFT_Item_WarmogsArmor',
  'TFT_Item_Redemption', // Spirit Visage
  'TFT_Item_FrozenHeart', // Protector's Vow
  'TFT_Item_Crownguard',
]);
const isDefensive = (it) => DEFENSIVE_ITEMS.has(it);

/** Team-utility items (anti-heal, shred/sunder, auras) — define the UTILITY / OFF-TANK role. */
const UTILITY_ITEMS = new Set([
  'TFT_Item_Morellonomicon', // anti-heal (burn)
  'TFT_Item_RedBuff', // Sunfire Cape: anti-heal
  'TFT_Item_SpectralGauntlet', // Evenshroud: armor shred
  'TFT_Item_IonicSpark', // magic-resist shred
  'TFT_Item_FrozenHeart', // Protector's Vow: team shield/aura
]);

/** AD / AP / TANK points of a completed item, from its components. */
function itemProfile(S, itemId) {
  const r = S.recipes.lookupRecipeByResult(itemId);
  const p = { AD: 0, AP: 0, TANK: 0 };
  if (r) for (const c of [r.a, r.b]) if (COMPONENT_CLASS[c]) p[COMPONENT_CLASS[c]]++;
  return p;
}

// ---------------------------------------------------------------- board extraction

function extractBoards(S, R, matches) {
  const boards = [];
  /** champion → { AD, AP, TANK } over every observed item (all placements) */
  const dmg = new Map();
  let used = 0;
  for (const m of matches) {
    const info = m?.info;
    if (!info || info.tft_set_number !== S.set || !CFG.queueIds.includes(info.queue_id)) continue;
    used++;
    for (const p of info.participants ?? []) {
      const units = (p.units ?? [])
        .map((u) => ({
          id: R.champ(u.character_id),
          star: u.tier ?? 1,
          items: (u.itemNames ?? u.items ?? []).filter((i) => typeof i === 'string').map(R.item),
        }))
        .filter((u) => u.id);
      for (const u of units) {
        const acc = dmg.get(u.id) ?? { AD: 0, AP: 0, TANK: 0 };
        for (const it of u.items) {
          const pr = itemProfile(S, it);
          acc.AD += pr.AD;
          acc.AP += pr.AP;
          acc.TANK += pr.TANK;
        }
        dmg.set(u.id, acc);
      }
      if (p.placement > 4) continue; // only top-4 boards define the meta
      const traits = (p.traits ?? [])
        .filter((t) => (t.tier_current ?? t.style ?? 0) > 0)
        .map((t) => ({ trait: R.trait(t.name), n: t.num_units }))
        .filter((t) => t.trait);
      boards.push({ units, traits, level: p.level ?? 8 });
    }
  }
  return { boards, dmg, matchesUsed: used };
}

const isUnique = (t) => t.breakpoints.length === 1 && t.breakpoints[0] === 1;
const recipeCount = (S, items) => items.filter((i) => S.recipes.lookupRecipeByResult(i)).length;
/** Offensive completed items — what decides who the carry is. */
const offenseCount = (S, items) => items.filter((i) => S.recipes.lookupRecipeByResult(i) && !isDefensive(i)).length;

function carryOf(S, board) {
  return [...board.units].sort(
    (a, b) =>
      offenseCount(S, b.items) - offenseCount(S, a.items) ||
      (S.champs.get(b.id)?.cost ?? 0) - (S.champs.get(a.id)?.cost ?? 0) ||
      b.star - a.star,
  )[0];
}

function primaryTrait(S, board, carry) {
  const champTraits = S.champs.get(carry.id)?.traits ?? [];
  return [...board.traits]
    .filter((t) => !isUnique(t.trait))
    .sort((a, b) => b.n - a.n || Number(champTraits.includes(b.trait.name)) - Number(champTraits.includes(a.trait.name)))[0]?.trait;
}

/**
 * Pass 1 groups boards by their *set* of most-itemized units (a duo-carry comp often has two
 * 3-item units) + primary trait. Pass 2 picks each group's main carry as the itemized unit top
 * players upgrade most (highest average ★ — main carries get 2★/3★, late 5-costs usually stay 1★),
 * cheaper unit on ties, then merges groups that end up with the same carry + trait.
 */
function clusterBoards(S, boards) {
  const groups = new Map();
  for (const b of boards) {
    const top = carryOf(S, b);
    if (!top || offenseCount(S, top.items) < 2) continue; // no clear carry → skip
    const max = offenseCount(S, top.items);
    const core = b.units.filter((u) => offenseCount(S, u.items) === max).slice(0, 2);
    const trait = primaryTrait(S, b, top);
    const key = `${core.map((u) => u.id).sort().join('+')}|${trait?.id ?? 'none'}`;
    const g = groups.get(key) ?? { core: core.map((u) => u.id), trait, boards: [] };
    g.boards.push(b);
    groups.set(key, g);
  }

  const avgStar = (g, id) => {
    const stars = g.boards.map((b) => b.units.find((u) => u.id === id)?.star).filter(Boolean);
    return stars.reduce((s, x) => s + x, 0) / Math.max(1, stars.length);
  };
  const clusters = new Map();
  for (const g of groups.values()) {
    const carry = [...g.core].sort(
      (a, b) => avgStar(g, b) - avgStar(g, a) || (S.champs.get(a)?.cost ?? 9) - (S.champs.get(b)?.cost ?? 9),
    )[0];
    const key = `${carry}|${g.trait?.id ?? 'none'}`;
    const c = clusters.get(key) ?? { carry, trait: g.trait, boards: [] };
    c.boards.push(...g.boards);
    clusters.set(key, c);
  }

  // Most played first; at most one comp per carry for variety.
  const seen = new Set();
  return [...clusters.values()]
    .sort((a, b) => b.boards.length - a.boards.length)
    .filter((c) => c.boards.length >= CFG.minBoards && !seen.has(c.carry) && seen.add(c.carry))
    .slice(0, CFG.comps);
}

// ---------------------------------------------------------------- comp building

const countBy = (arr) => {
  const m = new Map();
  for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function buildComp(S, dmg, cluster, rank) {
  const C = (id) => S.champs.get(id);
  const carry = cluster.carry;
  const n = cluster.boards.length;
  const unitFreq = countBy(cluster.boards.flatMap((b) => [...new Set(b.units.map((u) => u.id))]));
  const freq = new Map(unitFreq);
  const level = median(cluster.boards.map((b) => b.level));
  const boardSize = Math.min(9, Math.max(8, level));

  // Damage profile of a unit (AD/AP), from items players actually build on it.
  const dmgType = (id) => {
    const d = dmg.get(id);
    if (!d || d.AD + d.AP === 0) return null;
    return d.AD >= d.AP ? 'AD' : 'AP';
  };
  const carryType = dmgType(carry);
  const melee = (id) => (C(id)?.range ?? 4) <= 2;

  // ---- late board
  const late = [carry, ...unitFreq.map(([id]) => id).filter((id) => id !== carry && freq.get(id) / n >= 0.25)].slice(0, boardSize);

  // ---- items
  const itemsOn = (id) =>
    countBy(cluster.boards.flatMap((b) => b.units.filter((u) => u.id === id).flatMap((u) => u.items.filter((i) => S.recipes.lookupRecipeByResult(i)))));
  const tankScore = (id) => itemsOn(id).reduce((s, [it, k]) => s + (isDefensive(it) ? k : 0), 0);
  const tank =
    late.filter((id) => id !== carry && melee(id)).sort((a, b) => tankScore(b) - tankScore(a) || freq.get(b) - freq.get(a))[0] ??
    late.find((id) => id !== carry);
  const isUtility = (it) => UTILITY_ITEMS.has(it);
  const isDamage = (it) => !isUtility(it) && !isDefensive(it);
  /** Items built on `id` at least `minShare` of the time it appears in this cluster. */
  const commonItemsOn = (id, keep, minShare = 0.15) => {
    const appearances = freq.get(id) ?? 1;
    return itemsOn(id)
      .filter(([it, k]) => keep(it) && k >= Math.max(2, minShare * appearances))
      .map(([it]) => it);
  };
  const coreSet = (id, role, items) => ({
    unit: id,
    role,
    items: items.map((it) => {
      const r = S.recipes.lookupRecipeByResult(it);
      return { item: it, components: [r.a, r.b] };
    }),
  });
  const carryItems = coreSet(carry, 'carry', itemsOn(carry).map(([it]) => it).filter((it) => !isDefensive(it)).slice(0, 3));
  const tankItems = coreSet(tank, 'tank', itemsOn(tank).map(([it]) => it).filter(isDefensive).slice(0, 3));

  // Utility / off-tank first: the remaining unit most often holding anti-heal / shred / aura items.
  // Then duo / 2nd carry: the remaining unit most often given damage items (utility items such as
  // Morellonomicon on an AP duo count too, since that unit isn't the utility holder).
  const taken = new Set([carry, tank]);
  const bestBy = (score) =>
    late
      .filter((id) => !taken.has(id))
      .map((id) => [id, score(id)])
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
  const weight = (id, keep) => commonItemsOn(id, keep).length * 10 + itemsOn(id).filter(([it]) => keep(it)).reduce((s, [, k]) => s + k, 0) / n;
  const utility = bestBy((id) => weight(id, isUtility));
  const utilityItems = utility
    ? [...commonItemsOn(utility, isUtility), ...commonItemsOn(utility, (it) => !isUtility(it) && isDefensive(it))].slice(0, 3)
    : [];
  if (utility && utilityItems.length >= 2) taken.add(utility);
  const flex = (it) => isDamage(it) || isUtility(it);
  const secondary = bestBy((id) => weight(id, isDamage) * 2 + weight(id, isUtility));
  const secondaryItems = secondary ? commonItemsOn(secondary, flex).slice(0, 3) : [];
  const extraSets = [
    secondaryItems.length >= 2 && coreSet(secondary, 'secondary', secondaryItems),
    utilityItems.length >= 2 && coreSet(utility, 'utility', utilityItems),
  ].filter(Boolean);

  // ---- synergies (late board must actually reach each breakpoint)
  const traitsOf = (ids) => countBy(ids.flatMap((id) => C(id)?.traits ?? []));
  const lateTraitCounts = new Map(traitsOf(late));
  const traitFreq = countBy(cluster.boards.flatMap((b) => b.traits.filter((t) => !isUnique(t.trait)).map((t) => t.trait.name)));
  const synergies = traitFreq
    .filter(([, k]) => k / n >= 0.5)
    .map(([name]) => {
      const t = S.traitsByName.get(name);
      const have = lateTraitCounts.get(name) ?? 0;
      const bp = [...t.breakpoints].reverse().find((b) => b <= have);
      // A "1 unit" breakpoint (e.g. Flora Fatalis 1/2) is not a meaningful synergy target.
      return bp && bp >= 2 ? { trait: t.id, count: bp } : null;
    })
    .filter(Boolean)
    .slice(0, 4);
  const traitNameById = new Map([...S.traitsByName.values()].map((t) => [t.id, t.name]));
  const mainTraits = new Set(synergies.map((s) => traitNameById.get(s.trait)));

  // ---- item holders: shared traits + same damage type + same range class
  const holderScore = (id) => {
    const shared = (C(id)?.traits ?? []).filter((t) => (C(carry)?.traits ?? []).includes(t)).length;
    return shared * 2 + (carryType && dmgType(id) === carryType ? 2 : 0) + (melee(id) === melee(carry) ? 1 : 0) + (freq.get(id) ?? 0) / n;
  };
  const pickHolder = (maxCost) => {
    if ((C(carry)?.cost ?? 9) <= maxCost) return carry;
    return [...S.champs.values()]
      .filter((c) => c.cost <= maxCost && c.cost >= (maxCost === 3 ? 3 : 1) && c.id !== tank)
      .sort((a, b) => holderScore(b.id) - holderScore(a.id))[0]?.id;
  };
  const earlyHolder = pickHolder(2);
  const midHolder = pickHolder(3);

  // ---- early / mid boards
  // Early/mid units: favour the comp's synergy traits and the carry's traits, then any trait the
  // late board uses (keeps openers on-theme), then how often top players field the unit.
  const relevance = (id) => {
    const tr = C(id)?.traits ?? [];
    const core = tr.filter((t) => mainTraits.has(t) || (C(carry)?.traits ?? []).includes(t)).length;
    const lateShared = tr.filter((t) => lateTraitCounts.has(t)).length;
    return core * 10 + lateShared * 3 + (freq.get(id) ?? 0) / n;
  };
  const pool = (minCost, maxCost) =>
    [...S.champs.values()].filter((c) => c.cost >= minCost && c.cost <= maxCost).map((c) => c.id).sort((a, b) => relevance(b) - relevance(a));
  const withFront = (ids, size) => {
    const out = ids.slice(0, size);
    if (out.filter(melee).length < 2) {
      const front = ids.filter((id) => melee(id) && !out.includes(id)).slice(0, 2 - out.filter(melee).length);
      out.splice(out.length - front.length, front.length, ...front);
    }
    return out;
  };
  const uniq = (ids) => [...new Set(ids.filter(Boolean))];
  const early = withFront(uniq([earlyHolder, ...pool(1, 2)]), 6);
  const mid = withFront(uniq([midHolder, ...late.filter((id) => (C(id)?.cost ?? 9) <= 3), ...pool(1, 3)]), 7);

  // ---- playstyle
  const carryCost = C(carry)?.cost ?? 4;
  const carryStar = cluster.boards.reduce((s, b) => s + (b.units.find((u) => u.id === carry)?.star ?? 1), 0) / n;
  const playstyle =
    carryCost <= 2 && carryStar >= 2.4
      ? `Lvl ${carryCost === 1 ? 5 : 6} Reroll`
      : carryCost === 3 && carryStar >= 2.4
        ? 'Lvl 7 Slow Roll'
        : carryCost === 5
          ? 'Fast 9'
          : 'Fast 8';
  const reroll = /Reroll|Slow Roll/.test(playstyle);

  const name = (id) => C(id)?.name ?? id;
  const holderNote = (h) => {
    if (h === carry) return `${name(carry)} carries from the start — items stay on ${name(carry)}.`;
    const shared = (C(h)?.traits ?? []).filter((t) => (C(carry)?.traits ?? []).includes(t));
    const why = [shared.length ? `shares ${shared.join(' + ')}` : null, carryType && dmgType(h) === carryType ? `is ${carryType}` : null]
      .filter(Boolean)
      .join(' and ');
    return `${name(h)} ${why || 'is the closest early match'} like ${name(carry)}.`;
  };
  const frontline = (ids) => ids.filter(melee);
  const transferFrom = midHolder && midHolder !== carry ? midHolder : earlyHolder && earlyHolder !== carry ? earlyHolder : null;
  const traitName = cluster.trait?.name ?? 'Flex';

  return {
    id: slug(`${traitName}-${name(carry)}`),
    name: `${traitName} ${name(carry)}`,
    tier: rank < 2 ? 'S' : rank < 5 ? 'A' : 'B',
    playstyle,
    carry,
    tank,
    core_items: [carryItems, tankItems, ...extraSets].filter((s) => s.items.length > 0),
    phases: {
      early: {
        levels: [3, 5],
        stage: '2',
        units: early,
        frontline: frontline(early),
        ...(earlyHolder && { item_holder: { unit: earlyHolder, items: carryItems.items.map((i) => i.item), note: holderNote(earlyHolder) } }),
        tip: reroll
          ? `Buy every ${name(carry)} copy you see; play your strongest early board and save gold for the roll.`
          : `Slam ${name(carry)}'s items on ${name(earlyHolder ?? carry)} early and play strongest board — no rolling yet.`,
      },
      mid: {
        levels: [6, 7],
        stage: '3',
        units: mid,
        frontline: frontline(mid),
        ...(midHolder && midHolder !== earlyHolder && { item_holder: { unit: midHolder, items: carryItems.items.map((i) => i.item), note: holderNote(midHolder) } }),
        tip: `Hold ${name(carry)} and ${name(tank)} copies on the bench as you see them.`,
        rolldown: reroll
          ? `Reach Lvl ${playstyle.match(/\d/)?.[0] ?? 6} and slow roll above 50 gold until ${name(carry)} is 3★.`
          : 'Do not roll here — level on 3-2 and 4-1 to hit Lvl 8 with gold to spare.',
        econ: reroll ? 'Roll only the gold above 50 each round.' : 'Stay at or above 50 gold from 3-2 onward; spend extra on XP.',
      },
      late: {
        levels: [8, 10],
        stage: '4+',
        units: late,
        frontline: frontline(late),
        item_transfers: transferFrom ? [{ from: transferFrom, to: carry, items: carryItems.items.map((i) => i.item) }] : [],
        synergies,
        tip: reroll
          ? `Once ${name(carry)} is 3★, level up and add the 4/5-costs to round out the board.`
          : `Roll at 4-2 for ${name(carry)} 2★ and ${name(tank)} 2★, then push levels once stable.`,
      },
    },
  };
}

// ---------------------------------------------------------------- validation & output

function validate(S, db) {
  const errors = [];
  for (const c of db.comps) {
    const ids = [c.carry, c.tank, ...Object.values(c.phases).flatMap((p) => [...p.units, p.item_holder?.unit].filter(Boolean))];
    for (const id of ids) if (!S.champs.has(id)) errors.push(`${c.id}: unknown champion ${id}`);
    for (const s of c.core_items)
      for (const it of s.items) {
        const r = S.recipes.lookupRecipeByResult(it.item);
        if (!r || [r.a, r.b].sort().join() !== [...it.components].sort().join()) errors.push(`${c.id}: bad recipe ${it.item}`);
      }
    for (const p of Object.values(c.phases)) {
      if (!p.frontline.every((u) => p.units.includes(u))) errors.push(`${c.id}: frontline not subset of units`);
      for (const s of p.synergies ?? []) {
        const tname = [...S.traitsByName.values()].find((t) => t.id === s.trait)?.name;
        const have = p.units.filter((u) => S.champs.get(u)?.traits.includes(tname)).length;
        if (have < s.count) errors.push(`${c.id}: ${tname} ${have}/${s.count}`);
      }
    }
    if (!c.phases.late.units.includes(c.carry)) errors.push(`${c.id}: carry missing from late board`);
  }
  return errors;
}

/** Pretty JSON with short primitive arrays kept on one line (matches the hand-written file). */
const format = (obj) =>
  JSON.stringify(obj, null, 2).replace(
    /\[\s*((?:"[^"]*"|-?\d+(?:\.\d+)?)(?:,\s*(?:"[^"]*"|-?\d+(?:\.\d+)?))*)\s*\]/g,
    (_, inner) => `[${inner.split(/,\s*/).join(', ')}]`,
  ) + '\n';

// ---------------------------------------------------------------- main

async function main() {
  log(`fetch-riot-meta · ${CFG.offline ? 'offline (cached matches)' : `${CFG.platform}/${CFG.region}`}`);
  const S = await loadStatic();
  const R = makeResolvers(S);
  log(`Set ${S.set} · patch ${S.version} · ${S.champs.size} champions`);

  const ids = CFG.offline ? null : await fetchMatches();
  const matches = await loadCachedMatches(ids);
  const { boards, dmg, matchesUsed } = extractBoards(S, R, matches);
  log(`${matchesUsed} Set ${S.set} ranked matches → ${boards.length} top-4 boards`);
  if (!boards.length) throw new Error('No usable boards. Check the set/queue filters or fetch more matches.');

  const clusters = clusterBoards(S, boards);
  if (!clusters.length) throw new Error(`No comp cluster reached --min-boards=${CFG.minBoards}. Fetch more matches.`);
  const comps = clusters.map((c, i) => buildComp(S, dmg, c, i));

  const db = {
    schemaVersion: 1,
    set: S.set,
    patch: S.patch,
    generatedAt: new Date().toISOString(),
    source: { api: 'tft-match-v1', platform: CFG.offline ? `${CFG.platform} (cached)` : CFG.platform, matches: matchesUsed, boards: boards.length },
    comps,
  };

  const errors = validate(S, db);
  if (errors.length) {
    errors.forEach((e) => warn(e));
    throw new Error(`${errors.length} validation error(s) — not writing output.`);
  }

  console.log('\n  #  Tier  Comp                          Playstyle        Boards');
  clusters.forEach((c, i) =>
    console.log(`  ${String(i + 1).padStart(2)}  ${comps[i].tier}     ${comps[i].name.padEnd(30)}${comps[i].playstyle.padEnd(17)}${c.boards.length}`),
  );

  if (CFG.dryRun) {
    log('\n--dry-run: not writing. First comp:\n' + format(comps[0]));
    return;
  }
  await writeFile(CFG.out, format(db));
  log(`\nwrote ${comps.length} comps → ${CFG.out}`);
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
});
