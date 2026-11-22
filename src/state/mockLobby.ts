/**
 * Simulated opponents for Mock Mode. Each opponent "plays" a random comp from
 * comps.json (or a random mix) at a random level, so the lobby contest counter
 * has realistic data to work with.
 */
import { getComps, phaseForLevel } from '../utils/compMatcher';
import type { StarLevel, TftOpponent, TftUnit } from '../types/tft';

const NAMES = ['Shoggoth', 'Pengu Main', 'Rollin Rolf', 'Ezreal Enjoyer', 'Krug Life', 'Top4Tom', 'Bench Warmer'];

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
const shuffle = <T,>(arr: readonly T[]): T[] => [...arr].sort(() => Math.random() - 0.5);


export function generateMockLobby(count = 7): TftOpponent[] {
  const comps = getComps();
  const allUnits = [...new Set(comps.flatMap((c) => Object.values(c.phases).flatMap((p) => p.units)))];
  return NAMES.slice(0, count).map((name) => {
    const level = 5 + Math.floor(Math.random() * 4); // 5–8
    // ~75% commit to a comp, the rest play a random "flex" board.
    const comp = Math.random() < 0.75 ? pick(comps) : null;
    const pool = comp ? comp.phases[phaseForLevel(level)].units : shuffle(allUnits);
    const ids = shuffle(pool).slice(0, Math.min(level, pool.length));
    // Committed players usually hold their carry somewhere already.
    if (comp && Math.random() < 0.8 && !ids.includes(comp.carry)) ids[ids.length - 1] = comp.carry;
    const units: TftUnit[] = ids.map((id) => ({ id, star: (Math.random() < 0.35 ? 2 : 1) as StarLevel, items: [] }));
    return {
      name,
      level,
      hp: 40 + Math.floor(Math.random() * 61),
      board: units.slice(0, level),
      bench: units.slice(level),
    };
  });
}
