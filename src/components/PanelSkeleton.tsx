import React from 'react';

export function PanelSkeleton({ label, rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/40 p-4 flex flex-col gap-3 animate-pulse">
      {label && (
        <span className="text-[10px] font-mono font-black uppercase tracking-[0.2em] text-zinc-500">
          {label}
        </span>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Array.from({ length: rows * 2 }).map((_, i) => (
          <div key={i} className="h-9 rounded-lg bg-white/5" />
        ))}
      </div>
    </div>
  );
}
