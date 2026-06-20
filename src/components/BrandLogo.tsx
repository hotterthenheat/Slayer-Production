import React from 'react';

export function TerminalLogo() {
  return (
    <div className="relative flex items-center font-mono select-none text-[32px] leading-none">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-white/10 blur-[15px] rounded-full z-0" />
      <span className="text-[#6B7177] font-semibold mr-[0.02em] translate-y-[-1px] scale-y-[1.1] text-[0.9em] relative z-10">&gt;</span>
      <span className="text-[#ffffff] font-[900] mr-[0.1em] tracking-tighter relative z-10">S</span>
      <span className="w-[0.3em] h-[0.95em] bg-[#ffffff] shadow-[0_0_15px_rgba(255,255,255,0.7)] animate-caret relative z-10" />
    </div>
  );
}

export function BrandHeader({ expanded = true }: { expanded?: boolean }) {
  return (
    <div className="flex items-center gap-4 group w-max">
      <TerminalLogo />
    </div>
  );
}

