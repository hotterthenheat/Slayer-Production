/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SeededRandom } from './v11Math';
import { stdNormalCDF, stdNormalPDF } from './normalDist';

// ==========================================
// MODEL 1: ROBUST BLACK-SCHOLES-MERTON ENGINE WITH HIGHER-ORDER GREEKS
// ==========================================

export interface BSMGreeks {
  price: number;
  delta: number;
  vega: number;
  gamma: number;
  vanna: number;
  charm: number;
  speed: number;
  color: number;
}

// High-accuracy standard-normal CDF/PDF (Hart/West, ~1e-15) now live in
// ./normalDist; re-exported so existing `from './pinpointEngine'` imports keep working.
export { stdNormalCDF, stdNormalPDF };

/**
 * Calculates option prix and analytical greeks including 1st, 2nd, and 3rd order.
 */
export function calculateBSMGreeks(
  S: number,
  K: number,
  tau: number, // Time to expiration in years
  r: number,   // Continuous risk-free rate
  q: number,   // Continuous dividend yield
  sigma: number, // Implied Volatility
  isCall: boolean
): BSMGreeks {
  // Guard degenerate/non-finite inputs: Math.max(NaN, x) === NaN, so the floors
  // below would NOT catch a NaN spot/strike/σ/τ — and a single NaN Greek poisons
  // the whole dealer-exposure profile (and the UI). Abstain to flat/zero instead.
  if (!(S > 0) || !(K > 0) || !isFinite(tau) || !isFinite(sigma)) {
    return { price: 0.01, delta: 0, vega: 0, gamma: 0, vanna: 0, charm: 0, speed: 0, color: 0 };
  }
  const tBounded = Math.max(tau, 1e-5);
  const sigBounded = Math.max(sigma, 1e-5);
  const sqrtTau = Math.sqrt(tBounded);

  // d1 and d2
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigBounded * sigBounded) * tBounded) / (sigBounded * sqrtTau);
  const d2 = d1 - sigBounded * sqrtTau;

  const n_d1 = stdNormalPDF(d1);
  const N_d1 = stdNormalCDF(d1);
  const N_d2 = stdNormalCDF(d2);

  // Price
  let price = 0;
  if (isCall) {
    price = S * Math.exp(-q * tBounded) * N_d1 - K * Math.exp(-r * tBounded) * N_d2;
  } else {
    price = K * Math.exp(-r * tBounded) * stdNormalCDF(-d2) - S * Math.exp(-q * tBounded) * stdNormalCDF(-d1);
  }
  price = Math.max(0.01, price);

  // Delta
  const delta = isCall 
    ? Math.exp(-q * tBounded) * N_d1 
    : Math.exp(-q * tBounded) * (N_d1 - 1.0);

  // Vega
  const vega = S * Math.exp(-q * tBounded) * sqrtTau * n_d1;

  // Gamma (2nd order)
  const gamma = (Math.exp(-q * tBounded) * n_d1) / (S * sigBounded * sqrtTau);

  // Vanna (2nd order, d(Delta)/d(Vol) or d(Vega)/d(Asset))
  const vanna = -Math.exp(-q * tBounded) * n_d1 * (d2 / sigBounded);

  // Charm (Delta decay per day)
  let charm = 0;
  if (isCall) {
    charm = (q * Math.exp(-q * tBounded) * N_d1 - 
             Math.exp(-q * tBounded) * n_d1 * ((r - q) / (sigBounded * sqrtTau) - d2 / (2.0 * tBounded))) / 365.0;
  } else {
    charm = (-q * Math.exp(-q * tBounded) * stdNormalCDF(-d1) - 
             Math.exp(-q * tBounded) * n_d1 * ((r - q) / (sigBounded * sqrtTau) - d2 / (2.0 * tBounded))) / 365.0;
  }

  // Speed (3rd order, d(Gamma)/d(Asset))
  const speed = -(gamma / S) * (1.0 + d1 / (sigBounded * sqrtTau));

  // Color (3rd order, Gamma decay per day)
  const color = gamma * (q + (r - q) * d1 / (sigBounded * sqrtTau) + (1.0 - d1 * d2) / (2.0 * tBounded)) / 365.0;

  return {
    price,
    delta,
    vega,
    gamma,
    vanna,
    charm,
    speed,
    color
  };
}

