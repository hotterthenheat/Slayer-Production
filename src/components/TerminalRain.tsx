import React, { useState, useEffect } from 'react';

const CORE_WORDS_MAP: Record<string, string[]> = {
  home: [
    "def terminal(chain, strat):","    setups = skysvision.scan(chain, strat)","    flow = pinpoint.dealers(chain)",
    "    return setups.head(5), flow","top, flow = terminal(spx_chain, my_strat)","top[0]   # SPX 6050C 0DTE score 92",
    "flow.gex # -1.2bn  flip 5980","skysvision.scan() -> 5 setups","pinpoint.dealers() -> gex -1.2bn","flip 5,980   build 5.2.1",
    "NET GEX -1.2bn   FLIP 5,980","DEX +0.42   VEX 0.78","SPX 6050C 0DTE   92","NDX 21800P 1DTE   87","QQQ 505C WK   81",
    "IWM 232P 0DTE   74","upper = ema + k * atr","if px >= upper: return HOLDING","if px <= lower: return FAILING",
    "return TESTING","gamma: short","> live","slayer:~ $","setups = rank(chain, strat)","score = wilson(w, n)",
    "reprice(S, sigma - 0.012*dPct)","CALL WALL 6100   PUT WALL 5950","P_cal 0.64   EV +0.31R","SLAYER/LIVE  09:41:06 ET",
    "0DTE  filled  6050C  +34%","dealers.hedge -> accel up","ev = sum p(x)*payoff(x)","chain('SPX', 0DTE).rank()"
  ],
  skyvision: [
    "skysvision.scan()", "rank_options.execute()", "0DTE SPX scoring active", "eval(chain) -> EV", "model_infer(options)", "return setup",
    "P_cal 0.64", "EV +0.31R", "score: 92", "setup found", "calculating implied move"
  ],
  pinpoint: [
    "pinpoint.dealers()", "GEX = -1.2bn", "Call Wall: 6100", "Put Wall: 5950", "DEX +0.42", "VEX +0.78", "Dealer Flip: 5980", "hedge constraints active", "gamma state: SHORT"
  ],
  workspace: [
    "terminal.init()", "slayer:~ $ command", "[LIVE] connect()", "await market_data", "render_dashboard()", "load_positions()", "user.auth.verify()", "workspace_bridge active"
  ]
};

function rnd(a: string[]) { return a[Math.floor(Math.random() * a.length)]; }

function tint(s: string) {
  const l = s.toLowerCase();
  if (l.includes('skysvision') || l.includes('setup') || l.includes('scan') || l.includes('rank') || l.includes('score')) return 'text-[#6A93B5] opacity-55';
  if (l.includes('pinpoint') || l.includes('gex') || l.includes('dex') || l.includes('vex') || l.includes('flip') || l.includes('dealer') || l.includes('wall')) return 'text-[#C79350] opacity-55';
  return (Math.random() > 0.8) ? 'text-[#6B7177]' : 'text-[#454E58]';
}

export function TerminalRain({ activeTab = 'home' }: { activeTab?: string }) {
  const [cols, setCols] = useState<any[]>([]);

  useEffect(() => {
    const w = window.innerWidth;
    const numCols = Math.max(4, Math.min(10, Math.floor(w / 170)));
    const newCols = [];
    const POOL = CORE_WORDS_MAP[activeTab] || CORE_WORDS_MAP['home'];
    
    for (let c = 0; c < numCols; c++) {
      const left = (c * (100 / numCols) + (Math.random() * 4 - 2)) + '%';
      const dur = 36 + Math.random() * 42;
      const isUp = Math.random() > 0.5;
      const delay = (-Math.random() * dur);
      const opacity = (0.35 + Math.random() * 0.15).toFixed(2);
      const lines = [];
      for (let i = 0; i < 22; i++) {
        lines.push(rnd(POOL));
      }
      const two = [...lines, ...lines];
      const parsedLines = two.map((l, idx) => ({ text: l, className: tint(l), id: idx }));
      
      newCols.push({ left, dur, isUp, delay, opacity, lines: parsedLines, id: c });
    }
    setCols(newCols);
  }, [activeTab]);

  return (
    <div className="fixed inset-0 z-[1] overflow-hidden pointer-events-none select-none">
      {cols.map(c => (
        <div 
          key={c.id} 
          className="absolute top-0 flex flex-col gap-[17px] whitespace-nowrap font-mono text-[12px] leading-[1.85]"
          style={{
            left: c.left,
            opacity: c.opacity,
            animation: `${c.isUp ? 'scrollUp' : 'scrollDown'} ${c.dur}s linear infinite`,
            animationDelay: `${c.delay}s`,
            willChange: 'transform'
          }}
        >
          {c.lines.map((l: any, idx: number) => (
            <span key={idx} className={l.className}>{l.text}</span>
          ))}
        </div>
      ))}
      <div className="fixed inset-0 pointer-events-none transition-all duration-700" style={{ boxShadow: 'inset 0 0 200px 50px rgba(0,0,0,.95)', background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,.85) 100%)' }}></div>
    </div>
  );
}
