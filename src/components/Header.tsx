import type { ReactNode } from 'react';
import { MAX_LEVEL, shopOdds } from '../data/shopOdds';
import { COST_BG, COST_TEXT } from '../shared/costColors';
import { ow } from '../shared/overwolf';
import type { TftGameState } from '../types/tft';
import { Card } from './ui/Card';
import { Tooltip } from './ui/Tooltip';

const MAX_INTEREST = 5;

/**
 * Card 1 — Stage · Level · Gold (+interest) · HP and live shop odds.
 * Doubles as the window drag handle. Pure game-state info, no stats.
 */
export function Header({ state }: { state: TftGameState }) {
  const mock = state.source === 'mock';
  const interest = Math.min(MAX_INTEREST, Math.floor(Math.max(0, state.gold) / 10));
  const odds = shopOdds(state.level);
  const next = state.level < MAX_LEVEL ? shopOdds(state.level + 1) : null;

  return (
    <Card className="cursor-move px-2.5 pt-2 pb-2.5">
      <div onMouseDown={() => void ow.dragCurrent()}>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-black tracking-[0.18em] text-amber-300/90">TFT OVERLAY</span>
          <span
            className={`rounded px-1.5 py-px text-[9px] font-bold tracking-wide ${
              mock ? 'bg-sky-500/20 text-sky-300' : 'bg-emerald-500/20 text-emerald-300'
            }`}
          >
            {mock ? 'MOCK' : '● LIVE'}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          <Stat label="Stage">
            <span className="font-mono">{state.stage}</span>
          </Stat>
          <Stat label="Level">{state.level}</Stat>
          <Stat label="Gold" valueClass="text-amber-300">
            {state.gold}
            <Tooltip content={`+${interest} gold interest per round`}>
              <span className="ml-1 inline-flex gap-px self-center">
                {Array.from({ length: MAX_INTEREST }, (_, i) => (
                  <span key={i} className={`h-2 w-[3px] rounded-sm ${i < interest ? 'bg-amber-300' : 'bg-white/10'}`} />
                ))}
              </span>
            </Tooltip>
          </Stat>
          <Stat label="HP" valueClass={state.hp <= 30 ? 'text-red-400' : 'text-emerald-300'}>
            {state.hp}
          </Stat>
        </div>

        {/* Shop odds */}
        <div className="mt-2.5">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Shop odds · Lvl {state.level}</span>
            {next && <span className="text-[9px] text-slate-500">▲▼ vs Lvl {state.level + 1}</span>}
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-white/5">
            {odds.map((pct, i) =>
              pct > 0 ? <div key={i} className={`${COST_BG[i + 1]} transition-[width] duration-300`} style={{ width: `${pct}%` }} /> : null,
            )}
          </div>
          <div className="mt-1 grid grid-cols-5 text-center">
            {odds.map((pct, i) => {
              const delta = next ? next[i] - pct : 0;
              return (
                <div key={i} className={pct === 0 && delta === 0 ? 'opacity-30' : ''}>
                  <span className={`text-[9px] font-bold ${COST_TEXT[i + 1]}`}>{i + 1}g</span>{' '}
                  <span className="text-[12px] font-bold tabular-nums text-slate-100">{pct}%</span>
                  {delta !== 0 && (
                    <span className={`ml-px text-[8px] ${delta > 0 ? 'text-emerald-400/80' : 'text-red-400/70'}`}>{delta > 0 ? '▲' : '▼'}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, valueClass = 'text-slate-50', children }: { label: string; valueClass?: string; children: ReactNode }) {
  return (
    <div className="rounded-md bg-black/25 px-2 py-1">
      <div className="text-[8px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`flex items-center text-[16px] leading-tight font-bold tabular-nums ${valueClass}`}>{children}</div>
    </div>
  );
}
