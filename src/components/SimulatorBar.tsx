import { useMemo, useState, type ReactNode } from 'react';
import { COMPONENTS } from '../data/itemRecipes';
import { useDdragon } from '../hooks/useDdragon';
import { mockActions } from '../state/gameStore';
import type { TftGameState } from '../types/tft';
import { ChampionIcon, ItemIcon, champName } from './GameIcon';
import { Tooltip } from './ui/Tooltip';

const LEVELS = [3, 4, 5, 6, 7, 8, 9];

/**
 * Mock Mode test simulator: a small floating "Test Simulator" button that opens a drawer
 * over the bottom of the overlay. Closed by default so it never clutters the real UI.
 * Must be rendered inside a `relative` container.
 */
export function SimulatorBar({ state }: { state: TftGameState }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute right-3 bottom-8 z-20 rounded-full border border-sky-400/40 bg-sky-950/90 px-2.5 py-1 text-[10px] font-bold text-sky-200 shadow-lg backdrop-blur transition hover:bg-sky-900"
      >
        🧪 Test Simulator
      </button>
    );
  }

  return (
    <>
      <div className="absolute inset-0 z-20 bg-black/40" onClick={() => setOpen(false)} />
      <section className="absolute inset-x-1.5 bottom-1.5 z-30 max-h-[70%] overflow-y-auto rounded-xl border border-sky-400/30 bg-slate-950/95 text-[10px] shadow-2xl backdrop-blur">
        <div className="sticky top-0 flex items-center justify-between border-b border-white/10 bg-slate-950/95 px-3 py-2">
          <span className="font-bold uppercase tracking-wider text-sky-300">🧪 Test Simulator</span>
          <button className="rounded px-1.5 text-[12px] text-slate-400 hover:bg-white/10 hover:text-white" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
        <SimulatorControls state={state} />
      </section>
    </>
  );
}

function SimulatorControls({ state }: { state: TftGameState }) {
  const dd = useDdragon();
  const [pick, setPick] = useState('');

  const champions = useMemo(
    () =>
      dd
        ? Object.values(dd.champions)
            .filter((c) => c.set === dd.currentSet && c.cost >= 1 && c.cost <= 5)
            .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name))
        : [],
    [dd],
  );

  const itemCount = (id: string) => state.items.filter((i) => i === id).length;
  const units = [...state.board, ...state.bench];

  return (
    <div className="flex flex-col gap-2.5 p-3">
      <Row label="Level">
        <div className="flex gap-1">
          {LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => mockActions.setLevel(l)}
              className={`h-6 w-7 rounded font-bold ${
                state.level === l ? 'bg-amber-400 text-slate-950' : 'bg-white/10 text-slate-300 hover:bg-white/20'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </Row>

      <Row label="Components" hint="Click to add · right-click to remove">
        <div className="flex flex-wrap gap-1">
          {COMPONENTS.map((c) => {
            const n = itemCount(c.id);
            return (
              <button
                key={c.id}
                className="relative rounded hover:bg-white/10"
                onClick={() => mockActions.addItem(c.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  mockActions.removeItem(c.id);
                }}
              >
                <ItemIcon id={c.id} size={24} className={n ? '' : 'opacity-40'} />
                {n > 0 && (
                  <span className="absolute -right-1 -bottom-1 rounded bg-slate-950 px-0.5 text-[8px] font-bold text-amber-200 ring-1 ring-white/10">
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Row>

      <Row label="Champions" hint="Click a unit to cycle ★ · right-click to remove">
        <div className="flex gap-1">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="h-6 min-w-0 flex-1 rounded bg-slate-800 px-1 text-[11px] text-slate-200 outline-none"
          >
            <option value="">Add champion…</option>
            {champions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.cost}g · {c.name}
              </option>
            ))}
          </select>
          <button
            disabled={!pick}
            onClick={() => pick && mockActions.addUnit(pick)}
            className="h-6 rounded bg-sky-500/30 px-2.5 font-bold text-sky-200 enabled:hover:bg-sky-500/50 disabled:opacity-40"
          >
            Add
          </button>
        </div>
        {units.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {units.map((u) => (
              <Tooltip key={u.id} content={`${champName(u.id)} ${'★'.repeat(u.star)} — click: cycle ★ · right-click: remove`}>
                <button
                  className="flex flex-col items-center"
                  onClick={() => mockActions.cycleStar(u.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    mockActions.removeUnit(u.id);
                  }}
                >
                  <ChampionIcon id={u.id} size={26} />
                  <span className="text-[8px] leading-tight text-amber-300">{'★'.repeat(u.star)}</span>
                </button>
              </Tooltip>
            ))}
          </div>
        )}
      </Row>

      <Row label="Lobby">
        <div className="flex items-center gap-1">
          <span className="text-slate-400">{state.opponents.length} simulated opponents</span>
          <button className="ml-auto rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={mockActions.reshuffleLobby}>
            Reshuffle
          </button>
          <button className="rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={mockActions.reset}>
            Reset all
          </button>
        </div>
      </Row>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <span className="font-bold uppercase tracking-wider text-slate-400">{label}</span>
        {hint && <span className="text-[9px] text-slate-600">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
