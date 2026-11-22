import { useEffect, useMemo, useState } from 'react';
import { CompAdvisor } from '../../components/CompAdvisor';
import { ComponentsBar } from '../../components/ComponentsBar';
import { Header } from '../../components/Header';
import { LevelingCoach } from '../../components/LevelingCoach';
import { SimulatorBar } from '../../components/SimulatorBar';
import { BrowserFrame } from '../../components/ui/BrowserFrame';
import { Card } from '../../components/ui/Card';
import { isComponent } from '../../data/itemRecipes';
import { useDdragon } from '../../hooks/useDdragon';
import { useMeta } from '../../hooks/useMeta';
import { Tooltip } from '../../components/ui/Tooltip';
import type { MetaState } from '../../services/metaService';
import { WINDOWS } from '../../shared/constants';
import { isOverwolf, ow } from '../../shared/overwolf';
import { subscribeGameState } from '../../services/stateSync';
import { gameStore, useGameState } from '../../state/gameStore';
import { useLockedCompId } from '../../state/lockedComp';
import { getComp, recommendComps } from '../../utils/compMatcher';
import { slamPlan } from '../../utils/slamAdvisor';

/** Overlay window size — keep in sync with public/manifest.json (in_game / overlay_preview). */
export const OVERLAY_WIDTH = 380;
export const OVERLAY_HEIGHT = 720;

/**
 * Mock mode: plain browser, or the desktop "test mode" preview window.
 * Dev: `in_game.html?live` in a browser listens to synced state instead (to test the live pipeline).
 */
async function detectMock(): Promise<boolean> {
  if (!isOverwolf()) return !new URLSearchParams(location.search).has('live');
  return (await ow.currentWindow())?.name === WINDOWS.overlayPreview;
}

export function InGameApp() {
  const [hotkey, setHotkey] = useState('Alt+X');
  const dd = useDdragon();
  const meta = useMeta();
  const state = useGameState();
  const lockedComp = getComp(useLockedCompId());
  const mock = state.source === 'mock';

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void detectMock().then((m) => {
      if (cancelled) return;
      if (m) gameStore.reset('mock');
      // Live: mirror the background window's GEP state.
      else unsubscribe = subscribeGameState((s) => gameStore.set(s));
    });
    if (isOverwolf()) void ow.toggleHotkey().then(setHotkey);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // `dd` / `meta.db` are dependencies: recipe validity and the comp list can change at runtime.
  const matches = useMemo(() => recommendComps(state, 4, meta.db.comps), [state, dd, meta.db]);
  const focusComp = lockedComp ?? matches[0]?.comp;
  // What to craft/equip right now, and on whom (phase-aware), for the active comp.
  const plan = useMemo(() => slamPlan(focusComp, state), [focusComp, state]);
  const components = useMemo(() => state.items.filter(isComponent), [state.items]);

  return (
    <BrowserFrame width={OVERLAY_WIDTH} height={OVERLAY_HEIGHT}>
      <div className="relative flex h-full flex-col p-1.5 font-sans text-slate-100">
        <div className="glass flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden rounded-xl p-1.5">
          <Header state={state} />
          <ComponentsBar components={components} plan={plan} bisFor={focusComp?.name} />

          <Card className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
            {lockedComp ? <LevelingCoach comp={lockedComp} state={state} /> : <CompAdvisor matches={matches} />}
          </Card>

          <footer className="flex justify-between px-1.5 text-[10px] text-slate-500">
            <span>
              <kbd className="rounded bg-white/10 px-1 font-mono text-amber-200/90">{hotkey}</kbd> show / hide
            </span>
            <span className="flex gap-2">
              <MetaBadge meta={meta} />
              <span>{dd ? `Patch ${dd.version}` : 'Loading game data…'}</span>
            </span>
          </footer>
        </div>

        {mock && <SimulatorBar state={state} />}
      </div>
    </BrowserFrame>
  );
}

const ago = (t?: number) => {
  if (!t) return '';
  const h = Math.floor((Date.now() - t) / 3_600_000);
  return h < 1 ? 'just now' : `${h}h ago`;
};

/** Footer badge: where the comp list came from (remote / cache / bundled). */
function MetaBadge({ meta }: { meta: MetaState }) {
  const { db, source, fetchedAt, url } = meta;
  const label = source === 'bundled' ? 'Meta: built-in' : `Meta: ${source === 'remote' ? 'live' : 'cached'} · ${ago(fetchedAt)}`;
  return (
    <Tooltip
      content={
        <span>
          <b>{db.comps.length} comps</b> · Set {db.set} · patch {db.patch}
          {db.generatedAt && <span className="block text-slate-400">Generated {new Date(db.generatedAt).toLocaleString()}</span>}
          <span className="block text-slate-400">{url ?? 'No remote URL configured (VITE_META_URL)'}</span>
        </span>
      }
    >
      <span className={source === 'bundled' ? 'text-slate-500' : 'text-emerald-400/80'}>{label}</span>
    </Tooltip>
  );
}
