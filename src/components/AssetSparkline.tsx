import React, { useEffect, useState, useRef } from 'react';
import { useContractStore } from '../lib/store';

interface AssetSparklineProps {
  ticker: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
}

export function AssetSparkline({
  ticker,
  width = 60,
  height = 14,
  strokeWidth = 1.5,
}: AssetSparklineProps) {
  const [prices, setPrices] = useState<number[]>([]);
  const isMounted = useRef<boolean>(true);

  // Read latest live tick from the global Zustand store
  const liveSpot = useContractStore(
    (state) => state.serverState?.liveSpotPrices?.[ticker]
  );

  // Fetch initial 20 periods of history to bootstrap the sparkline
  useEffect(() => {
    isMounted.current = true;
    
    async function fetchHistory() {
      try {
        const response = await fetch(`/api/history?ticker=${ticker}&timeframe=5m&count=20`);
        const data = await response.json();
        
        if (isMounted.current && data.success && Array.isArray(data.candles)) {
          const closes = data.candles.map((c: any) => c.close);
          if (closes.length > 0) {
            setPrices(closes);
          }
        }
      } catch (err) {
        console.error(`[Sparkline] Failed to load history for ${ticker}`, err);
      }
    }

    fetchHistory();

    return () => {
      isMounted.current = false;
    };
  }, [ticker]);

  // Keep track of the sparkline points and append live price ticks
  const prevSpotRef = useRef<number | null>(null);
  useEffect(() => {
    if (liveSpot && liveSpot !== prevSpotRef.current) {
      prevSpotRef.current = liveSpot;
      setPrices((prev) => {
        if (prev.length === 0) return [liveSpot];
        // Only append if it actually changed from the last cached value
        if (prev[prev.length - 1] === liveSpot) return prev;
        const next = [...prev, liveSpot];
        return next.slice(-20); // Maintain a stable sliding window of 20 elements
      });
    }
  }, [liveSpot]);

  if (prices.length < 2) {
    // Elegant tiny loader/shimmer to keep UI extremely polished
    return (
      <div 
        style={{ width, height }} 
        className="bg-[var(--border)] animate-pulse rounded opacity-45 shrink-0 inline-block" 
      />
    );
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const padding = 1.5;
  const points = prices
    .map((val, idx) => {
      const x = (idx / (prices.length - 1)) * (width - padding * 2) + padding;
      const y = height - ((val - min) / range) * (height - padding * 2) - padding;
      return `${x},${y}`;
    })
    .join(' ');

  const currentPrice = prices[prices.length - 1];
  const startPrice = prices[0];
  const isBullish = currentPrice >= startPrice;
  // Tokenized success/danger so the sparkline tracks the active theme palette.
  const strokeColor = isBullish ? 'var(--success)' : 'var(--danger)';

  const endX = width - padding;
  const endY = height - ((currentPrice - min) / range) * (height - padding * 2) - padding;

  return (
    <svg 
      width={width} 
      height={height} 
      className="overflow-visible shrink-0 inline-block"
      style={{ verticalAlign: 'middle' }}
    >
      {/* Sparkline Path */}
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      {/* Tiny blinking beacon for the current price tick */}
      <circle
        cx={endX}
        cy={endY}
        r="2"
        fill={strokeColor}
        className="animate-pulse"
      />
    </svg>
  );
}