// ==========================================
// MODEL 2: STOCHASTIC VOLATILITY INSPIRED (SVI) OPTION SURFACE ENGINE
// ==========================================

export interface SVIParams {
  a: number;
  b: number;
  rho: number;
  m: number;
  sigma: number;
}

/**
 * Gatheral SVI Implied Variance formula
 * @param k Log-moneyness k = ln(K / F) or ln(K / S)
 * @param params [a, b, rho, m, sigma] SVI parameters
 */
export function rawSVI(k: number, params: SVIParams): number {
  const { a, b, rho, m, sigma } = params;
  return a + b * (rho * (k - m) + Math.sqrt((k - m) * (k - m) + sigma * sigma));
}

/**
 * SVI Slice Calibration checks for butterfly and calendar arbitrage
 */
export class SVISurfaceCalibrator {
  /**
   * Verifies butterfly arbitrage on an SVI slice for a given range of log-moneyness.
   * Uses helper function g(k). Slice passes if and only if g(k) >= 0 everywhere.
   */
  static checkButterflyArbitrage(kRange: number[], params: SVIParams): boolean {
    const { a, b, rho, m, sigma } = params;
    
    for (const k of kRange) {
      const distance = k - m;
      const sqrtTerm = Math.sqrt(distance * distance + sigma * sigma);
      const w = a + b * (rho * distance + sqrtTerm);

      if (w <= 0) return false; // Non-negativity constraint violated

      // Derivatives w' and w''
      const dw_dk = b * (rho + distance / sqrtTerm);
      const d2w_dk2 = (b * sigma * sigma) / (sqrtTerm * sqrtTerm * sqrtTerm);

      // g(k) helper
      const term1_temp = 1.0 - (k * dw_dk) / (2.0 * w);
      const term1 = term1_temp * term1_temp;
      const term2 = (dw_dk * dw_dk / 4.0) * (1.0 / w + 0.25);
      const term3 = d2w_dk2 / 2.0;

      const g = term1 - term2 + term3;
      if (g < 0) {
        return false; // Butterfly arbitrage present!
      }
    }
    return true;
  }

  /**
   * Verifies calendar spread arbitrage between two maturities.
   * Needs total variance to be strictly non-decreasing with respect to time to expiration:
   * w_T2(k) >= w_T1(k) for all k when T2 > T1.
   */
  static checkCalendarArbitrage(kRange: number[], params1: SVIParams, params2: SVIParams): boolean {
    for (const k of kRange) {
      const w1 = rawSVI(k, params1);
      const w2 = rawSVI(k, params2);
      if (w2 < w1) {
        return false; // Calendar spread arbitrage present!
      }
    }
    return true;
  }

  /**
   * Quick heuristic solver to calibrate SVI slice parameters to market implied variances
   */
  static calibrateSliceHeuristic(
    kAndVariances: { k: number; marketVariance: number }[]
  ): SVIParams {
    let bestParams: SVIParams = { a: 0.04, b: 0.1, rho: -0.3, m: 0.0, sigma: 0.1 };
    let minError = Infinity;

    // Search grid of typical SVI parameter structures to fit safely
    const aCandidates = [0.01, 0.03, 0.05, 0.08];
    const bCandidates = [0.05, 0.1, 0.2, 0.4];
    const rhoCandidates = [-0.7, -0.4, -0.1, 0.1, 0.4];
    const mCandidates = [-0.1, 0.0, 0.1];
    const sigmaCandidates = [0.05, 0.1, 0.2];

    for (const a of aCandidates) {
      for (const b of bCandidates) {
        for (const rho of rhoCandidates) {
          for (const m of mCandidates) {
            for (const sigma of sigmaCandidates) {
              // Enforce SVI physical lower bound constraint: a + b * sigma * sqrt(1 - rho^2) >= 0
              if (a + b * sigma * Math.sqrt(1.0 - rho * rho) < 0) continue;

              const params: SVIParams = { a, b, rho, m, sigma };
              let totalError = 0;
              for (const pt of kAndVariances) {
                const fittedVar = rawSVI(pt.k, params);
                totalError += (fittedVar - pt.marketVariance) * (fittedVar - pt.marketVariance);
              }

              if (totalError < minError) {
                minError = totalError;
                bestParams = params;
              }
            }
          }
        }
      }
    }

    return bestParams;
  }
}

