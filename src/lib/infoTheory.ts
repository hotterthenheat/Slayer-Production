/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Information-theoretic tools:
 *   • Transfer Entropy — directed (time-asymmetric) information flow between two
 *     assets; proves which one LEADS (causation, not correlation).
 *   • Fisher Information divergence — distance between the recent and prior return
 *     distributions on the statistical manifold; flags a structural/regime shift
 *     before price breaks.
 */
import { Candle } from '../types';

const ln = Math.log;
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const variance = (a: number[]) => { if (a.length < 2) return 0; const m = mean(a); return a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1); };

function logReturns(c: Candle[]): number[] { const px = c.map((k) => k.close); const r: number[] = []; for (let i = 1; i < px.length; i++) if (px[i] > 0 && px[i - 1] > 0) r.push(ln(px[i] / px[i - 1])); return r; }

/** Discretize returns into 3 states (down/flat/up) using a volatility deadband. */
function discretize(rets: number[]): number[] {
  const sd = Math.sqrt(variance(rets)) || 1e-9;
  const band = 0.33 * sd;
  return rets.map((r) => (r > band ? 2 : r < -band ? 0 : 1));
}

/**
 * Plug-in (maximum-likelihood) Shannon entropy in bits, with optional
 * Miller-Madow bias correction. The plug-in estimator is NEGATIVELY biased on
 * short windows by ≈ (K̂−1)/(2N) (K̂ = number of observed non-empty bins,
 * N = sample count) — it UNDERESTIMATES the true entropy; Miller-Madow ADDS
 * exactly that term. We return H_plugin and (K̂−1) separately so the caller can
 * assemble the bias correction with the correct sign for each entropy term of
 * the TE decomposition.
 */
function entropyMM(counts: Map<string, number>, total: number): { h: number; kHat: number } {
  let h = 0, kHat = 0;
  for (const c of counts.values()) { if (c > 0) { kHat++; const p = c / total; h -= p * (ln(p) / Math.LN2); } }
  return { h, kHat };
}

/**
 * Transfer entropy T_{src→dst} (bits): how much knowing src's past reduces the
 * uncertainty of dst's next move, beyond dst's own past. Plug-in estimator on
 * 3-state discretized returns with lag 1, DE-BIASED with the Miller-Madow
 * correction so independent series collapse toward 0 instead of a spurious
 * positive value. Clamped to ≥ 0 (negative estimates are pure noise).
 */
export function transferEntropy(srcRets: number[], dstRets: number[]): number {
  const n = Math.min(srcRets.length, dstRets.length);
  if (n < 30) return 0;
  const s = discretize(srcRets.slice(-n));
  const d = discretize(dstRets.slice(-n));
  // Joint counts for H(dst_t, dst_{t-1}) and H(dst_t, dst_{t-1}, src_{t-1}).
  const cYY1 = new Map<string, number>(); // (dst_t, dst_{t-1})
  const cY1 = new Map<string, number>();  // (dst_{t-1})
  const cYY1X1 = new Map<string, number>(); // (dst_t, dst_{t-1}, src_{t-1})
  const cY1X1 = new Map<string, number>(); // (dst_{t-1}, src_{t-1})
  let total = 0;
  for (let t = 1; t < n; t++) {
    const yt = d[t], y1 = d[t - 1], x1 = s[t - 1];
    cYY1.set(`${yt},${y1}`, (cYY1.get(`${yt},${y1}`) || 0) + 1);
    cY1.set(`${y1}`, (cY1.get(`${y1}`) || 0) + 1);
    cYY1X1.set(`${yt},${y1},${x1}`, (cYY1X1.get(`${yt},${y1},${x1}`) || 0) + 1);
    cY1X1.set(`${y1},${x1}`, (cY1X1.get(`${y1},${x1}`) || 0) + 1);
    total++;
  }
  if (total === 0) return 0;
  // TE = H(Y_t|Y_{t-1}) − H(Y_t|Y_{t-1},X_{t-1})
  //    = [H(Y_t,Y_{t-1}) − H(Y_{t-1})] − [H(Y_t,Y_{t-1},X_{t-1}) − H(Y_{t-1},X_{t-1})]
  const yy1 = entropyMM(cYY1, total);
  const y1 = entropyMM(cY1, total);
  const yy1x1 = entropyMM(cYY1X1, total);
  const y1x1 = entropyMM(cY1X1, total);
  const tePlugin = (yy1.h - y1.h) - (yy1x1.h - y1x1.h);
  // Miller-Madow: the plug-in H is NEGATIVELY biased; the de-biased estimate adds
  // (K̂−1)/(2N) nats ⇒ /ln2 for bits to EACH term. Carrying those corrections
  // through the TE decomposition with its own signs yields a single combined
  // term. Because the 3-variable joint (Y_t,Y_{t-1},X_{t-1}) has the most bins,
  // the combined correction is net-negative — which is exactly what removes the
  // POSITIVE small-sample bias that makes independent series report TE>0.
  const mmBits = ((yy1.kHat - 1) - (y1.kHat - 1) - (yy1x1.kHat - 1) + (y1x1.kHat - 1)) / (2 * total * Math.LN2);
  const te = tePlugin + mmBits;
  return Math.max(0, Number(te.toFixed(4)));
}

