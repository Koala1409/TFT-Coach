import { useState, type ReactNode } from 'react';
import { lookupRecipeByResult } from '../data/itemRecipes';
import { useDdragon } from '../hooks/useDdragon';
import { COST_RING } from '../shared/costColors';
import {
  getChampion,
  getItem,
  getItemIconUrl,
  getSpriteUrl,
  getTrait,
  getTraitIconUrl,
} from '../services/ddragonService';
import { Tooltip } from './ui/Tooltip';

interface IconProps {
  size?: number;
  className?: string;
}

/** Text tile shown while Data Dragon loads or when an id is unknown. */
function Fallback({ label, size, className = '' }: { label: string; size: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded bg-slate-700/80 text-[9px] font-semibold text-slate-300 ${className}`}
      style={{ width: size, height: size }}
    >
      {label.replace(/^\w+?_(\d+_)?/, '').slice(0, 3)}
    </span>
  );
}

function ImgIcon({ src, label, size, className = '' }: { src?: string; label: string; size: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <Fallback label={label} size={size} className={className} />;
  return (
    <img
      src={src}
      alt={label}
      width={size}
      height={size}
      draggable={false}
      decoding="async"
      onError={() => setBroken(true)}
      className={`shrink-0 rounded ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export const itemName = (id: string) => getItem(id)?.name ?? id.replace(/^\w+?_(Item_|Component_)?/, '');
export const champName = (id: string) => getChampion(id)?.name ?? id.replace(/^\w+?_(\d+_)?/, '');

/** Tooltip body for an item: name, and its recipe when it is a standard combined item. */
export function ItemTooltip({ id, extra }: { id: string; extra?: ReactNode }) {
  const recipe = lookupRecipeByResult(id);
  return (
    <div>
      <div className="font-semibold">{itemName(id)}</div>
      {recipe && (
        <div className="mt-1 flex items-center gap-1 text-slate-400">
          <ItemIcon id={recipe.a} size={16} tooltip={false} />
          <span>{itemName(recipe.a)}</span>
          <span>+</span>
          <ItemIcon id={recipe.b} size={16} tooltip={false} />
          <span>{itemName(recipe.b)}</span>
        </div>
      )}
      {extra}
    </div>
  );
}

export function ItemIcon({ id, size = 28, className, tooltip = true }: IconProps & { id: string; tooltip?: boolean }) {
  useDdragon();
  const icon = <ImgIcon src={getItemIconUrl(id)} label={itemName(id)} size={size} className={className} />;
  return tooltip ? <Tooltip content={<ItemTooltip id={id} />}>{icon}</Tooltip> : icon;
}

export function TraitIcon({ id, size = 20, className }: IconProps & { id: string }) {
  useDdragon();
  const trait = getTrait(id);
  return <ImgIcon src={getTraitIconUrl(id)} label={trait?.name ?? id} size={size} className={className} />;
}

/** Champion portrait from the 48×48 Data Dragon sprite sheet, ringed by cost colour. */
export function ChampionIcon({ id, size = 36, className = '', ring = true }: IconProps & { id: string; ring?: boolean }) {
  useDdragon();
  const champ = getChampion(id);
  const sheet = champ && getSpriteUrl(champ.sprite.sheet);
  if (!champ || !sheet) return <Fallback label={id} size={size} className={className} />;
  const { x, y, w, h } = champ.sprite;
  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden ${ring ? `rounded ring-2 ${COST_RING[champ.cost] ?? 'ring-slate-600'}` : ''} ${className}`}
      style={{ width: size, height: size }}
    >
      <span
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: w,
          height: h,
          backgroundImage: `url(${sheet})`,
          backgroundPosition: `-${x}px -${y}px`,
          transform: `scale(${size / w}, ${size / h})`,
        }}
      />
    </span>
  );
}

/**
 * Portrait + name underneath (always visible), cost-coloured ring, optional star pips
 * and a corner badge. The standard way to show a champion anywhere in the overlay.
 */
export function ChampionTile({
  id,
  size = 34,
  star,
  badge,
  dim = false,
  tooltip,
}: {
  id: string;
  size?: number;
  star?: number;
  badge?: ReactNode;
  dim?: boolean;
  tooltip?: ReactNode;
}) {
  useDdragon();
  const champ = getChampion(id);
  const tile = (
    <span className="flex flex-col items-center" style={{ width: size + 14 }}>
      <span className={`relative mt-0.5 ${dim ? 'opacity-45 grayscale-[60%]' : ''}`}>
        <ChampionIcon id={id} size={size} />
        {badge && <span className="absolute -top-1.5 -right-2">{badge}</span>}
        {star && star > 1 ? (
          <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-sm bg-slate-950/90 px-0.5 text-[8px] leading-none text-amber-300">
            {'★'.repeat(star)}
          </span>
        ) : null}
      </span>
      <span className={`mt-1.5 w-full truncate text-center text-[10px] leading-tight font-medium ${dim ? 'text-slate-500' : 'text-slate-200'}`}>
        {champName(id)}
      </span>
    </span>
  );
  return (
    <Tooltip
      content={
        tooltip ?? (
          <span>
            <b>{champ?.name ?? id}</b> <span className="text-slate-400">· {champ?.cost ?? '?'}-cost</span>
          </span>
        )
      }
    >
      {tile}
    </Tooltip>
  );
}