// ==========================================
// MODEL 3: DUPIRE LOCAL VOLATILITY SURFACE SOLVER
// ==========================================

export class DupireLocalVolSolver {
  /**
   * Projects instantaneous Local Volatility from the implied variance surface w(k, \tau)
   * using finite differences for derivatives.
   */
  static solveLocalVol(
    k: number,
    tau: number,
    paramsAtTau: SVIParams,
    paramsAtTauPlus: SVIParams, // Slice slightly shifted in time for dW/dT
    dT = 0.01
  ): number {
    const w = rawSVI(k, paramsAtTau);
    const wPlus = rawSVI(k, paramsAtTauPlus);

    // Bounded minimums to protect numerical solver
    const wBounded = Math.max(w, 1e-4);
    const tauBounded = Math.max(tau, 1e-4);

    // 1. Time derivative: dW / dT. Floor at a small fraction of the variance
    // level rather than a hard 0 — a flat/slightly-decreasing slice (a normal
    // numerical artifact at the wings) then degrades smoothly instead of snapping
    // to the implied-vol fallback.
    const dw_dtau = Math.max(1e-6 * wBounded, (wPlus - w) / dT);

    // 2. Spatial derivatives of SVI model analytically
    const { a, b, rho, m, sigma } = paramsAtTau;
    const distance = k - m;
    const sqrtTerm = Math.sqrt(distance * distance + sigma * sigma);

    const dw_dk = b * (rho + distance / sqrtTerm);
    const d2w_dk2 = (b * sigma * sigma) / (sqrtTerm * sqrtTerm * sqrtTerm);

    // 3. Dupire continuous denominator solver operating on log-moneyness.
    // Canonical Gatheral local-vol-in-total-variance denominator:
    //   D = 1 − (k/w)·w' + (1/4)(−1/4 − 1/w + k²/w²)·(w')² + (1/2)·w''
    // (the first term is LINEAR, not the squared Durrleman (1 − k·w'/2w)² used for
    // the butterfly g(k) test — squaring it injects a spurious +k²w'²/4w² term that
    // biases local vol away from the money. Verified against price-space Dupire.)
    const den_term1 = 1.0 - (k * dw_dk) / wBounded;

    const den_term2 = (dw_dk * dw_dk / 4.0) * (-0.25 - 1.0 / wBounded + (k * k) / (wBounded * wBounded));
    const den_term3 = d2w_dk2 / 2.0;

    const denominator = den_term1 + den_term2 + den_term3;

    // Enforce local boundary stability
    if (denominator <= 1e-6) {
      return Math.sqrt(wBounded / tauBounded); // Fallback to implied vol
    }

    const localVolSq = dw_dtau / denominator;
    if (localVolSq <= 0 || isNaN(localVolSq)) {
      return Math.sqrt(wBounded / tauBounded); // Safe lower boundary
    }

    return Math.max(0.01, Math.min(3.5, Math.sqrt(localVolSq)));
  }
}

// ==========================================
// MODEL 4: DEALER GEX, VEX, AND CEX EXPOSURE ENGINE
// ==========================================

