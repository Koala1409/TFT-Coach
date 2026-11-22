import type { CompTier } from '../types/comps';
import type { ContestInfo } from '../utils/compMatcher';
import type { Reason, ReasonTone } from '../utils/compReasons';
import { Tooltip } from './ui/Tooltip';

const TIER_STYLE: Record<CompTier, string> = {
  S: 'bg-amber-400 text-slate-950',
  A: 'bg-violet-500 text-white',
  B: 'bg-slate-500 text-white',
};

export function TierBadge({ tier }: { tier: CompTier }) {
  return (
    <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-black ${TIER_STYLE[tier]}`}>
      {tier}
    </span>
  );
}

export function PlaystyleTag({ playstyle }: { playstyle: string }) {
  return (
    <span className="rounded bg-white/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap text-slate-300">
      {playstyle}
    </span>
  );
}

export function ContestBadge({ contest }: { contest: ContestInfo }) {
  const { count, opponents } = contest;
  return (
    <ReasonTag
      reason={
        count === 0
          ? { label: 'Uncontested', tone: 'good', hint: 'No opponent holds the main carry' }
          : { label: `${count} contesting`, tone: count === 1 ? 'warn' : 'bad', hint: `Holding the carry: ${opponents.join(', ')}` }
      }
    />
  );
}

const TONE: Record<ReasonTone, string> = {
  good: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20',
  warn: 'bg-amber-500/15 text-amber-300 ring-amber-400/20',
  bad: 'bg-red-500/15 text-red-300 ring-red-400/25',
  neutral: 'bg-white/[0.06] text-slate-300 ring-white/10',
};

const ICON: Record<ReasonTone, string> = { good: '✓', warn: '!', bad: '✕', neutral: '•' };

export function ReasonTag({ reason }: { reason: Reason }) {
  const tag = (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-[2px] text-[10px] font-semibold whitespace-nowrap ring-1 ring-inset ${TONE[reason.tone]}`}>
      <span className="text-[9px] opacity-80">{ICON[reason.tone]}</span>
      {reason.label}
    </span>
  );
  return reason.hint ? <Tooltip content={reason.hint}>{tag}</Tooltip> : tag;
}

/** Small corner badge for champion tiles. */
export function CornerBadge({ children, tone = 'gold' }: { children: string; tone?: 'gold' | 'red' | 'green' }) {
  const style = tone === 'gold' ? 'bg-amber-400 text-slate-950' : tone === 'red' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-slate-950';
  return <span className={`rounded-sm px-[3px] text-[7px] font-black leading-[11px] uppercase shadow ${style}`}>{children}</span>;
}
