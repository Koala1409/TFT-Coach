import { ITEM_ROLE_LABEL, ITEM_ROLE_ORDER, type CoreItemSet, type ItemRole } from '../types/comps';
import { ChampionTile, ItemIcon } from './GameIcon';

export const ROLE_TEXT: Record<ItemRole, string> = {
  carry: 'text-amber-300',
  tank: 'text-sky-300',
  secondary: 'text-rose-300',
  utility: 'text-emerald-300',
};

export const ROLE_BG: Record<ItemRole, string> = {
  carry: 'bg-amber-400 text-slate-950',
  tank: 'bg-sky-400 text-slate-950',
  secondary: 'bg-rose-400 text-slate-950',
  utility: 'bg-emerald-400 text-slate-950',
};

/** Compact 2×2 grid of the comp's itemized champions (carry, tank, duo, utility) and their BiS items. */
export function ItemizedGrid({
  sets,
  owned,
  builtItems,
}: {
  sets: readonly CoreItemSet[];
  owned: Map<string, number>;
  /** Completed items the player already has (for ✓ marks). */
  builtItems: readonly string[];
}) {
  const sorted = [...sets].sort((a, b) => ITEM_ROLE_ORDER.indexOf(a.role) - ITEM_ROLE_ORDER.indexOf(b.role));
  const built = new Map<string, number>();
  for (const id of builtItems) built.set(id, (built.get(id) ?? 0) + 1);

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {sorted.map((set) => (
        <div key={set.role + set.unit} className="flex items-center gap-1 rounded-md bg-black/25 py-1 pr-1 pl-0.5">
          <ChampionTile id={set.unit} size={28} star={owned.get(set.unit)} dim={!owned.has(set.unit)} />
          <div className="min-w-0 flex-1">
            <div className={`truncate text-[8px] font-black uppercase tracking-wider ${ROLE_TEXT[set.role]}`}>{ITEM_ROLE_LABEL[set.role]}</div>
            <div className="mt-0.5 flex gap-0.5">
              {set.items.map((ci) => {
                const n = built.get(ci.item) ?? 0;
                if (n > 0) built.set(ci.item, n - 1);
                return (
                  <span key={ci.item} className="relative">
                    <ItemIcon id={ci.item} size={21} className={n > 0 ? 'ring-2 ring-emerald-400' : 'opacity-80'} />
                    {n > 0 && <span className="absolute -right-1 -bottom-1 text-[9px] font-bold text-emerald-300">✓</span>}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
