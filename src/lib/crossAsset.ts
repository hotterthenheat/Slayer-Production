/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cross-asset PCA statistical-arbitrage engine. Builds the market factor (first
 * principal component) across the index complex, then flags any asset whose
 * idiosyncratic residual diverges past a Z-score threshold — index-wide stat-arb
 * rather than primitive pairs trading. Keyless: uses the streamed candle returns.
 */
import { Candle } from '../types';

const ln = Math.log;
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const std = (a: number[]) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1)); };

function logReturns(px: number[]): number[] { const r: number[] = []; for (let i = 1; i < px.length; i++) if (px[i] > 0 && px[i - 1] > 0) r.push(ln(px[i] / px[i - 1])); return r; }

export interface PcaResidual {
  z: number; // idiosyncratic residual Z-score
  beta: number; // loading on the market factor
  active: boolean; // |z| > threshold
  direction: 'RICH' | 'CHEAP' | 'FAIR';
}

/**
 * @param series  ticker → candle array (aligned by recency).
 * @param window  number of returns to use.
 * @param zThresh divergence threshold (default 2σ).
 */
export function pcaResidualZScores(series: Record<string, Candle[]>, window = 60, zThresh = 2): Record<string, PcaResidual> {
  const tickers = Object.keys(series);
  const out: Record<string, PcaResidual> = {};
  if (tickers.length < 2) return out;

  // Build standardized return matrix (assets × time), aligned to the shortest length.
  const retsByTicker: Record<string, number[]> = {};
  let minLen = Infinity;
  for (const t of tickers) {
    const r = logReturns((series[t] || []).map((c) => c.close)).slice(-window);
    retsByTicker[t] = r;
    minLen = Math.min(minLen, r.length);
  }
  if (!isFinite(minLen) || minLen < 20) return out;
  const stdz: Record<string, number[]> = {};
  for (const t of tickers) {
    const r = retsByTicker[t].slice(-minLen);
    const m = mean(r), s = std(r) || 1;
    stdz[t] = r.map((x) => (x - m) / s);
  }

  // Correlation matrix C (assets × assets) on standardized returns.
  const n = tickers.length;
  const C: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const a = stdz[tickers[i]], b = stdz[tickers[j]];
      let dot = 0;
      for (let k = 0; k < minLen; k++) dot += a[k] * b[k];
      const c = dot / (minLen - 1);
      C[i][j] = c; C[j][i] = c;
    }
  }

  // Top eigenvector via power iteration → PC1 loadings (the market factor).
  let w = new Array(n).fill(1 / Math.sqrt(n));
  for (let iter = 0; iter < 60; iter++) {
    const nw = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) nw[i] += C[i][j] * w[j];
    const norm = Math.sqrt(nw.reduce((a, b) => a + b * b, 0)) || 1;
    for (let i = 0; i < n; i++) nw[i] /= norm;
    w = nw;
  }
  // Factor time series f(t) = Σ_i w_i · stdRet_i(t).
  const f: number[] = new Array(minLen).fill(0);
  for (let k = 0; k < minLen; k++) for (let i = 0; i < n; i++) f[k] += w[i] * stdz[tickers[i]][k];
  const fVarRaw = f.reduce((a, b) => a + b * b, 0) / (minLen - 1) || 1;
  // Relative floor on the factor variance. Rows are standardized to unit variance,
  // so an uncorrelated factor has Var(f)=Σw_i²=1 and a fully-correlated one ~n. A
  // near-degenerate (e.g. anti-correlated) factor can drive Var(f)→0, which would
  // blow up beta = cov/fVar. Floor at 0.1% of the unit baseline to bound betas.
  const fVar = Math.max(fVarRaw, 1e-3);

  // Per asset: beta on factor, residual Z-score of the latest point.
  for (let i = 0; i < n; i++) {
    const r = stdz[tickers[i]];
    let cov = 0;
    for (let k = 0; k < minLen; k++) cov += r[k] * f[k];
    cov /= (minLen - 1);
    const beta = cov / fVar;
    const resid = r.map((x, k) => x - beta * f[k]);
    const rs = std(resid) || 1;
    const z = resid[resid.length - 1] / rs;
    out[tickers[i]] = {
      z: Number(z.toFixed(2)),
      beta: Number(beta.toFixed(2)),
      active: Math.abs(z) >= zThresh,
      direction: z >= zThresh ? 'RICH' : z <= -zThresh ? 'CHEAP' : 'FAIR',
    };
  }
  return out;
}
