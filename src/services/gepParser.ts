/**
 * Pure parser: Overwolf GEP (TFT) info updates → TftGameState.
 *
 * GEP delivers `info[category][key] = value`, where most values are JSON *strings*
 * (sometimes already objects, e.g. match_stats.board_players). The parser keeps a small
 * accumulator of the latest raw pieces and derives a fresh TftGameState on demand.
 *
 * Payload formats: https://dev.overwolf.com/ow-native/live-game-data-gep/supported-games/teamfight-tactics
 *
 * Deliberately NOT handled: augment data (Overwolf/Riot: augment info must not be shown in apps).
 */
import type { StarLevel, TftGameState, TftOpponent, TftUnit } from '../types/tft';

// ---------- raw GEP shapes ----------

interface RawPiece {
  name?: string;
  level?: string | number;
  item_1?: string;
  item_2?: string;
  item_3?: string;
}
type RawPieceMap = Record<string, RawPiece | undefined>;

interface RawRosterEntry {
  health?: number | string;
  xp?: number | string;
  localplayer?: boolean | string;
  rank?: number | string;
  tag_line?: string;
}

interface RawItemBenchEntry {
  summoner?: string;
  tag_line?: string;
  bench_items?: { name?: string; count?: number | string }[];
}

interface RawBoardPlayer {
  summoner?: string;
  tag_line?: string;
  teamId?: number;
  board?: RawPiece[];
  bench?: RawPiece[];
}

interface RawMatchStatsEntry {
  stage?: { stage_main?: number; stage_sub?: number };
  board?: RawBoardPlayer[];
}

/** Everything we've seen so far in the current match. */
export interface GepAccumulator {
  gameMode?: 'TFT' | 'LOL';
  /** Saw TFT-only data (board, round_type…) — fallback when game_mode never arrives. */
  sawTftData: boolean;
  inMatch: boolean;
  summonerName?: string;
  level: number;
  gold: number;
  hp: number;
  stage: string;
  board: RawPieceMap;
  bench: RawPieceMap;
  shop: RawPieceMap;
  itemBench: RawItemBenchEntry[];
  roster: Record<string, RawRosterEntry>;
  boardPlayers: RawBoardPlayer[];
  /** Board currently being scouted: opponent_board_pieces paired with board_spectate ("name#tag"). */
  spectating?: { name?: string; pieces: RawPieceMap };
}

export const createAccumulator = (): GepAccumulator => ({
  sawTftData: false,
  inMatch: false,
  level: 1,
  gold: 0,
  hp: 100,
  stage: '1-1',
  board: {},
  bench: {},
  shop: {},
  itemBench: [],
  roster: {},
  boardPlayers: [],
});

// ---------- helpers ----------

/** JSON-decode strings, pass objects through, return undefined on garbage. */
export function decode<T>(value: unknown): T | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as T; // plain string values ("TFT", "11", …)
  }
}

const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const nameOnly = (riotId: string) => riotId.split('#')[0].trim().toLowerCase();

export type ItemCanonicalizer = (id: string) => string;

function toUnit(p: RawPiece | undefined, canon: ItemCanonicalizer): TftUnit | null {
  const id = p?.name?.trim();
  if (!id || id.toLowerCase() === 'sold') return null;
  const star = Math.min(3, Math.max(1, num(p?.level, 1))) as StarLevel;
  const items = [p?.item_1, p?.item_2, p?.item_3].filter((i): i is string => !!i?.trim()).map(canon);
  return { id, star, items };
}

const toUnits = (pieces: RawPieceMap | RawPiece[] | undefined, canon: ItemCanonicalizer): TftUnit[] =>
  Object.values(pieces ?? {})
    .map((p) => toUnit(p, canon))
    .filter((u): u is TftUnit => u !== null);

// ---------- reducer ----------

/**
 * Apply one `info` object from onInfoUpdates2 / getInfo: `{ [category]: { [key]: value } }`.
 * Mutates and returns the accumulator. Unknown categories/keys are ignored.
 */
export function applyInfo(acc: GepAccumulator, info: Record<string, Record<string, unknown> | undefined>): GepAccumulator {
  for (const [category, entries] of Object.entries(info)) {
    if (!entries) continue;
    for (const [key, value] of Object.entries(entries)) applyKey(acc, category, key, value);
  }
  return acc;
}

