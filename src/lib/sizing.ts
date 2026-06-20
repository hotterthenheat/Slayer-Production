/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Edge-based position sizing (Kelly / fractional Kelly) and portfolio greek
 * aggregation. Turns the calibrated win-probability + expected payoff the engine
 * already produces into an optimal-fraction sizing recommendation. Keyless.
 */

export interface KellyResult {
  /** Full-Kelly fraction of bankroll in [0,1] (negative edge ⇒ 0). */
  kelly: number;
  /** Recommended (half-Kelly by default) fraction. */
  recommended: number;
  edge: number; // expected value per unit risked
  payoffRatio: number; // avg win / avg loss
  verdict: 'NO EDGE' | 'SMALL' | 'MODERATE' | 'STRONG';
}

/**
 * Kelly fraction for a bet that wins `winPct` of the time, paying `avgWinPct`
 * on a win and losing `avgLossPct` (positive number) on a loss.
 *   f* = p/lossRatio − (1−p)/winRatio  (continuous Kelly with asymmetric payoffs)
 * Implemented via the standard binary form f* = (b·p − q)/b with b = win/loss.
 */
export function kellySize(winPct: number, avgWinPct: number, avgLossPct: number, fraction = 0.5): KellyResult {
  const p = Math.min(1, Math.max(0, winPct));
  const q = 1 - p;
  const win = Math.max(1e-6, Math.abs(avgWinPct));
  const loss = Math.max(1e-6, Math.abs(avgLossPct));
  const b = win / loss;
  const kellyRaw = (b * p - q) / b;
  const kelly = Math.min(1, Math.max(0, kellyRaw));
  const edge = p * win - q * loss;
  const recommended = Number((kelly * fraction).toFixed(4));
  let verdict: KellyResult['verdict'] = 'NO EDGE';
  if (kelly >= 0.25) verdict = 'STRONG';
  else if (kelly >= 0.12) verdict = 'MODERATE';
  else if (kelly > 0.02) verdict = 'SMALL';
  return { kelly: Number(kelly.toFixed(4)), recommended, edge: Number(edge.toFixed(4)), payoffRatio: Number(b.toFixed(2)), verdict };
}

export interface BookPosition {
  ticker: string;
  quantity: number; // contracts; negative = short
  isCall: boolean;
  delta: number; // per-share
  gamma: number;
  vega: number;
  theta: number; // per day
  spot: number;
}

export interface PortfolioGreeks {
  netDelta: number; // share-equivalents
  netGamma: number;
  netVega: number;
  netTheta: number; // $/day
  grossDeltaNotional: number; // $ delta exposure
  positions: number;
  bias: 'NET LONG' | 'NET SHORT' | 'NEUTRAL';
}

/** Aggregate a book of option positions into net greeks (×100 contract multiplier). */
export function aggregatePortfolioGreeks(positions: BookPosition[]): PortfolioGreeks {
  let netDelta = 0, netGamma = 0, netVega = 0, netTheta = 0, grossDeltaNotional = 0;
  for (const p of positions) {
    const mult = p.quantity * 100;
    netDelta += p.delta * mult;
    netGamma += p.gamma * mult;
    netVega += p.vega * mult;
    netTheta += p.theta * mult;
    grossDeltaNotional += Math.abs(p.delta * mult * (p.spot || 0));
  }
  let bias: PortfolioGreeks['bias'] = 'NEUTRAL';
  if (netDelta > 1e-6) bias = 'NET LONG';
  else if (netDelta < -1e-6) bias = 'NET SHORT';
  return {
    netDelta: Number(netDelta.toFixed(2)),
    netGamma: Number(netGamma.toFixed(4)),
    netVega: Number(netVega.toFixed(2)),
    netTheta: Number(netTheta.toFixed(2)),
    grossDeltaNotional: Number(grossDeltaNotional.toFixed(0)),
    positions: positions.length,
    bias,
  };
}
