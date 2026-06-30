/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DEALER HEDGING SIMULATOR
 * ------------------------
 * Projects how dealers must re-hedge as spot moves, from the REAL per-strike net
 * gamma exposure (gex_profile.strikes). Each strike's γ-exposure is concentrated
 * near its own strike (γ peaks at-the-money), so the dealer's net γ at a
 * hypothetical spot S′ is the proximity-weighted sum of the strike GEX:
 *
 *     Γ$(S′) = Σ_k  netGEX_k · exp( −½ · ((S′−K_k)/w)² ),   w = spot·EM
 *
 * Sign convention (call-positive / put-negative GEX): Γ$ > 0 ⇒ dealers are LONG
 * gamma ⇒ they sell rallies / buy dips ⇒ price is DAMPENED (pinning). Γ$ < 0 ⇒
 * SHORT gamma ⇒ they buy rallies / sell dips ⇒ moves are AMPLIFIED (squeeze-prone).
 *
 * The hedge requirement to move from spot to S′ is the path integral of Γ$ in
 * "$ per 1% move" terms — the cumulative delta dealers must buy/sell along the way.
 */

export interface HedgeStrike { strike: number; netGex: number }
export interface HedgeNode { price: number; gammaDollar: number; cumHedge: number; regime: 'stabilizing' | 'amplifying' }
export interface DealerHedgingResult {
  spot: number;
  nodes: HedgeNode[];
  netGammaNow: number;            // Γ$ at spot
  regimeNow: 'stabilizing' | 'amplifying';
  gammaFlip: number | null;       // nearest S′ where Γ$ crosses zero
  hedgePer1PctUp: number;         // signed $ dealers trade for a +1% move (≈ Γ$ at spot)
  hedgePer1PctDown: number;
  squeezePrice: number | null;    // most-negative-Γ level below spot (amplification risk)
  squeezeScore: number;           // 0..1
}

/**
 * @param strikes per-strike net GEX (signed $; from gex_profile.strikes)
 * @param spot    current underlying
 * @param emPct   one-sigma expected move as a fraction of spot (sets the γ kernel width)
 * @param rangePct half-width of the simulated spot grid (default ±6%)
 * @param steps   grid resolution (default 121)
 */
export function simulateDealerHedging(
  strikes: HedgeStrike[],
  spot: number,
  emPct: number,
  rangePct = 0.06,
  steps = 121,
): DealerHedgingResult | null {
  const rows = (strikes || []).filter((s) => isFinite(s.strike) && s.strike > 0 && isFinite(s.netGex));
  if (rows.length < 2 || !(spot > 0)) return null;

  const w = Math.max(spot * Math.min(0.08, Math.max(0.003, emPct)), spot * 0.003); // kernel width
  const gammaAt = (S: number): number => {
    let g = 0;
    for (const r of rows) { const z = (S - r.strike) / w; g += r.netGex * Math.exp(-0.5 * z * z); }
    return g;
  };

  const lo = spot * (1 - rangePct), hi = spot * (1 + rangePct);
  const dP = (hi - lo) / (steps - 1);
  const nodes: HedgeNode[] = [];
  // Cumulative hedge measured outward from spot (0 at spot), integrated in $/1%.
  const spotIdx = Math.round(((spot - lo) / (hi - lo)) * (steps - 1));
  const raw: { price: number; g: number }[] = [];
  for (let i = 0; i < steps; i++) { const price = lo + i * dP; raw.push({ price, g: gammaAt(price) }); }

  // integrate Γ$ · (dP/price·100%) outward from spotIdx in both directions
  const cum = new Array(steps).fill(0);
  for (let i = spotIdx + 1; i < steps; i++) {
    const midG = (raw[i].g + raw[i - 1].g) / 2;
    cum[i] = cum[i - 1] + midG * ((raw[i].price - raw[i - 1].price) / raw[i].price) * 100;
  }
  for (let i = spotIdx - 1; i >= 0; i--) {
    const midG = (raw[i].g + raw[i + 1].g) / 2;
    cum[i] = cum[i + 1] - midG * ((raw[i + 1].price - raw[i].price) / raw[i].price) * 100;
  }

  for (let i = 0; i < steps; i++) {
    nodes.push({ price: raw[i].price, gammaDollar: raw[i].g, cumHedge: cum[i], regime: raw[i].g >= 0 ? 'stabilizing' : 'amplifying' });
  }

  const netGammaNow = gammaAt(spot);
  // gamma flip: nearest zero-crossing of Γ$ to spot
  let gammaFlip: number | null = null, bestDist = Infinity;
  for (let i = 1; i < steps; i++) {
    if ((raw[i - 1].g <= 0 && raw[i].g > 0) || (raw[i - 1].g >= 0 && raw[i].g < 0)) {
      const t = raw[i].g === raw[i - 1].g ? 0 : -raw[i - 1].g / (raw[i].g - raw[i - 1].g);
      const cross = raw[i - 1].price + t * (raw[i].price - raw[i - 1].price);
      if (Math.abs(cross - spot) < bestDist) { bestDist = Math.abs(cross - spot); gammaFlip = cross; }
    }
  }

  // squeeze: most-negative Γ below spot, scored vs the largest |Γ| on the grid
  let squeezePrice: number | null = null, minG = 0;
  for (const r of raw) if (r.price < spot && r.g < minG) { minG = r.g; squeezePrice = r.price; }
  const maxAbs = raw.reduce((m, r) => Math.max(m, Math.abs(r.g)), 0) || 1;
  const squeezeScore = Math.max(0, Math.min(1, -minG / maxAbs));

  return {
    spot, nodes, netGammaNow,
    regimeNow: netGammaNow >= 0 ? 'stabilizing' : 'amplifying',
    gammaFlip,
    hedgePer1PctUp: netGammaNow,    // long γ ⇒ +Γ$ sold into a rally (stabilizing)
    hedgePer1PctDown: -netGammaNow,
    squeezePrice, squeezeScore,
  };
}
