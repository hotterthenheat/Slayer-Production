/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { stdNormalCDF, stdNormalPDF } from './normalDist';

/**
 * Standard Normal PDF/CDF. These thin wrappers delegate to the shared
 * machine-precision implementations in ./normalDist (Hart/West CDF, ~1e-15)
 * instead of the former Abramowitz & Stegun 7.1.26 CDF approximation (~1.5e-7,
 * worse in the tails). Kept as named exports so existing importers don't break.
 */
export function normPdf(x: number): number {
  return stdNormalPDF(x);
}

export function normCdf(x: number): number {
  return stdNormalCDF(x);
}

export interface OptionGreeks {
  delta: number;
  gamma: number;
  vanna: number;
  charm: number;
  speed: number;
  color: number;
}

export interface SimulatedPathResults {
  path: number[];
  flow: number;
  fragility: number;
}

export interface CampaignStateResult {
  state: string;
  completion: number;
  v_flow: number;
  a_oi: number;
}

export interface EventDivergenceResult {
  unwind_risk: string;
  vanna_shock: number;
  divergence: number;
}

/**
 * Replicates the quantitative algorithms from `physics.py`
 */
export class DealerFlowPhysics {
  public static readonly Y = 0.0001; // Resilience constant (square-root impact scaling)
  public static readonly MOC_IMBALANCE_THRESHOLD = 500_000_000;

  /**
   * Calculates continuous Black-Scholes-Merton and higher-order options Greeks
   */
  public static calculateGreeks(
    S: number,
    K: number,
    t: number,
    sigma: number,
    r = 0.05,
    q = 0.01,
    optionType: 'call' | 'put' = 'call'
  ): OptionGreeks {
    const tBounded = t <= 0 ? 1e-5 : t;
    const sigBounded = sigma <= 0 ? 1e-4 : sigma;

    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigBounded * sigBounded) * tBounded) / (sigBounded * Math.sqrt(tBounded));
    const d2 = d1 - sigBounded * Math.sqrt(tBounded);

    const n_prime_d1 = normPdf(d1);
    const N_d1 = normCdf(d1);

    // Delta & Gamma
    const delta = optionType === 'call' 
      ? Math.exp(-q * tBounded) * N_d1 
      : Math.exp(-q * tBounded) * (N_d1 - 1);
    
    const gamma = (Math.exp(-q * tBounded) * n_prime_d1) / (S * sigBounded * Math.sqrt(tBounded));

    // Second-Order: Vanna, Charm
    const vanna = -Math.exp(-q * tBounded) * n_prime_d1 * (d2 / sigBounded);
    
    let charm = 0;
    if (optionType === 'call') {
      charm = q * Math.exp(-q * tBounded) * N_d1 - Math.exp(-q * tBounded) * n_prime_d1 * ((r - q) / (sigBounded * Math.sqrt(tBounded)) - d2 / (2 * tBounded));
    } else {
      charm = -q * Math.exp(-q * tBounded) * (1 - N_d1) - Math.exp(-q * tBounded) * n_prime_d1 * ((r - q) / (sigBounded * Math.sqrt(tBounded)) - d2 / (2 * tBounded));
    }

    // Third-Order: Speed, Color
    const speed = -(gamma / S) * (1 + (d1 / (sigBounded * Math.sqrt(tBounded))));
    // Color = ∂Γ/∂t (gamma decay per unit calendar time). Canonical Gatheral form:
    //   +[e^{−qτ}φ(d1) / (2Sτσ√τ)] · [2qτ + 1 + d1·(2(r−q)τ − d2·σ√τ)/(σ√τ)]
    // The prior expression dropped the 2qτ term, mis-grouped the d1 factor, and had
    // the wrong overall sign — it disagreed with a finite-difference dΓ/dt even at q=0.
    const sqrtTauC = Math.sqrt(tBounded);
    const color = (Math.exp(-q * tBounded) * n_prime_d1 / (2 * S * tBounded * sigBounded * sqrtTauC)) *
      (2 * q * tBounded + 1 + d1 * (2 * (r - q) * tBounded - d2 * sigBounded * sqrtTauC) / (sigBounded * sqrtTauC));

    return { delta, gamma, vanna, charm, speed, color };
  }

  /**
   * Processes Level 2 Order Book Depth for base liquidity scaling (weighted depth)
   */
  public static processTier1Liquidity(
    l2Bids: { price: number; size: number }[],
    l2Asks: { price: number; size: number }[]
  ): number {
    if (!l2Bids || !l2Asks || l2Bids.length === 0 || l2Asks.length === 0) {
      return 50.0;
    }

    let bidDepth = 0.0;
    let askDepth = 0.0;
    const maxLevels = Math.min(5, l2Bids.length, l2Asks.length);

    for (let i = 0; i < maxLevels; i++) {
      const weight = Math.pow(0.85, i);
      bidDepth += (l2Bids[i].size || 0) * weight;
      askDepth += (l2Asks[i].size || 0) * weight;
    }

    const denom = bidDepth + askDepth;
    return denom > 0 ? ((bidDepth - askDepth) / denom + 1.0) * 50.0 : 50.0;
  }

  /**
   * Tier 1 MOC processing active strictly between 15:50 and 16:00 (represented as minutes 950 to 960)
   */
  public static processMocImbalance(
    imbalanceSize: number,
    side: 'buy' | 'sell' | 'neutral',
    currentMin: number
  ) {
    if (currentMin < 950 || currentMin > 960 || imbalanceSize < this.MOC_IMBALANCE_THRESHOLD) {
      return { active: false, delta_dollars: 0.0, multiplier: 1.0 };
    }

    const sideMult = side === 'buy' ? 1.0 : (side === 'sell' ? -1.0 : 0.0);
    return {
      active: true,
      delta_dollars: imbalanceSize * sideMult,
      multiplier: 1.0 + ((currentMin - 950) / 10.0)
    };
  }
}

