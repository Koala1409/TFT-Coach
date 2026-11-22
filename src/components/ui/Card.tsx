import type { ReactNode } from 'react';

/** Compact content card used to group overlay sections. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-white/[0.07] bg-white/[0.035] ${className}`}>{children}</section>;
}

export function CardHeader({ title, right, className = '' }: { title: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between px-2.5 pt-2 pb-1.5 ${className}`}>
      <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{title}</h2>
      {right}
    </div>
  );
}

export function SubLabel({ children }: { children: ReactNode }) {
  return <h3 className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">{children}</h3>;
}
