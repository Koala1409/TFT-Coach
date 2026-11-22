import { useDdragon } from '../hooks/useDdragon';
import { ITEM_ROLE_LABEL } from '../types/comps';
import type { EquipReason, SlamPlan, SlamSuggestion } from '../utils/slamAdvisor';
import { ChampionIcon, ItemIcon, champName, itemName } from './GameIcon';
import { ROLE_BG, ROLE_TEXT } from './ItemizedGrid';
import { Tooltip } from './ui/Tooltip';

const MAX_EXTRA = 2;

function reasonText(s: SlamSuggestion): string {
  const target = champName(s.target);
  const map: Record<EquipReason, string> = {
    'target-owned': `${ITEM_ROLE_LABEL[s.role]} · you own ${target}`,
    late: `${ITEM_ROLE_LABEL[s.role]} · late game — put it on ${target}`,
    holder: `Item holder until you find ${target}`,
    'stand-in': `Frontline stand-in until you find ${target}`,
    hold: `Keep on bench until you find ${target}`,
  };
  return map[s.reason];
}

/**
 * "RECOMMENDED SLAM" — what to craft (or equip) right now and on whom, for the active comp.
 * Phase-aware: item holder / stand-in in Lvl 3–7 when the target isn't owned, the target itself otherwise.
 */
export function SlamCallout({ plan, compName }: { plan: SlamPlan; compName?: string }) {
  useDdragon();
  const [top, ...rest] = plan.suggestions;

  if (!top) {
    if (!plan.nextNeed) return null;
    const n = plan.nextNeed;
    return (
      <div className="mt-2 flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-black/25 px-2 py-1.5 text-[10px] text-slate-400">
        <span className="font-bold uppercase tracking-wider text-slate-500">Next</span>
        <ItemIcon id={n.need} size={16} />
        <span>
          Need <b className="text-slate-200">{itemName(n.need)}</b> for <b className="text-slate-200">{itemName(n.item)}</b> ({champName(n.target)})
        </span>
      </div>
    );
  }

  const equipOnTarget = top.equipOn === top.target;
  return (
    <div className="mt-2 rounded-lg border border-amber-300/40 bg-gradient-to-r from-amber-400/15 to-amber-400/[0.03] p-2 shadow-[0_0_14px_rgba(251,191,36,0.12)]">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-[0.14em] text-amber-300">
          ⚡ Recommended {top.kind === 'craft' ? 'slam' : 'equip'}
        </span>
        {compName && <span className="truncate pl-2 text-[9px] text-slate-500">for {compName}</span>}
      </div>

      <div className="flex items-center gap-2">
        {/* Item (+ recipe) */}
        <Tooltip content={<span>{top.kind === 'craft' ? 'Combine' : 'Already built — on your bench'}</span>}>
          <span className="flex items-center gap-1">
            <ItemIcon id={top.item} size={30} className="ring-2 ring-amber-400" tooltip={false} />
            {top.components && (
              <span className="flex flex-col gap-px">
                <ItemIcon id={top.components[0]} size={13} tooltip={false} />
                <ItemIcon id={top.components[1]} size={13} tooltip={false} />
              </span>
            )}
          </span>
        </Tooltip>

        <span className="text-[14px] font-bold text-amber-300">→</span>

        {/* Who gets it now */}
        <span className="relative shrink-0">
          <ChampionIcon id={top.equipOn} size={30} />
          {!equipOnTarget && (
            <span className="absolute -right-1.5 -bottom-1.5 rounded-full bg-slate-950 p-px ring-1 ring-white/20" title={`Final: ${champName(top.target)}`}>
              <ChampionIcon id={top.target} size={13} ring={false} className="block rounded-full" />
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[12px] font-bold text-slate-50">
            {top.kind === 'craft' ? 'Craft' : 'Equip'} {itemName(top.item)}
          </div>
          <div className="truncate text-[11px] text-slate-200">
            → Equip on <b className="text-amber-200">{champName(top.equipOn)}</b>
            {top.reason === 'holder' && <span className="text-slate-400"> (Item Holder)</span>}
          </div>
          <div className={`truncate text-[9px] font-semibold ${ROLE_TEXT[top.role]}`}>{reasonText(top)}</div>
        </div>
      </div>

      {rest.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5 border-t border-amber-300/15 pt-1.5">
          {rest.slice(0, MAX_EXTRA).map((s) => (
            <li key={s.item + s.equipOn} className="flex items-center gap-1.5 text-[10px] text-slate-300">
              <span className={`rounded-sm px-1 text-[7px] font-black uppercase ${ROLE_BG[s.role]}`}>{ITEM_ROLE_LABEL[s.role]}</span>
              <ItemIcon id={s.item} size={16} />
              <span className="truncate">{itemName(s.item)}</span>
              <span className="text-slate-500">→</span>
              <ChampionIcon id={s.equipOn} size={16} />
              <span className="truncate">
                {champName(s.equipOn)}
                {s.reason === 'holder' && <span className="text-slate-500"> (holder)</span>}
              </span>
            </li>
          ))}
          {rest.length > MAX_EXTRA && <li className="text-[9px] text-slate-500">+{rest.length - MAX_EXTRA} more BiS crafts available</li>}
        </ul>
      )}
    </div>
  );
}
