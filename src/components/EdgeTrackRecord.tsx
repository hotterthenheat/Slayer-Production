/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * EdgeTrackRecord — makes the dealer-read edge VISIBLE and falsifiable. It logs each live GEX
 * outlook, resolves it against the realized price path (edgeLedger), and shows the historical
 * hit-rate FOR THE REGIME THE TERMINAL IS CALLING RIGHT NOW ("PINNING reads held 71%, n=34") plus
 * an overall, per-regime, and calibration summary. This is the difference between a pretty
 * dashboard and a provable edge.
 *
 * Honesty guardrails: live and model track records are summarized SEPARATELY and labeled; a
 * synthetic-data record is never shown as live. Descriptive only — it scores the READ, not trades.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { GexProfileData } from '../types';
import { computeGexOutlook } from '../lib/terminalRead';
import { recordRead, resolveReads, getLedger } from '../lib/edgeLedger';
import { summarize, ScoredRead } from '../lib/edgeTracker';
import { Candle } from '../types';
import { Target, ChevronDown } from 'lucide-react';
import { CalibrationCurve } from './CalibrationCurve';

interface Props {
  profile: GexProfileData;
  ticker: string;
  candles: Candle[];
  provenance: 'live' | 'model';
}

const HORIZON_BARS = 12;        // forward window the read is judged over
const RECORD_GAP_BARS = 6;      // don't log more often than this (unless the regime flips)
const MIN_REGIME_N = 8;         // below this, show "building sample" not a headline number

const rateColor = (r: number) => (r >= 60 ? 'var(--success)' : r >= 45 ? 'var(--warning)' : 'var(--danger)');

