/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * edgeTracker — the moat. Computing dealer GEX is a commodity; PROVING the read precedes price
 * is the defensible asset. This module turns each GEX-outlook read (a falsifiable forecast: a
 * regime + directional bias + a target level + a confidence) into a scored outcome once the
 * forward price path is known, then rolls those outcomes into an honest, calibrated track record.
 *
 * Pure and deterministic — no storage, no clock, no globals — so the edge math is unit-testable
 * and reproducible. Persistence/lifecycle lives in edgeLedger; this file is just the scoring IP.
 *
 * Scoring is regime-correct: a 'sideways' read (PINNING/RANGE) is a bet that price STAYS — scored
 * on realized range; a directional read (TREND/SQUEEZE) is a bet price MOVES toward the target —
 * scored on net move in the bias direction, max favorable vs adverse excursion, and whether the
 * target was reached. Provenance (live vs model) is carried through and NEVER conflated.
 */
import { GexOutlook } from './terminalRead';

export type ReadVerdict = 'hit' | 'partial' | 'flat' | 'miss';

export interface ReadSnapshot {
  id: string;
  ts: number;                 // when the read was taken (ms)
  ticker: string;
  spot: number;               // spot at read time (the anchor)
  regime: GexOutlook['regime'];
  bias: GexOutlook['bias'];   // 'up' | 'down' | 'sideways'
  target?: number;            // level price is drawn toward (magnet/wall/flip)
  confidence: number;         // 0..100 (the read's own stated confidence)
  provenance: 'live' | 'model';
}

export interface ReadResolution {
  barsForward: number;
  endReturnPct: number;       // (end - spot) / spot * 100
  maxFavorablePct: number;    // best excursion in the predicted direction (≥0; range for sideways)
  maxAdversePct: number;      // worst excursion against the prediction (≥0)
  reachedTarget: boolean;
  verdict: ReadVerdict;
  score: number;              // -1..1 continuous edge contribution
}

export interface ScoredRead extends ReadSnapshot { resolution: ReadResolution; }

