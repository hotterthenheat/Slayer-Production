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
  positionStrength: number; // 0..100 — conviction in the read (confluence × agreement × regime clarity)
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

  // Position Strength (0..100): a single conviction number for the current read — how strong the
  // directional confluence is (|score|), how aligned the signals are (confidence), and how clear
  // the regime is (gamma concentration in a PIN; confluence magnitude in a TREND). Halved when
  // there is no clean tradeable bracket so a no-trade never reads as a strong setup. Pure synthesis
  // of the real signals above — every input is shown to the user, so it is auditable, not a black box.
  const regimeClarity = regime === 'PIN' ? pinStrength : Math.min(100, Math.abs(score) * 1.1);
  let positionStrength = Math.round(0.45 * Math.abs(score) + 0.35 * confidence + 0.20 * regimeClarity);
  if (noTrade || biasDir === 0) positionStrength = Math.floor(positionStrength / 2);
  positionStrength = Math.max(0, Math.min(100, positionStrength));

  // ── Live narrative ──
  const events: TerminalEvent[] = [];
  if (flip && spot) events.push({ text: spot >= flip ? `Holding above γ-flip ${r0(flip)} — stability` : `Below γ-flip ${r0(flip)} — unstable / trending`, tone: spot >= flip ? 'pos' : 'neg' });
  if (cw && Math.abs(pct(cw) ?? 9) < 0.35) events.push({ text: `Pressing Call Wall ${r0(cw)} — gamma resistance`, tone: 'neg' });
  if (pw && Math.abs(pct(pw) ?? 9) < 0.35) events.push({ text: `Testing Put Wall ${r0(pw)} — gamma support`, tone: 'pos' });
  if (magnet && Math.abs(pct(magnet) ?? 9) < 0.12) events.push({ text: `Pinned to magnet ${r0(magnet)}`, tone: 'neutral' });
  else if (magnet) events.push({ text: `Magnet ${r0(magnet)} drawing price ${(pct(magnet) ?? 0) > 0 ? 'higher' : 'lower'}`, tone: 'neutral' });
  events.push({ text: `Net ${fmtGex(netGex)} gamma — dealers ${longGamma ? 'suppress vol' : 'chase moves'}`, tone: longGamma ? 'pos' : 'neg' });
  if (emPct) events.push({ text: `Implied day range ±${(emPct * 100).toFixed(2)}% (${r0(spot * (1 - emPct))}–${r0(spot * (1 + emPct))})`, tone: 'neutral' });

  return { bias, score, confidence, confidenceLabel, regime, regimeLabel, pinStrength, positionStrength, signals, play, entry, target, stop, noTrade, netVex, events };
}

/**
 * GEX OUTLOOK — a descriptive regime/path classifier. Where computeTerminalRead builds a
 * tradeable bracket, this answers only "what is the dealer book likely to make price DO?":
 * pin to a magnet, squeeze up into a call wall, force shorts to cover, trend with the flip,
 * or oscillate inside the cage. It is a READ, not a trade — no contracts, entries, or stops.
 *
 * Mechanic-driven, regime-correct: in long gamma (netGex ≥ 0) dealers suppress vol, so price
 * pins to / mean-reverts toward the dominant-gamma strike; in short gamma (netGex < 0) dealers
 * hedge WITH the move, so breaks of the γ-flip amplify and put-heavy reversals force covering.
 */
export interface GexOutlook {
  regime: 'PINNING' | 'GAMMA SQUEEZE' | 'SHORT SQUEEZE' | 'TREND UP' | 'TREND DOWN' | 'RANGE' | 'NEUTRAL';
  bias: 'up' | 'down' | 'sideways';
  headline: string;     // short, e.g. "Pinned to 6,800" / "Gamma squeeze risk above 6,850"
  detail: string;       // one sentence on the dealer mechanic driving it
  target?: number;      // the level price is drawn toward (magnet/wall/flip), undefined if none
  confidence: number;   // 0..100
}

