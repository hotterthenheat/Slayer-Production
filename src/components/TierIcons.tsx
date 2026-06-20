import React from 'react';
import { Sparkles } from 'lucide-react';

export const WoodenSword = ({ className = "" }: { className?: string }) => (
  <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={`opacity-80 rotate-12 transition-all duration-300 ${className}`}>
    <path d="M16 38L38 16" stroke="#8B5A2B" strokeWidth="4" strokeLinecap="round"/>
    <path d="M12 42L18 36" stroke="#5C4033" strokeWidth="5" strokeLinecap="round"/>
    <path d="M10 38L16 44" stroke="#5C4033" strokeWidth="4" strokeLinecap="round"/>
    <path d="M34 12L42 20M34 12L38 16M42 20L38 16" stroke="#8B5A2B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const NeedleSword = ({ className = "" }: { className?: string }) => (
  <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={`opacity-80 rotate-12 transition-all duration-300 ${className}`}>
    <path d="M16 38L42 12" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M12 42L18 36" stroke="#4B5563" strokeWidth="3" strokeLinecap="round"/>
    <circle cx="12" cy="42" r="2.5" fill="#1F2937"/>
    <path d="M14 34L20 40" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const ValyrianSword = ({ className = "" }: { className?: string }) => (
  <div className={`relative flex items-center justify-center rotate-12 transition-all duration-300 ${className}`}>
    <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative z-10">
      <defs>
        <linearGradient id="valyrian" x1="16" y1="38" x2="42" y2="12" gradientUnits="userSpaceOnUse">
          <stop stopColor="#94A3B8" />
          <stop offset="0.3" stopColor="#334155" />
          <stop offset="0.6" stopColor="#CBD5E1" />
          <stop offset="1" stopColor="#1E293B" />
        </linearGradient>
      </defs>
      <path d="M16 38L42 12" stroke="url(#valyrian)" strokeWidth="4" strokeLinecap="round"/>
      <path d="M12 42L18 36" stroke="#0F172A" strokeWidth="6" strokeLinecap="round"/>
      <path d="M10 36L18 44" stroke="#475569" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="12" cy="42" r="3" fill="#020617"/>
      <path d="M24 30C26 28 28 28 30 26" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      <path d="M29 25C31 23 33 23 35 21" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
    </svg>
    <div className="absolute inset-0 z-20 animate-sparkle-1">
      <Sparkles className="w-2.5 h-2.5 text-slate-200 absolute -top-1 -right-1" />
      <Sparkles className="w-1.5 h-1.5 text-blue-200 absolute top-2 right-2" />
    </div>
  </div>
);

export const CuteScythe = ({ className = "" }: { className?: string }) => (
  <div className={`relative flex items-center justify-center rotate-12 transition-all duration-300 ${className}`}>
    <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative z-10">
      <path d="M10 40L30 20" stroke="#4C1D95" strokeWidth="3" strokeLinecap="round"/>
      <path d="M28 18C26 10 16 8 12 10C22 14 24 22 24 26" fill="#C4B5FD"/>
      <path d="M12 10C22 14 24 22 24 26" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="10" cy="40" r="2.5" fill="#5B21B6"/>
      <path d="M8 38L12 42" stroke="#4C1D95" strokeWidth="2" strokeLinecap="round"/>
    </svg>
    <div className="absolute inset-0 z-20 animate-sparkle-2">
      <Sparkles className="w-2.5 h-2.5 text-violet-300 absolute -top-1 -right-1" />
      <Sparkles className="w-1.5 h-1.5 text-fuchsia-300 absolute top-2 right-1" />
    </div>
  </div>
);

export const InfinityCrown = ({ className = "" }: { className?: string }) => (
  <div className={`relative flex items-center justify-center rotate-12 transition-all duration-300 ${className}`}>
    <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative z-10">
      <path d="M8 38L14 20L24 30L34 20L40 38H8Z" fill="url(#goldGradient)"/>
      <path d="M8 38L14 20L24 30L34 20L40 38H8Z" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="14" cy="20" r="2.5" fill="#FCD34D"/>
      <circle cx="24" cy="30" r="3" fill="#FDE68A"/>
      <circle cx="34" cy="20" r="2.5" fill="#FCD34D"/>
      <defs>
        <linearGradient id="goldGradient" x1="8" y1="20" x2="40" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B45309" />
          <stop offset="0.5" stopColor="#F59E0B" />
          <stop offset="1" stopColor="#FEF3C7" />
        </linearGradient>
      </defs>
    </svg>
    <div className="absolute inset-0 z-20 animate-sparkle-3">
      <Sparkles className="w-2.5 h-2.5 text-yellow-300 absolute -top-1 -right-1" />
      <Sparkles className="w-1.5 h-1.5 text-amber-300 absolute top-3 right-1" />
    </div>
  </div>
);
