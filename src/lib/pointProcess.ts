/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Self-exciting point-process + aggressive-flow tools:
 *   • Hawkes intensity — models order-flow as self-exciting (one cascade triggers
 *     the next): λ(t) = μ + Σ α·e^{−β(t−tᵢ)} over recent volume-spike events.
 *   • Net-Delta tape aggression — delta-weighted aggressive (sweep) order flow
 *     from the live flow tape, filtering out passive/hedging noise.
 */
import { Candle } from '../types';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export interface HawkesResult {
  intensity: number;
  cascadeProbability: number; // fraction of intensity from self-excitation (0..1)
  ignition: boolean;
  events: number;
}

/** Hawkes self-exciting intensity from volume-spike arrivals (bar index = time). */
export function hawkesIntensity(candles: Candle[], mu = 0.3, alpha = 0.6, beta = 0.8): HawkesResult {
  const recent = candles.slice(-80);
  const vols = recent.map((c) => c.volume || 0);
  const avg = mean(vols) || 1;
  const events: number[] = [];
  for (let i = 0; i < recent.length; i++) if (vols[i] > 1.6 * avg) events.push(i);
  const tNow = recent.length - 1;
  let excite = 0;
  for (const ti of events) if (ti < tNow) excite += alpha * Math.exp(-beta * (tNow - ti));
  const intensity = mu + excite;
  const cascadeProbability = clamp01(excite / (mu + excite));
  return {
    intensity: Number(intensity.toFixed(3)),
    cascadeProbability: Number(cascadeProbability.toFixed(3)),
    ignition: cascadeProbability > 0.6,
    events: events.length,
  };
}

export interface NetDeltaResult {
  netDelta: number; // signed delta-weighted aggressive flow
  sweepCount: number;
  anomaly: boolean;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

/**
 * Net-Delta of aggressive sweeps from the flow tape. Each tape print carries a
 * contract string ("1,234 SPX 7650C") and a side; only sweeps (spread-crossing,
 * intent-revealing) are counted, delta-weighted by a nominal |Δ|.
 */
export function netDeltaAggression(flow: any[], ticker: string): NetDeltaResult {
  let net = 0, sweeps = 0;
  for (const f of flow || []) {
    if (f?.asset !== ticker) continue;
    if (f?.type !== 'SWEEP') continue; // aggressive, intent-revealing only
    const m = String(f.contract || '').match(/^([\d,]+)/);
    const count = m ? parseInt(m[1].replace(/,/g, ''), 10) || 0 : 0;
    const nominalDelta = 0.45;
    net += (f.side === 'C' ? 1 : -1) * count * nominalDelta;
    sweeps++;
  }
  const netDelta = Math.round(net);
  return {
    netDelta,
    sweepCount: sweeps,
    anomaly: Math.abs(netDelta) > 3000,
    direction: netDelta > 500 ? 'BULLISH' : netDelta < -500 ? 'BEARISH' : 'NEUTRAL',
  };
}