export interface DealerExposures {
  gexStrike: number;
  vexStrike: number;
  cexStrike: number;
}

export class DealerExposureEngine {
  /**
   * Computes signed dealer exposures per strike assuming dealers are net SHORT inventory.
   */
  static calculateExposures(
    S: number,
    K: number,
    tau: number,
    r: number,
    q: number,
    sigma: number,
    isCall: boolean,
    openInterest: number
  ): DealerExposures {
    const greeks = calculateBSMGreeks(S, K, tau, r, q, sigma, isCall);

    // In dealer flow conventions, calls add positive delta/gamma, puts add negative under standard hedging signs
    const typeSign = isCall ? 1 : -1;

    // GEX: Shares needed to hedge per 1% move of the underlying (gamma * OI * 100 * S^2 * 0.01) * sign
    const gexStrike = greeks.gamma * openInterest * 100 * S * S * 0.01 * typeSign;

    // VEX: Changes in dealer delta hedging per 1% absolute IV shift (vanna * OI * 100 * S * 0.01) * sign
    const vexStrike = greeks.vanna * openInterest * 100 * S * 0.01 * typeSign;

    // CEX: 24h dealer delta-decay (charm * OI * 100 * S) * sign. greeks.charm is
    // ALREADY in per-day units (÷365 inside calculateBSMGreeks), so do NOT divide
    // by 365 again. (GEX uses S²·0.01, VEX uses S·0.01, CEX uses raw S — three
    // intentionally different scalings, not a bug.)
    const cexStrike = greeks.charm * openInterest * 100 * S * typeSign;

    return {
      gexStrike,
      vexStrike,
      cexStrike
    };
  }

  /**
   * Aggregates the option chain into net totals
   */
  static aggregateChainExposures(
    S: number,
    r: number,
    q: number,
    contracts: {
      strike: number;
      isCall: boolean;
      oi: number;
      iv: number;
      tau: number;
    }[]
  ) {
    let netGex = 0;
    let netVex = 0;
    let netCex = 0;

    const strikesMap: { strike: number; gex: number; vex: number; cex: number }[] = [];

    for (const c of contracts) {
      const exp = this.calculateExposures(S, c.strike, c.tau, r, q, c.iv, c.isCall, c.oi);
      netGex += exp.gexStrike;
      netVex += exp.vexStrike;
      netCex += exp.cexStrike;

      strikesMap.push({
        strike: c.strike,
        gex: exp.gexStrike,
        vex: exp.vexStrike,
        cex: exp.cexStrike
      });
    }

    return {
      netGex,
      netVex,
      netCex,
      strikesMap
    };
  }
}

// ==========================================
// MODEL 5: PHYSICS POTENTIAL FIELDS & DRIFT PROPAGATION (THE CASCADES ENGINE)
// ==========================================

