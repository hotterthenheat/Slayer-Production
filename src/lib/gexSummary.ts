/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Plain-English dealer-gamma read for a single ticker. Generated DETERMINISTICALLY
 * from the same computed GEX / dealer-dynamics fields the cards display — so the
 * prose can never contradict the numbers (no model, no API, no hallucination).
 */

export interface GexSummaryDynamics {
  vanna?: { hedgeFlow?: 'SUPPORTIVE' | 'PRESSURING' | 'NEUTRAL' } | null;
  charm?: { bias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL' } | null;
  migration?: { direction?: 'BULLISH' | 'BEARISH' | 'STABLE' } | null;
}

export interface GexSummaryInput {
  ticker: string;
  spot: number;
  decimals: number;
  netGex: number;
  callWall: number;
  putWall: number;
  gammaFlip: number;
  magnet: number;
  expiryLabel: string;
  dynamics?: GexSummaryDynamics | null;
}

function fmtPrice(v: number, decimals: number): string {
  return typeof v === 'number' && isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: decimals }) : '—';
}

/** Signed $ GEX with B/M scaling, e.g. +$1.24B / -$0.12B / +$840K. */
function fmtGexDollars(v: number): string {
  if (typeof v !== 'number' || !isFinite(v)) return '$0';
  const a = Math.abs(v);
  const sign = v >= 0 ? '+' : '-';
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(0)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(0)}K`;
  return `${sign}$${Math.round(a)}`;
}

function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Compose a 3–5 sentence read of the dealer-gamma posture for one ticker.
 * Every clause is gated on a real value, so the output always matches the data.
 */
export function buildGexSummary(i: GexSummaryInput): string {
  const out: string[] = [];
  const px = (v: number) => fmtPrice(v, i.decimals);
  const tkr = i.ticker || 'this name';

  // 1) Gamma regime — the headline read.
  if (i.netGex >= 0) {
    out.push(`Dealers are net long gamma (net GEX ${fmtGexDollars(i.netGex)}), so they buy dips and sell rallies — ${tkr} moves should stay dampened and mean-reverting.`);
  } else {
    out.push(`Dealers are net short gamma (net GEX ${fmtGexDollars(i.netGex)}), so they hedge with the move — expect ${tkr} swings to be amplified and to trend more easily.`);
  }

  // 2) Gamma-flip pivot.
  if (i.gammaFlip > 0 && i.spot > 0) {
    out.push(i.spot >= i.gammaFlip
      ? `Price is holding above the ${px(i.gammaFlip)} gamma flip — the stabilizing, long-gamma side; losing it would tip dealers into amplifying moves.`
      : `Price is below the ${px(i.gammaFlip)} gamma flip — the unstable, amplifying side; reclaiming it would calm the tape.`);
  }

  // 3) Walls — support / resistance.
  const walls: string[] = [];
  if (i.callWall > 0) walls.push(`the ${px(i.callWall)} call wall caps upside`);
  if (i.putWall > 0) walls.push(`the ${px(i.putWall)} put wall anchors downside`);
  if (walls.length) out.push(cap(walls.join(' and ')) + '.');

  // 4) Pin magnet.
  if (i.magnet > 0) {
    out.push(`${px(i.magnet)} is the pin magnet into ${i.expiryLabel || 'expiry'} — price tends to gravitate there as expiry approaches.`);
  }

  // 5) Live dealer flows (vanna / charm / migration), only the non-neutral ones.
  const d = i.dynamics;
  if (d) {
    const flows: string[] = [];
    if (d.vanna?.hedgeFlow === 'SUPPORTIVE') flows.push('vanna flow is supportive (softer IV has dealers buying)');
    else if (d.vanna?.hedgeFlow === 'PRESSURING') flows.push('vanna flow is pressuring (firmer IV has dealers selling)');
    if (d.charm?.bias === 'BULLISH') flows.push('charm decay adds an upward drift into the close');
    else if (d.charm?.bias === 'BEARISH') flows.push('charm decay adds a downward drift into the close');
    if (d.migration?.direction === 'BULLISH') flows.push('the gamma center-of-mass is migrating up');
    else if (d.migration?.direction === 'BEARISH') flows.push('the gamma center-of-mass is migrating down');
    if (flows.length) out.push(cap(flows.join(', ')) + '.');
  }

  return out.join(' ');
}
