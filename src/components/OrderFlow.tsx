import { OrderFlowData } from '../types';
import { Network, Activity, BarChart3 } from 'lucide-react';

// Theme tokens — follows the active Slayer theme like the rest of the terminal.
const K = { up: 'var(--success)', down: 'var(--danger)', dim: 'var(--text-tertiary)' };
const mix = (token: string, pct: number) => `color-mix(in srgb, ${token} ${pct}%, transparent)`;
const fmtVol = (v: number) => { const a = Math.abs(v); return a >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v.toFixed(0); };

/**
 * OrderFlow — the Level-2 (depth-of-market) rail: order-book imbalance, cumulative delta,
 * and a footprint ladder. Renders an explicit "awaiting feed" state until the L2 stream is
 * connected; every visual is driven by the OrderFlowData contract so wiring the live feed is
 * a pure data hand-off (no layout work).
 */
export function OrderFlow({ data, decimals }: { data?: OrderFlowData | null; decimals: number }) {
  // Coerce every numeric off a possibly-partial L2 frame — a bad tick must never render
  // NaN% bars or a silently-wrong "Balanced" state.
  const num = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const imb = data ? Math.max(-1, Math.min(1, num(data.imbalance))) : 0;
  const buyPct = ((imb + 1) / 2) * 100;
  const cd = (data?.cumulativeDelta || []).map(num);
  const cdLast = cd.length ? cd[cd.length - 1] : 0;
  const cdMin = cd.length ? Math.min(...cd) : 0, cdMax = cd.length ? Math.max(...cd) : 1;
  const cdRange = (cdMax - cdMin) || 1;
  const cdPath = cd.map((v, i) => `${(i / Math.max(1, cd.length - 1)) * 100},${30 - ((v - cdMin) / cdRange) * 28 - 1}`).join(' ');
  const foot = (data?.footprint || []).map(f => ({ price: num(f.price), buyVol: num(f.buyVol), sellVol: num(f.sellVol) }));
  const maxFoot = Math.max(...foot.map(f => Math.max(f.buyVol, f.sellVol)), 1);
  // Depth-of-market book — resting bid/ask size by price (top = highest). Renders when the L2 feed
  // supplies it; otherwise this section is simply absent (the honest "awaiting feed" state stands).
  const book = (data?.book || []).map(b => ({ price: num(b.price), bidSize: num(b.bidSize), askSize: num(b.askSize) }));
  const maxBook = Math.max(...book.map(b => Math.max(b.bidSize, b.askSize)), 1);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden" style={{ background: 'var(--surface)' }}>
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 h-9 border-b border-[var(--border)] shrink-0">
        <Network className="w-3.5 h-3.5 text-[var(--accent-color)]" />
        <span className="text-[10px] font-sans font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]">Order Flow</span>
        <span className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-mono font-black uppercase tracking-widest border" style={{ borderColor: data ? mix('var(--success)', 40) : 'var(--border)', color: data ? K.up : 'var(--text-tertiary)' }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: data ? K.up : 'var(--text-tertiary)' }} />L2 {data ? (data.feed || 'live') : 'idle'}
        </span>
      </div>

      {!data ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-2">
          <Network className="w-7 h-7 text-[var(--text-tertiary)] opacity-40" />
          <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Awaiting L2 Feed</div>
          <p className="text-[10px] font-mono leading-relaxed text-[var(--text-tertiary)] max-w-[200px]">Order-book imbalance, cumulative delta and footprint activate when the depth-of-market stream connects.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto antialiased">
          {/* Order-book imbalance */}
          <div className="p-3 border-b border-[var(--border)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-[var(--text-tertiary)]">Book Imbalance</span>
              <span className="text-[11px] font-mono font-black tabular-nums transition-colors duration-300" style={{ color: imb >= 0 ? K.up : K.down }}>{imb >= 0 ? '+' : ''}{(imb * 100).toFixed(0)}%</span>
            </div>
            <div className="relative h-3 rounded-sm overflow-hidden flex bg-white/[0.03]">
              <div className="h-full" style={{ width: `${buyPct}%`, background: `linear-gradient(90deg, ${mix('var(--success)', 25)}, ${mix('var(--success)', 70)})` }} />
              <div className="h-full flex-1" style={{ background: `linear-gradient(90deg, ${mix('var(--danger)', 70)}, ${mix('var(--danger)', 25)})` }} />
              <div className="absolute top-0 bottom-0 w-px bg-white/40" style={{ left: '50%' }} />
            </div>
            <div className="flex items-center justify-between mt-1.5 text-[9px] font-mono font-bold tabular-nums">
              <span style={{ color: K.up }}>BID {fmtVol(num(data.bidDepth))}</span>
              <span className="uppercase tracking-widest" style={{ color: imb >= 0.12 ? K.up : imb <= -0.12 ? K.down : K.dim }}>{imb >= 0.12 ? 'Buyers Lifting' : imb <= -0.12 ? 'Sellers Hitting' : 'Balanced'}</span>
              <span style={{ color: K.down }}>{fmtVol(num(data.askDepth))} ASK</span>
            </div>
          </div>

          {/* Cumulative delta */}
          <div className="p-3 border-b border-[var(--border)]">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-[var(--text-tertiary)]"><Activity className="w-3 h-3" /> Cumulative Delta</span>
              <span className="text-[11px] font-mono font-black tabular-nums transition-colors duration-300" style={{ color: cdLast >= 0 ? K.up : K.down }}>{cdLast >= 0 ? '+' : ''}{fmtVol(cdLast)}</span>
            </div>
            <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-9">
              <line x1="0" y1={30 - ((0 - cdMin) / cdRange) * 28 - 1} x2="100" y2={30 - ((0 - cdMin) / cdRange) * 28 - 1} stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
              {cd.length > 1 && <polyline points={cdPath} fill="none" stroke={cdLast >= 0 ? K.up : K.down} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />}
            </svg>
          </div>

          {/* Footprint ladder */}
          <div className="px-3 py-2 border-b border-[var(--border)] flex items-center gap-1.5 shrink-0">
            <BarChart3 className="w-3.5 h-3.5 text-[var(--accent-color)]" />
            <span className="text-[10px] font-mono font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">Footprint</span>
            <span className="ml-auto text-[8.5px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">sell · buy</span>
          </div>
          <div className="py-1">
            {foot.map((f, i) => {
              const net = f.buyVol - f.sellVol;
              return (
                <div key={i} className="grid grid-cols-[1fr_58px_1fr] items-center gap-1 px-3 h-[22px] text-[10px] font-mono font-medium tabular-nums hover:bg-white/[0.03] transition-colors duration-150">
                  <div className="flex justify-end items-center gap-1"><span className="text-[9px]" style={{ color: K.down }}>{fmtVol(f.sellVol)}</span><div className="h-[8px] rounded-sm" style={{ width: `${(f.sellVol / maxFoot) * 100}%`, maxWidth: '100%', background: mix('var(--danger)', 55), transition: 'width 300ms ease-out' }} /></div>
                  <div className="text-center font-black tracking-wider transition-colors duration-300" style={{ color: net >= 0 ? K.up : K.down }}>{f.price.toFixed(decimals)}</div>
                  <div className="flex justify-start items-center gap-1"><div className="h-[8px] rounded-sm" style={{ width: `${(f.buyVol / maxFoot) * 100}%`, maxWidth: '100%', background: mix('var(--success)', 55), transition: 'width 300ms ease-out' }} /><span className="text-[9px]" style={{ color: K.up }}>{fmtVol(f.buyVol)}</span></div>
                </div>
              );
            })}
          </div>
          {/* Depth of market — resting bid/ask book (bid green left · ask red right) */}
          {book.length > 0 && (
            <>
              <div className="px-3 py-2 border-y border-[var(--border)] flex items-center gap-1.5 shrink-0">
                <BarChart3 className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                <span className="text-[10px] font-mono font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">Depth of Market</span>
                {data?.spread != null && <span className="ml-auto text-[8.5px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">spread {num(data.spread).toFixed(decimals)}</span>}
              </div>
              <div className="py-1">
                {book.map((b, i) => (
                  <div key={i} className="grid grid-cols-[1fr_58px_1fr] items-center gap-1 px-3 h-[20px] text-[10px] font-mono tabular-nums hover:bg-white/[0.03] transition-colors duration-150">
                    <div className="flex justify-end items-center gap-1"><span className="text-[9px]" style={{ color: K.up }}>{b.bidSize ? fmtVol(b.bidSize) : ''}</span><div className="h-[7px] rounded-sm" style={{ width: `${(b.bidSize / maxBook) * 100}%`, maxWidth: '100%', background: mix('var(--success)', 50), transition: 'width 300ms ease-out' }} /></div>
                    <div className="text-center font-bold text-[var(--text-secondary)]">{b.price.toFixed(decimals)}</div>
                    <div className="flex justify-start items-center gap-1"><div className="h-[7px] rounded-sm" style={{ width: `${(b.askSize / maxBook) * 100}%`, maxWidth: '100%', background: mix('var(--danger)', 50), transition: 'width 300ms ease-out' }} /><span className="text-[9px]" style={{ color: K.down }}>{b.askSize ? fmtVol(b.askSize) : ''}</span></div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
