import React, { useState, useMemo } from 'react';
import { 
  Users, 
  BookOpen, 
  MessagesSquare, 
  HelpCircle, 
  FileText, 
  Tv, 
  Lightbulb, 
  Calendar, 
  ExternalLink, 
  ArrowUpRight, 
  MessageSquarePlus, 
  CheckCircle,
  Clock,
  Compass,
  GraduationCap,
  Sparkles,
  Bookmark
} from 'lucide-react';
import { useContractStore } from '../lib/store';

export default function ArborCapital() {
  const [activeChannel, setActiveChannel] = useState<'research' | 'education' | 'community' | 'support'>('research');
  
  // Feature requests state
  const [userRequests, setUserRequests] = useState([
    { id: 'req-1', title: 'Imbalance sweep trigger audio alerts', type: 'Feature Request', votes: 24, status: 'Completed' },
    { id: 'req-2', title: 'Vanna squeeze speed accelerator coefficients', type: 'Research suggestion', votes: 11, status: 'In Review' },
    { id: 'req-3', title: 'Gamma Flip levels overlays in standard indices charts', type: 'Feature Request', votes: 19, status: 'Scheduled' }
  ]);
  const [newRequestTitle, setNewRequestTitle] = useState('');
  const [newRequestType, setNewRequestType] = useState('Feature Request');
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  const handleAddRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequestTitle.trim()) return;

    setUserRequests([
      {
        id: `req-${Date.now()}`,
        title: newRequestTitle,
        type: newRequestType,
        votes: 1,
        status: 'Open'
      },
      ...userRequests
    ]);
    setNewRequestTitle('');
    setRequestSubmitted(true);
    setTimeout(() => setRequestSubmitted(false), 3000);
  };

  const handleVote = (id: string) => {
    setUserRequests(prev => prev.map(r => r.id === id ? { ...r, votes: r.votes + 1 } : r));
  };

  // Static mock data for the selected channel content
  const researchArticles = [
    {
      title: 'Deep-Exhaustion Volatility Spikes: Dealer Dynamic Gamma Rebalancing Strategy',
      tag: 'Dealer Flow Analysis',
      date: 'June 08, 2026',
      summary: 'An empirical breakdown of spot price velocity as market makers hit deep negative gamma thresholds. Historical win rate for buyer options spikes counts at 72.4% inside critical 90m gaps.',
      readTime: '8 min read',
      isPremium: true
    },
    {
      title: 'Structural Imbalances: Overbought RSI Cascade Divergences on Index Futures',
      tag: 'Market Research',
      date: 'June 07, 2026',
      summary: 'Analyzing the statistical reliability of standard deviation reversion overlays. When combined with net orderblock sweeps, historical drawdown levels decline by over 14%.',
      readTime: '6 min read',
      isPremium: false
    },
    {
      title: 'Weekly Institutional Outlook: Core Index Flip Parameters and Vanna Targets',
      tag: 'Macro Analysis',
      date: 'June 05, 2026',
      summary: 'Critical Call Wall & Put Wall placements mapped for SPX, NDX, and RUT. Spot price clustering dictates an imminent volatility compression, which represents optimal setup for Calendars.',
      readTime: '12 min read',
      isPremium: true
    }
  ];

  const educationModules = [
    {
      title: 'Institutional Options Greeks & Inventory Decoupled',
      level: 'CORE LESSON 1',
      desc: 'Understand exactly how GEX (Gamma), DEX (Delta), and VEX (Vanna) dictate the dynamic hedging constraints of market makers. Never guess the dealer boundaries again.',
      progress: '100% COMPLETED',
      icon: GraduationCap,
      color: 'text-indigo-400'
    },
    {
      title: 'Orderblock & VWAP Space Trajectory Architecture',
      level: 'CORE LESSON 2',
      desc: 'Master the art of locating major displacement zones. Understand how structure breaks (BOS) act as magnet boundaries for short-dated premiums.',
      progress: '80% COMPLETED',
      icon: BookOpen,
      color: 'text-[#4ADE80]'
    },
    {
      title: 'Option Risk Management: Mitigating Mathematical Ruin Profiles',
      level: 'ADVANCED METRIC 3',
      desc: 'A complete framework addressing expected value, probability calibration, and drawdown models to maintain terminal equity paths in multi-volatility environments.',
      progress: 'NOT STARTED',
      icon: Compass,
      color: 'text-amber-400'
    }
  ];

  const communityDiscussions = [
    { id: 1, user: 'VolTrader_41', avatar: '🛡️', msg: 'SPX GEX wall just held beautifully at 5180. Dealers pushed it straight back into equilibrium. Standard compression protocol played out on target.', time: '12m ago' },
    { id: 2, user: 'QuantDelta', avatar: '🔬', msg: 'Fascinating looking at the Vanna curve on QQQ right now. Implied Volatility decline is triggering automatic passive buyback flows.', time: '28m ago' },
    { id: 3, user: 'SlayerAlpha_007', avatar: '🌲', msg: 'Has anyone tested the V8 live tracker outcomes vs the expected range bounds? My target 1 outcomes this morning hit with extreme accuracy.', time: '1h ago' }
  ];

  return (
    <div className="w-full text-[#4ADE80] flex flex-col font-mono select-none antialiased space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center apple-glass p-5 rounded-2xl gap-4 shadow-lg border border-white/5">
        <div>
          <div className="flex items-center gap-2 text-[#4ADE80] mb-1">
            <Users className="w-4 h-4 text-[#4ADE80]" />
            <span className="text-[10px] tracking-[0.25em] font-black uppercase font-mono">SLAYER LABS INTEL HUB</span>
          </div>
          <h2 className="text-xl font-bold tracking-wider text-[#E5E5E5] font-mono flex items-center gap-2">
            🌲 SLAYER LABS: THE COMMUNITY & EDUCATION LAYER
          </h2>
          <p className="text-xs text-zinc-400 font-sans mt-1 leading-normal text-left">
            Where institutional software meets high-conviction collaboration. Proving what works, educating options traders, and sharing trade reviews.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-black/40 p-2.5 border border-white/5 rounded-lg shrink-0">
          <span className="text-[9px] text-[#A1A1AA] font-mono tracking-wider uppercase block">CORE TAGLINE</span>
          <div className="h-5 w-px bg-white/10 mx-1"></div>
          <span className="text-xs font-bold text-[#4ADE80] font-mono italic">"Where Intelligence Becomes Community."</span>
        </div>
      </div>

      {/* Main Structural Information Cards regarding "Not a Discord, Not an alert service" */}
      <div className="bg-gradient-to-r from-zinc-300/10 via-indigo-500/5 to-transparent border border-black p-6 rounded-2xl relative overflow-hidden shadow-xl text-left">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <Sparkles className="w-24 h-24 text-[#4ADE80] shrink-0" />
        </div>
        <div className="relative">
          <h3 className="text-xs font-black tracking-widest text-[#E0E0E0] uppercase font-mono mb-2">Ecosystem Philosophy</h3>
          <p className="text-xs md:text-sm text-[#4ADE80] leading-relaxed font-sans max-w-4xl pt-0.5">
            Slayer.trade is a financial technology company - <span className="font-bold text-[#4ADE80]">Slayer Labs is not a signal group or standard Discord alert room</span>. We believe in software that helps traders make better decisions using measurable data. The community exists to support the software and build elite accountability. The software does not exist to support the community.
          </p>
          <div className="flex flex-wrap gap-4 mt-4 text-[10px] text-zinc-400 font-mono uppercase">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-black"></span>
              <span>100% Software First</span>
            </div>
            <div className="h-4 w-px bg-white/10"></div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#d4d4d8]"></span>
              <span>Measurable Accountability</span>
            </div>
            <div className="h-4 w-px bg-white/10"></div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#d4d4d8]"></span>
              <span>Institutional Frameworks</span>
            </div>
          </div>
        </div>
      </div>

      {/* Slayer Labs Interactive Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        {/* Sidebar Navigation */}
        <div className="col-span-1 flex flex-col gap-2 w-full">
          
          <button
            onClick={() => setActiveChannel('research')}
            className={`flex items-center gap-3 p-3 px-4 rounded-xl text-left font-mono text-xs font-bold transition-all border ${
              activeChannel === 'research'
                ? 'bg-black/40 text-[#d4d4d8] border-black shadow'
                : 'bg-black/30 border-white/5 hover:border-black text-[#888888] hover:text-zinc-200'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <div className="flex flex-col">
              <span>RESEARCH CHANNELS</span>
              <span className="text-[9px] text-zinc-550 font-normal">Flow & Macro Analysis</span>
            </div>
          </button>

          <button
            onClick={() => setActiveChannel('education')}
            className={`flex items-center gap-3 p-3 px-4 rounded-xl text-left font-mono text-xs font-bold transition-all border ${
              activeChannel === 'education'
                ? 'bg-black/40 text-[#d4d4d8] border-black shadow'
                : 'bg-black/30 border-white/5 hover:border-black text-[#888888] hover:text-zinc-200'
            }`}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <div className="flex flex-col">
              <span>EDUCATIONAL CONTENT</span>
              <span className="text-[9px] text-zinc-550 font-normal">Interactive options school</span>
            </div>
          </button>

          <button
            onClick={() => setActiveChannel('community')}
            className={`flex items-center gap-3 p-3 px-4 rounded-xl text-left font-mono text-xs font-bold transition-all border ${
              activeChannel === 'community'
                ? 'bg-black/40 text-[#d4d4d8] border-black shadow'
                : 'bg-black/30 border-white/5 hover:border-black text-[#888888] hover:text-zinc-200'
            }`}
          >
            <MessagesSquare className="w-4 h-4 shrink-0" />
            <div className="flex flex-col">
              <span>COMMUNITY FEED</span>
              <span className="text-[9px] text-zinc-550 font-normal">Trade journaling logs</span>
            </div>
          </button>

          <button
            onClick={() => setActiveChannel('support')}
            className={`flex items-center gap-3 p-3 px-4 rounded-xl text-left font-mono text-xs font-bold transition-all border ${
              activeChannel === 'support'
                ? 'bg-black/40 text-[#d4d4d8] border-black shadow'
                : 'bg-black/30 border-white/5 hover:border-black text-[#888888] hover:text-zinc-200'
            }`}
          >
            <HelpCircle className="w-4 h-4 shrink-0" />
            <div className="flex flex-col">
              <span>PRODUCT SUPPORT</span>
              <span className="text-[9px] text-zinc-550 font-normal">Feedback and suggestion box</span>
            </div>
          </button>

          {/* Event Timeline Display Widget */}
          <div className="bg-black/30 border border-white/5 rounded-2xl p-5 mt-2 flex flex-col font-mono text-xs gap-3">
            <span className="text-[9px] text-[#A1A1AA] uppercase tracking-widest font-black flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-[#4ADE80]" />
              Upcoming Live Events Calendar
            </span>

            <div className="space-y-3.5 text-left">
              <div className="border-l-2 border-black pl-3">
                <span className="text-[9px] text-[#d4d4d8] block font-bold uppercase tracking-wider">TODAY 15:30 UTC</span>
                <span className="font-bold text-zinc-200 block">Intraday Dealer Flow Audit Review</span>
                <span className="text-[10px] text-zinc-500 font-sans">Live platform screening with V8 systems experts</span>
              </div>
              
              <div className="border-l-2 border-white/10 pl-3 text-[#888888]">
                <span className="text-[9px] block uppercase tracking-wider">WEDNESDAY 19:15 UTC</span>
                <span className="font-bold text-zinc-400 block">Volatility Squeeze Macro Panel</span>
                <span className="text-[10px] text-zinc-650 font-sans">Educational theory detailing Vanna/Charm overlays</span>
              </div>
            </div>
          </div>

        </div>

        {/* Content Dynamic Area */}
        <div className="col-span-1 lg:col-span-3 bg-black/40 border border-white/5 rounded-2xl p-6 shadow-xl relative min-h-[350px]">
          
          {/* Channel 1: Research Articles */}
          {activeChannel === 'research' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <h3 className="text-sm font-bold text-[#E5E5E5] font-mono uppercase tracking-widest flex items-center gap-1.5">
                  <FileText className="w-4.5 h-4.5 text-[#d4d4d8]" />
                  Active Market Research & Flow Reports
                </h3>
                <span className="text-[9px] text-zinc-500 font-mono">PUBLISHED BY SLAYER LABS QUANT DESK</span>
              </div>

              <div className="space-y-4">
                {researchArticles.map((article, idx) => (
                  <div key={idx} className="bg-black/30 hover:bg-black/80 border border-white/5 hover:border-black p-5 rounded-2xl transition-all flex flex-col justify-between shadow-md text-left">
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[9.5px] font-bold text-[#d4d4d8] bg-[#d4d4d8]/10 px-2 py-0.5 border border-[#d4d4d8]/20 font-mono rounded text-center">
                          {article.tag}
                        </span>
                        <div className="flex items-center gap-3 text-[10.5px] text-zinc-500 font-mono">
                          <span>{article.date}</span>
                          <span className="hidden sm:inline">•</span>
                          <span className="hidden sm:inline">{article.readTime}</span>
                        </div>
                      </div>

                      <h4 className="text-sm sm:text-base font-bold text-zinc-100 hover:text-[#d4d4d8] transition-colors font-mono tracking-tight leading-tight cursor-pointer flex items-center gap-1.5">
                        {article.title}
                        <ArrowUpRight className="w-3.5 h-3.5 shrink-0 opacity-70" />
                      </h4>
                      <p className="text-zinc-400 font-sans text-xs mt-2.5 ml-0.5 leading-relaxed">
                        {article.summary}
                      </p>
                    </div>

                    <div className="mt-4 pt-3.5 border-t border-white/5 flex items-center justify-between text-[10.5px] font-mono select-none">
                      <span className="text-zinc-550">Author: Senior Portfolio Strategist</span>
                      <button className="text-[#d4d4d8] hover:underline flex items-center gap-1 bg-black/40 px-2.5 py-1 border border-white/5 rounded-lg cursor-pointer">
                        <span>EXPAND ENTIRE REPORT</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Channel 2: Educational Content */}
          {activeChannel === 'education' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <h3 className="text-sm font-bold text-[#E5E5E5] font-mono uppercase tracking-widest flex items-center gap-1.5">
                  <GraduationCap className="w-4.5 h-4.5 text-[#d4d4d8]" />
                  Options Education & Risk Management Academy
                </h3>
                <span className="text-[9px] text-zinc-500 font-mono">3 / 5 MODULES COMPLETED</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                {educationModules.map((module, idx) => {
                  const IconComp = module.icon;
                  return (
                    <div key={idx} className="bg-black/30 border border-white/5 p-5 rounded-2xl flex flex-col justify-between shadow-md">
                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-[9px] text-zinc-500 font-mono leading-none tracking-wider uppercase block">{module.level}</span>
                          <span className={`text-[9.5px] font-bold font-mono px-2 py-0.5 border rounded ${
                            module.progress.startsWith('100') 
                              ? 'bg-[#d4d4d8]/10 text-[#d4d4d8] border-[#d4d4d8]/20' 
                              : module.progress.startsWith('NOT')
                              ? 'bg-black/40 text-zinc-500 border-transparent'
                              : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                          }`}>
                            {module.progress}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mb-2">
                          <IconComp className={`w-5 h-5 shrink-0 ${module.color}`} />
                          <h4 className="text-[12.5px] font-extrabold text-zinc-200 mt-0.5 tracking-tight font-mono leading-none">{module.title}</h4>
                        </div>
                        <p className="text-zinc-450 font-sans text-xs mt-2.5 leading-relaxed">
                          {module.desc}
                        </p>
                      </div>

                      <div className="mt-5 pt-3.5 border-t border-white/5">
                        <button className="w-full text-center py-2 bg-black/40 hover:bg-black/80 text-zinc-200 hover:text-[#E5E5E5] font-mono text-[10.5px] uppercase border border-white/5 rounded-lg cursor-pointer transition-colors shadow">
                          {module.progress.startsWith('100') ? 'REVIEW MODULE CONTENT' : 'LAUNCH WORKBOOK'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 p-5 bg-black/50 border border-white/5 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 text-left shadow-inner">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#d4d4d8]/10 text-[#d4d4d8] rounded-full shrink-0">
                    <Tv className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#E5E5E5] block font-mono">🎓 SLAYER WEEKLY CLASSROOM INTERACTIVE REPLAY</span>
                    <span className="text-[11px] text-zinc-400 font-sans">Full visual breakdown of expected value systems & calibration buckets.</span>
                  </div>
                </div>
                <button className="w-full sm:w-auto px-4 py-2 bg-[#d4d4d8] hover:bg-black/40 text-black font-extrabold text-xs font-mono uppercase rounded-lg transition-colors shadow cursor-pointer whitespace-nowrap shrink-0">
                  PLAY ARCHIVE (1h 14m)
                </button>
              </div>
            </div>
          )}

          {/* Channel 3: Community Discussions Feed */}
          {activeChannel === 'community' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <h3 className="text-sm font-bold text-[#E5E5E5] font-mono uppercase tracking-widest flex items-center gap-1.5">
                  <MessagesSquare className="w-4.5 h-4.5 text-[#d4d4d8]" />
                  Intra-Session Member Trade Journals & Flow Discussions
                </h3>
                <span className="text-[9px] text-zinc-500 font-mono">148 MEMBERS LIVE ONLINE</span>
              </div>

              {/* Feed List */}
              <div className="space-y-3.5 text-left">
                {communityDiscussions.map((d) => (
                  <div key={d.id} className="bg-black/30 border border-white/5 p-4 rounded-xl flex items-start gap-3.5 font-sans shadow-md">
                    <div className="w-8 h-8 rounded-full bg-black/40 border border-white/5 flex items-center justify-center text-sm shrink-0 select-none">
                      {d.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between font-mono text-[11px] mb-1">
                        <span className="font-bold text-[#d4d4d8]">{d.user}</span>
                        <span className="text-[#888888] tracking-tighter italic font-sans">{d.time}</span>
                      </div>
                      <p className="text-[#4ADE80] text-xs leading-normal">
                        {d.msg}
                      </p>
                      <div className="flex items-center gap-3.5 font-mono text-[10.5px] text-zinc-500 mt-2 hover:text-zinc-400">
                        <button className="hover:underline flex items-center gap-1 cursor-pointer">
                          <span>❤️ Agree (14)</span>
                        </button>
                        <span>•</span>
                        <button className="hover:underline flex items-center gap-1 cursor-pointer">
                          <span>💬 Reply</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Chat Input placeholder bar */}
              <div className="mt-3 p-2 bg-black/40 border border-[#2D2D30] rounded-xl flex items-center justify-between gap-3 font-mono">
                <input 
                  type="text" 
                  placeholder="Share journals commentary, critical pivot breakouts, or platform trades..."
                  className="bg-transparent border-0 text-xs text-zinc-350 placeholder-zinc-650 focus:outline-none flex-1 px-2.5 py-1.5"
                  readOnly
                />
                <button 
                  onClick={() => alert('Slayer Labs journals require system authentication verified options logs.')}
                  className="px-4 py-2 bg-black/50 text-zinc-400 hover:text-[#E5E5E5] border border-white/5 text-[10px] font-bold uppercase rounded-lg cursor-pointer whitespace-nowrap mr-1 hover:bg-black"
                >
                  SEND ENTRY
                </button>
              </div>
            </div>
          )}

          {/* Channel 4: Product Support & Feedback Box */}
          {activeChannel === 'support' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <h3 className="text-sm font-bold text-[#E5E5E5] font-mono uppercase tracking-widest flex items-center gap-1.5">
                  <HelpCircle className="w-4.5 h-4.5 text-[#d4d4d8]" />
                  Ecosystem Support & Dynamic Platform Proposals
                </h3>
                <span className="text-[9px] text-zinc-500 font-mono">SLAYER ECOSYSTEM ROADMAP</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch text-left">
                
                {/* Submit suggestion */}
                <div className="bg-black/30 border border-white/5 p-5 rounded-2xl flex flex-col justify-between font-mono shadow-md">
                  <div>
                    <h4 className="text-xs font-black text-[#d4d4d8] uppercase tracking-widest flex items-center gap-1 mb-2.5">
                      <MessageSquarePlus className="w-4 h-4 text-[#d4d4d8]" />
                      Propose Platform Improvements
                    </h4>
                    <p className="text-[11px] text-zinc-400 font-sans leading-relaxed mb-4">
                      Submit and review feature pipeline requests representing SkyVision decisions index modules, or Pinpoint AI positioning telemetry models.
                    </p>

                    {requestSubmitted ? (
                      <div className="bg-black/40 text-[#d4d4d8] border border-[#d4d4d8]/20 p-4 rounded-xl flex items-start gap-2.5 mb-4 font-sans text-xs">
                        <CheckCircle className="w-4.5 h-4.5 shrink-0 text-[#d4d4d8]" />
                        <div>
                          <span className="font-bold font-mono block">Proposal Lodged Successfully</span>
                          We have recorded your suggestions for quantitative options triggers review.
                        </div>
                      </div>
                    ) : (
                      <form onSubmit={handleAddRequest} className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[9.5px] text-[#888888] uppercase font-bold block">PROPOSAL TITLE</label>
                          <input 
                            type="text" 
                            value={newRequestTitle}
                            onChange={(e) => setNewRequestTitle(e.target.value)}
                            placeholder="e.g. VEX option IV compression indicators..."
                            className="w-full bg-black/40 border border-white/5 p-2.5 text-xs rounded-lg text-zinc-200 focus:outline-[1px] focus:outline-[#d4d4d8]/50"
                            required
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9.5px] text-[#888888] uppercase font-bold block">CATEGORY</label>
                          <select 
                            value={newRequestType}
                            onChange={(e) => setNewRequestType(e.target.value)}
                            className="w-full bg-black/40 border border-white/5 p-2 text-xs rounded-lg text-[#4ADE80] font-mono focus:outline-none"
                          >
                            <option value="Feature Request">Platform Feature Request</option>
                            <option value="Technical Bug">Technical Bug Report</option>
                            <option value="Research Suggestion">Quantitative Research Suggestion</option>
                          </select>
                        </div>

                        <button 
                          type="submit"
                          className="w-full py-2.5 bg-[#d4d4d8] hover:bg-black/40 text-black font-extrabold uppercase text-[10px] rounded-lg transition-all shadow cursor-pointer"
                        >
                          SUBMIT COMMITTED PROPOSAL
                        </button>
                      </form>
                    )}
                  </div>
                </div>

                {/* Grid list of registered user requests */}
                <div className="bg-black/30 border border-white/5 p-5 rounded-box flex flex-col font-mono text-xs rounded-2xl shadow-md">
                  <h4 className="text-xs font-black text-[#4ADE80] uppercase tracking-widest flex items-center gap-1 mb-3 pb-2 border-b border-white/5">
                    <Bookmark className="w-4 h-4 text-[#d4d4d8]" />
                    Latest Member Proposals Map
                  </h4>

                  <div className="space-y-2.5 overflow-y-auto max-h-[220px] flex-1">
                    {userRequests.map((req) => (
                      <div key={req.id} className="p-3 bg-black/30 border border-white/5 rounded-xl flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-[9px] mb-1">
                            <span className="text-[#d4d4d8] font-bold uppercase tracking-tighter">{req.type}</span>
                            <span className="text-zinc-650">•</span>
                            <span className={`px-1.5 py-px rounded uppercase tracking-tighter text-[8px] ${
                              req.status === 'Completed' ? 'bg-[#d4d4d8]/10 text-[#d4d4d8] border border-[#d4d4d8]/20' :
                              req.status === 'In Review' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                              req.status === 'Scheduled' ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20' :
                              'bg-white/5 text-zinc-400 border-transparent'
                            }`}>
                              {req.status}
                            </span>
                          </div>
                          <span className="font-bold text-zinc-200 block truncate leading-tight">{req.title}</span>
                        </div>

                        <button
                          onClick={() => handleVote(req.id)}
                          className="bg-black/30 hover:bg-[#d4d4d8]/10 p-1.5 px-2.5 border border-white/5 rounded-lg font-bold text-center flex flex-col text-[10px] shrink-0 hover:text-[#d4d4d8] hover:border-[#d4d4d8]/50 transition-all cursor-pointer"
                        >
                          <span></span>
                          <span>{req.votes}</span>
                        </button>
                      </div>
                    ))}
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
