/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * terminalRead — the Live Terminal's synthesis engine. Turns a dealer GEX profile (+ recent
 * price) into a single actionable read: a directional bias with a confluence score, the
 * weighted signals behind it, a regime-aware battle plan (entry/target/stop), and a live
 * narrative. Pure and dependency-free so it's unit-testable and deterministic.
 */
import { GexProfileData } from '../types';

export interface TerminalSignal { key: string; label: string; dir: -1 | 0 | 1; weight: number; detail: string; }
export interface TerminalEvent { text: string; tone: 'pos' | 'neg' | 'neutral'; }
export interface TerminalRead {
  bias: 'LONG' | 'SHORT' | 'NEUTRAL';
  score: number;          // -100..100 (weighted directional sum)
  confidence: number;     // 0..100 (share of directional weight agreeing with the bias)
  confidenceLabel: string;
  regime: 'PIN' | 'TREND';
  signals: TerminalSignal[];
  play: string;
  entry: string;
  target?: number;
  stop?: number;
  events: TerminalEvent[];
}

const r0 = (v?: number) => (typeof v === 'number' ? Math.round(v).toLocaleString('en-US') : '—');

export function computeTerminalRead(profile: GexProfileData, recentCloses: number[] = []): TerminalRead {
  const spot = profile.spot || 0;
  const netGex = profile.netGex || 0;
  const longGamma = netGex >= 0;
  const flip = profile.gammaFlip;
  const magnet = profile.magnet;
  const cw = profile.callWall;
  const pw = profile.putWall;
  const emPct = profile.expectedMovePct;
  const callOi = profile.totalCallOi || 0, putOi = profile.totalPutOi || 0;
  const pct = (lvl?: number) => (lvl && spot ? ((lvl - spot) / spot) * 100 : null);

  const signals: TerminalSignal[] = [];

  // 1) γ-flip position — the single biggest tell of dealer support vs pressure.
  if (flip && spot) {
    const above = spot >= flip;
    signals.push({ key: 'flip', label: 'γ-Flip Position', dir: above ? 1 : -1, weight: 28, detail: `Spot ${above ? 'above' : 'below'} flip ${r0(flip)} — dealers ${above ? 'buy dips' : 'sell rallies'}` });
  }
  // 2) Magnet pull — open interest gravity.
  if (magnet && spot) {
    const d = pct(magnet) ?? 0;
    const dir = Math.abs(d) < 0.1 ? 0 : d > 0 ? 1 : -1; // magnet above spot → upward pull
    signals.push({ key: 'magnet', label: 'Magnet Pull', dir, weight: 16, detail: dir === 0 ? `Pinned at magnet ${r0(magnet)}` : `Magnet ${r0(magnet)} pulls ${dir > 0 ? 'up' : 'down'}` });
  }
  // 3) Wall position — where price sits inside the dealer cage.
  if (cw && pw && cw > pw && spot) {
    const rel = (spot - pw) / (cw - pw);
    const dir = rel > 0.72 ? -1 : rel < 0.28 ? 1 : 0;
    signals.push({ key: 'wall', label: 'Wall Position', dir, weight: 18, detail: dir < 0 ? `Capped near Call Wall ${r0(cw)}` : dir > 0 ? `Supported near Put Wall ${r0(pw)}` : `Mid-range ${r0(pw)}–${r0(cw)}` });
  }
  // 4) Options positioning — call/put OI skew.
  if (callOi + putOi > 0) {
    const bull = (callOi / (callOi + putOi)) * 100;
    const dir = bull >= 55 ? 1 : bull <= 45 ? -1 : 0;
    signals.push({ key: 'flow', label: 'Positioning', dir, weight: 22, detail: `${bull.toFixed(0)}% call OI — ${dir > 0 ? 'call-heavy' : dir < 0 ? 'put-heavy' : 'balanced'}` });
  }
  // 5) Momentum — recent close slope.
  if (recentCloses.length >= 4) {
    const a = recentCloses[recentCloses.length - 1], b = recentCloses[0];
    const dir = a > b * 1.0005 ? 1 : a < b * 0.9995 ? -1 : 0;
    signals.push({ key: 'mom', label: 'Momentum', dir, weight: 16, detail: dir > 0 ? 'Higher over recent bars' : dir < 0 ? 'Lower over recent bars' : 'Flat over recent bars' });
  }

  const score = Math.max(-100, Math.min(100, Math.round(signals.reduce((a, s) => a + s.dir * s.weight, 0))));
  const bias: TerminalRead['bias'] = score > 18 ? 'LONG' : score < -18 ? 'SHORT' : 'NEUTRAL';
  const biasDir = bias === 'LONG' ? 1 : bias === 'SHORT' ? -1 : 0;
  const dirWeight = signals.reduce((a, s) => a + (s.dir !== 0 ? s.weight : 0), 0) || 1;
  const agreeWeight = signals.reduce((a, s) => a + (s.dir === biasDir && biasDir !== 0 ? s.weight : 0), 0);
  const confidence = biasDir === 0 ? Math.min(40, Math.round(Math.abs(score))) : Math.round((agreeWeight / dirWeight) * 100);
  const confidenceLabel = confidence >= 75 ? 'High' : confidence >= 50 ? 'Moderate' : confidence >= 30 ? 'Low' : 'Mixed';

  const regime: TerminalRead['regime'] = longGamma ? 'PIN' : 'TREND';

  // Regime-aware battle plan.
  let play: string, entry: string, target: number | undefined, stop: number | undefined;
  if (regime === 'PIN') {
    target = magnet || spot;
    play = `Long-gamma pin — dealers dampen vol. Fade extensions back toward magnet ${r0(magnet)}; respect the ${r0(pw)}–${r0(cw)} cage.`;
    entry = `Fade edges toward ${r0(magnet)}`;
    stop = bias === 'LONG' ? pw : bias === 'SHORT' ? cw : undefined;
  } else {
    target = bias === 'LONG' ? cw : bias === 'SHORT' ? pw : magnet;
    play = `Short-gamma — moves amplify. ${bias === 'LONG' ? `Hold above γ-flip ${r0(flip)} for continuation toward ${r0(cw)}` : bias === 'SHORT' ? `Reject below γ-flip ${r0(flip)} for downside toward ${r0(pw)}` : `Watch γ-flip ${r0(flip)} — the line in the sand`}.`;
    entry = bias === 'LONG' ? `Reclaim & hold ${r0(flip)}` : bias === 'SHORT' ? `Lose & backtest ${r0(flip)}` : `Break of ${r0(flip)}`;
    stop = flip;
  }

  // Live narrative.
  const events: TerminalEvent[] = [];
  if (flip && spot) events.push({ text: spot >= flip ? `Holding above γ-flip ${r0(flip)} — stability` : `Below γ-flip ${r0(flip)} — unstable / trending`, tone: spot >= flip ? 'pos' : 'neg' });
  if (cw && Math.abs(pct(cw) ?? 9) < 0.35) events.push({ text: `Pressing Call Wall ${r0(cw)} — gamma resistance`, tone: 'neg' });
  if (pw && Math.abs(pct(pw) ?? 9) < 0.35) events.push({ text: `Testing Put Wall ${r0(pw)} — gamma support`, tone: 'pos' });
  if (magnet && Math.abs(pct(magnet) ?? 9) < 0.15) events.push({ text: `Pinned to magnet ${r0(magnet)}`, tone: 'neutral' });
  else if (magnet) events.push({ text: `Magnet ${r0(magnet)} drawing price ${(pct(magnet) ?? 0) > 0 ? 'higher' : 'lower'}`, tone: 'neutral' });
  events.push({ text: longGamma ? `Net +${(netGex / 1e9).toFixed(2)}B gamma — dealers suppress vol` : `Net ${(netGex / 1e9).toFixed(2)}B gamma — dealers chase moves`, tone: longGamma ? 'pos' : 'neg' });
  if (emPct) events.push({ text: `Implied day range ±${(emPct * 100).toFixed(2)}% (${r0(spot * (1 - emPct))}–${r0(spot * (1 + emPct))})`, tone: 'neutral' });

  return { bias, score, confidence, confidenceLabel, regime, signals, play, entry, target, stop, events };
}