/**
 * Replicates the recursive 25-step hedging cascade from `cascade_simulator.py`
 */
export class HedgingCascadeSimulator {
  /**
   * Returns market liquidity coefficient based on U-Shaped intraday curve + Event Slasher logic
   */
  public static getLiquidityCoefficient(
    currentMin: number,
    eventMode: 'none' | 'event' | 'extreme_event'
  ): number {
    let base = 1.0;
    
    if (currentMin >= 570 && currentMin < 630) {
      base = 1.5;      // Market Open block (09:30 - 10:30 EST)
    } else if (currentMin >= 630 && currentMin < 720) {
      base = 1.0;      // Morning trading (10:30 - 12:00 EST)
    } else if (currentMin >= 720 && currentMin < 840) {
      base = 0.4;      // Lunch Vacuum (12:00 - 14:00 EST)
    } else if (currentMin >= 840 && currentMin < 900) {
      base = 0.9;      // Afternoon trading (14:00 - 15:00 EST)
    } else {
      base = 1.8;      // Power Hour / Pre-Close (15:00 - 16:00 EST)
    }

    if (eventMode === 'event') {
      return Math.max(base * 0.35, 0.05);
    }
    if (eventMode === 'extreme_event') {
      return Math.max(base * 0.10, 0.05);
    }
    return Math.max(base, 0.05);
  }

  /**
   * Executes the strict 25-step recursive dealer hedging cascade simulation
   */
  public static runSimulation(
    spot0: number,
    optionChain: Array<{ strike: number; t: number; sigma: number; type: 'call' | 'put'; oi: number }>,
    currentMin: number,
    eventMode: 'none' | 'event' | 'extreme_event',
    mocData: { active: boolean; delta_dollars: number; multiplier: number }
  ): SimulatedPathResults {
    const liquidity = this.getLiquidityCoefficient(currentMin, eventMode);
    
    let spot = spot0;
    const runningPath: number[] = [spot0];
    let prevFlow = 0.0;
    let iteration = 0;

    while (iteration < 25) {
      // Inject MOC vectors if active
      let totalFlow = mocData.active ? mocData.delta_dollars : 0.0;

      for (const opt of optionChain) {
        // Calculate G Greeks for option contract
        const greeks = DealerFlowPhysics.calculateGreeks(
          spot,
          opt.strike,
          opt.t,
          opt.sigma,
          0.05,
          0.01,
          opt.type
        );

        const dSpot = spot - runningPath[0];
        const dTime = 1.0 / (365.0 * 6.5 * 60.0); // dt in terms of mini slots

        // Delta change formulation: (gamma * dS) + (charm * dT)
        const deltaChange = (greeks.gamma * dSpot) + (greeks.charm * dTime);
        const dealerCoeff = opt.type === 'call' ? -1.0 : 1.0; // Dealers are short-gamma when long callers buy
        
        totalFlow += deltaChange * opt.oi * 100 * dealerCoeff * spot;
      }

      // Termination constraint: relative change flow is minor
      if (iteration > 0 && Math.abs(totalFlow - prevFlow) / (Math.abs(prevFlow) + 1e-5) < 0.05) {
        break;
      }

      // Market Impact volume allocation translation
      const scaledVol = liquidity * 10_000_000;
      const impactPct = Math.sign(totalFlow) * DealerFlowPhysics.Y * 0.20 * Math.sqrt(Math.abs(totalFlow) / scaledVol);

      // Squeeze compression check
      if (Math.abs(impactPct) < 0.0002) {
        break;
      }

      spot = spot * (1.0 + impactPct);
      runningPath.push(Number(spot.toFixed(2)));
      prevFlow = totalFlow;
      iteration++;
    }

    // Fragility estimation formula
    const fragility = Math.min((Math.abs(prevFlow) / (liquidity * 5_000_000)) * 100, 100);

    return {
      path: runningPath,
      flow: prevFlow,
      fragility: Number(fragility.toFixed(2))
    };
  }
}

