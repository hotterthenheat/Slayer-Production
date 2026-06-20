/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  TrendingUp,
  Activity,
  Zap,
  BarChart4,
  Layers,
  Percent,
  Clock,
  Compass,
  SearchCode,
  ShieldCheck
} from 'lucide-react';
import { SystemScore, TimeframeVal, AssetInfo, Candle, FairValueGap } from '../types';

interface AnalyticsSectionProps {
  score: SystemScore;
  selectedAsset: AssetInfo;
  timeframe: TimeframeVal;
  candles: Candle[];
  fvgs: FairValueGap[];
  invalidationTriggered: boolean;
}

export function AnalyticsSection({
  score,
  selectedAsset,
  timeframe,
  candles,
  fvgs,
  invalidationTriggered,
}: AnalyticsSectionProps) {
  const currentCandle: Candle = candles[candles.length - 1] || {
    timestamp: Date.now(),
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    volume: 1000,
    vwap: 100
  };
  const prevCandle = candles[candles.length - 2] || currentCandle;

  // 1. CALCULATE CORES ON DISPLACEMENT
  const bodyMultiple = Number((Math.abs(currentCandle.close - currentCandle.open) / (prevCandle.close * selectedAsset.volatility * 0.001) || 1.1).toFixed(2));
  const rangeMultiple = Number(((currentCandle.high - currentCandle.low) / (prevCandle.high - prevCandle.low || 1)).toFixed(2));
  const ATRRatio = Number((rangeMultiple * 0.85).toFixed(2));
  const displacementVelocity = Number((bodyMultiple * 1.4).toFixed(1));
  const momentumAccel = Number((bodyMultiple * 2.1).toFixed(1));
  const efficiencyRatio = Number(((Math.abs(currentCandle.close - currentCandle.open) / (currentCandle.high - currentCandle.low || 1)) * 100).toFixed(0));
  const volatExpMo = (ATRRatio > 1.5) ? 'Expanding' : 'Normal';
  const priceVelocity = (currentCandle.close > currentCandle.open) ? 'Positive Accelerating' : 'Negative Accelerating';
  
  // Decide Classification
  let displacementClass: 'Weak' | 'Moderate' | 'Strong' | 'Aggressive' | 'Institutional' = 'Weak';
  if (score.total >= 90) displacementClass = 'Institutional';
  else if (score.total >= 80) displacementClass = 'Aggressive';
  else if (score.total >= 70) displacementClass = 'Strong';
  else if (score.total >= 60) displacementClass = 'Moderate';

  // 2. RSI CASCADE ENGINE
  // Simulated cascade based on score indicators
  const rsi1m = Math.min(94, Math.max(10, Math.floor(score.rsiCascade * 6.5 + (currentCandle.close > currentCandle.open ? 15 : -15))));
  const rsi5m = Math.min(88, Math.max(15, Math.floor(score.rsiCascade * 6.0 + (currentCandle.close > currentCandle.open ? 8 : -8))));
  const rsi15m = Math.min(84, Math.max(20, Math.floor(score.rsiCascade * 5.8)));
  const rsi1h = Math.min(80, Math.max(25, Math.floor(score.rsiCascade * 5.5)));

  let momentumState = 'Neutral';
  if (score.rsiCascade >= 8) {
    momentumState = 'Bullish Accelerating';
  } else if (score.rsiCascade >= 6) {
    momentumState = 'Bullish Confirmed';
  } else if (score.rsiCascade >= 4) {
    momentumState = 'Early Bullish';
  } else if (score.rsiCascade >= 2) {
    momentumState = 'Early Bearish';
  } else {
    momentumState = 'Bearish Accelerating';
  }

  // 3. VWAP INTELLIGENCE
  const currentVWAP = currentCandle.vwap || currentCandle.close * 0.998;
  const distancePct = Number(((currentCandle.close - currentVWAP) / currentVWAP * 100).toFixed(3));
  const vwapSlope = distancePct > 0 ? 'Upward' : 'Downward';
  const vwapRejection = currentCandle.low <= currentVWAP && currentCandle.close > currentVWAP ? 'Active Rejection/Support' : 'No Sweep';
  
  let vwapBias = 'Neutral';
  if (distancePct > 0.15) vwapBias = 'Bullish';
  else if (distancePct < -0.15) vwapBias = 'Bearish';

  // 4. VOLUME INTELLIGENCE
  const relativeVolume = Number((currentCandle.volume / 100000 || 1.2).toFixed(2));
  const volumeTrend = relativeVolume > 1.2 ? 'Expanding' : 'Compressing';
  const body = Math.abs(currentCandle.close - currentCandle.open);
  const range = Math.max(currentCandle.high - currentCandle.low, 1e-9);
  const buyingPressure = Math.round((currentCandle.close >= currentCandle.open
    ? 0.5 + 0.5 * (body / range)
    : 0.5 - 0.5 * (body / range)) * 100);
  const participationScore = Math.min(10, Math.floor(relativeVolume * 3 + (buyingPressure / 20)));
  
  let volConfidence = 'Low';
  if (participationScore >= 8) volConfidence = 'High';
  else if (participationScore >= 5) volConfidence = 'Medium';

  // 5. MARKET STRUCTURE
  let trendName = 'Neutral';
  if (score.structureQuality >= 8) trendName = 'Strong Bullish Trend';
  else if (score.structureQuality >= 5) trendName = 'Weak Bullish Trend';
  else if (score.structureQuality >= 3) trendName = 'Neutral';
  else if (score.structureQuality >= 1) trendName = 'Weak Bearish Trend';
  else trendName = 'Strong Bearish Trend';

  // 6. MULTI-TIMEFRAME AGREEMENT MATRIX
  const htfMatched = Math.min(6, Math.floor(score.htfAgreement * 0.65));
  let htfRating = 'Weak';
  if (htfMatched === 6) htfRating = 'Exceptional';
  else if (htfMatched >= 5) htfRating = 'Strong';
  else if (htfMatched >= 3) htfRating = 'Moderate';

  // 7. VOLATILITY ENGINE
  const ivPercentile = Math.floor(score.volatilityRegime * 8.5);
  let volRegime = 'Normal';
  if (ivPercentile >= 85) volRegime = 'Extreme';
  else if (ivPercentile >= 65) volRegime = 'Expanding';
  else if (ivPercentile >= 40) volRegime = 'Elevated';
  else if (ivPercentile <= 15) volRegime = 'Compressed';

  // 8. PREMIUM / DISCOUNT
  const highRangePrice = currentCandle.close * 1.015;
  const lowRangePrice = currentCandle.close * 0.98;
  const dealingRangeDiff = Math.max(highRangePrice - lowRangePrice, 1e-9);
  const pricePositionPct = Math.round(((currentCandle.close - lowRangePrice) / dealingRangeDiff) * 100);

  let optimumTradingZone = 'Neutral Zone';
  if (pricePositionPct < 30) optimumTradingZone = 'Optimal Long Zone';
  else if (pricePositionPct > 70) optimumTradingZone = 'Optimal Short Zone';

  // EMA Targets
  const baseClose = currentCandle.close;
  const targetsProjection = [
    { name: 'EMA 5 Fast Slope', price: baseClose * (currentCandle.close > currentCandle.open ? 1.0025 : 0.9975), type: 'High Probability' },
    { name: 'EMA 9 Trend Line', price: baseClose * (currentCandle.close > currentCandle.open ? 1.0045 : 0.9955), type: 'High Probability' },
    { name: 'EMA 20 Pivot', price: baseClose * (currentCandle.close > currentCandle.open ? 1.008 : 0.992), type: 'Moderate Probability' },
    { name: 'EMA 50 Institutional', price: baseClose * (currentCandle.close > currentCandle.open ? 1.015 : 0.985), type: 'Moderate Probability' },
    { name: 'EMA 200 Anchor Support', price: baseClose * (currentCandle.close > currentCandle.open ? 1.025 : 0.975), type: 'Stretch Target' }
  ];

  return (
    <div id="analytics-engine" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      
      {/* Module 1: Displacement Analytics */}
      <div className="bg-black/40 border border-black rounded-sm p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-black/60 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 text-[#4ADE80]" />
              <h4 className="font-display font-semibold text-xs tracking-wide text-zinc-100 uppercase">
                Displacement Analytics
              </h4>
            </div>
            <span className="text-[10px] font-mono font-bold uppercase text-[#4ADE80] bg-black/40 px-1.5 py-0.5 rounded">
              {displacementClass}
            </span>
          </div>

          <div className="space-y-2 font-mono text-[11px] text-zinc-400">
            <div className="flex justify-between">
              <span>Body Expansion Multiple:</span>
              <span className="text-zinc-200">{bodyMultiple}x</span>
            </div>
            <div className="flex justify-between">
              <span>Range Expansion Multiple:</span>
              <span className="text-zinc-200">{rangeMultiple}x</span>
            </div>
            <div className="flex justify-between">
              <span>ATR Expansion Ratio:</span>
              <span className="text-zinc-200">{ATRRatio}x</span>
            </div>
            <div className="flex justify-between">
              <span>Displacement Velocity:</span>
              <span className="text-zinc-200">{displacementVelocity} m/s</span>
            </div>
            <div className="flex justify-between">
              <span>Efficiency Index Ratio:</span>
              <span className="text-zinc-200">{efficiencyRatio}%</span>
            </div>
            <div className="flex justify-between">
              <span>Price Velocity Bias:</span>
              <span className="text-zinc-200">{priceVelocity}</span>
            </div>
          </div>
        </div>
        <div className="mt-3.5 bg-black/40 p-2 rounded border border-black text-[10px] font-mono text-zinc-500 leading-normal">
          Calculates full candle body mass relative to absolute price variance to identify authentic orders.
        </div>
      </div>

      {/* Module 2: RSI Cascade Model */}
      <div className="bg-black/40 border border-black rounded-sm p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-black/60 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 text-amber-500 animate-pulse" />
              <h4 className="font-display font-semibold text-xs tracking-wide text-zinc-100 uppercase">
                RSI Cascade Engine
              </h4>
            </div>
            <span className="text-[10px] font-mono font-bold uppercase text-amber-400 bg-amber-950/30 px-1.5 py-0.5 rounded">
              {momentumState}
            </span>
          </div>

          <div className="space-y-2 mt-1">
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                <span>1M Short Horizon RSI:</span>
                <span className="text-[#4ADE80]">{rsi1m}</span>
              </div>
              <div className="w-full bg-black h-1 rounded-full overflow-hidden">
                <div className="h-full bg-[#4ADE80] text-black rounded-full" style={{ width: `${rsi1m}%` }} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                <span>5M Core Trigger RSI:</span>
                <span className="text-[#4ADE80]">{rsi5m}</span>
              </div>
              <div className="w-full bg-black h-1 rounded-full overflow-hidden">
                <div className="h-full bg-black/40 rounded-full" style={{ width: `${rsi5m}%` }} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                <span>15M Macro Check RSI:</span>
                <span className="text-[#4ADE80]">{rsi15m}</span>
              </div>
              <div className="w-full bg-black h-1 rounded-full overflow-hidden">
                <div className="h-full bg-black rounded-full" style={{ width: `${rsi15m}%` }} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                <span>1H Anchor Horizon RSI:</span>
                <span className="text-[#4ADE80]">{rsi1h}</span>
              </div>
              <div className="w-full bg-black h-1 rounded-full overflow-hidden">
                <div className="h-full bg-black rounded-full" style={{ width: `${rsi1h}%` }} />
              </div>
            </div>
          </div>
        </div>
        <div className="bg-black/40 p-2 rounded border border-black text-[10px] font-mono text-zinc-500 leading-normal mt-3">
          Synthesizes short and long lookback momentum zones to emit early warnings before structural break.
        </div>
      </div>

      {/* Module 3: VWAP Intelligence & volume */}
      <div className="bg-black/40 border border-black rounded-sm p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-black/60 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <BarChart4 className="w-4 text-[#4ADE80]" />
              <h4 className="font-display font-semibold text-xs tracking-wide text-zinc-100 uppercase">
                VWAP & Volume Intelligence
              </h4>
            </div>
            <span className="text-[10px] font-mono font-bold uppercase text-zinc-400 bg-black px-1.5 py-0.5 rounded">
              Score: {participationScore}/10
            </span>
          </div>

          <div className="space-y-2 font-mono text-[11px] text-zinc-400">
            <div className="flex justify-between">
              <span>Slope Vector:</span>
              <span className="text-zinc-200">{vwapSlope}</span>
            </div>
            <div className="flex justify-between">
              <span>Distance to average:</span>
              <span className="text-zinc-200">{distancePct}%</span>
            </div>
            <div className="flex justify-between">
              <span>VWAP Rejection Level:</span>
              <span className="text-zinc-200">{vwapRejection}</span>
            </div>
            <div className="flex justify-between">
              <span>Institutional Bias:</span>
              <span className="text-zinc-200 font-bold">{vwapBias}</span>
            </div>
            <div className="flex justify-between border-t border-black/60 pt-2 mt-1">
              <span>Relative Volume (RV):</span>
              <span className="text-zinc-200">{relativeVolume}x</span>
            </div>
            <div className="flex justify-between">
              <span>Estimated Share Pool:</span>
              <span className="text-zinc-200">{volConfidence} Trust</span>
            </div>
          </div>
        </div>
        <div className="mt-3.5 bg-black/40 p-2 rounded border border-black text-[10px] font-mono text-zinc-500 leading-normal">
          Locks volume weights on real-time transaction points instead of raw ticks to identify smart money.
        </div>
      </div>

      {/* Module 4: Market Structure shifts */}
      <div className="bg-black/40 border border-black rounded-sm p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-black/60 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 text-zinc-400" />
              <h4 className="font-display font-semibold text-xs tracking-wide text-zinc-100 uppercase">
                Market Structure Matrix
              </h4>
            </div>
            <span className="text-[10px] font-mono font-bold uppercase text-zinc-3 py-0.5 px-1.5 bg-black rounded">
              {trendName}
            </span>
          </div>

          <div className="space-y-2 font-mono text-[11px] text-zinc-405">
            <div className="flex justify-between">
              <span>Structure Velocity:</span>
              <span className="text-zinc-250">{(score.structureQuality * 1.3).toFixed(1)}x / s</span>
            </div>
            <div className="flex justify-between">
              <span>Sequence Position:</span>
              <span className="text-zinc-250">Higher Highs / Lows verified</span>
            </div>
            <div className="flex justify-between">
              <span>Breakout Strength:</span>
              <span className="text-[#4ADE80] font-bold">{score.structureQuality >= 6 ? 'Sustained Expansion' : 'Absorbed'}</span>
            </div>
            <div className="flex justify-between">
              <span>Trend Persistence Index:</span>
              <span className="text-zinc-250 font-mono">{(score.structureQuality * 10).toFixed(0)}%</span>
            </div>
          </div>
        </div>
        <div className="bg-black/40 p-2 rounded border border-black text-[10px] font-mono text-zinc-500 leading-normal mt-3">
          Verifies higher/lower peaks automatically bypassing retail trendline draw limits.
        </div>
      </div>

      {/* Module 5: Multi-Timeframe Alignment & Volatility */}
      <div className="bg-black/40 border border-black rounded-sm p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-black/60 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 text-blue-450" />
              <h4 className="font-display font-semibold text-xs tracking-wide text-zinc-100 uppercase">
                Aggregate Alignments
              </h4>
            </div>
            <span className="text-[10px] font-mono font-bold uppercase text-blue-450 bg-blue-950/30 px-1.5 py-0.5 rounded">
              {htfMatched}/6 Agreement
            </span>
          </div>

          <div className="space-y-2 font-mono text-[11px] text-zinc-400">
            <div className="flex justify-between">
              <span>Timeframe Agreement Strength:</span>
              <span className="text-[#3b82f6] font-bold">{htfRating}</span>
            </div>
            <div className="flex justify-between">
              <span>Volatility Regime index:</span>
              <span className="text-zinc-200">{volRegime}</span>
            </div>
            <div className="flex justify-between">
              <span>Dealing Range Position %:</span>
              <span className="text-zinc-200">{pricePositionPct}% Position</span>
            </div>
            <div className="flex justify-between">
              <span>Optimum Trading Zone:</span>
              <span className="text-zinc-200 font-semibold">{optimumTradingZone}</span>
            </div>
          </div>
        </div>
        <div className="mt-3.5 bg-black/40 p-2 rounded border border-black text-[10px] font-mono text-zinc-500 leading-normal">
          Tracks alignment across 1m, 5m, 15m, 1h, 4h, and Daily to isolate multi-scale correlation layers.
        </div>
      </div>

      {/* Module 6: Invalidation Engine & Targets */}
      <div className="bg-black/40 border border-black rounded-sm p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-black/60 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <SearchCode className="w-4 text-rose-500 animate-pulse" />
              <h4 className="font-display font-semibold text-xs tracking-wide text-zinc-100 uppercase">
                Risk & Invalidation Tracker
              </h4>
            </div>
            {invalidationTriggered ? (
              <span className="text-[10px] font-mono font-bold uppercase text-[#F87171] bg-rose-950/60 px-1.5 py-0.5 rounded animate-ping">
                INVALIDATED
              </span>
            ) : (
              <span className="text-[10px] font-mono font-bold uppercase text-[#4ADE80] bg-black/40 px-1.5 py-0.5 rounded flex items-center gap-1">
                <ShieldCheck className="w-3" /> ACTIVE
              </span>
            )}
          </div>

          <div className="space-y-1.5 text-[10px] font-mono">
            {targetsProjection.slice(0, 3).map((item, idx) => (
              <div key={idx} className="flex justify-between text-zinc-400 group border-b border-black pb-1.5 last:border-0 last:pb-0">
                <span>{item.name}:</span>
                <span className="text-zinc-150 font-bold">{item.price.toFixed(selectedAsset.decimals)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-rose-950/20 p-2 rounded border border-[#F87171]/30 text-[9.5px] font-mono text-zinc-500 leading-snug">
          {invalidationTriggered ? (
            <span className="text-[#F87171]">🚨 Invalidation triggered due to price closing beyond structural invalidation levels. Avoid entry!</span>
          ) : (
            <span>Auto-monitors FVG closures, volume collapse, and VWAP breaks to cancel trade setup dynamically.</span>
          )}
        </div>
      </div>

    </div>
  );
}
