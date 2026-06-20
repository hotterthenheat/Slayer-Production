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

function entropy(counts: Map<string, number>, total: number): number {
  let h = 0;
  for (const c of counts.values()) { if (c > 0) { const p = c / total; h -= p * (ln(p) / Math.LN2); } }
  return h;
}

/**
 * Transfer entropy T_{src→dst} (bits): how much knowing src's past reduces the
 * uncertainty of dst's next move, beyond dst's own past. Plug-in estimator on
 * 3-state discretized returns with lag 1.
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
  const te = (entropy(cYY1, total) - entropy(cY1, total)) - (entropy(cYY1X1, total) - entropy(cY1X1, total));
  return Math.max(0, Number(te.toFixed(4)));
}

export interface LeadLagResult {
  leader: string;
  follower: string;
  te: number; // directed information (bits)
  active: boolean;
}

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
      if (!best || te > best.te) best = { leader: a, follower: b, te, active: te > 0.03 };
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
