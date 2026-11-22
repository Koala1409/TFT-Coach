import { useMemo } from 'react';
import { useDdragon } from '../hooks/useDdragon';
import { getChampion } from '../services/ddragonService';
import { COST_BG } from '../shared/costColors';
import { BOARD_COLS, BOARD_ROWS, layoutBoard } from '../utils/boardLayout';
import { ChampionIcon, champName } from './GameIcon';
import { Tooltip } from './ui/Tooltip';

const CELL_W = 42;
const CELL_H = 48;
const GAP = 3;
const ROW_STEP = CELL_H * 0.75 + GAP;
const HEX = 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)';

interface Props {
  units: readonly string[];
  frontline?: readonly string[];
  carry: string;
  tank: string;
  holder?: string;
  owned: Map<string, number>;
}

/** Mini 4×7 hex board showing where each unit of the phase should stand. */
export function HexBoard({ units, frontline, carry, tank, holder, owned }: Props) {
  useDdragon();
  const placements = useMemo(
    () => layoutBoard({ units, frontline, carry, tank, holder }),
    [units, frontline, carry, tank, holder],
  );
  const at = new Map(placements.map((p) => [`${p.row}:${p.col}`, p.id]));
  const width = BOARD_COLS * (CELL_W + GAP) + CELL_W / 2;
  const height = (BOARD_ROWS - 1) * ROW_STEP + CELL_H;

  return (
    <div className="flex flex-col items-center">
      <div className="mb-1 w-full text-center text-[9px] font-bold uppercase tracking-wider text-red-300/70">▲ Enemy side · front line</div>
      <div className="relative" style={{ width, height }}>
        {Array.from({ length: BOARD_ROWS }, (_, row) =>
          Array.from({ length: BOARD_COLS }, (_, col) => {
            const id = at.get(`${row}:${col}`);
            const left = col * (CELL_W + GAP) + (row % 2 ? (CELL_W + GAP) / 2 : 0);
            const top = row * ROW_STEP;
            return (
              <div key={`${row}:${col}`} className="absolute" style={{ left, top, width: CELL_W, height: CELL_H }}>
                {id ? <UnitHex id={id} isCarry={id === carry} isTank={id === tank} isHolder={id === holder} star={owned.get(id)} /> : <EmptyHex />}
              </div>
            );
          }),
        )}
      </div>
      <div className="mt-1 w-full text-center text-[9px] font-bold uppercase tracking-wider text-sky-300/60">Back line ▼</div>
    </div>
  );
}

function EmptyHex() {
  return <div className="h-full w-full bg-white/[0.05]" style={{ clipPath: HEX }} />;
}

function UnitHex({ id, isCarry, isTank, isHolder, star }: { id: string; isCarry: boolean; isTank: boolean; isHolder: boolean; star?: number }) {
  const champ = getChampion(id);
  const ownedNow = star !== undefined;
  const role = isCarry ? 'Main carry' : isTank ? 'Main tank' : isHolder ? 'Item holder' : undefined;
  return (
    <Tooltip
      content={
        <span>
          <b>{champName(id)}</b> <span className="text-slate-400">· {champ?.cost ?? '?'}-cost</span>
          {role && <span className="block text-amber-300">{role}</span>}
          <span className="block text-slate-400">{ownedNow ? `Owned ${'★'.repeat(star)}` : 'Not owned yet'}</span>
        </span>
      }
    >
      <div className="relative" style={{ width: CELL_W, height: CELL_H }}>
        <div
          className={`absolute inset-0 ${isCarry ? 'bg-amber-300' : (COST_BG[champ?.cost ?? 0] ?? 'bg-slate-500')} ${ownedNow ? '' : 'opacity-50'}`}
          style={{ clipPath: HEX }}
        />
        <div className={`absolute inset-[2.5px] overflow-hidden bg-slate-900 ${ownedNow ? '' : 'opacity-55 grayscale-[50%]'}`} style={{ clipPath: HEX }}>
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <ChampionIcon id={id} size={CELL_H} ring={false} className="block" />
          </span>
        </div>
        {(isCarry || isTank || isHolder) && (
          <span
            className={`absolute -top-0.5 left-1/2 -translate-x-1/2 rounded-sm px-[3px] text-[7px] font-black leading-[10px] shadow ${
              isCarry ? 'bg-amber-400 text-slate-950' : isTank ? 'bg-sky-400 text-slate-950' : 'bg-emerald-400 text-slate-950'
            }`}
          >
            {isCarry ? 'CARRY' : isTank ? 'TANK' : 'ITEMS'}
          </span>
        )}
        {ownedNow && star > 1 && (
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[8px] leading-none text-amber-300 drop-shadow">{'★'.repeat(star)}</span>
        )}
      </div>
    </Tooltip>
  );
}