export function computeGexOutlook(profile: GexProfileData, recentCloses: number[] = []): GexOutlook {
  const spot = profile.spot || 0;
  const netGex = profile.netGex || 0;

  // NEUTRAL — insufficient data (no usable spot or no gamma signal at all).
  if (!spot || (!profile.netGex && !(profile.strikes || []).length)) {
    return { regime: 'NEUTRAL', bias: 'sideways', headline: 'No clear regime', detail: 'Insufficient GEX data to classify the dealer path.', target: undefined, confidence: 10 };
  }

  const longGamma = netGex >= 0;
  const flip = profile.gammaFlip;
  const magnet = profile.magnet;
  const cw = profile.callWall;
  const pw = profile.putWall;
  const callOi = profile.totalCallOi || 0, putOi = profile.totalPutOi || 0;
  const pct = (lvl?: number) => (lvl && spot ? ((lvl - spot) / spot) * 100 : null);

  // Momentum from recent closes — same convention as computeTerminalRead.
  let mom: -1 | 0 | 1 = 0;
  if (recentCloses.length >= 4) {
    const a = recentCloses[recentCloses.length - 1], b = recentCloses[0];
    mom = a > b * 1.0005 ? 1 : a < b * 0.9995 ? -1 : 0;
  }
  // Reversal-off-a-low: last close turning up from the lowest point in the window — the
  // tell for a short squeeze (forced covering tends to ignite off a flush, not a drift).
  const reversalUp = (() => {
    if (recentCloses.length < 4) return false;
    const last = recentCloses[recentCloses.length - 1];
    const lo = Math.min(...recentCloses);
    const loIdx = recentCloses.indexOf(lo);
    return loIdx < recentCloses.length - 1 && last > lo * 1.0005;
  })();

  // OI skew — call- vs put-dominant positioning.
  const oiTot = callOi + putOi;
  const callPct = oiTot > 0 ? (callOi / oiTot) * 100 : 50;
  const callHeavy = callPct >= 55, putHeavy = callPct <= 45;

  // Dominant-gamma strike + concentration (HHI), reused from the pinStrength mechanic. The
  // magnet is the headline attractor, but the dominant strike is the true gamma center.
  const ss = profile.strikes || [];
  let domStrike: number | undefined, hhi = 0;
  if (ss.length) {
    const tot = ss.reduce((a, s) => a + Math.abs(s.netGex || 0), 0) || 1;
    let top = ss[0];
    for (const s of ss) { const sh = Math.abs(s.netGex || 0) / tot; hhi += sh * sh; if (Math.abs(s.netGex || 0) > Math.abs(top.netGex || 0)) top = s; }
    domStrike = top.strike;
  }
  const pinTarget = magnet ?? domStrike;
  // Continuous pin strength (0..100): concentration × proximity to the dominant strike.
  const pinStrength = (() => {
    if (!longGamma || !ss.length || domStrike == null) return 0;
    const prox = Math.exp(-Math.pow((spot - domStrike) / (spot * 0.004), 2));
    return Math.max(0, Math.min(100, Math.round(100 * Math.sqrt(hhi) * prox)));
  })();

  const dPin = pct(pinTarget);     // % distance to the pin attractor
  const dCw = pct(cw);             // % distance to call wall (>0 ⇒ above spot)
  const dPw = pct(pw);             // % distance to put wall
  const aboveFlip = flip != null ? spot >= flip : null;
  const r1 = (v?: number) => r0(v);

  // ── Classification (priority order) ────────────────────────────────────────
  // 1) PINNING — long gamma, glued to the attractor, gamma concentrated.
  if (longGamma && pinTarget != null && dPin != null && Math.abs(dPin) <= 0.20 && pinStrength >= 40) {
    const confidence = Math.max(45, Math.min(96, Math.round(40 + pinStrength * 0.55)));
    return { regime: 'PINNING', bias: 'sideways', headline: `Pinned to ${r1(pinTarget)}`, detail: `Long-gamma dealers suppress volatility around ${r1(pinTarget)}; price sticks to the magnet until gamma rolls off.`, target: pinTarget, confidence };
  }

  // 2) GAMMA SQUEEZE — long gamma above the flip, pressing UP into a large call wall.
  if (longGamma && cw != null && aboveFlip === true && dCw != null && dCw > 0 && dCw <= 0.6 && callHeavy && mom >= 0) {
    const prox = 1 - dCw / 0.6;               // closer to the wall ⇒ hotter
    const confidence = Math.max(50, Math.min(92, Math.round(52 + prox * 30 + (mom > 0 ? 8 : 0))));
    return { regime: 'GAMMA SQUEEZE', bias: 'up', headline: `Gamma squeeze risk above ${r1(cw)}`, detail: `Spot is pressing the ${r1(cw)} call wall above the flip; dealers buy to stay hedged as price rises, accelerating the upside.`, target: cw, confidence };
  }

  // 3) SHORT SQUEEZE — short gamma, reversing up off a low, put-heavy book (forced covering).
  if (!longGamma && putHeavy && (reversalUp || mom > 0)) {
    const tgt = flip ?? cw;
    const confidence = Math.max(48, Math.min(90, Math.round(54 + (reversalUp ? 16 : 6) + (putHeavy ? 8 : 0))));
    return { regime: 'SHORT SQUEEZE', bias: 'up', headline: tgt != null ? `Short squeeze toward ${r1(tgt)}` : 'Short squeeze risk', detail: `Short-gamma dealers and a put-heavy book chase a reversal higher; covering is forced and the move is more violent than a gamma squeeze.`, target: tgt, confidence };
  }

  // 4) TREND DOWN — short gamma below the flip with downside momentum (dealers amplify selling).
  if (!longGamma && aboveFlip === false && mom < 0) {
    const tgt = pw ?? flip;
    const confidence = Math.max(45, Math.min(88, Math.round(56 + (putHeavy ? 10 : 0) + (dPw != null && dPw < 0 ? 6 : 0))));
    return { regime: 'TREND DOWN', bias: 'down', headline: tgt != null ? `Trending down toward ${r1(tgt)}` : 'Trending down', detail: `Short-gamma dealers sell into weakness below the flip; downside momentum is amplified toward ${r1(tgt)}.`, target: tgt, confidence };
  }

  // 5) TREND UP — short gamma above the flip with upside momentum (not a clean squeeze).
  if (!longGamma && aboveFlip === true && mom > 0) {
    const tgt = cw ?? flip;
    const confidence = Math.max(45, Math.min(86, Math.round(54 + (callHeavy ? 10 : 0))));
    return { regime: 'TREND UP', bias: 'up', headline: tgt != null ? `Trending up toward ${r1(tgt)}` : 'Trending up', detail: `Short-gamma dealers buy into strength above the flip; upside momentum is amplified toward ${r1(tgt)}.`, target: tgt, confidence };
  }

  // 6) RANGE — long gamma, mid-cage between the walls (not pinned): mean-reverts wall-to-wall.
  if (longGamma && cw != null && pw != null && cw > pw && spot > pw && spot < cw) {
    const tgt = magnet;
    const confidence = Math.max(40, Math.min(78, Math.round(48 + pinStrength * 0.2)));
    return { regime: 'RANGE', bias: 'sideways', headline: `Ranging ${r1(pw)}–${r1(cw)}`, detail: `Long-gamma dealers dampen vol inside the cage; price mean-reverts between the ${r1(pw)} put wall and ${r1(cw)} call wall.`, target: tgt, confidence };
  }

  // Fallback — has a usable spot/gamma but no decisive structure/momentum. Lean on the
  // gamma sign for a soft, low-confidence read rather than over-committing.
  if (longGamma) {
    const tgt = pinTarget;
    return { regime: 'RANGE', bias: 'sideways', headline: tgt != null ? `Range around ${r1(tgt)}` : 'Choppy / range', detail: `Long-gamma dealers suppress volatility; expect mean-reversion with no decisive directional path.`, target: tgt, confidence: 35 };
  }
  const tgt = aboveFlip === false ? (pw ?? flip) : (cw ?? flip);
  const bias: GexOutlook['bias'] = aboveFlip === false ? 'down' : aboveFlip === true ? 'up' : 'sideways';
  return { regime: bias === 'down' ? 'TREND DOWN' : bias === 'up' ? 'TREND UP' : 'NEUTRAL', bias, headline: bias === 'sideways' ? 'Unstable / no clear path' : `Unstable — leaning ${bias}`, detail: `Short-gamma dealers amplify moves; direction unresolved until the ${r1(flip)} flip is decisively held or lost.`, target: bias === 'sideways' ? undefined : tgt, confidence: 30 };
}