export class PhysicsCascadeEngine {
  /**
   * Computes the mathematical acceleration force vector F = -dU/dS acting on price S.
   */
  static calculateHedgingForce(
    S: number,
    strikes: number[],
    gex: number[],
    orderBookLevels: number[],
    orderBookLiquidity: number[],
    meanReversionTarget: number,
    theta: number, // Mean reversion speed coefficient
    widthScale = 1.2
  ): number {
    // 1. GEX Potential Force (Gaussian wells)
    // Positive GEX attracts (gravity wells), negative GEX repels (accelerators)
    let gexForce = 0.0;
    for (let i = 0; i < strikes.length; i++) {
      const K = strikes[i];
      const G = gex[i] || 0;
      const distance = S - K;
      const dDecayBoundary = S * 0.015 * widthScale;
      const variance = dDecayBoundary * dDecayBoundary;
      
      const exponential = Math.exp(-(distance * distance) / (2.0 * variance));
      
      // Force is the negative gradient of the Gaussian potential well
      // U_gex = −G·exp(−d²/2v):  F = −dU/dS = −G·(d/v)·exp(−d²/2v).
      // Positive G is an attractive pin (S > K ⇒ negative force pulling down toward K;
      // S < K ⇒ positive force pulling up), matching the LOB/MR terms' −∇U sign and the
      // long-gamma pinning convention. (The prior code dropped this leading minus, making
      // positive GEX repel — backwards from the documented model.)
      gexForce -= G * (distance / variance) * exponential;
    }

    // 2. Limit Order Book Force (Logarithmic potential wells)
    // Pulls spot back to highly dense capitalization blocks
    let liqForce = 0.0;
    for (let j = 0; j < orderBookLevels.length; j++) {
      const K = orderBookLevels[j];
      const L = orderBookLiquidity[j] || 0;
      const distance = S - K;
      const sign = distance > 0 ? 1 : distance < 0 ? -1 : 0;
      const absDistance = Math.abs(distance);

      // Force contribution is negative gradient: -dU_lob/dS = -L * sign(d) / (1 + |d|)
      liqForce -= L * sign / (1.0 + absDistance);
    }

    // 3. Structural Mean Reversion Force
    // Pulls spot back to volatility-calibrated default anchor mu
    const mrForce = -theta * (S - meanReversionTarget);

    // Sum of external force-acceleration contributions
    return gexForce + liqForce + mrForce;
  }

  /**
   * Runs a high-fidelity multi-path Monte Carlo Euler-Maruyama stochastic path projection
   */
  static simulatePaths(
    S0: number,
    strikes: number[],
    gex: number[],
    orderBookLevels: number[],
    orderBookLiquidity: number[],
    meanReversionTarget: number,
    theta: number,
    kappa: number,       // Market elasticity force coupling coefficient
    localVol: number,    // Dupire continuous local vol
    timeHorizon: number, // Exp in years
    steps = 40,
    paths = 100,
    r = 0.05,
    q = 0.0
  ) {
    const dt = timeHorizon / steps;
    const sqrtDt = Math.sqrt(dt);
    
    // Seeded generator for deterministic, replicable trails
    const lcg = new SeededRandom(1337 + Math.round(S0));

    const pathMatrix: number[][] = Array.from({ length: paths }).map(() =>
      new Array(steps + 1).fill(0)
    );

    // Initialize initial spot
    for (let p = 0; p < paths; p++) {
      pathMatrix[p][0] = S0;
    }

    for (let t = 0; t < steps; t++) {
      for (let p = 0; p < paths; p++) {
        const St = pathMatrix[p][t];

        // Solve physical acceleration draft force acting at specific state S_t
        const F = this.calculateHedgingForce(
          St,
          strikes,
          gex,
          orderBookLevels,
          orderBookLiquidity,
          meanReversionTarget,
          theta,
          1.5
        );

        // Incorporate coupling coefficient into drift mechanics.
        // F (hedging force) is in PRICE units, so convert it to a *fractional*
        // drift (÷ St) before it enters the rate term, and bound it. Adding the
        // raw kappa·F to a rate and re-multiplying by St produced an enormous
        // per-step drift that pinned every simulated path at the $1 floor.
        const forceReturn = Math.max(-0.5, Math.min(0.5, (kappa * F) / Math.max(St, 1e-9)));
        const drift = (r - q + forceReturn) * St * dt;

        // Diffusion (Standard Brownian increment scaled by continuous local vol)
        const dW = lcg.nextNormal(0, 1);
        const diffusion = localVol * St * dW * sqrtDt;

        // Euler-Maruyama step integration
        let S_next = St + drift + diffusion;
        
        // Enforce physical boundary (no negative stock assets)
        if (S_next < 1.0) S_next = 1.0;

        pathMatrix[p][t + 1] = S_next;
      }
    }

    // Extract endpoint features
    const endpoints = pathMatrix.map(p => p[steps]);
    let sum = 0;
    for (const val of endpoints) sum += val;
    const meanTarget = sum / paths;

    let varSum = 0;
    for (const val of endpoints) {
      const dev = val - meanTarget;
      varSum += dev * dev;
    }
    const stdDevTarget = Math.sqrt(varSum / (paths - 1 || 1));
    const standardError = stdDevTarget / Math.sqrt(paths);

    // 95% Confidence Interval for paths expectation
    const z_95 = 1.96;
    const ci_lower = meanTarget - z_95 * standardError;
    const ci_upper = meanTarget + z_95 * standardError;

    return {
      paths: pathMatrix,
      mean: meanTarget,
      stdDev: stdDevTarget,
      standardError,
      ci95: [ci_lower, ci_upper] as [number, number],
      sampleSize: paths
    };
  }
}

