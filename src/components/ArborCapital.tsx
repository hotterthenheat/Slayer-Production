import React, { useState, useMemo } from 'react';
import {
  Users,
  BookOpen,
  FileText,
  HelpCircle,
  Calendar,
  MessageSquarePlus,
  CheckCircle,
  Compass,
  GraduationCap,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Bookmark,
  ChevronUp,
} from 'lucide-react';
import { useContractStore } from '../lib/store';
import { V8TradeRecord } from '../types';

type ChannelKey = 'verified' | 'research' | 'education' | 'support';

const CHANNELS: { key: ChannelKey; label: string; sub: string; Icon: typeof FileText }[] = [
  { key: 'verified', label: 'Trade Record', sub: 'Logged trade ledger', Icon: ShieldCheck },
  { key: 'research', label: 'Research Library', sub: 'Flow & macro methodology', Icon: FileText },
  { key: 'education', label: 'Options Education', sub: 'Greeks & risk framework', Icon: BookOpen },
  { key: 'support', label: 'Product Support', sub: 'Feature requests & feedback', Icon: HelpCircle },
];

// Section header used across every channel for a consistent institutional look.
function SectionHeader({
  icon,
  title,
  meta,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
          {title}
        </h3>
      </div>
      {meta != null && (
        <span className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] shrink-0">
          {meta}
        </span>
      )}
    </div>
  );
}

const WIN_OUTCOMES = ['Target 1 Winner', 'Target 2 Winner', 'Target 3 Winner', 'Stretch Winner'];

