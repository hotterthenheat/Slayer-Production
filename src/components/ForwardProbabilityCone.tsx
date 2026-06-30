/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * FORWARD PROBABILITY CONE
 * ------------------------
 * A forward-looking read the platform did not have: given spot and the option
 * chain's expected one-sigma move, where is the underlying *likely to sit* by
 * expiry, and how does that distribution line up against the dealer's own
 * structure (call wall / put wall / gamma flip)?
 *
 * The cone is a driftless log-normal projection — price at time-fraction f of the
 * horizon is log-normal with sigma(f) = EM·√f (EM = the chain's 1σ expected move
 * as a fraction of spot). We shade the ±1σ (~68%) and ±2σ (~95%) envelopes, mark
 * the median, and overlay the dealer levels with the probability the path TOUCHES
 * each one before expiry (reflection principle: P(touch L) = 2·Φ(−|ln(L/S)|/EM)).
 *
 * It is a MODEL projection, labelled as such — not a forecast or a feed.
 */
import { useMemo } from 'react';

interface ForwardProbabilityConeProps {
  spot: number;
  /** 1-sigma expected move at the horizon, as a FRACTION of spot (e.g. 0.012 = 1.2%). */
  emFraction: number;
  callWall?: number | null;
  putWall?: number | null;
  gammaFlip?: number | null;
  decimals?: number;
  ticker?: string;
}

