import type { ReactNode } from 'react';
import { isOverwolf } from '../../shared/overwolf';

/**
 * Inside Overwolf the window itself is the frame. In a desktop browser (npm run dev) the
 * overlay is shown as a centred card at its real window size instead of stretching across
 * a 1080p/1440p monitor.
 */
export function BrowserFrame({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  if (isOverwolf()) return <>{children}</>;
  return (
    <div className="fixed inset-0 overflow-auto bg-[radial-gradient(ellipse_at_top,#1e293b_0%,#020617_70%)]">
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
          style={{ width, height }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
