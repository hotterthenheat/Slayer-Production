/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Orchestrator that assembles the "edge" analytics block from the individual
 * engines: realized vol / VRP, Breeden–Litzenberger RND, skew (with a rolling
 * percentile), the intraday charm/vanna clock, and the per-contract scenario
 * matrix + Kelly sizing. Computed per asset once per tick (cached) so the SSE
 * broadcast is cheap regardless of client count.
 */
import { Candle } from '../types';
import { ChainContract } from './v11Math';
import { computeRealizedVol, computeVRP, RealizedVolResult, VRPResult } from './realizedVol';
import { computeRiskNeutralDensity, RiskNeutralResult } from './riskNeutral';
import { computeSkew, percentileRank, SkewResult } from './skewAnalytics';
import { computeDealerClock, DealerClock } from './dealerClock';
import { computeScenarioMatrix, ScenarioMatrix } from './scenarioMatrix';
import { kellySize, KellyResult } from './sizing';

export interface EdgeHistory { rr: number[]; bf: number[]; }

export interface AssetEdge {
  realizedVol: RealizedVolResult;
  vrp: VRPResult;
  skew: (SkewResult & { rrPercentile: number; bfPercentile: number }) | null;
  rnd: RiskNeutralResult | null;
  dealerClock: DealerClock;
  rndDteDays: number;
}

export interface ContractEdge {
  kelly: KellyResult;
  scenario: ScenarioMatrix;
}

const HISTORY_CAP = 240;
function pushCap(arr: number[], v: number) {
  if (!isFinite(v)) return;
  arr.push(v);
  if (arr.length > HISTORY_CAP) arr.shift();
}

export function computeAssetEdge(params: {
  chain: ChainContract[];
  candles: Candle[];
  spot: number;
  rndDteDays: number;
  netCharm: number;
  netVanna: number;
  history: EdgeHistory;
}): AssetEdge {
  const { chain, candles, spot, rndDteDays, netCharm, netVanna, history } = params;
  const skewRaw = computeSkew(chain, spot);
  const atmIv = skewRaw?.atmIv ?? 0.2;
  const realizedVol = computeRealizedVol(candles, 20);
  const vrp = computeVRP(atmIv, candles, 20);
  const rnd = computeRiskNeutralDensity(chain, spot, rndDteDays, 0.05);
  const dealerClock = computeDealerClock(netCharm, netVanna);

  let skew: AssetEdge['skew'] = null;
  if (skewRaw) {
    pushCap(history.rr, skewRaw.riskReversal25);
    pushCap(history.bf, skewRaw.butterfly25);
    skew = {
      ...skewRaw,
      rrPercentile: percentileRank(history.rr, skewRaw.riskReversal25),
      bfPercentile: percentileRank(history.bf, skewRaw.butterfly25),
    };
  }
  return { realizedVol, vrp, skew, rnd, dealerClock, rndDteDays };
}

export function computeContractEdge(params: {
  spot: number;
  strike: number;
  dteDays: number;
  iv: number;
  isCall: boolean;
  entryPrice: number;
  winPct: number; // 0..1
  riskReward: number;
}): ContractEdge {
  const { spot, strike, dteDays, iv, isCall, entryPrice, winPct, riskReward } = params;
  // Kelly from the calibrated win-rate using R/R as the win:loss payoff ratio.
  const kelly = kellySize(winPct, Math.max(0.1, riskReward), 1, 0.5);
  const scenario = computeScenarioMatrix({ spot, strike, dteDays, iv, isCall, entryPrice, quantity: 1 });
  return { kelly, scenario };
}
