/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface MetricCardProps {
  id?: string;
  label: string;
  value: string | number;
  subValue?: string | number;
  type?: 'bullish' | 'bearish' | 'neutral' | 'default';
  className?: string;
  icon?: React.ReactNode;
}

export function MetricCard({
  id,
  label,
  value,
  subValue,
  type = 'default',
  className = '',
  icon,
}: MetricCardProps) {
  const badgeStyles = {
    bullish: 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--success)]',
    bearish: 'border-[var(--danger)]/50 bg-[var(--surface-2)] text-[var(--danger)]',
    neutral: 'border-[var(--warning)]/40 bg-[var(--surface-2)] text-[var(--warning)]',
    default: 'border-[var(--border)] bg-[var(--surface)] text-[var(--success)]',
  };

  return (
    <div
      id={id}
      className={`rounded-sm border p-3 flex flex-col justify-between transition-all duration-300 ${badgeStyles[type]} ${className}`}
    >
      <div className="flex justify-between items-start gap-2">
        <span className="text-[10px] md:text-xs font-medium tracking-tight text-[var(--text-tertiary)] uppercase">
          {label}
        </span>
        {icon && <div className="text-[var(--text-tertiary)]">{icon}</div>}
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-lg md:text-xl font-mono font-bold tracking-tight tabular-nums text-[var(--text-primary)]">
          {value}
        </span>
        {subValue !== undefined && (
          <span className="text-[10px] md:text-xs font-mono tabular-nums text-[var(--text-secondary)] truncate max-w-[50%]">
            {subValue}
          </span>
        )}
      </div>
    </div>
  );
}