// Standard normal CDF (Abramowitz–Stegun 7.1.26) — no external dep.
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-(x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export function ForwardProbabilityCone({
  spot,
  emFraction,
  callWall,
  putWall,
  gammaFlip,
  decimals = 0,
  ticker,
}: ForwardProbabilityConeProps) {
  const model = useMemo(() => {
    if (!(spot > 0) || !(emFraction > 0)) return null;

    const em = Math.min(0.35, Math.max(0.0008, emFraction)); // clamp to sane band
    const sigmaFull = spot * em; // 1σ in price terms at the horizon

    // Viewbox geometry (responsive via width=100%).
    const W = 1000, H = 420;
    const padL = 56, padR = 132, padT = 18, padB = 30;
    const x0 = padL, x1 = W - padR;
    const y0 = padT, y1 = H - padB;

    // Price range: ±2.6σ around spot, widened to include any dealer level on screen.
    const levels = [callWall, putWall, gammaFlip].filter((v): v is number => typeof v === 'number' && v > 0);
    let lo = spot - 2.6 * sigmaFull;
    let hi = spot + 2.6 * sigmaFull;
    for (const L of levels) { lo = Math.min(lo, L); hi = Math.max(hi, L); }
    const span = hi - lo || 1;
    const pad = span * 0.06;
    lo -= pad; hi += pad;

    const fToX = (f: number) => x0 + (x1 - x0) * f;
    const pToY = (p: number) => y1 - ((p - lo) / (hi - lo)) * (y1 - y0);

    // Sample the cone envelope across the horizon.
    const N = 48;
    const fs = Array.from({ length: N + 1 }, (_, i) => i / N);
    const band = (k: number) => {
      const up: string[] = [], dn: string[] = [];
      fs.forEach((f) => {
        const s = sigmaFull * Math.sqrt(f) * k;
        up.push(`${fToX(f).toFixed(1)},${pToY(spot + s).toFixed(1)}`);
        dn.push(`${fToX(f).toFixed(1)},${pToY(spot - s).toFixed(1)}`);
      });
      return `M${up.join(' L')} L${dn.reverse().join(' L')} Z`;
    };

    const touchProb = (L: number) => {
      const z = Math.abs(Math.log(L / spot)) / em;
      return Math.min(0.99, Math.max(0.01, 2 * normCdf(-z)));
    };

    const rawLines = [
      callWall && callWall > 0 ? { label: 'Call Wall', price: callWall, color: 'var(--success)', p: touchProb(callWall) } : null,
      gammaFlip && gammaFlip > 0 ? { label: 'γ Flip', price: gammaFlip, color: 'var(--warning)', p: touchProb(gammaFlip) } : null,
      putWall && putWall > 0 ? { label: 'Put Wall', price: putWall, color: 'var(--danger)', p: touchProb(putWall) } : null,
    ].filter((v): v is { label: string; price: number; color: string; p: number } => !!v);

    // Vertically dodge the right-rail labels so levels that sit close together
    // (relative to the cone's full ±2σ price range) don't overlap. The line stays
    // at the true price; only the label text is nudged, with a connector drawn.
    const dealerLines = rawLines
      .map((d) => ({ ...d, y: pToY(d.price), ly: pToY(d.price) }))
      .filter((d) => d.y >= y0 - 2 && d.y <= y1 + 2)
      .sort((a, b) => a.y - b.y);
    const LH = 30;
    let last = -Infinity;
    for (const d of dealerLines) { d.ly = Math.max(d.y, last + LH); last = d.ly; }
    const over = last - (y1 - 8);
    if (over > 0) for (const d of dealerLines) d.ly -= over;

    const timeTicks = [
      { f: 0, label: 'Now' },
      { f: 0.25, label: '¼' },
      { f: 0.5, label: '½' },
      { f: 0.75, label: '¾' },
      { f: 1, label: 'Exp' },
    ];

    return { W, H, x0, x1, y0, y1, fToX, pToY, band, dealerLines, timeTicks, sigmaFull };
  }, [spot, emFraction, callWall, putWall, gammaFlip]);

  const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  if (!model) {
    return (
      <div className="h-[260px] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center">
        <span className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest">No expected-move data</span>
      </div>
    );
  }

  const { W, H, x0, x1, y0, y1, fToX, pToY, band, dealerLines, timeTicks } = model;
  const spotY = pToY(spot);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="w-[3px] h-3.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--accent-color) 55%, transparent)' }} />
          <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-[var(--text-primary)]">
            Forward Probability Cone{ticker ? ` · ${ticker}` : ''}
          </span>
        </div>
        <span
          className="text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded uppercase"
          style={{ color: 'var(--info)', background: 'color-mix(in srgb, var(--info) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--info) 30%, transparent)' }}
          title="Driftless log-normal projection from spot and the chain's expected move — a model, not a forecast."
        >
          Model
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" preserveAspectRatio="xMidYMid meet">
        {/* ±2σ then ±1σ envelopes */}
        <path d={band(2)} fill="color-mix(in srgb, var(--accent-color) 12%, transparent)" stroke="none" />
        <path d={band(1)} fill="color-mix(in srgb, var(--accent-color) 22%, transparent)" stroke="none" />

        {/* Median (spot) projection */}
        <line x1={x0} y1={spotY} x2={x1} y2={spotY} stroke="var(--text-secondary)" strokeWidth={1.25} strokeDasharray="4 4" opacity={0.8} />

        {/* Time axis ticks */}
        {timeTicks.map((t) => (
          <g key={t.label}>
            <line x1={fToX(t.f)} y1={y1} x2={fToX(t.f)} y2={y1 + 4} stroke="var(--border)" strokeWidth={1} />
            <text x={fToX(t.f)} y={y1 + 18} textAnchor="middle" fontSize={11} fill="var(--text-tertiary)" fontFamily="ui-monospace, monospace">{t.label}</text>
          </g>
        ))}

        {/* Dealer levels + touch probability */}
        {dealerLines.map((d) => (
          <g key={d.label}>
            <line x1={x0} y1={d.y} x2={x1} y2={d.y} stroke={d.color} strokeWidth={1.25} opacity={0.85} />
            <path d={`M${x1},${d.y} L${x1 + 6},${(d.ly - 4).toFixed(1)}`} stroke={d.color} strokeWidth={1} opacity={0.5} fill="none" />
            <text x={x1 + 9} y={d.ly - 4} fontSize={11} fontWeight={700} fill={d.color} fontFamily="ui-monospace, monospace">{d.label}</text>
            <text x={x1 + 9} y={d.ly + 9} fontSize={10} fill="var(--text-tertiary)" fontFamily="ui-monospace, monospace">{fmt(d.price)} · {Math.round(d.p * 100)}% touch</text>
          </g>
        ))}

        {/* NOW spot marker */}
        <circle cx={x0} cy={spotY} r={3.5} fill="var(--accent-color)" />
        <text x={x0 + 6} y={spotY - 6} fontSize={11} fontWeight={700} fill="var(--text-primary)" fontFamily="ui-monospace, monospace">{fmt(spot)}</text>
      </svg>

      <div className="flex items-center gap-4 px-3.5 py-2 border-t border-[var(--border)] text-[10px] text-[var(--text-tertiary)]">
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: 'color-mix(in srgb, var(--accent-color) 22%, transparent)' }} /> ±1σ (~68%)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: 'color-mix(in srgb, var(--accent-color) 12%, transparent)' }} /> ±2σ (~95%)</span>
        <span className="ml-auto">Touch % = path reaches the level before expiry</span>
      </div>
    </div>
  );
}