export default function ArborCapital() {
  const [activeChannel, setActiveChannel] = useState<ChannelKey>('verified');

  // Real platform data — trade ledger and market clock come straight from the store.
  const trades = useContractStore((s) => s.trades);
  const serverState = useContractStore((s) => s.serverState);
  const marketState = useContractStore((s) => s.marketState);
  const selectedAsset = useContractStore((s) => s.selectedAsset);

  // Feature requests are genuine client-side UI (a working form + voting). The
  // rows seeded below are illustrative EXAMPLES of the format, not a live
  // community board — they are flagged `example` and labeled as such in the UI
  // so the vote counts/statuses are never presented as real activity. Requests
  // a user submits this session are real and unflagged.
  const [userRequests, setUserRequests] = useState([
    { id: 'req-1', title: 'Imbalance sweep trigger audio alerts', type: 'Feature Request', votes: 24, status: 'Completed', example: true },
    { id: 'req-2', title: 'Vanna exposure speed indicators', type: 'Research Suggestion', votes: 11, status: 'In Review', example: true },
    { id: 'req-3', title: 'Gamma flip level overlays on index charts', type: 'Feature Request', votes: 19, status: 'Scheduled', example: true },
  ]);
  const [newRequestTitle, setNewRequestTitle] = useState('');
  const [newRequestType, setNewRequestType] = useState('Feature Request');
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  const handleAddRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequestTitle.trim()) return;
    setUserRequests([
      { id: `req-${Date.now()}`, title: newRequestTitle, type: newRequestType, votes: 1, status: 'Open', example: false },
      ...userRequests,
    ]);
    setNewRequestTitle('');
    setRequestSubmitted(true);
    setTimeout(() => setRequestSubmitted(false), 3000);
  };

  const handleVote = (id: string) => {
    setUserRequests((prev) => prev.map((r) => (r.id === id ? { ...r, votes: r.votes + 1 } : r)));
  };

  // Aggregate stats from the real logged trade archive (empty until trades log).
  const ledgerStats = useMemo(() => {
    const list = (trades || []) as V8TradeRecord[];
    const closed = list.filter((t) => t.finalOutcome && t.finalOutcome !== 'Active');
    const wins = closed.filter((t) => WIN_OUTCOMES.includes(t.finalOutcome));
    const active = list.filter((t) => t.finalOutcome === 'Active');
    const winRate = closed.length ? (wins.length / closed.length) * 100 : null;
    const avgGain = closed.length
      ? closed.reduce((s, t) => s + (Number.isFinite(t.maxGain) ? t.maxGain : 0), 0) / closed.length
      : null;
    return {
      total: list.length,
      closed: closed.length,
      wins: wins.length,
      active: active.length,
      winRate,
      avgGain,
    };
  }, [trades]);

  const recentTrades = useMemo(
    () => ((trades || []) as V8TradeRecord[]).slice(0, 8),
    [trades],
  );

  // Static, clearly-labeled reference content. No fabricated "live" statistics,
  // dates, or hit rates — these describe how the platform's tools work.
  const researchTopics = [
    {
      title: 'Reading Dealer Gamma Through Volatility',
      tag: 'Dealer Flow',
      body: 'How market makers hedge across positive and negative gamma regimes, and why price behaves differently on each side of the gamma flip.',
    },
    {
      title: 'Order Blocks, VWAP & Structure Breaks',
      tag: 'Price Structure',
      body: 'Mapping displacement zones and structure breaks (BOS) as reference levels for short-dated option premium.',
    },
    {
      title: 'Call / Put Walls & Vanna Levels',
      tag: 'Positioning',
      body: 'Interpreting call-wall and put-wall clustering on index names, and what compressing exposure implies for the expected move.',
    },
  ];

  const educationModules = [
    {
      title: 'Greeks & Dealer Hedging',
      level: 'Foundations',
      desc: 'How GEX, DEX and VEX drive market-maker hedging and where dealers are positioned to push price.',
      Icon: GraduationCap,
      accent: '#4ADE80',
    },
    {
      title: 'Key Price Levels',
      level: 'Foundations',
      desc: 'Identifying major order blocks and displacement zones, and why structure breaks act as magnets for premium.',
      Icon: BookOpen,
      accent: '#60A5FA',
    },
    {
      title: 'Risk Management',
      level: 'Advanced',
      desc: 'A practical framework for expected value, probability-based sizing and drawdown limits across volatility regimes.',
      Icon: Compass,
      accent: '#FBBF24',
    },
  ];

  const fmtPct = (v: number | null, signed = false) =>
    v == null || !Number.isFinite(v) ? '—' : `${signed && v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

  const fmtTime = (ts?: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—'; // unparseable timestamp — show an em dash, not a blank
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="w-full flex flex-col font-mono select-none antialiased space-y-5 text-[var(--text-secondary)]">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Users className="w-4 h-4 text-[var(--success)]" />
            <span className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--text-tertiary)]">
              Arbor Capital
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
            Community &amp; Education
          </h2>
          <p className="text-xs text-[var(--text-tertiary)] mt-1 leading-relaxed max-w-2xl">
            Research, education and a logged trade ledger for options day traders. Built around
            measurable results — not alerts.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 shrink-0">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Market</span>
            <span
              className="text-xs font-bold tabular-nums"
              style={{ color: marketState.open ? '#4ADE80' : '#F87171' }}
            >
              {marketState.open ? 'OPEN' : 'CLOSED'}
            </span>
          </div>
          <div className="h-7 w-px bg-[var(--border)]" />
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
              {marketState.open ? 'Closes in' : 'Opens in'}
            </span>
            <span className="text-xs font-bold tabular-nums text-[var(--text-primary)]">
              {marketState.open ? marketState.closeIn : marketState.openIn}
            </span>
          </div>
        </div>
      </div>

      {/* Positioning statement */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-2">
          What This Is
        </h3>
        <p className="text-xs md:text-[13px] text-[var(--text-secondary)] leading-relaxed max-w-4xl">
          Slayer Terminal is a software platform —{' '}
          <span className="font-bold text-[var(--text-primary)]">not a signal group or Discord alert room</span>.
          The tools help traders make better decisions with real, measurable data. The community exists to
          support the software and keep results accountable.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
          {['Software first', 'Logged results', 'Data-driven methods'].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-[var(--success)]" />
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 items-start">

        {/* Sidebar */}
        <div className="lg:col-span-1 flex flex-col gap-2">
          {CHANNELS.map(({ key, label, sub, Icon }) => {
            const active = activeChannel === key;
            return (
              <button
                key={key}
                onClick={() => setActiveChannel(key)}
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                  active
                    ? 'border-[var(--border-strong)] bg-[var(--surface-2)]'
                    : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]'
                }`}
              >
                <Icon
                  className="w-4 h-4 shrink-0"
                  style={{ color: active ? '#4ADE80' : 'var(--text-tertiary)' }}
                />
                <div className="flex flex-col">
                  <span
                    className="text-[11px] font-bold uppercase tracking-[0.1em]"
                    style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                  >
                    {label}
                  </span>
                  <span className="text-[9px] text-[var(--text-tertiary)] normal-case">{sub}</span>
                </div>
              </button>
            );
          })}

          {/* Live session note */}
          <div className="mt-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col gap-2.5">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[var(--success)]" />
              <span className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                Live Sessions
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Platform walkthroughs and education sessions are announced in-app. Tracked contract:{' '}
              <span className="font-bold text-[var(--text-primary)]">{selectedAsset?.ticker ?? '—'}</span>.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 md:p-6 min-h-[360px]">

          {/* Trade Record — real logged trade ledger (empty until the engine logs trades) */}
          {activeChannel === 'verified' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              <SectionHeader
                icon={<ShieldCheck className="w-4 h-4 text-[var(--success)]" />}
                title="Trade Ledger"
                meta={serverState?.data_source && serverState.data_source !== 'undefined' ? `Source · ${serverState.data_source}` : undefined}
              />

              {/* Stat strip from real archive */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Logged Trades', value: String(ledgerStats.total), tone: 'var(--text-primary)' },
                  {
                    label: 'Win Rate',
                    value: fmtPct(ledgerStats.winRate),
                    tone:
                      ledgerStats.winRate == null
                        ? 'var(--text-primary)'
                        : ledgerStats.winRate >= 50
                        ? '#4ADE80'
                        : '#F87171',
                  },
                  {
                    label: 'Avg Max Gain',
                    value: fmtPct(ledgerStats.avgGain, true),
                    tone: (ledgerStats.avgGain ?? 0) >= 0 ? '#4ADE80' : '#F87171',
                  },
                  { label: 'Active Now', value: String(ledgerStats.active), tone: '#FBBF24' },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
                    <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] block">
                      {s.label}
                    </span>
                    <span className="text-lg font-bold tabular-nums mt-0.5 block" style={{ color: s.tone }}>
                      {s.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Recent entries */}
              {recentTrades.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                    Most recent entries
                  </span>
                  {recentTrades.map((t) => {
                    const bullish = t.direction === 'BULLISH';
                    const isWin = WIN_OUTCOMES.includes(t.finalOutcome);
                    const isActive = t.finalOutcome === 'Active';
                    const outcomeTone = isActive ? '#FBBF24' : isWin ? '#4ADE80' : '#F87171';
                    return (
                      <div
                        key={t.id}
                        className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3.5 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-7 h-7 rounded flex items-center justify-center shrink-0"
                            style={{ background: `${bullish ? '#4ADE80' : '#F87171'}1a` }}
                          >
                            {bullish ? (
                              <TrendingUp className="w-4 h-4" style={{ color: '#4ADE80' }} />
                            ) : (
                              <TrendingDown className="w-4 h-4" style={{ color: '#F87171' }} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-[var(--text-primary)] block truncate">
                              {t.contract}
                            </span>
                            <span className="text-[10px] text-[var(--text-tertiary)] tabular-nums">
                              {fmtTime(t.closeTs || t.timestamp) || '—'}
                              {t.recommendation && (t.recommendation as string) !== 'undefined' ? ` · ${t.recommendation}` : ''}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
                          <div className="flex flex-col items-end">
                            <span className="text-[9px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                              Max gain
                            </span>
                            <span
                              className="text-xs font-bold tabular-nums"
                              style={{ color: (t.maxGain ?? 0) >= 0 ? '#4ADE80' : '#F87171' }}
                            >
                              {fmtPct(t.maxGain, true)}
                            </span>
                          </div>
                          <span
                            className="text-[9px] font-bold uppercase tracking-[0.1em] px-2 py-1 rounded whitespace-nowrap"
                            style={{ color: outcomeTone, background: `${outcomeTone}14`, border: `1px solid ${outcomeTone}55` }}
                          >
                            {t.finalOutcome}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-8 text-center">
                  <ShieldCheck className="w-7 h-7 text-[var(--text-tertiary)] mx-auto mb-2" />
                  <p className="text-xs text-[var(--text-secondary)]">
                    {ledgerStats.total === 0
                      ? 'No trades recorded yet.'
                      : `No closed trades yet — ${ledgerStats.active} open ${ledgerStats.active === 1 ? 'position' : 'positions'}.`}
                  </p>
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
                    {ledgerStats.total === 0
                      ? 'Your live track record starts at launch — logged trades appear here as the engine records them.'
                      : 'Closed results appear here once open positions resolve.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Research Library */}
          {activeChannel === 'research' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              <SectionHeader
                icon={<FileText className="w-4 h-4 text-[var(--success)]" />}
                title="Research Library"
                meta="Methodology"
              />
              <p className="text-xs text-[var(--text-tertiary)] leading-relaxed -mt-1">
                Reference notes on how the platform reads flow, structure and positioning. These describe
                method — they are not trade calls.
              </p>
              <div className="grid grid-cols-1 gap-3">
                {researchTopics.map((a) => (
                  <div
                    key={a.title}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4"
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--success)] px-2 py-0.5 rounded border border-[var(--success)]/30 bg-[var(--success)]/10">
                        {a.tag}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-[var(--text-primary)] tracking-tight leading-snug">
                      {a.title}
                    </h4>
                    <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed">{a.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Options Education */}
          {activeChannel === 'education' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              <SectionHeader
                icon={<GraduationCap className="w-4 h-4 text-[var(--success)]" />}
                title="Options Education"
                meta="Core curriculum"
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {educationModules.map((m) => {
                  const Icon = m.Icon;
                  return (
                    <div
                      key={m.title}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 flex flex-col gap-3"
                    >
                      <div className="flex items-center justify-between">
                        <div
                          className="w-8 h-8 rounded flex items-center justify-center"
                          style={{ background: `${m.accent}1a`, border: `1px solid ${m.accent}55` }}
                        >
                          <Icon className="w-4 h-4" style={{ color: m.accent }} />
                        </div>
                        <span className="text-[9px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                          {m.level}
                        </span>
                      </div>
                      <h4 className="text-[13px] font-bold text-[var(--text-primary)] tracking-tight leading-snug">
                        {m.title}
                      </h4>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed flex-1">{m.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Product Support */}
          {activeChannel === 'support' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              <SectionHeader
                icon={<HelpCircle className="w-4 h-4 text-[var(--success)]" />}
                title="Support & Feature Requests"
                meta="Product roadmap"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">

                {/* Submit */}
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <MessageSquarePlus className="w-4 h-4 text-[var(--success)]" />
                    <h4 className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--text-primary)]">
                      Submit a Request
                    </h4>
                  </div>
                  <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed mb-4">
                    Share feature ideas or bug reports. Upvote existing requests to help prioritize what we
                    build next.
                  </p>

                  {requestSubmitted ? (
                    <div className="rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 p-4 flex items-start gap-2.5">
                      <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#4ADE80' }} />
                      <div>
                        <span className="text-xs font-bold text-[var(--text-primary)] block">
                          Request submitted
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)]">
                          Logged and queued for review.
                        </span>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleAddRequest} className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)] block">
                          Request title
                        </label>
                        <input
                          type="text"
                          value={newRequestTitle}
                          onChange={(e) => setNewRequestTitle(e.target.value)}
                          placeholder="e.g. Alert when IV drops below 15%"
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--success)]/60"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)] block">
                          Category
                        </label>
                        <select
                          value={newRequestType}
                          onChange={(e) => setNewRequestType(e.target.value)}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--success)]/60"
                        >
                          <option value="Feature Request">Feature Request</option>
                          <option value="Technical Bug">Technical Bug</option>
                          <option value="Research Suggestion">Research Suggestion</option>
                        </select>
                      </div>
                      <button
                        type="submit"
                        className="w-full rounded-lg py-2.5 bg-[var(--success)] hover:bg-[#3fcf72] text-black font-bold uppercase text-[10px] tracking-[0.12em] transition-colors"
                      >
                        Submit Request
                      </button>
                    </form>
                  )}
                </div>

                {/* Open requests */}
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 flex flex-col">
                  <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-[var(--border)]">
                    <div className="flex items-center gap-1.5">
                      <Bookmark className="w-4 h-4 text-[var(--success)]" />
                      <h4 className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--text-primary)]">
                        Open Requests
                      </h4>
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)] border border-[var(--border)] rounded px-1.5 py-0.5">
                      Examples
                    </span>
                  </div>
                  <div className="space-y-2.5 overflow-y-auto max-h-[300px]">
                    {userRequests.map((req) => {
                      const tone =
                        req.status === 'Completed'
                          ? '#4ADE80'
                          : req.status === 'In Review'
                          ? '#FBBF24'
                          : req.status === 'Scheduled'
                          ? '#60A5FA'
                          : 'var(--text-tertiary)';
                      return (
                        <div
                          key={req.id}
                          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                              <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                                {req.type}
                              </span>
                              <span className="text-[var(--text-tertiary)]">·</span>
                              <span
                                className="text-[8px] font-bold uppercase tracking-[0.1em] px-1.5 py-px rounded"
                                style={{ color: tone, background: `${tone}1a` }}
                              >
                                {req.status}
                              </span>
                              {req.example && (
                                <span className="text-[8px] font-bold uppercase tracking-[0.1em] px-1.5 py-px rounded text-[var(--text-tertiary)] border border-[var(--border)]">
                                  Example
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-bold text-[var(--text-primary)] block truncate leading-tight">
                              {req.title}
                            </span>
                          </div>
                          <button
                            onClick={() => handleVote(req.id)}
                            aria-label={`Upvote "${req.title}" — ${req.votes} ${req.votes === 1 ? 'vote' : 'votes'}`}
                            className="flex flex-col items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 shrink-0 hover:border-[var(--success)]/60 transition-colors focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
                          >
                            <ChevronUp className="w-3.5 h-3.5 text-[var(--success)]" aria-hidden="true" />
                            <span className="text-[11px] font-bold tabular-nums text-[var(--text-primary)]">
                              {req.votes}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
