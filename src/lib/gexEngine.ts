import { LiveOptionContract } from './marketDataProvider';
import { gammaFlipSpot, expectedMovePct } from './skyQuantCore';

export interface GexStrikeRow {
  strike: number; callGex: number; putGex: number; netGex: number;
  callOi: number; putOi: number; callVolume: number; putVolume: number;
}
export interface GexProfile {
  spot: number; strikes: GexStrikeRow[]; netGex: number; netGexBn: number;
  callWall: number; putWall: number; gammaFlip: number; magnet: number;
  totalCallOi: number; totalPutOi: number; callPutOiRatio: number;
  expectedMovePct: number; dealerBias: 'LONG GAMMA' | 'SHORT GAMMA'; aboveFlip: boolean;
}

export function buildGexProfile(
  chain: LiveOptionContract[], spot: number, tauYears: number, windowPct = 0.06
): GexProfile | null {
  if (!chain || chain.length === 0 || !(spot > 0)) return null;
  const byStrike = new Map<number, GexStrikeRow>();
  let netGex = 0, totalCallOi = 0, totalPutOi = 0;

  for (const c of chain) {
    const sign = c.type === 'C' ? 1 : -1;
    const gex = (c.greeks?.gamma || 0) * c.oi * 100 * spot * spot * 0.01 * sign;
    netGex += gex;
    let row = byStrike.get(c.strike);
    if (!row) {
      row = { strike: c.strike, callGex: 0, putGex: 0, netGex: 0, callOi: 0, putOi: 0, callVolume: 0, putVolume: 0 };
      byStrike.set(c.strike, row);
    }
    if (c.type === 'C') { row.callGex += gex; row.callOi += c.oi; row.callVolume += c.volume; totalCallOi += c.oi; }
    else { row.putGex += gex; row.putOi += c.oi; row.putVolume += c.volume; totalPutOi += c.oi; }
    row.netGex = row.callGex + row.putGex;
  }

  const allRows = [...byStrike.values()].sort((a, b) => a.strike - b.strike);
  let callWall = spot, putWall = spot, maxCall = -1, maxPut = -1;
  for (const r of allRows) {
    // Walls must straddle spot (canonical convention, matching v11Math): the call wall is the
    // heaviest call-γ strike AT/ABOVE spot, the put wall the heaviest put-γ strike AT/BELOW spot —
    // so they can't both collapse to one side on a degenerate chain.
    if (r.strike >= spot && Math.abs(r.callGex) > maxCall) { maxCall = Math.abs(r.callGex); callWall = r.strike; }
    if (r.strike <= spot && Math.abs(r.putGex) > maxPut) { maxPut = Math.abs(r.putGex); putWall = r.strike; }
  }
  const nearSpot = allRows.filter(r => Math.abs(r.strike - spot) / spot <= 0.03);
  const pool = nearSpot.length ? nearSpot : allRows;
  const magnet = pool.reduce((b, r) => Math.abs(r.netGex) > Math.abs(b.netGex) ? r : b, pool[0]).strike;

  // Gamma flip ("zero gamma"): CANONICAL cumulative-net-GEX-by-strike convention,
  // shared with skyQuantCore.gammaFlipSpot and v11Math.computeDealerInventory so
  // the platform reports ONE flip price per chain. (Previously this used a
  // pointwise grid that re-priced gamma at hypothetical spots — a different
  // definition that could disagree with the by-strike flip quoted elsewhere.)
  const flip = gammaFlipSpot(allRows.map((r) => r.strike), allRows.map((r) => r.netGex));
  const found = flip !== null;
  // Bounded fallback when no zero-crossing exists (one-sided book), labeled by aboveFlip semantics.
  const gammaFlip = found ? flip! : (netGex >= 0 ? putWall : callWall);

  const atm = chain.reduce((b, c) => Math.abs(c.strike - spot) < Math.abs(b.strike - spot) ? c : b, chain[0]);
  const expectedMovePctVal = expectedMovePct(atm.impliedVolatility, tauYears);
  const windowRows = allRows.filter(r => Math.abs(r.strike - spot) / spot <= windowPct);

  return {
    spot, strikes: (windowRows.length >= 5 ? windowRows : allRows).slice(0, 80),
    netGex, netGexBn: Number((netGex / 1e9).toFixed(3)),
    callWall, putWall, gammaFlip: Number(gammaFlip.toFixed(2)), magnet,
    totalCallOi, totalPutOi,
    callPutOiRatio: totalPutOi > 0 ? Number((totalCallOi / totalPutOi).toFixed(2)) : 0,
    expectedMovePct: expectedMovePctVal, dealerBias: netGex >= 0 ? 'LONG GAMMA' : 'SHORT GAMMA',
    aboveFlip: spot >= gammaFlip,
  };
}

// Dealer buying-pressure gauge (−100..+100) with full provenance per component.
export function computeDealerFlowGauge(profile: GexProfile, netCharm: number, netDex: number) {
  const { spot, gammaFlip, netGex, magnet, dealerBias } = profile;
  const gammaRegime = Math.tanh(((spot - gammaFlip) / spot) * 120) * (netGex >= 0 ? 1 : 1.4);
  const magnetPull = netGex >= 0 ? Math.tanh(((magnet - spot) / spot) * 150) : 0;
  const charmNorm = Math.tanh(netCharm / 5e7);
  const dexNorm = -Math.tanh(netDex / 5e10) * 0.5;
  let cv = 0, pv = 0;
  for (const r of profile.strikes) { cv += r.callVolume; pv += r.putVolume; }
  const volImb = cv + pv > 0 ? (cv - pv) / (cv + pv) : 0;

  const components = [
    { name: 'Gamma regime', value: Number(gammaRegime.toFixed(3)), weight: 0.35, detail: `spot ${spot.toFixed(2)} vs flip ${gammaFlip.toFixed(2)} (${dealerBias})` },
    { name: 'Magnet pull', value: Number(magnetPull.toFixed(3)), weight: 0.15, detail: `pin magnet ${magnet.toFixed(2)}` },
    { name: 'Charm decay flow', value: Number(charmNorm.toFixed(3)), weight: 0.20, detail: `net charm ${(netCharm / 1e6).toFixed(1)}M/day` },
    { name: 'Delta inventory', value: Number(dexNorm.toFixed(3)), weight: 0.10, detail: `net DEX ${(netDex / 1e9).toFixed(2)}B` },
    { name: 'Hedge-flow demand', value: Number(volImb.toFixed(3)), weight: 0.20, detail: `call vol ${cv.toLocaleString()} vs put vol ${pv.toLocaleString()}` },
  ];
  const raw = components.reduce((a, c) => a + c.value * c.weight, 0);
  const pressure = Math.round(Math.max(-1, Math.min(1, raw)) * 100);
  const headline = pressure >= 35
    ? `Dealers are net BUYERS: ${dealerBias} book with supportive hedging below ${gammaFlip.toFixed(0)}.`
    : pressure <= -35
      ? `Dealers are net SELLERS: hedging pressure dominates ${spot < gammaFlip ? 'below the gamma flip' : 'into rallies'}.`
      : `Dealer flows balanced: ${dealerBias} book pinning toward ${magnet.toFixed(0)}.`;
  return { pressure, bias: dealerBias, components, headline };
}