/**
 * Replicates the state transitions from `state_engines.py`
 */
export class DealerFlowStateEngines {
  /**
   * Evaluates Campaign State Machine transitions via 1st/2nd derivatives of open interest and delta flows
   */
  public static evaluateCampaignState(
    oiHistory: number[],
    flowHistory: number[],
    maxCapacity = 10_000_000
  ): CampaignStateResult {
    if (oiHistory.length < 3 || flowHistory.length < 3) {
      return { state: 'UNKNOWN', completion: 0.0, v_flow: 0.0, a_oi: 0.0 };
    }

    const n = oiHistory.length;
    const v_oi = oiHistory[n - 1] - oiHistory[n - 2];
    const a_oi = v_oi - (oiHistory[n - 2] - oiHistory[n - 3]);
    
    const v_flow = flowHistory[n - 1] - flowHistory[n - 2];

    let state = 'UNKNOWN';
    if (v_flow > 0 && v_oi <= 0) {
      state = 'SPECULATIVE';
    } else if (v_flow > 0 && v_oi > 0 && a_oi <= 0) {
      state = 'POSITION BUILDING';
    } else if (v_flow > 0 && v_oi > 0 && a_oi > 0) {
      state = 'ACCUMULATION';
    } else if (v_oi > 0 && a_oi < 0) {
      state = 'EXHAUSTION';
    } else if (v_oi < 0) {
      state = 'UNWINDING';
    }

    // Stress amplifier upgrader trigger
    if (state === 'ACCUMULATION' && flowHistory[n - 1] > 50_000_000) {
      state = 'INSTITUTIONAL CAMPAIGN';
    }

    const lastOi = oiHistory[n - 1];
    let completion = (lastOi / maxCapacity) * 100 * (a_oi < 0 ? 1.15 : 1.0);
    completion = Math.max(0.0, Math.min(completion, 99.0));

    return {
      state,
      completion: Number(completion.toFixed(1)),
      v_flow,
      a_oi
    };
  }

  /**
   * Event Divergence Engine: Flags forced unwinds when positioning and reality collide
   */
  public static evaluateEventDivergence(
    preEventPositioning: 'bullish' | 'bearish' | 'neutral',
    headlineResult: 'bullish' | 'bearish' | 'neutral'
  ): EventDivergenceResult {
    const pos_skew = preEventPositioning === 'bullish' ? 1 : (preEventPositioning === 'bearish' ? -1 : 0);
    const head_skew = headlineResult === 'bullish' ? 1 : (headlineResult === 'bearish' ? -1 : 0);
    
    const divergence = pos_skew - head_skew;
    let vanna_shock = 1.0;
    let unwind_risk = 'Low';

    if (Math.abs(divergence) >= 1 && pos_skew !== 0) {
      unwind_risk = Math.abs(divergence) === 2 ? 'Extreme' : 'High';
      vanna_shock = unwind_risk === 'Extreme' ? 2.5 : 1.8;
    }

    return {
      unwind_risk,
      vanna_shock,
      divergence
    };
  }
}
