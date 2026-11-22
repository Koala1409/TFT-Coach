import { useEffect, useMemo, useState } from 'react';
import { useDdragon } from '../hooks/useDdragon';
import { getTrait } from '../services/ddragonService';
import { lockedCompStore } from '../state/lockedComp';
import type { Comp, Phase, PhaseGuide } from '../types/comps';
import type { TftGameState } from '../types/tft';
import { matchComp, phaseForLevel, playerUnits } from '../utils/compMatcher';
import { ContestBadge, CornerBadge, PlaystyleTag, TierBadge } from './badges';
import { ChampionTile, ItemIcon, TraitIcon, champName } from './GameIcon';
import { HexBoard } from './HexBoard';
import { ItemizedGrid } from './ItemizedGrid';
import { SubLabel } from './ui/Card';

const TABS: { phase: Phase; label: string; levels: string }[] = [
  { phase: 'early', label: 'Early', levels: 'Lvl 3–5' },
  { phase: 'mid', label: 'Mid', levels: 'Lvl 6–7' },
  { phase: 'late', label: 'Late', levels: 'Lvl 8+' },
];

/** Mode B — phase-by-phase guide for the locked-in comp. */
export function LevelingCoach({ comp, state }: { comp: Comp; state: TftGameState }) {
  useDdragon();
  const autoPhase = phaseForLevel(state.level);
  const [manual, setManual] = useState<Phase | null>(null);
  // Follow the player's level again whenever it crosses into a new phase.
  useEffect(() => setManual(null), [autoPhase]);
  const phase = manual ?? autoPhase;

  const match = useMemo(() => matchComp(comp, state), [comp, state]);
  const owned = useMemo(() => playerUnits(state), [state]);
  const guide = comp.phases[phase];

  return (
    <div className="flex flex-col">
      {/* Active comp header */}
      <div className="px-2.5 pt-2.5">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-amber-300/80">Active comp</div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <TierBadge tier={comp.tier} />
              <span className="truncate text-[15px] font-bold leading-tight">{comp.name}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <PlaystyleTag playstyle={comp.playstyle} />
              <ContestBadge contest={match.contest} />
              <span className="text-[10px] font-bold text-slate-300">{match.matchScore}% match</span>
            </div>
          </div>
          <button
            className="self-start rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-bold text-slate-300 transition hover:border-amber-300/60 hover:text-amber-200"
            onClick={() => lockedCompStore.set(null)}
          >
            ⟲ Pivot
          </button>
        </div>

        {/* Itemized champions: carry, tank, duo, utility */}
        <div className="mt-2.5">
          <ItemizedGrid sets={comp.core_items} owned={owned} builtItems={match.completedOwned} />
        </div>
      </div>

      {/* Phase tabs */}
      <div className="mx-2.5 mt-2.5 grid grid-cols-3 gap-1 rounded-lg bg-black/30 p-0.5">
        {TABS.map((t) => (
          <button
            key={t.phase}
            onClick={() => setManual(t.phase === autoPhase ? null : t.phase)}
            className={`rounded-md px-1 py-1 text-center transition ${
              phase === t.phase ? 'bg-amber-400/90 text-slate-950 shadow' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
            }`}
          >
            <div className="text-[11px] font-bold leading-tight">
              {t.label}
              {t.phase === autoPhase && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" title="Your current level" />}
            </div>
            <div className={`text-[9px] leading-tight ${phase === t.phase ? 'text-slate-800' : 'text-slate-500'}`}>{t.levels}</div>
          </button>
        ))}
      </div>

      <PhaseView guide={guide} comp={comp} owned={owned} />
    </div>
  );
}

function PhaseView({ guide, comp, owned }: { guide: PhaseGuide; comp: Comp; owned: Map<string, number> }) {
  const holder = guide.item_holder?.unit;
  const ownedCount = guide.units.filter((u) => owned.has(u)).length;

  return (
    <div className="flex flex-col gap-3 px-2.5 py-2.5">
      {/* Positioning */}
      <section className="rounded-lg bg-black/25 py-2">
        <HexBoard units={guide.units} frontline={guide.frontline} carry={comp.carry} tank={comp.tank} holder={holder} owned={owned} />
      </section>

      {/* Units to buy */}
      <section>
        <div className="flex items-baseline justify-between">
          <SubLabel>
            Buy · Stage {guide.stage}
          </SubLabel>
          <span className="text-[10px] text-slate-500">
            {ownedCount}/{guide.units.length} owned
          </span>
        </div>
        <div className="grid grid-cols-6 gap-y-1.5">
          {guide.units.map((id) => (
            <ChampionTile
              key={id}
              id={id}
              size={32}
              star={owned.get(id)}
              dim={!owned.has(id)}
              badge={
                id === holder ? <CornerBadge>Items</CornerBadge> : id === comp.carry ? <CornerBadge>Carry</CornerBadge> : undefined
              }
            />
          ))}
        </div>
      </section>

      {/* Item holder */}
      {guide.item_holder && (
        <section className="rounded-lg border border-amber-300/25 bg-amber-300/[0.06] p-2">
          <div className="flex items-center gap-2">
            <ChampionTile id={guide.item_holder.unit} size={30} star={owned.get(guide.item_holder.unit)} />
            <div className="min-w-0 flex-1">
              <CornerBadge>Item holder</CornerBadge>
              <div className="mt-1 flex flex-wrap gap-1">
                {guide.item_holder.items.map((id) => (
                  <ItemIcon key={id} id={id} size={24} />
                ))}
              </div>
            </div>
          </div>
          {guide.item_holder.note && <p className="mt-1.5 text-[11px] leading-snug text-slate-300">{guide.item_holder.note}</p>}
        </section>
      )}

      {/* Late: item transfers */}
      {guide.item_transfers && (
        <section>
          <SubLabel>Item transfer</SubLabel>
          {guide.item_transfers.length === 0 ? (
            <p className="text-[11px] text-slate-400">No transfer — items stay on {champName(comp.carry)}.</p>
          ) : (
            guide.item_transfers.map((t) => (
              <div key={t.from + t.to} className="flex items-center gap-1.5 rounded-md bg-black/25 p-1.5">
                <span className="text-[10px] font-bold uppercase text-red-300">Sell</span>
                <ChampionTile id={t.from} size={26} />
                <span className="text-slate-500">→</span>
                <ChampionTile id={t.to} size={26} />
                <span className="ml-auto flex gap-0.5">
                  {t.items.map((i) => (
                    <ItemIcon key={i} id={i} size={20} />
                  ))}
                </span>
              </div>
            ))
          )}
        </section>
      )}

      {/* Late: synergies */}
      {guide.synergies && (
        <section>
          <SubLabel>Synergy targets</SubLabel>
          <div className="flex flex-wrap gap-1.5">
            {guide.synergies.map((s) => (
              <span key={s.trait} className="flex items-center gap-1 rounded-md bg-white/[0.06] py-0.5 pr-2 pl-0.5 text-[11px]">
                <TraitIcon id={s.trait} size={18} className="bg-slate-800 p-px" />
                <b className="text-amber-200">{s.count}</b> {getTrait(s.trait)?.name ?? s.trait}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Tips */}
      <section className="flex flex-col gap-1.5 rounded-lg bg-black/25 p-2 text-[11px] leading-snug">
        <Tip label="Tip" text={guide.tip} />
        {guide.rolldown && <Tip label="Roll" text={guide.rolldown} />}
        {guide.econ && <Tip label="Econ" text={guide.econ} />}
      </section>
    </div>
  );
}

const Tip = ({ label, text }: { label: string; text: string }) => (
  <p className="flex gap-1.5">
    <span className="h-fit w-9 shrink-0 rounded bg-sky-400/15 py-px text-center text-[9px] font-bold uppercase text-sky-300">{label}</span>
    <span className="text-slate-300">{text}</span>
  </p>
);