export interface LeadLagResult {
  leader: string;
  follower: string;
  te: number; // directed information (bits)
  active: boolean;
}

/**
 * Activation floor for `marketLeader`, in bits. RE-TUNED for the Miller-Madow
 * de-biased TE scale. The old 0.03 floor was set against the positively-biased
 * plug-in estimator. After de-biasing, an INDEPENDENT pair's TE collapses toward
 * 0 but still has a residual sampling tail (empirically p99 ≈ 0.06–0.08 bits for
 * ~120–160-bar windows). 0.10 bits clears that noise tail on every realistic
 * window while genuine lead→lag coupling lands at ≥0.4 bits — so an "active"
 * leader now reflects real directed information, not small-sample noise.
 */
const MARKET_LEADER_TE_THRESHOLD = 0.10;

/** Find the dominant lead→lag pair across the index complex by transfer entropy. */
export function marketLeader(series: Record<string, Candle[]>): LeadLagResult | null {
  const tickers = Object.keys(series);
  if (tickers.length < 2) return null;
  const rets: Record<string, number[]> = {};
  for (const t of tickers) rets[t] = logReturns(series[t] || []);
  let best: LeadLagResult | null = null;
  for (const a of tickers) {
    for (const b of tickers) {
      if (a === b) continue;
      const te = transferEntropy(rets[a], rets[b]); // a → b
      if (!best || te > best.te) best = { leader: a, follower: b, te, active: te > MARKET_LEADER_TE_THRESHOLD };
    }
  }
  return best;
}

export interface FisherResult {
  divergence: number;
  structuralShift: boolean;
}

/**
 * Fisher-information / Fisher-Rao divergence between the recent and prior return
 * distributions (Gaussian approximation). Symmetric-KL between N(m1,s1²) and
 * N(m2,s2²) measures how far the market's statistical "rules" have moved.
 */
export function fisherDivergence(candles: Candle[], window = 30): FisherResult {
  const rets = logReturns(candles);
  if (rets.length < 2 * window) return { divergence: 0, structuralShift: false };
  const recent = rets.slice(-window);
  const prior = rets.slice(-2 * window, -window);
  const m1 = mean(recent), m2 = mean(prior);
  const v1 = variance(recent) || 1e-12, v2 = variance(prior) || 1e-12;
  const dm2 = (m1 - m2) * (m1 - m2);
  // Symmetric KL (Jeffreys divergence) of the two Gaussians.
  const div = 0.5 * ((v1 + dm2) / v2 + (v2 + dm2) / v1 - 2);
  return { divergence: Number(div.toFixed(3)), structuralShift: div > 1.5 };
}