// ==========================================
// MODEL 6: BAYESIAN REGIME CLASSIFICATION & UNCERTAINTY ENGINE
// ==========================================

export type MarketRegime = 'STABILIZED_PIN' | 'VOLATILITY_TRANSITION' | 'AMPLIFIED_SQUEEZE';

export class BayesianRegimeEngine {
  /**
   * Applies Bayesian Inference to classify market regimes based on [S_t, GEX_t, Vol_t]
   */
  static classifyRegime(
    netGex: number,
    ivRank: number,
    momentumVel: number
  ): {
    regime: MarketRegime;
    posteriors: Record<MarketRegime, number>;
  } {
    // Priors of the structural regimes: Pr(R)
    // 1. PIN: 45%. 2. TRANS: 35%. 3. SQUEEZE: 20%.
    const priors: Record<MarketRegime, number> = {
      STABILIZED_PIN: 0.45,
      VOLATILITY_TRANSITION: 0.35,
      AMPLIFIED_SQUEEZE: 0.20
    };

    // Classify likelihoods: Pr(X | R) modeled via standard distance indices
    let p_pin = 0.1;
    let p_trans = 0.1;
    let p_squeeze = 0.1;

    if (netGex >= 0) {
      // Clean Long GEX regime has higher likelihood for stable pinned ranges
      p_pin = Math.exp(-Math.abs(momentumVel) / 1.5) * 0.8;
      p_trans = (1.0 - Math.exp(-Math.abs(momentumVel) / 2.0)) * 0.5;
      p_squeeze = 0.05;
    } else {
      // Short GEX regime amplifies squeeze chances and transitioning swings
      p_squeeze = (1.0 - Math.exp(-Math.abs(momentumVel) / 2.5)) * 0.8;
      p_trans = 0.4;
      p_pin = 0.05;
    }

    // Dynamic adjustment by IV Rank
    if (ivRank < 30) {
      p_pin *= 1.4;
      p_squeeze *= 0.4;
    } else if (ivRank > 70) {
      p_squeeze *= 1.5;
      p_pin *= 0.3;
    }

    // Bayesian posterior solver: Pr(R_m | X) = Pr(X | R_m)*Pr(R_m) / Sum(Pr(X|R_j)*Pr(R_j))
    const p_pin_joint = p_pin * priors.STABILIZED_PIN;
    const p_trans_joint = p_trans * priors.VOLATILITY_TRANSITION;
    const p_squeeze_joint = p_squeeze * priors.AMPLIFIED_SQUEEZE;

    const joint_sum = p_pin_joint + p_trans_joint + p_squeeze_joint || 1;

    const posteriors: Record<MarketRegime, number> = {
      STABILIZED_PIN: p_pin_joint / joint_sum,
      VOLATILITY_TRANSITION: p_trans_joint / joint_sum,
      AMPLIFIED_SQUEEZE: p_squeeze_joint / joint_sum
    };

    // Determine highest posterior probability regime
    let regime: MarketRegime = 'STABILIZED_PIN';
    let maxProb = -1;
    for (const key of Object.keys(posteriors) as MarketRegime[]) {
      if (posteriors[key] > maxProb) {
        maxProb = posteriors[key];
        regime = key;
      }
    }

    return {
      regime,
      posteriors
    };
  }
}
