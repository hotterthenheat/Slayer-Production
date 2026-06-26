/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * terminalRead — the Live Terminal's synthesis engine. Turns a dealer GEX profile (+ recent
 * price) into a single actionable read: a directional bias with a confluence score, the
 * weighted signals behind it, a regime-aware battle plan (entry/target/stop), and a live
 * narrative. Pure and dependency-free so it's unit-testable and deterministic.
 *
 * Regime-correct by construction: in a long-gamma PIN dealers fade extensions, so price
 * mean-reverts to the magnet and momentum is a CONTRA signal; in a short-gamma TREND dealers
 * amplify, so momentum is trend-following and the flip is the line in the sand. The battle
 * plan is always directionally coherent (target lies in the bias direction beyond spot, stop
 * opposite) or it degrades to an explicit no-trade.
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
  regimeLabel: string;    // single source of truth for regime wording
  pinStrength: number;    // 0..100 — concentration × proximity of dealer gamma (PIN only)
  signals: TerminalSignal[];
  play: string;
  entry: string;
  target?: number;        // undefined ⇒ no clean target (no-trade / pinned)
  stop?: number;
  noTrade: boolean;
  netVex?: number;        // honest, aggregated from per-strike vex (undefined if absent)
  events: TerminalEvent[];
}

const r0 = (v?: number) => (typeof v === 'number' ? Math.round(v).toLocaleString('en-US') : '—');
const fmtGex = (v: number) => { const a = Math.abs(v), s = v < 0 ? '−' : '+'; return a >= 1e9 ? `${s}${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${s}${(a / 1e6).toFixed(0)}M` : a >= 1e3 ? `${s}${(a / 1e3).toFixed(0)}K` : `${s}${a.toFixed(0)}`; };

