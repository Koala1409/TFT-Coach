import { useMemo, useState } from 'react';
import { COMPONENTS, SPECIAL_COMPONENT_IDS, craftableFrom, recipesUsing, type Recipe } from '../data/itemRecipes';
import { useDdragon } from '../hooks/useDdragon';
import { getItemRecipe } from '../services/ddragonService';
import { ITEM_ROLE_LABEL } from '../types/comps';
import type { SlamPlan } from '../utils/slamAdvisor';
import { ChampionIcon, ItemIcon, ItemTooltip, champName, itemName } from './GameIcon';
import { ROLE_BG } from './ItemizedGrid';
import { SlamCallout } from './SlamCallout';
import { Card, CardHeader, SubLabel } from './ui/Card';
import { Tooltip } from './ui/Tooltip';

const ORDER: string[] = [...COMPONENTS.map((c) => c.id), ...SPECIAL_COMPONENT_IDS];
const MAX_CRAFTABLE_ICONS = 8;

interface Props {
  /** Component item ids the player currently holds (duplicates = multiple copies). */
  components: readonly string[];
  /** Slam plan for the active (locked or top-recommended) comp — BiS items, targets, suggestions. */
  plan: SlamPlan;
  bisFor?: string;
}

/**
 * Card 2 — your components and what you can craft right now.
 * Hover any icon for its name and recipe; click a component to see everything it builds.
 * Recipes only — no win rates / placement stats (Riot third-party policy).
 */
export function ComponentsBar({ components, plan, bisFor }: Props) {
  const dd = useDdragon();
  const [pinned, setPinned] = useState<string | null>(null);
  const active = pinned && components.includes(pinned) ? pinned : null;
  const bis = useMemo(() => new Set(plan.itemTargets.keys()), [plan]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of components) m.set(id, (m.get(id) ?? 0) + 1);
    return [...m.entries()].sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b));
  }, [components]);

  const valid = (r: Recipe) => getItemRecipe(r.a, r.b) !== undefined;
  // `valid` reads Data Dragon data, so `dd` is a dependency. BiS items first.
  const craftableNow = useMemo(
    () =>
      craftableFrom(components)
        .filter(valid)
        .sort((x, y) => Number(bis.has(y.result)) - Number(bis.has(x.result))),
    [components, dd, bis],
  );

  return (
    <Card>
      <CardHeader
        title="My components"
        right={
          craftableNow.length > 0 && (
            <span className="text-[10px] font-semibold text-emerald-300">{craftableNow.length} craftable</span>
          )
        }
      />
      <div className="px-2.5 pb-2.5">
        {counts.length === 0 ? (
          <p className="text-[11px] text-slate-500">No components on your bench yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {counts.map(([id, n]) => (
              <Tooltip
                key={id}
                content={
                  <span>
                    <b>{itemName(id)}</b>
                    <span className="block text-slate-400">Click to see everything it builds</span>
                  </span>
                }
              >
                <button
                  className={`relative rounded-md p-0.5 transition ${
                    active === id ? 'bg-amber-400/25 ring-1 ring-amber-300' : 'hover:bg-white/10'
                  }`}
                  onClick={() => setPinned((p) => (p === id ? null : id))}
                >
                  <ItemIcon id={id} size={28} tooltip={false} />
                  {n > 1 && (
                    <span className="absolute -right-1 -bottom-1 rounded bg-slate-950 px-1 text-[9px] font-bold leading-tight text-amber-200 ring-1 ring-white/10">
                      ×{n}
                    </span>
                  )}
                </button>
              </Tooltip>
            ))}
          </div>
        )}

        {active ? (
          <RecipeList component={active} counts={new Map(counts)} isValid={valid} bis={bis} onClose={() => setPinned(null)} />
        ) : (
          craftableNow.length > 0 && (
            <div className="mt-2.5">
              <SubLabel>Craftable now{bis.size > 0 && bisFor ? ` · BiS for ${bisFor}` : ''}</SubLabel>
              <div className="flex items-center gap-2.5">
                {craftableNow.slice(0, MAX_CRAFTABLE_ICONS).map((r) => {
                  const target = plan.itemTargets.get(r.result);
                  return (
                    <Tooltip
                      key={r.result}
                      content={
                        <ItemTooltip
                          id={r.result}
                          extra={
                            target && (
                              <div className="mt-1 font-semibold text-amber-300">
                                ★ BiS for {champName(target.unit)} ({ITEM_ROLE_LABEL[target.role]})
                              </div>
                            )
                          }
                        />
                      }
                    >
                      <span className="relative">
                        <ItemIcon
                          id={r.result}
                          size={26}
                          tooltip={false}
                          className={target ? 'ring-2 ring-amber-400' : 'ring-1 ring-emerald-400/40'}
                        />
                        {/* BiS: gold ring + badge of the champion it belongs to (role-coloured) */}
                        {target && (
                          <span className={`absolute -right-1.5 -bottom-1.5 rounded-full p-px ${ROLE_BG[target.role]}`}>
                            <ChampionIcon id={target.unit} size={13} ring={false} className="block rounded-full" />
                          </span>
                        )}
                      </span>
                    </Tooltip>
                  );
                })}
                {craftableNow.length > MAX_CRAFTABLE_ICONS && (
                  <span className="text-[10px] text-slate-400">+{craftableNow.length - MAX_CRAFTABLE_ICONS}</span>
                )}
              </div>
            </div>
          )
        )}
        {!active && <SlamCallout plan={plan} compName={bisFor} />}
      </div>
    </Card>
  );
}

function RecipeList({
  component,
  counts,
  isValid,
  bis,
  onClose,
}: {
  component: string;
  counts: Map<string, number>;
  isValid: (r: Recipe) => boolean;
  bis: Set<string>;
  onClose: () => void;
}) {
  const rows = recipesUsing(component)
    .filter(isValid)
    .map((r) => {
      const partner = r.a === component ? r.b : r.a;
      const ready = partner === component ? (counts.get(component) ?? 0) >= 2 : counts.has(partner);
      return { ...r, partner, ready };
    })
    .sort((x, y) => Number(y.ready) - Number(x.ready) || Number(bis.has(y.result)) - Number(bis.has(x.result)));

  return (
    <div className="mt-2.5">
      <div className="mb-1 flex items-center justify-between">
        <SubLabel>{itemName(component)} builds</SubLabel>
        <button className="text-[10px] text-slate-400 hover:text-slate-100" onClick={onClose}>
          ✕ close
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-slate-500">Combines into set-specific items.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-1">
          {rows.map((r) => (
            <li
              key={r.result}
              className={`flex items-center gap-1.5 rounded px-1 py-0.5 ${r.ready ? 'bg-emerald-400/10' : 'opacity-45'}`}
            >
              <ItemIcon id={r.result} size={20} className={bis.has(r.result) ? 'ring-1 ring-amber-400' : ''} />
              <span className="min-w-0 flex-1 truncate text-[11px] leading-tight">{itemName(r.result)}</span>
              <span className="text-[9px] text-slate-500">+</span>
              <ItemIcon id={r.partner} size={14} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