export interface ScoreOpts {
  /** Net move (%) in the predicted direction that counts as a real directional hit. */
  moveThreshPct?: number;
  /** Realized range (%) at/under which a 'sideways' read counts as a clean pin. */
  pinThreshPct?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Score a single read against the forward path (closes AFTER the snapshot, oldest→newest).
 * Returns null only if there is no forward data to judge against.
 */
export function scoreRead(snap: ReadSnapshot, forwardCloses: number[], opts: ScoreOpts = {}): ReadResolution | null {
  const path = forwardCloses.filter(v => typeof v === 'number' && isFinite(v) && v > 0);
  if (!path.length || !(snap.spot > 0)) return null;

  const moveThresh = opts.moveThreshPct ?? 0.15; // ~index intraday short-horizon move
  const pinThresh = opts.pinThreshPct ?? 0.25;
  const s0 = snap.spot;
  const end = path[path.length - 1];
  const hi = Math.max(...path), lo = Math.min(...path);
  const endReturnPct = ((end - s0) / s0) * 100;
  const upExcPct = ((hi - s0) / s0) * 100;     // ≥ may be negative if price only fell
  const dnExcPct = ((lo - s0) / s0) * 100;     // ≤ 0 typically
  const rangePct = ((hi - lo) / s0) * 100;

  if (snap.bias === 'sideways') {
    // Bet: price holds. Reward tightness; penalize breakout/trend-away.
    const drift = Math.abs(endReturnPct);
    const nearTargetEnd = snap.target == null || Math.abs((end - snap.target) / s0) * 100 <= pinThresh;
    const pinned = rangePct <= pinThresh && drift <= pinThresh * 0.7 && nearTargetEnd;
    const brokeOut = rangePct >= pinThresh * 2.2 || drift >= pinThresh * 1.8;
    const verdict: ReadVerdict = pinned ? 'hit' : brokeOut ? 'miss' : 'partial';
    const score = clamp(1 - rangePct / pinThresh, -1, 1);
    return { barsForward: path.length, endReturnPct, maxFavorablePct: rangePct, maxAdversePct: Math.max(0, rangePct - pinThresh), reachedTarget: pinned, verdict, score };
  }

  // Directional read.
  const dir = snap.bias === 'up' ? 1 : -1;
  const dirRet = dir * endReturnPct;                       // net realized in the predicted direction
  const favorablePct = Math.max(0, dir > 0 ? upExcPct : -dnExcPct);
  const adversePct = Math.max(0, dir > 0 ? -dnExcPct : upExcPct);
  const reachedTarget = snap.target != null
    ? (dir > 0 ? hi >= snap.target && snap.target >= s0 : lo <= snap.target && snap.target <= s0)
    : false;

  let verdict: ReadVerdict;
  if (dirRet >= moveThresh || reachedTarget) verdict = (adversePct <= favorablePct ? 'hit' : 'partial');
  else if (dirRet <= -moveThresh) verdict = 'miss';
  else if (Math.abs(dirRet) < moveThresh * 0.5 && favorablePct < moveThresh) verdict = 'flat';
  else verdict = 'partial';

  // Continuous edge: net direction + half the favorable excursion, minus half the adverse,
  // normalized to ±(3× threshold). Reaching the target nudges it up.
  let score = (dirRet + 0.5 * favorablePct - 0.5 * adversePct) / (moveThresh * 3);
  if (reachedTarget) score += 0.15;
  return { barsForward: path.length, endReturnPct, maxFavorablePct: favorablePct, maxAdversePct: adversePct, reachedTarget, verdict, score: clamp(score, -1, 1) };
}

const VERDICT_CREDIT: Record<ReadVerdict, number> = { hit: 1, partial: 0.5, flat: 0, miss: 0 };

export interface CalibrationBucket { label: string; n: number; predicted: number; realized: number; }
export interface TrackRecord {
  n: number;                    // resolved reads
  hitRate: number;              // 0..100, credit-weighted (hit=1, partial=0.5)
  cleanHits: number;            // verdict === 'hit'
  misses: number;
  avgScore: number;             // -1..1
  byRegime: { regime: string; n: number; hitRate: number }[];
  calibration: CalibrationBucket[];
  calibrationError: number;     // 0..100, mean |predicted − realized| (lower = better calibrated)
}

const EMPTY_TRACK: TrackRecord = { n: 0, hitRate: 0, cleanHits: 0, misses: 0, avgScore: 0, byRegime: [], calibration: [], calibrationError: 0 };

/** Roll scored reads into an honest track record. Caller pre-filters by provenance — never mix. */
export function summarize(scored: ScoredRead[]): TrackRecord {
  if (!scored.length) return { ...EMPTY_TRACK };
  const credit = (r: ScoredRead) => VERDICT_CREDIT[r.resolution.verdict];
  const n = scored.length;
  const hitRate = (scored.reduce((a, r) => a + credit(r), 0) / n) * 100;
  const cleanHits = scored.filter(r => r.resolution.verdict === 'hit').length;
  const misses = scored.filter(r => r.resolution.verdict === 'miss').length;
  const avgScore = scored.reduce((a, r) => a + r.resolution.score, 0) / n;

  const regimes = new Map<string, ScoredRead[]>();
  for (const r of scored) { const g = regimes.get(r.regime) || []; g.push(r); regimes.set(r.regime, g); }
  const byRegime = [...regimes.entries()]
    .map(([regime, g]) => ({ regime, n: g.length, hitRate: (g.reduce((a, r) => a + credit(r), 0) / g.length) * 100 }))
    .sort((a, b) => b.n - a.n);

  // Calibration: predicted confidence vs realized credit, bucketed.
  const buckets: { label: string; lo: number; hi: number }[] = [
    { label: '0–40', lo: 0, hi: 40 }, { label: '40–60', lo: 40, hi: 60 },
    { label: '60–80', lo: 60, hi: 80 }, { label: '80–100', lo: 80, hi: 101 },
  ];
  const calibration: CalibrationBucket[] = [];
  let calErrNum = 0, calErrDen = 0;
  for (const b of buckets) {
    const g = scored.filter(r => r.confidence >= b.lo && r.confidence < b.hi);
    if (!g.length) continue;
    const predicted = g.reduce((a, r) => a + r.confidence, 0) / g.length;
    const realized = (g.reduce((a, r) => a + credit(r), 0) / g.length) * 100;
    calibration.push({ label: b.label, n: g.length, predicted, realized });
    calErrNum += Math.abs(predicted - realized) * g.length; calErrDen += g.length;
  }
  const calibrationError = calErrDen ? calErrNum / calErrDen : 0;

  return { n, hitRate, cleanHits, misses, avgScore, byRegime, calibration, calibrationError };
}
