/**
 * Human-readable "Why this comp?" tags derived from a CompMatch.
 * Only uses the player's own game state and the lobby — never external stats.
 */
import { getChampion, getItem } from '../services/ddragonService';
import type { CompMatch } from './compMatcher';

export type ReasonTone = 'good' | 'warn' | 'bad' | 'neutral';

export interface Reason {
  label: string;
  tone: ReasonTone;
  hint?: string;
}

const name = (id: string) => getChampion(id)?.name ?? id;

export function compReasons(m: CompMatch): Reason[] {
  const out: Reason[] = [];

  // Items
  if (m.completedOwned.length) {
    const first = getItem(m.completedOwned[0])?.name ?? m.completedOwned[0];
    out.push({
      label: m.completedOwned.length === 1 ? `Built ${first}` : `${m.completedOwned.length} core items built`,
      tone: 'good',
    });
  }
  if (m.playerComponentCount > 0) {
    const used = m.ownedComponents.length;
    const ratio = used / m.playerComponentCount;
    out.push({
      label: `Uses ${used}/${m.playerComponentCount} components`,
      tone: ratio >= 0.75 ? 'good' : ratio >= 0.4 ? 'neutral' : 'warn',
      hint: 'Your loose components that go into this comp’s core items',
    });
  }

  // Units
  const carry = m.ownedUnits.find((u) => u.id === m.comp.carry);
  if (carry) out.push({ label: `Have ${name(carry.id)}${carry.star > 1 ? ` ${'★'.repeat(carry.star)}` : ''}`, tone: 'good' });
  const upgraded = m.ownedUnits.filter((u) => u.star >= 2 && u.id !== m.comp.carry);
  if (upgraded.length) out.push({ label: `${name(upgraded[0].id)} ${'★'.repeat(upgraded[0].star)}`, tone: 'good' });
  const others = m.ownedUnits.length - (carry ? 1 : 0) - (upgraded.length ? 1 : 0);
  if (others > 0) out.push({ label: `+${others} unit${others > 1 ? 's' : ''} owned`, tone: 'neutral' });

  // Lobby
  const { count, opponents } = m.contest;
  out.push(
    count === 0
      ? { label: 'Uncontested', tone: 'good', hint: 'No opponent holds the main carry' }
      : { label: `${count} contesting`, tone: count === 1 ? 'warn' : 'bad', hint: `Holding ${name(m.comp.carry)}: ${opponents.join(', ')}` },
  );

  return out;
}