function applyKey(acc: GepAccumulator, category: string, key: string, value: unknown): void {
  switch (`${category}.${key}`) {
    // --- match_info ---
    case 'match_info.game_mode': {
      const mode = String(decode<string>(value) ?? '').toUpperCase();
      if (mode === 'TFT' || mode === 'LOL') acc.gameMode = mode;
      return;
    }
    case 'match_info.match_state': {
      const p = decode<{ in_progress?: boolean | string }>(value)?.in_progress;
      acc.inMatch = p === true || p === 'true';
      return;
    }
    case 'match_info.round_type': {
      const stage = decode<{ stage?: string }>(value)?.stage;
      if (stage) {
        acc.stage = stage;
        acc.sawTftData = true;
      }
      return;
    }
    case 'match_info.board_spectate': {
      const name = decode<string>(value);
      acc.spectating = { name: typeof name === 'string' ? name : undefined, pieces: acc.spectating?.pieces ?? {} };
      return;
    }

    // --- me ---
    case 'me.summoner_name':
      acc.summonerName = String(decode<string>(value) ?? '') || acc.summonerName;
      return;
    case 'me.xp':
      acc.level = num(decode<{ level?: number | string }>(value)?.level, acc.level);
      return;
    case 'me.gold':
      acc.gold = num(decode(value), acc.gold);
      return;
    case 'me.health':
      acc.hp = num(decode(value), acc.hp);
      return;

    // --- roster ---
    case 'roster.player_status':
      acc.roster = decode<Record<string, RawRosterEntry>>(value) ?? acc.roster;
      return;

    // --- store / board / bench ---
    case 'store.shop_pieces':
      acc.shop = decode<RawPieceMap>(value) ?? {};
      return;
    case 'board.board_pieces':
      acc.board = decode<RawPieceMap>(value) ?? {};
      acc.sawTftData = true;
      return;
    case 'board.opponent_board_pieces':
      acc.spectating = { name: acc.spectating?.name, pieces: decode<RawPieceMap>(value) ?? {} };
      return;
    case 'bench.bench_pieces':
      acc.bench = decode<RawPieceMap>(value) ?? {};
      acc.sawTftData = true;
      return;
    case 'bench.item_bench':
      acc.itemBench = decode<RawItemBenchEntry[]>(value) ?? acc.itemBench;
      return;

    // --- match_stats: boards + benches of all players, per stage ---
    case 'match_stats.board_players': {
      const stages = decode<RawMatchStatsEntry[]>(value);
      const latest = Array.isArray(stages) ? stages[stages.length - 1] : undefined;
      if (latest?.board) acc.boardPlayers = latest.board;
      return;
    }
  }
}

/** GEP onNewEvents. Returns true when the accumulator was reset (new match). */
export function applyEvent(acc: GepAccumulator, name: string): boolean {
  if (name === 'match_start') {
    Object.assign(acc, createAccumulator(), {
      gameMode: acc.gameMode,
      summonerName: acc.summonerName,
      sawTftData: true,
      inMatch: true,
    });
    return true;
  }
  if (name === 'match_end') acc.inMatch = false;
  return false;
}

/** True once we know (or strongly suspect) the running 5426 game is TFT, not League. */
export const isTftMatch = (acc: GepAccumulator): boolean =>
  acc.gameMode === 'TFT' || (acc.gameMode !== 'LOL' && acc.sawTftData);

// ---------- projection ----------

function localName(acc: GepAccumulator): string | undefined {
  if (acc.summonerName) return acc.summonerName;
  return Object.entries(acc.roster).find(([, r]) => String(r.localplayer) === 'true')?.[0];
}

export function toGameState(acc: GepAccumulator, canon: ItemCanonicalizer): TftGameState {
  const me = localName(acc)?.toLowerCase();
  const isMe = (summoner?: string) => !!me && !!summoner && nameOnly(summoner) === nameOnly(me);

  // Local item bench (item_bench covers every player).
  const mine = acc.itemBench.find((e) => isMe(e.summoner)) ?? (acc.itemBench.length === 1 ? acc.itemBench[0] : undefined);
  const items = (mine?.bench_items ?? []).flatMap((it) =>
    it.name ? Array<string>(Math.max(1, num(it.count, 1))).fill(canon(it.name)) : [],
  );

  // Opponents: roster gives names/hp/level; match_stats gives boards; live scouting overrides.
  const boardsByName = new Map(acc.boardPlayers.filter((b) => b.summoner).map((b) => [nameOnly(b.summoner!), b]));
  const spectated = acc.spectating?.name ? nameOnly(acc.spectating.name) : undefined;

  const opponentNames = Object.keys(acc.roster).length
    ? Object.entries(acc.roster)
        .filter(([name, r]) => !isMe(name) && String(r.localplayer) !== 'true')
        .map(([name]) => name)
    : acc.boardPlayers.map((b) => b.summoner ?? '').filter((n) => n && !isMe(n));

  const opponents: TftOpponent[] = opponentNames.map((name) => {
    const key = nameOnly(name);
    const r = acc.roster[name];
    const stats = boardsByName.get(key);
    const scouted = spectated === key && acc.spectating ? toUnits(acc.spectating.pieces, canon) : null;
    return {
      name,
      level: num(r?.xp, 0),
      hp: num(r?.health, 0),
      board: scouted ?? toUnits(stats?.board, canon),
      bench: toUnits(stats?.bench, canon),
    };
  });

  return {
    source: 'live',
    gameMode: acc.gameMode,
    inMatch: acc.inMatch,
    level: acc.level,
    gold: acc.gold,
    hp: acc.hp,
    stage: acc.stage,
    board: toUnits(acc.board, canon),
    bench: toUnits(acc.bench, canon),
    items,
    shop: Object.values(acc.shop).map((p) => (p?.name && p.name.toLowerCase() !== 'sold' ? p.name : '')),
    opponents,
    updatedAt: Date.now(),
  };
}
