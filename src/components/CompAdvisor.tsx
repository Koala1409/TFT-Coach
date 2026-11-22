import { useMemo } from 'react';
import { useDdragon } from '../hooks/useDdragon';
import { lockedCompStore } from '../state/lockedComp';
import type { TftGameState } from '../types/tft';
import type { CompMatch } from '../utils/compMatcher';
import { compReasons } from '../utils/compReasons';
import { PlaystyleTag, ReasonTag, TierBadge } from './badges';
import { ChampionTile, ItemIcon } from './GameIcon';
import { CardHeader } from './ui/Card';

/** Mode A — top 4 comps for the current state. Click a card to lock it in. */
export function CompAdvisor({ matches }: { matches: CompMatch[]; state?: TftGameState }) {
  useDdragon();
  return (
    <div>
      <CardHeader title="Recommended comps" right={<span className="text-[10px] text-slate-500">Click to lock in</span>} />
      <ul className="flex flex-col gap-2 px-2 pb-2">
        {matches.map((m, i) => (
          <CompCard key={m.comp.id} match={m} rank={i + 1} />
        ))}
      </ul>
    </div>
  );
}

function CompCard({ match: m, rank }: { match: CompMatch; rank: number }) {
  const reasons = useMemo(() => compReasons(m), [m]);
  const scoreColor = m.matchScore >= 70 ? 'bg-emerald-400' : m.matchScore >= 45 ? 'bg-amber-400' : 'bg-slate-500';
  const scoreText = m.matchScore >= 70 ? 'text-emerald-300' : m.matchScore >= 45 ? 'text-amber-200' : 'text-slate-300';

  return (
    <li>
      <button
        className={`group w-full rounded-lg border p-2 text-left transition hover:border-amber-300/50 hover:bg-white/[0.06] ${
          rank === 1 ? 'border-amber-300/25 bg-amber-300/[0.04]' : 'border-white/[0.07] bg-black/20'
        }`}
        onClick={() => lockedCompStore.set(m.comp.id)}
      >
        <div className="flex items-start gap-2">
          <ChampionTile id={m.comp.carry} size={38} />
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-1.5">
              <TierBadge tier={m.comp.tier} />
              <span className="truncate text-[14px] font-bold leading-tight">{m.comp.name}</span>
            </div>
            <div className="mt-1">
              <PlaystyleTag playstyle={m.comp.playstyle} />
            </div>
          </div>
          <div className="w-14 pt-0.5 text-right">
            <div className={`text-[18px] font-black leading-none tabular-nums ${scoreText}`}>{m.matchScore}%</div>
            <div className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-500">match</div>
            <div className="mt-0.5 h-1 overflow-hidden rounded bg-white/10">
              <div className={`h-full ${scoreColor}`} style={{ width: `${m.matchScore}%` }} />
            </div>
          </div>
        </div>

        {/* Why this comp? */}
        <div className="mt-2 flex flex-wrap gap-1">
          {reasons.map((r) => (
            <ReasonTag key={r.label} reason={r} />
          ))}
        </div>

        {/* Components: owned → still needed */}
        <div className="mt-2 flex items-center gap-1 border-t border-white/[0.06] pt-1.5">
          <span className="mr-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">Items</span>
          {m.completedOwned.map((id, i) => (
            <ItemIcon key={`c${i}`} id={id} size={18} className="ring-1 ring-emerald-400" />
          ))}
          {m.ownedComponents.map((id, i) => (
            <ItemIcon key={`o${i}`} id={id} size={18} className="ring-1 ring-emerald-400/70" />
          ))}
          {m.missingComponents.length > 0 && <span className="mx-0.5 text-[10px] text-slate-600">→</span>}
          {m.missingComponents.slice(0, 7).map((id, i) => (
            <ItemIcon key={`m${i}`} id={id} size={18} className="opacity-35 grayscale" />
          ))}
          {m.missingComponents.length > 7 && <span className="text-[9px] text-slate-500">+{m.missingComponents.length - 7}</span>}
          <span className="ml-auto text-[10px] font-semibold text-amber-300 opacity-0 transition group-hover:opacity-100">Lock in ›</span>
        </div>
      </button>
    </li>
  );
}
