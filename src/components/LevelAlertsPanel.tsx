import { useState } from 'react';
import { Bell, BellRing, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import type { ArmedAlert, FiredAlert, AlertKind } from '../lib/levelAlerts';
import { ALERT_LABEL } from '../lib/levelAlerts';

/**
 * Level Alerts — arm a chime/toast when spot crosses a dealer level (call wall / put wall / gamma flip
 * / magnet) or a custom price. Descriptive: it notifies on a crossing; it never places a trade. Armed
 * state persists (handled by the parent); this panel is the presentation + controls.
 */
const DEALER_KINDS: Exclude<AlertKind, 'custom'>[] = ['callWall', 'putWall', 'gammaFlip', 'magnet'];
const KIND_COLOR: Record<string, string> = { callWall: 'var(--success)', putWall: 'var(--danger)', gammaFlip: 'var(--warning)', magnet: 'var(--info)' };

export function LevelAlertsPanel({ armed, levels, fired, decimals, onToggle, onAddCustom, onRemove, onClearFired }: {
  armed: ArmedAlert[];
  levels: { callWall?: number; putWall?: number; gammaFlip?: number; magnet?: number; spot: number };
  fired: FiredAlert[];
  decimals: number;
  onToggle: (kind: Exclude<AlertKind, 'custom'>) => void;
  onAddCustom: (price: number) => void;
  onRemove: (id: string) => void;
  onClearFired: () => void;
}) {
  const [price, setPrice] = useState('');
  const nf = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const isArmed = (kind: AlertKind) => armed.some(a => a.kind === kind);
  const customs = armed.filter(a => a.kind === 'custom');
  const submit = () => { const p = parseFloat(price); if (isFinite(p) && p > 0) { onAddCustom(p); setPrice(''); } };

  return (
    <div className="w-full font-mono text-[11px] flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-1.5 text-[9px] font-black tracking-widest uppercase text-[var(--text-tertiary)]"><Bell className="w-3 h-3" /> Level Alerts</div>
        <p className="text-[9px] text-[var(--text-tertiary)] mt-0.5 leading-snug">Chime when spot crosses a level. Descriptive — never a trade.</p>
      </div>
      {/* Dealer levels */}
      <div className="px-2 py-1.5 space-y-1 shrink-0 border-b border-[var(--border)]">
        {DEALER_KINDS.map(kind => {
          const v = levels[kind]; const on = isArmed(kind); const col = KIND_COLOR[kind];
          return (
            <button key={kind} onClick={() => onToggle(kind)} disabled={v == null}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md border transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] focus:outline-none"
              style={{ borderColor: on ? `color-mix(in srgb, ${col} 50%, transparent)` : 'var(--border)', background: on ? `color-mix(in srgb, ${col} 9%, transparent)` : 'transparent' }}>
              {on ? <BellRing className="w-3.5 h-3.5 shrink-0" style={{ color: col }} /> : <Bell className="w-3.5 h-3.5 shrink-0 text-[var(--text-tertiary)]" />}
              <span className="text-[10px] font-bold tracking-wide" style={{ color: on ? col : 'var(--text-secondary)' }}>{ALERT_LABEL[kind]}</span>
              <span className="ml-auto text-[10px] tabular-nums" style={{ color: on ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{v != null ? nf(v) : '—'}</span>
            </button>
          );
        })}
      </div>
      {/* Custom price */}
      <div className="px-2 py-1.5 shrink-0 border-b border-[var(--border)]">
        <div className="flex items-center gap-1.5">
          <input value={price} onChange={e => setPrice(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }} inputMode="decimal" placeholder="Custom price…"
            className="flex-1 min-w-0 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-[10px] font-mono tabular-nums text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-strong)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] focus:outline-none" />
          <button onClick={submit} className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] focus:outline-none transition-colors"><Plus className="w-3 h-3" /> Add</button>
        </div>
        {customs.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {customs.map(a => (
              <div key={a.id} className="flex items-center gap-2 px-2 py-1 rounded bg-[var(--surface-2)]">
                <BellRing className="w-3 h-3 shrink-0" style={{ color: 'var(--accent-color)' }} />
                <span className="text-[10px] tabular-nums text-[var(--text-secondary)]">{a.price != null ? nf(a.price) : ''}</span>
                <button onClick={() => onRemove(a.id)} className="ml-auto text-[var(--text-tertiary)] hover:text-[var(--danger)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] focus:outline-none rounded transition-colors"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Fired log */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex items-center justify-between px-3 py-1.5 sticky top-0 bg-[var(--surface)]">
          <span className="text-[8px] font-black tracking-widest uppercase text-[var(--text-tertiary)]">Triggered</span>
          {fired.length > 0 && <button onClick={onClearFired} className="text-[8px] font-mono uppercase tracking-wider text-[var(--text-tertiary)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] focus:outline-none rounded transition-colors">Clear</button>}
        </div>
        {fired.length === 0 ? (
          <div className="px-3 py-4 text-[9px] font-mono text-[var(--text-tertiary)] text-center">No crossings yet.</div>
        ) : fired.map((f, i) => (
          <div key={`${f.id}-${f.ts}-${i}`} className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)]/50">
            {f.dir === 'up' ? <ArrowUp className="w-3 h-3 shrink-0" style={{ color: 'var(--success)' }} /> : <ArrowDown className="w-3 h-3 shrink-0" style={{ color: 'var(--danger)' }} />}
            <span className="text-[10px] font-bold text-[var(--text-secondary)] truncate">{f.label}</span>
            <span className="ml-auto text-[10px] font-mono tabular-nums" style={{ color: f.dir === 'up' ? 'var(--success)' : 'var(--danger)' }}>{nf(f.price)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
