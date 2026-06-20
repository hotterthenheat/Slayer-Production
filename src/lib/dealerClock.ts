/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Intraday charm/vanna hedging clock. Dealer delta-decay (charm) and vol-driven
 * delta (vanna) hedging is not uniform through the day — it ramps into the
 * afternoon and accelerates into the cash close (the well-known ~2pm ET ramp,
 * peaking in the final 30-60 min on expiry-heavy days). This weights the engine's
 * net charm/vanna by a time-of-day profile so the displayed hedging pressure
 * reflects WHEN the flows actually hit. Keyless (uses the wall clock).
 */

/** US cash-session minutes since 09:30 ET (0 = open, 390 = close), or null off-hours. */
function minutesSinceOpenET(now = new Date()): number | null {
  // Convert to America/New_York wall time without pulling a tz library.
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const mins = et.getHours() * 60 + et.getMinutes();
  const open = 9 * 60 + 30; // 09:30
  const close = 16 * 60; // 16:00
  if (mins < open || mins > close) return null;
  return mins - open;
}

export interface DealerClock {
  session: 'PRE' | 'OPEN' | 'MIDDAY' | 'POWER_HOUR' | 'CLOSE' | 'AFTER';
  /** 0..1 charm/vanna hedging intensity for the current time of day. */
  weight: number;
  minutesToClose: number | null;
  label: string;
  weightedCharm: number; // netCharm × weight
  weightedVanna: number; // netVanna × weight
}

/**
 * Time-of-day weight in [0,1]. Low at the open, building through midday, peaking
 * into the final hour (power hour) — a smooth ramp anchored to empirical
 * charm/vanna flow timing.
 */
export function charmVannaWeight(now = new Date()): { weight: number; minsSinceOpen: number | null; minsToClose: number | null } {
  const m = minutesSinceOpenET(now);
  if (m === null) return { weight: 0.15, minsSinceOpen: null, minsToClose: null };
  const frac = m / 390; // 0 at open → 1 at close
  // Convex ramp: ~0.2 at open, ~0.5 midday, →1.0 into the close.
  const weight = Math.min(1, 0.2 + 0.8 * Math.pow(frac, 1.6));
  return { weight, minsSinceOpen: m, minsToClose: 390 - m };
}

export function computeDealerClock(netCharm: number, netVanna: number, now = new Date()): DealerClock {
  const { weight, minsSinceOpen, minsToClose } = charmVannaWeight(now);
  let session: DealerClock['session'] = 'AFTER';
  let label = 'After hours — hedging flows dormant';
  if (minsSinceOpen === null) {
    const hourET = Number(new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getHours());
    if (hourET < 9 || (hourET === 9 && now.getMinutes() < 30)) { session = 'PRE'; label = 'Pre-market — positioning ahead of the bell'; }
  } else if (minsSinceOpen < 60) { session = 'OPEN'; label = 'Opening drive — charm/vanna ramp building'; }
  else if (minsToClose !== null && minsToClose <= 30) { session = 'CLOSE'; label = 'Into the close — peak hedging acceleration'; }
  else if (minsToClose !== null && minsToClose <= 90) { session = 'POWER_HOUR'; label = 'Power hour — charm/vanna ramp accelerating'; }
  else { session = 'MIDDAY'; label = 'Midday — hedging flows moderate'; }

  return {
    session,
    weight: Number(weight.toFixed(3)),
    minutesToClose: minsToClose,
    label,
    weightedCharm: Number((netCharm * weight).toFixed(0)),
    weightedVanna: Number((netVanna * weight).toFixed(0)),
  };
}