export function computeTerminalRead(profile: GexProfileData, recentCloses: number[] = []): TerminalRead {
  const spot = profile.spot || 0;
  const netGex = profile.netGex || 0;
  const longGamma = netGex >= 0;
  const regime: TerminalRead['regime'] = longGamma ? 'PIN' : 'TREND';
  const regimeLabel = longGamma ? 'Pinning' : 'Trending';
  const flip = profile.gammaFlip;
  const magnet = profile.magnet;
  const cw = profile.callWall;
  const pw = profile.putWall;
  const emPct = profile.expectedMovePct;
  const callOi = profile.totalCallOi || 0, putOi = profile.totalPutOi || 0;
  const pct = (lvl?: number) => (lvl && spot ? ((lvl - spot) / spot) * 100 : null);

  // Honest Vanna: aggregate per-strike vex; only use a top-level netVex if explicitly provided.
  const strikeVex = (profile.strikes || []).reduce((a, s) => a + (s.netVex ?? ((s.callVex ?? 0) + (s.putVex ?? 0))), 0);
  const hasStrikeVex = (profile.strikes || []).some(s => s.netVex != null || s.callVex != null || s.putVex != null);
  const netVex = hasStrikeVex ? strikeVex : (typeof profile.netVex === 'number' ? profile.netVex : undefined);

  // Raw recent-momentum direction.
  let rawMom: -1 | 0 | 1 = 0;
  if (recentCloses.length >= 4) {
    const a = recentCloses[recentCloses.length - 1], b = recentCloses[0];
    rawMom = a > b * 1.0005 ? 1 : a < b * 0.9995 ? -1 : 0;
  }

  const signals: TerminalSignal[] = [];

  // 1) γ-flip position — dealer support vs pressure (both regimes).
  if (flip && spot) {
    const above = spot >= flip;
    signals.push({ key: 'flip', label: 'γ-Flip Position', dir: above ? 1 : -1, weight: 28, detail: `Spot ${above ? 'above' : 'below'} flip ${r0(flip)} — dealers ${above ? 'buy dips' : 'sell rallies'}` });
  }
  // 2) Magnet — a strong reversion attractor in PIN, weak in TREND.
  if (magnet && spot) {
    const d = pct(magnet) ?? 0;
    const dir = Math.abs(d) < 0.08 ? 0 : d > 0 ? 1 : -1; // points toward the magnet
    signals.push({ key: 'magnet', label: 'Magnet Pull', dir, weight: regime === 'PIN' ? 24 : 8, detail: dir === 0 ? `Pinned at magnet ${r0(magnet)}` : `Magnet ${r0(magnet)} ${regime === 'PIN' ? 'reverts price' : 'pulls'} ${dir > 0 ? 'up' : 'down'}` });
  }
  // 3) Wall position — support/resistance inside the dealer cage.
  if (cw && pw && cw > pw && spot) {
    const rel = (spot - pw) / (cw - pw);
    const dir = rel > 0.72 ? -1 : rel < 0.28 ? 1 : 0;
    signals.push({ key: 'wall', label: 'Wall Position', dir, weight: 16, detail: dir < 0 ? `Capped near Call Wall ${r0(cw)}` : dir > 0 ? `Supported near Put Wall ${r0(pw)}` : `Mid-range ${r0(pw)}–${r0(cw)}` });
  }
  // 4) Options positioning — call/put OI skew.
  if (callOi + putOi > 0) {
    const bull = (callOi / (callOi + putOi)) * 100;
    const dir = bull >= 55 ? 1 : bull <= 45 ? -1 : 0;
    signals.push({ key: 'flow', label: 'Positioning', dir, weight: 18, detail: `${bull.toFixed(0)}% call OI — ${dir > 0 ? 'call-heavy' : dir < 0 ? 'put-heavy' : 'balanced'}` });
  }
  // 5) Momentum — TREND-following in short gamma, FADE (contra) in a long-gamma pin.
  if (rawMom !== 0) {
    const dir = (regime === 'PIN' ? -rawMom : rawMom) as -1 | 1;
    signals.push({ key: 'mom', label: 'Momentum', dir, weight: regime === 'PIN' ? 12 : 24, detail: regime === 'PIN' ? `${rawMom > 0 ? 'Extended up — fade to magnet' : 'Extended down — fade to magnet'}` : `${rawMom > 0 ? 'Trending up' : 'Trending down'}` });
  }

  const score = Math.max(-100, Math.min(100, Math.round(signals.reduce((a, s) => a + s.dir * s.weight, 0))));
  const bias: TerminalRead['bias'] = score > 18 ? 'LONG' : score < -18 ? 'SHORT' : 'NEUTRAL';
  const biasDir = bias === 'LONG' ? 1 : bias === 'SHORT' ? -1 : 0;
  const dirWeight = signals.reduce((a, s) => a + (s.dir !== 0 ? s.weight : 0), 0) || 1;
  const agreeWeight = signals.reduce((a, s) => a + (s.dir === biasDir && biasDir !== 0 ? s.weight : 0), 0);
  const confidence = biasDir === 0 ? Math.min(40, Math.round(Math.abs(score))) : Math.round((agreeWeight / dirWeight) * 100);
  const confidenceLabel = confidence >= 75 ? 'High' : confidence >= 50 ? 'Moderate' : confidence >= 30 ? 'Low' : 'Mixed';

  // Continuous pin strength: HHI concentration of |netGex| × proximity to the dominant
  // strike. High ⇒ a tight, sticky pin; low ⇒ diffuse gamma, weak magnet. PIN regime only.
  const pinStrength = (() => {
    const ss = profile.strikes || [];
    if (!longGamma || !ss.length || !spot) return 0;
    const tot = ss.reduce((a, s) => a + Math.abs(s.netGex || 0), 0) || 1;
    let hhi = 0, top = ss[0];
    for (const s of ss) { const sh = Math.abs(s.netGex || 0) / tot; hhi += sh * sh; if (Math.abs(s.netGex || 0) > Math.abs(top.netGex || 0)) top = s; }
    const prox = Math.exp(-Math.pow((spot - top.strike) / (spot * 0.004), 2));
    return Math.max(0, Math.min(100, Math.round(100 * Math.sqrt(hhi) * prox)));
  })();

  // ── Battle plan — always directionally coherent, or an explicit no-trade ──
  const tiny = spot * 0.0006; // ~0.06% dead-zone
  let target: number | undefined, stop: number | undefined, entry: string, play: string, noTrade = false;
  if (biasDir === 0) {
    target = undefined; stop = undefined;
    entry = `Trade the break of γ-flip ${r0(flip)}`;
    play = `Undecided — confluence is mixed. ${flip ? `γ-flip ${r0(flip)} is the line in the sand; let it pick the direction.` : 'Wait for structure to resolve.'}`;
  } else if (regime === 'PIN') {
    const cand = (magnet && biasDir * (magnet - spot) > tiny) ? magnet : (biasDir > 0 ? cw : pw);
    target = cand; stop = biasDir > 0 ? pw : cw;
    entry = `Fade ${biasDir > 0 ? 'dips' : 'rips'} toward ${r0(target)}`;
    play = `Long-gamma pin — dealers dampen vol. Fade extensions back toward ${r0(magnet)}; respect the ${r0(pw)}–${r0(cw)} cage.`;
  } else {
    target = biasDir > 0 ? cw : pw; stop = flip;
    entry = biasDir > 0 ? `Hold above γ-flip ${r0(flip)}` : `Reject below γ-flip ${r0(flip)}`;
    play = `Short-gamma — moves amplify. ${biasDir > 0 ? `Hold above γ-flip ${r0(flip)} for continuation toward ${r0(cw)}` : `Lose γ-flip ${r0(flip)} for downside toward ${r0(pw)}`}.`;
  }
  // Enforce ordering: target beyond spot in the bias direction, stop on the other side.
  if (biasDir !== 0) {
    const tOk = typeof target === 'number' && biasDir * (target - spot) > tiny;
    const sOk = typeof stop === 'number' && biasDir * (spot - stop) > tiny;
    if (!tOk || !sOk) { noTrade = true; target = undefined; stop = undefined; entry = 'No clean bracket — wait for structure'; play = `${regimeLabel} regime but spot sits ${tOk ? 'inside its stop' : 'past its target'} — no coherent ${bias.toLowerCase()} bracket. Stand down until levels reset.`; }
  }

  // ── Live narrative ──
  const events: TerminalEvent[] = [];
  if (flip && spot) events.push({ text: spot >= flip ? `Holding above γ-flip ${r0(flip)} — stability` : `Below γ-flip ${r0(flip)} — unstable / trending`, tone: spot >= flip ? 'pos' : 'neg' });
  if (cw && Math.abs(pct(cw) ?? 9) < 0.35) events.push({ text: `Pressing Call Wall ${r0(cw)} — gamma resistance`, tone: 'neg' });
  if (pw && Math.abs(pct(pw) ?? 9) < 0.35) events.push({ text: `Testing Put Wall ${r0(pw)} — gamma support`, tone: 'pos' });
  if (magnet && Math.abs(pct(magnet) ?? 9) < 0.12) events.push({ text: `Pinned to magnet ${r0(magnet)}`, tone: 'neutral' });
  else if (magnet) events.push({ text: `Magnet ${r0(magnet)} drawing price ${(pct(magnet) ?? 0) > 0 ? 'higher' : 'lower'}`, tone: 'neutral' });
  events.push({ text: `Net ${fmtGex(netGex)} gamma — dealers ${longGamma ? 'suppress vol' : 'chase moves'}`, tone: longGamma ? 'pos' : 'neg' });
  if (emPct) events.push({ text: `Implied day range ±${(emPct * 100).toFixed(2)}% (${r0(spot * (1 - emPct))}–${r0(spot * (1 + emPct))})`, tone: 'neutral' });

  return { bias, score, confidence, confidenceLabel, regime, regimeLabel, pinStrength, signals, play, entry, target, stop, noTrade, netVex, events };
}