export function EdgeTrackRecord({ profile, ticker, candles, provenance }: Props) {
  const [version, setVersion] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const lastRec = useRef<{ ts: number; regime: string } | null>(null);

  const outlook = useMemo(() => computeGexOutlook(profile, candles.slice(-12).map(c => c.close)), [profile, candles]);

  useEffect(() => {
    if (!candles.length || !(profile.spot > 0)) return;
    const last = candles[candles.length - 1];
    const now = last.timestamp;
    const barMs = candles.length >= 2 ? Math.max(1, last.timestamp - candles[candles.length - 2].timestamp) : 5 * 60 * 1000;
    const horizonMs = barMs * HORIZON_BARS;
    // Normalize the move/pin thresholds to this symbol's expected move so the same scorer is fair
    // across a $6,800 index and a $20 name.
    const emPct = (profile.expectedMovePct ?? 0.008) * 100;
    const opts = { moveThreshPct: Math.max(0.05, emPct * 0.18), pinThreshPct: Math.max(0.08, emPct * 0.3) };

    const flipped = !lastRec.current || lastRec.current.regime !== outlook.regime;
    const gapOk = !lastRec.current || now - lastRec.current.ts >= barMs * RECORD_GAP_BARS;
    if ((flipped || gapOk) && outlook.regime !== 'NEUTRAL') {
      recordRead({ id: `${ticker}-${now}`, ts: now, ticker, spot: profile.spot, regime: outlook.regime, bias: outlook.bias, target: outlook.target, confidence: outlook.confidence, provenance });
      lastRec.current = { ts: now, regime: outlook.regime };
    }
    resolveReads(ticker, candles, horizonMs, opts);
    setVersion(v => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, ticker, provenance]);

  const { rec, scopedN } = useMemo(() => {
    void version;
    const all = getLedger().scored as ScoredRead[];
    const scoped = all.filter(r => r.provenance === provenance);
    return { rec: summarize(scoped), scopedN: scoped.length };
  }, [version, provenance]);

  const here = rec.byRegime.find(b => b.regime === outlook.regime);
  const badge = provenance === 'live'
    ? { t: 'LIVE', c: 'var(--success)' }
    : { t: 'MODEL', c: 'var(--warning)' };

  // Calibration chip — how reads in the LIVE read's confidence band have ACTUALLY resolved, so the
  // trader knows whether to trust this confidence number instead of taking it on faith. Verdict:
  // realized within ±12 of stated = CALIBRATED; well below = OVERCONFIDENT; well above = under.
  const band = rec.calibration.find(b => b.label === (outlook.confidence < 40 ? '0–40' : outlook.confidence < 60 ? '40–60' : outlook.confidence < 80 ? '60–80' : '80–100'));
  const calib = band && band.n >= 5 ? (() => {
    const gap = band.realized - outlook.confidence;
    if (Math.abs(gap) <= 12) return { t: 'CALIBRATED', c: 'var(--success)' };
    return gap < 0 ? { t: 'OVERCONF', c: 'var(--danger)' } : { t: 'UNDERCONF', c: 'var(--info)' };
  })() : null;

  // Hidden until outcomes resolve — an empty "track record" only advertises that we have none yet. The
  // recording effect above keeps logging in the background, so the panel appears the moment it has data. (P1-9)
  if (scopedN === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center gap-2 px-3 h-8 border-b border-[var(--border)]">
        <Target className="w-3.5 h-3.5" style={{ color: 'var(--accent-color)' }} />
        <span className="text-[10px] font-black tracking-wider uppercase text-[var(--text-primary)] min-w-0 truncate">Edge · Track Record</span>
        <span className="ml-auto px-1.5 py-0.5 rounded text-[8px] font-mono font-black uppercase tracking-widest border" style={{ color: badge.c, borderColor: `color-mix(in srgb, ${badge.c} 40%, transparent)` }} title={provenance === 'model' ? 'Track record on simulated data — not a live record' : 'Track record on live data'}>{badge.t}</span>
        {scopedN > 0 && (
          <button onClick={() => setExpanded(e => !e)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors shrink-0" title={expanded ? 'Hide calibration curve' : 'Show calibration curve'} aria-label="Toggle calibration curve">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      <div className="px-3 py-2.5">
          {/* Killer line: how the CURRENTLY-CALLED regime has historically resolved */}
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-secondary)] truncate">{outlook.regime} reads {here && here.n >= MIN_REGIME_N ? 'held' : ''}</span>
            {here && here.n >= MIN_REGIME_N
              ? <span className="text-[20px] font-mono font-black tabular-nums leading-none" style={{ color: rateColor(here.hitRate) }}>{Math.round(here.hitRate)}%</span>
              : <span className="text-[10px] font-mono text-[var(--text-tertiary)]">building sample…</span>}
          </div>
          <div className="text-[9px] font-mono text-[var(--text-tertiary)] mt-0.5">{here ? `n=${here.n} resolved` : 'no prior reads in this regime yet'}</div>

          {/* Calibration of the LIVE read's own confidence: trust the number, or not */}
          {calib && band && (
            <div className="mt-2 flex items-center gap-1.5 text-[9px] font-mono tabular-nums" title={`Reads stated at ~${outlook.confidence}% confidence have actually resolved ${Math.round(band.realized)}% of the time (n=${band.n})`}>
              <span className="px-1 py-0.5 rounded text-[8px] font-black uppercase tracking-wider shrink-0" style={{ color: calib.c, background: `color-mix(in srgb, ${calib.c} 14%, transparent)` }}>{calib.t}</span>
              <span className="text-[var(--text-secondary)]">{outlook.confidence}%<span className="text-[var(--text-tertiary)]"> stated → </span>{Math.round(band.realized)}%<span className="text-[var(--text-tertiary)]"> real</span></span>
              <span className="ml-auto text-[var(--text-tertiary)] shrink-0">n{band.n}</span>
            </div>
          )}

          {/* Overall + calibration */}
          <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-[var(--border)] text-[9px] font-mono tabular-nums">
            <span className="text-[var(--text-tertiary)]">OVERALL</span>
            <span className="font-black" style={{ color: rateColor(rec.hitRate) }}>{Math.round(rec.hitRate)}%</span>
            <span className="text-[var(--text-tertiary)]">· {rec.n} reads · {rec.cleanHits}✓/{rec.misses}✗</span>
            <span className="ml-auto text-[var(--text-tertiary)]" title="Calibration error: how far stated confidence sits from realized hit-rate (lower is better)">cal ±{Math.round(rec.calibrationError)}</span>
          </div>

          {/* Per-regime mini bars */}
          {rec.byRegime.length > 0 && (
            <div className="mt-2 space-y-1">
              {rec.byRegime.slice(0, 4).map(b => (
                <div key={b.regime} className="flex items-center gap-2">
                  <span className={`text-[8px] font-mono uppercase tracking-wide w-[88px] shrink-0 truncate ${b.regime === outlook.regime ? 'text-[var(--text-primary)] font-black' : 'text-[var(--text-tertiary)]'}`}>{b.regime}</span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-[var(--surface-2)]">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, b.hitRate))}%`, background: rateColor(b.hitRate) }} />
                  </div>
                  <span className="text-[8px] font-mono tabular-nums w-[44px] text-right" style={{ color: rateColor(b.hitRate) }}>{Math.round(b.hitRate)}% · {b.n}</span>
                </div>
              ))}
            </div>
          )}

          {/* Expanded: the reliability curve — stated confidence vs realized hit-rate */}
          {expanded && (
            <div className="mt-2.5 pt-2 border-t border-[var(--border)]">
              <div className="flex items-center justify-between text-[8px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-1">
                <span>Calibration · realized ↑ vs stated →</span>
                <span title="Mean gap between stated confidence and realized hit-rate (lower is better)">err ±{Math.round(rec.calibrationError)}</span>
              </div>
              {rec.calibration.length >= 2
                ? <CalibrationCurve buckets={rec.calibration} />
                : <div className="py-3 text-[9px] font-mono text-[var(--text-tertiary)]">Need reads across ≥2 confidence bands to plot — {rec.calibration.length} so far.</div>}
              <div className="text-[8px] font-mono text-[var(--text-tertiary)] mt-1 leading-snug">Dashed = perfect calibration. Dots above = under-claimed; below = over-confident. Size = sample.</div>
            </div>
          )}
        </div>
    </div>
  );
}
