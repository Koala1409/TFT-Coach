import { useEffect, useState } from 'react';
import { WINDOWS } from '../../shared/constants';
import { isOverwolf, isTftGame, ow } from '../../shared/overwolf';

type Status = 'browser' | 'waiting' | 'running';

const STATUS_LABEL: Record<Status, { text: string; dot: string }> = {
  browser: { text: 'Browser dev mode (no Overwolf)', dot: 'bg-sky-400' },
  waiting: { text: 'Waiting for TFT…', dot: 'bg-amber-400' },
  running: { text: 'TFT detected — overlay active', dot: 'bg-emerald-400' },
};

export function DesktopApp() {
  const [status, setStatus] = useState<Status>(isOverwolf() ? 'waiting' : 'browser');
  const [hotkey, setHotkey] = useState('Alt+X');

  useEffect(() => {
    if (!isOverwolf()) return;
    void ow.toggleHotkey().then(setHotkey);
    void ow.runningGame().then((g) => setStatus(isTftGame(g) ? 'running' : 'waiting'));
    const onGame = (e: Overwolf.GameInfoUpdatedEvent) =>
      setStatus(isTftGame(e.gameInfo) ? 'running' : 'waiting');
    overwolf.games.onGameInfoUpdated.addListener(onGame);
    return () => overwolf.games.onGameInfoUpdated.removeListener(onGame);
  }, []);

  const openPreview = () => {
    if (isOverwolf()) void ow.show(WINDOWS.overlayPreview);
    else window.open('/in_game.html', '_blank', 'width=350,height=720');
  };

  const s = STATUS_LABEL[status];

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-200">
      {/* Custom title bar (Overwolf windows are frameless) */}
      <header
        className="flex h-9 shrink-0 items-center justify-between border-b border-white/5 bg-slate-900 pl-3"
        onMouseDown={() => void ow.dragCurrent()}
      >
        <span className="text-xs font-semibold tracking-wide text-amber-300">TFT OVERLAY</span>
        {isOverwolf() && (
          <div className="flex" onMouseDown={(e) => e.stopPropagation()}>
            <button
              className="h-9 w-10 text-slate-400 hover:bg-white/5"
              onClick={() => void ow.hide(WINDOWS.desktop)}
              title="Minimize"
            >
              –
            </button>
            <button
              className="h-9 w-10 text-slate-400 hover:bg-red-600 hover:text-white"
              onClick={() => void ow.close(WINDOWS.desktop)}
              title="Close"
            >
              ✕
            </button>
          </div>
        )}
      </header>

      <main className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
          {s.text}
        </div>

        <div className="rounded-md border border-white/5 bg-white/[0.03] p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Toggle overlay</span>
            <kbd className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-amber-200">{hotkey}</kbd>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            The overlay opens automatically when a TFT match starts.
          </p>
        </div>

        <button
          className="mt-auto rounded-md bg-amber-500 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          onClick={openPreview}
        >
          Launch overlay (test mode)
        </button>
      </main>
    </div>
  );
}
