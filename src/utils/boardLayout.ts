/**
 * Auto-positioning for the mini hex board (4 rows × 7 cols, row 0 = front line facing the enemy).
 *
 * - Frontline units (comps.json `frontline`) fill row 0 centre-out, tank in the middle; overflow → row 1.
 * - Backline fills row 3; a ranged carry takes the corner with its item holder beside it; overflow → row 2.
 * A sensible default for at-a-glance positioning — not a scouting-specific placement.
 */
export const BOARD_ROWS = 4;
export const BOARD_COLS = 7;

const CENTER_OUT = [3, 2, 4, 1, 5, 0, 6];
const BACK_ROW_ORDER = [6, 5, 0, 4, 1, 3, 2]; // corner first

export interface Placement {
  id: string;
  row: number;
  col: number;
}

export function layoutBoard(opts: {
  units: readonly string[];
  frontline?: readonly string[];
  carry?: string;
  tank?: string;
  holder?: string;
}): Placement[] {
  const front = new Set(opts.frontline ?? []);
  const priority = (id: string) => (id === opts.carry ? 0 : id === opts.tank ? 0 : id === opts.holder ? 1 : 2);
  const sorted = (ids: string[]) => [...ids].sort((a, b) => priority(a) - priority(b));

  const frontUnits = sorted(opts.units.filter((u) => front.has(u)));
  const backUnits = sorted(opts.units.filter((u) => !front.has(u)));

  const out: Placement[] = [];
  const fill = (ids: string[], rows: [number, number], order: number[]) => {
    const slots = [...order.map((c) => [rows[0], c] as const), ...CENTER_OUT.map((c) => [rows[1], c] as const)];
    ids.slice(0, slots.length).forEach((id, i) => out.push({ id, row: slots[i][0], col: slots[i][1] }));
  };
  fill(frontUnits, [0, 1], CENTER_OUT);
  fill(backUnits, [3, 2], BACK_ROW_ORDER);
  return out;
}
