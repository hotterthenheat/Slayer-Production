/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CalibrationCurve — the canonical "is this model actually calibrated?" reliability plot. X is the
 * confidence the read STATED, Y is the rate it actually RESOLVED. The dashed diagonal is perfect
 * calibration; points above it mean the read under-claimed (it's better than it says), below means
 * over-confident (flagged red). Dot size = sample. This is the artifact that turns "trust us" into
 * "see for yourself" — pure presentation over data edgeTracker already computes.
 */
import { CalibrationBucket } from '../lib/edgeTracker';

interface Props { buckets: CalibrationBucket[]; width?: number; height?: number }

export function CalibrationCurve({ buckets, width = 244, height = 150 }: Props) {
  const padL = 22, padR = 8, padT = 8, padB = 16;
  const x0 = padL, x1 = width - padR, y0 = height - padB, yTop = padT;
  const sx = (v: number) => x0 + (v / 100) * (x1 - x0);
  const sy = (v: number) => y0 - (v / 100) * (y0 - yTop);

  const pts = buckets.filter(b => b.n > 0).slice().sort((a, b) => a.predicted - b.predicted);
  const maxN = Math.max(1, ...pts.map(p => p.n));
  const dotColor = (b: CalibrationBucket) => {
    const gap = b.realized - b.predicted;
    return Math.abs(gap) <= 12 ? 'var(--success)' : gap < 0 ? 'var(--danger)' : 'var(--info)';
  };

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Calibration reliability curve: stated confidence versus realized hit-rate">
      {/* gridlines + ticks at 0 / 50 / 100 */}
      {[0, 50, 100].map(t => (
        <g key={t}>
          <line x1={sx(t)} y1={y0} x2={sx(t)} y2={yTop} style={{ stroke: 'var(--border)' }} strokeWidth={0.5} opacity={0.45} />
          <line x1={x0} y1={sy(t)} x2={x1} y2={sy(t)} style={{ stroke: 'var(--border)' }} strokeWidth={0.5} opacity={0.45} />
          <text x={sx(t)} y={height - 4} textAnchor="middle" style={{ fill: 'var(--text-tertiary)' }} fontSize={7} fontFamily="monospace">{t}</text>
          <text x={x0 - 3} y={sy(t) + 2.5} textAnchor="end" style={{ fill: 'var(--text-tertiary)' }} fontSize={7} fontFamily="monospace">{t}</text>
        </g>
      ))}
      {/* perfect-calibration diagonal */}
      <line x1={sx(0)} y1={sy(0)} x2={sx(100)} y2={sy(100)} style={{ stroke: 'var(--text-tertiary)' }} strokeWidth={1} strokeDasharray="3 3" opacity={0.65} />
      {/* the reliability curve through the buckets */}
      {pts.length >= 2 && (
        <polyline points={pts.map(p => `${sx(p.predicted)},${sy(p.realized)}`).join(' ')} fill="none" style={{ stroke: 'var(--accent-color)' }} strokeWidth={1.5} opacity={0.85} />
      )}
      {/* sample-weighted points */}
      {pts.map((b, i) => (
        <circle key={i} cx={sx(b.predicted)} cy={sy(b.realized)} r={2.5 + 4 * Math.sqrt(b.n / maxN)} style={{ fill: dotColor(b) }} opacity={0.92}>
          <title>{`stated ${Math.round(b.predicted)}% → resolved ${Math.round(b.realized)}% (n=${b.n})`}</title>
        </circle>
      ))}
    </svg>
  );
}
