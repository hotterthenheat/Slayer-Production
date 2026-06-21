import { useState, useEffect, useMemo, useRef } from 'react';
import { useContractStore } from '../lib/store';
import { formatTime as globalFormatTime } from '../lib/timeUtils';
import { ASSET_LIST } from '../data';
import { 
  DealerFlowPhysics, 
  HedgingCascadeSimulator, 
  DealerFlowStateEngines,
  OptionGreeks 
} from '../lib/dealerflowEngine';
import { 
  Compass, 
  Layers, 
  Zap, 
  Sliders, 
  Play, 
  Pause,
  Flame, 
  AlertTriangle, 
  Clock, 
  Globe, 
  Cpu, 
  Gauge, 
  Plus, 
  Trash2,
  Table,
  CheckCircle2,
  Target,
  Terminal,
  Activity,
  GitBranch
} from 'lucide-react';

interface MockOption {
  strike: number;
  t: number;
  sigma: number;
  type: 'call' | 'put';
  oi: number;
}

interface MockScenario {
  name: string;
  desc: string;
  spotPrice: number;
  timeMin: number;
  eventMode: 'none' | 'event' | 'extreme_event';
  mocSize: number;
  mocSide: 'buy' | 'sell' | 'neutral';
  options: MockOption[];
}

const SCENARIOS: Record<string, MockScenario> = {
  gammaSqueeze: {
    name: 'FOMC Short Gamma Squeeze',
    desc: 'Heavy call OI forces dealers to buy aggressively on every uptick, amplifying momentum on FOMC afternoons.',
    spotPrice: 5000,
    timeMin: 880, // 2:40 PM EST
    eventMode: 'none',
    mocSize: 180000000,
    mocSide: 'buy',
    options: [
      { strike: 4950, t: 2/365, sigma: 0.15, type: 'put', oi: 80000 },
      { strike: 5000, t: 2/365, sigma: 0.14, type: 'call', oi: 380000 },
      { strike: 5050, t: 2/365, sigma: 0.16, type: 'call', oi: 470000 },
      { strike: 5100, t: 2/365, sigma: 0.18, type: 'call', oi: 340000 },
    ]
  },
  liquidCollapse: {
    name: 'Macro Panic Collapse',
    desc: 'Heavy put OI, thin liquidity, and a large sell MOC imbalance combine in the final hour, driving a rapid sell-off.',
    spotPrice: 4950,
    timeMin: 955, // 3:55 PM EST (Power hour close)
    eventMode: 'extreme_event',
    mocSize: 320000000,
    mocSide: 'sell',
    options: [
      { strike: 4800, t: 3/365, sigma: 0.26, type: 'put', oi: 550000 },
      { strike: 4880, t: 3/365, sigma: 0.22, type: 'put', oi: 480000 },
      { strike: 4950, t: 3/365, sigma: 0.19, type: 'put', oi: 310000 },
      { strike: 5000, t: 3/365, sigma: 0.16, type: 'call', oi: 60000 },
    ]
  },
  pinTrap: {
    name: 'Lunch-Hour Pin Trap Constriction',
    desc: 'Large straddle OI at the same strike pins price in a tight range as dealers hedge both sides, creating a price magnet.',
    spotPrice: 5020,
    timeMin: 740, // 12:20 PM EST (Lunch vacuum)
    eventMode: 'none',
    mocSize: 0,
    mocSide: 'neutral',
    options: [
      { strike: 4980, t: 3/365, sigma: 0.11, type: 'put', oi: 210000 },
      { strike: 5020, t: 3/365, sigma: 0.12, type: 'call', oi: 450000 },
      { strike: 5020, t: 3/365, sigma: 0.12, type: 'put', oi: 450000 },
      { strike: 5060, t: 3/365, sigma: 0.14, type: 'call', oi: 280000 },
    ]
  }
};

export function MicrostructureLabView() {
  const selectedAsset = useContractStore(s => s.selectedAsset);
  const serverState = useContractStore(s => s.serverState);
  // Live spot for the asset in view (falls back to the static default keyless).
  const liveSpot = serverState?.liveSpotPrices?.[selectedAsset.ticker] || selectedAsset.defaultPrice;
  // Real microstructure toxicity from the server edge engine (VPIN / Kyle's λ),
  // so the headline metrics are authentic even though the per-level book is a
  // model (this app has no true L2/L3 feed). Falls back to neutral when absent.
  const edgeVpinPct = typeof serverState?.quant_edge?.vpin?.vpin === 'number'
    ? Math.max(0, Math.min(100, serverState.quant_edge.vpin.vpin * 100))
    : null;

  // 1. Core Simulation State variables
  const [spot, setSpot] = useState<number>(selectedAsset.defaultPrice);
  const [timeMin, setTimeMin] = useState<number>(600); 
  const [eventMode, setEventMode] = useState<'none' | 'event' | 'extreme_event'>('none');
  const [mocSize, setMocSize] = useState<number>(200_000_000);
  const [mocSide, setMocSide] = useState<'buy' | 'sell' | 'neutral'>('neutral');
  
  // Custom manual option adders
  const [options, setOptions] = useState<MockOption[]>([]);
  const [newStrike, setNewStrike] = useState<string>('');
  const [newType, setNewType] = useState<'call' | 'put'>('call');
  const [newOi, setNewOi] = useState<number>(12000);
  const [newVol, setNewVol] = useState<number>(0.18);

  // 2. State engines histories
  const [oiHist, setOiHist] = useState<number[]>([1500000, 2400000, 3100000, 3900000, 4800000]);
  const [flowHist, setFlowHist] = useState<number[]>([12000000, 22000000, 35000000, 46000000, 58000000]);
  const [maxCapacity, setMaxCapacity] = useState<number>(8_000_000);

  // 3. Event and positioning
  const [preEventPos, setPreEventPos] = useState<'bullish' | 'bearish' | 'neutral'>('bullish');
  const [headlineRes, setHeadlineRes] = useState<'bullish' | 'bearish' | 'neutral'>('bearish');

  // Interactive View and AutoPlay States
  const [labTab, setLabTab] = useState<'terminal' | 'gex_chart' | 'campaigns' | 'orderbook'>('terminal');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const playTimerRef = useRef<any>(null);

  // --- Real-time Microstructure Order Book States (Task 3) ---
  const [bookFilter, setBookFilter] = useState<'all' | 'institutional' | 'all_alerts'>('all');
  const [obiPercentage, setObiPercentage] = useState<number>(14.2);
  const [vpinToxicity, setVpinToxicity] = useState<number>(38.5);
  const [absorptionStrength, setAbsorptionStrength] = useState<number>(68.0);
  const [orderBookAsks, setOrderBookAsks] = useState<any[]>([]);
  const [orderBookBids, setOrderBookBids] = useState<any[]>([]);
  const [microstructureFeeds, setMicrostructureFeeds] = useState<any[]>([]);

  // Keep the displayed VPIN toxicity synced to the real server edge value (no
  // interval reset — just mirrors the authentic metric as it streams in).
  useEffect(() => {
    if (edgeVpinPct !== null) setVpinToxicity(edgeVpinPct);
  }, [edgeVpinPct]);

  // Seed and update orderbook data dynamically
  useEffect(() => {
    const spot = liveSpot || 5000;
    const tick = selectedAsset.ticker === 'SPX' || selectedAsset.ticker === 'NDX' ? 0.5 : 0.05;
    
    // Generator for initial lines
    const genAsks = () => Array.from({ length: 8 }).map((_, i) => {
      const dist = (i + 1) * tick;
      const isWall = i === 4;
      const isIceberg = i === 2;
      const size = isWall ? Math.floor(Math.random() * 400 + 500) : isIceberg ? Math.floor(Math.random() * 50 + 40) : Math.floor(Math.random() * 80 + 10);
      return {
        price: spot + dist,
        size,
        type: isWall ? 'WALL' : isIceberg ? 'ICEBERG' : Math.random() > 0.85 ? 'SPOOF' : 'MM',
        cumulative: 0
      };
    });

    const genBids = () => Array.from({ length: 8 }).map((_, i) => {
      const dist = (i + 1) * tick;
      const isWall = i === 5;
      const isIceberg = i === 1;
      const size = isWall ? Math.floor(Math.random() * 350 + 600) : isIceberg ? Math.floor(Math.random() * 60 + 50) : Math.floor(Math.random() * 85 + 15);
      return {
        price: spot - dist,
        size,
        type: isWall ? 'WALL' : isIceberg ? 'ICEBERG' : Math.random() > 0.85 ? 'SPOOF' : 'MM',
        cumulative: 0
      };
    });

    // Populate initial
    let currentAsks = genAsks();
    let currentBids = genBids();
    
    const calculateCumulative = (arr: any[]) => {
      let sum = 0;
      return arr.map(item => {
        sum += item.size;
        return { ...item, cumulative: sum };
      });
    };

    setOrderBookAsks(calculateCumulative(currentAsks));
    setOrderBookBids(calculateCumulative(currentBids));

    setMicrostructureFeeds([
      { id: 'feed-1', time: '14:21:44', side: 'BID', price: (spot - tick * 1).toFixed(2), text: 'ICEBERG POSITION DETECTED: +480 lots sitting at limit', style: 'text-cyan-400' },
      { id: 'feed-2', time: '14:21:40', side: 'ASK', price: (spot + tick * 5).toFixed(2), text: 'SPOOFING SCANNER: +950 lots canceled shortly after placement', style: 'text-amber-500 font-bold' },
      { id: 'feed-3', time: '14:21:32', side: 'BID', price: (spot - tick * 2).toFixed(2), text: 'LIMIT WALL FORMED: Large institutional block supported', style: 'text-[#4ADE80] font-bold' }
    ]);

    // Active fluctuation socket simulation
    const interval = setInterval(() => {
      // Modify sizes slightly
      currentAsks = currentAsks.map((item, idx) => {
        const change = Math.floor(Math.random() * 15 - 7);
        const newSize = Math.max(5, item.size + change);
        return { ...item, size: newSize };
      });

      currentBids = currentBids.map((item, idx) => {
        const change = Math.floor(Math.random() * 15 - 7);
        const newSize = Math.max(5, item.size + change);
        return { ...item, size: newSize };
      });

      // Sometimes random cancellations or spoof bids vanish
      if (Math.random() > 0.70) {
        const randIdx = Math.floor(Math.random() * 8);
        if (Math.random() > 0.50) {
          const spoofPrice = currentBids[randIdx].price.toFixed(2);
          const legacySize = currentBids[randIdx].size;
          currentBids[randIdx].size = Math.floor(Math.random() * 15 + 5);
          currentBids[randIdx].type = 'SPOOF';
          setMicrostructureFeeds(prev => [
            {
              id: `feed-${Date.now()}`,
              time: globalFormatTime(new Date()),
              side: 'BID',
              price: spoofPrice,
              text: `SPOOF ALERT: BID of ${legacySize} contracts rapidly withdrawn. Zero execution occurred.`,
              style: 'text-rose-500 animate-pulse'
            },
            ...prev.slice(0, 25)
          ]);
        } else {
          const spoofPrice = currentAsks[randIdx].price.toFixed(2);
          const legacySize = currentAsks[randIdx].size;
          currentAsks[randIdx].size = Math.floor(Math.random() * 15 + 5);
          currentAsks[randIdx].type = 'SPOOF';
          setMicrostructureFeeds(prev => [
            {
              id: `feed-${Date.now()}`,
              time: globalFormatTime(new Date()),
              side: 'ASK',
              price: spoofPrice,
              text: `SPOOF ALERT: ASK of ${legacySize} contracts pulled prior to trade collision.`,
              style: 'text-rose-500 animate-pulse'
            },
            ...prev.slice(0, 25)
          ]);
        }
      }

      // Check for iceberg absorption executions
      if (Math.random() > 0.8) {
        const randIdx = Math.floor(Math.random() * 8);
        const icebergPrice = currentBids[randIdx].price.toFixed(2);
        currentBids[randIdx].type = 'ICEBERG';
        currentBids[randIdx].size += Math.floor(Math.random() * 200 + 80);
        setMicrostructureFeeds(prev => [
          {
            id: `feed-${Date.now()}`,
            time: globalFormatTime(new Date()),
            side: 'BID',
            price: icebergPrice,
            text: `HIDDEN LIQUIDITY EXECUTION: +150 contracts executed on iceberg limit absorption`,
            style: 'text-cyan-400 font-black'
          },
          ...prev.slice(0, 25)
        ]);
      }

      // Calculate Math-based OBI
      const totalBidsVal = currentBids.reduce((a, b) => a + b.size, 0);
      const totalAsksVal = currentAsks.reduce((a, b) => a + b.size, 0);
      const computedObi = ((totalBidsVal - totalAsksVal) / (totalBidsVal + totalAsksVal)) * 100;
      setObiPercentage(computedObi);

      // Fluctuating VPIN based on volume imbalance severity
      const skewFactor = Math.abs(totalBidsVal - totalAsksVal) / (totalBidsVal + totalAsksVal);
      const newVpin = 20 + skewFactor * 60 + (Math.random() * 10 - 5);
      setVpinToxicity(Math.max(10, Math.min(95, newVpin)));

      // Limit Absorption speed metrics
      const newAbsorption = 40 + Math.random() * 50;
      setAbsorptionStrength(newAbsorption);

      // Commit to component states
      setOrderBookAsks(calculateCumulative(currentAsks));
      setOrderBookBids(calculateCumulative(currentBids));
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedAsset]);

  // Auto-initialize standard list relative to spot
  useEffect(() => {
    const baseS = selectedAsset.defaultPrice;
    const items: MockOption[] = [
      { strike: Math.round(baseS * 0.98), t: 3 / 365, sigma: selectedAsset.volatility, type: 'put', oi: 160000 },
      { strike: Math.round(baseS * 0.99), t: 3 / 365, sigma: selectedAsset.volatility, type: 'put', oi: 240000 },
      { strike: Math.round(baseS), t: 3 / 365, sigma: selectedAsset.volatility, type: 'call', oi: 360000 },
      { strike: Math.round(baseS * 1.01), t: 3 / 365, sigma: selectedAsset.volatility, type: 'call', oi: 290000 },
      { strike: Math.round(baseS * 1.02), t: 3 / 365, sigma: selectedAsset.volatility, type: 'call', oi: 150000 },
    ];
    setOptions(items);
    setSpot(baseS);
    setNewStrike(Math.round(baseS).toString());
  }, [selectedAsset]);

  // Handle Autoplay Clock progression
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(() => {
        setTimeMin(prev => {
          if (prev >= 960) {
            return 570; // cycle back to start
          }
          return prev + 5;
        });
        
        // Add random slight price variation to simulate live trading tick!
        setSpot(prev => {
          const tick = prev * (1 + (Math.random() - 0.49) * 0.0006);
          return Number(tick.toFixed(2));
        });
      }, 800);
    } else {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    }

    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying]);

  // Formatter for clock
  const formatTime = (totalMin: number) => {
    const hrs = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    const dispHrs = hrs > 12 ? hrs - 12 : hrs === 0 ? 12 : hrs;
    return `${dispHrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${ampm} EST`;
  };

  // Preset Scenario loader
  const handleLoadScenario = (key: keyof typeof SCENARIOS) => {
    const s = SCENARIOS[key];
    if (!s) return;
    setSpot(s.spotPrice);
    setTimeMin(s.timeMin);
    setEventMode(s.eventMode);
    setMocSide(s.mocSide);
    setMocSize(s.mocSize);
    setOptions(s.options);
    setNewStrike(Math.round(s.spotPrice).toString());
  };

  const handleAddOption = () => {
    const s = Number(newStrike);
    if (!s || s <= 0) return;
    setOptions(prev => [
      ...prev,
      {
        strike: s,
        t: 3 / 365,
        sigma: Number(newVol),
        type: newType,
        oi: Number(newOi)
      }
    ]);
  };

  const handleRemoveOption = (index: number) => {
    setOptions(prev => prev.filter((_, idx) => idx !== index));
  };

  // Recursive Simulator math engine with detailed step tracing logs
  const detailedSimulation = useMemo(() => {
    const mocData = DealerFlowPhysics.processMocImbalance(mocSize, mocSide, timeMin);
    const liquidity = HedgingCascadeSimulator.getLiquidityCoefficient(timeMin, eventMode);
    
    let currentSpot = spot;
    const path: number[] = [spot];
    const stepLogs: Array<{
      step: number;
      spotPrice: number;
      dealerFlow: number;
      impact: number;
      dominantGreek: string;
      rawNetGamma: number;
    }> = [];
    
    let prevFlow = 0;
    let iteration = 0;
    
    while (iteration < 25) {
      let totalFlow = mocData.active ? mocData.delta_dollars : 0.0;
      let netGamma = 0;
      let netVanna = 0;

      for (const opt of options) {
        const g = DealerFlowPhysics.calculateGreeks(
          currentSpot,
          opt.strike,
          opt.t,
          opt.sigma,
          0.05,
          0.01,
          opt.type
        );
        const dSpot = currentSpot - spot;
        const dTime = 1.0 / (365.0 * 6.5 * 60.0);
        const deltaChange = (g.gamma * dSpot) + (g.charm * dTime);
        const dealerCoeff = opt.type === 'call' ? -1.0 : 1.0;
        
        totalFlow += deltaChange * opt.oi * 100 * dealerCoeff * currentSpot;
        netGamma += g.gamma * opt.oi * 100 * dealerCoeff;
        netVanna += g.vanna * opt.oi * 100 * dealerCoeff;
      }

      // Record logs
      const dominantGreek = Math.abs(netGamma) > Math.abs(netVanna) ? 'GAMMA' : 'VANNA';
      stepLogs.push({
        step: iteration,
        spotPrice: currentSpot,
        dealerFlow: totalFlow,
        impact: 0,
        dominantGreek,
        rawNetGamma: netGamma
      });

      if (iteration > 0 && Math.abs(totalFlow - prevFlow) / (Math.abs(prevFlow) + 1e-5) < 0.05) {
        break;
      }

      const scaledVol = liquidity * 10_000_000;
      const pctImpact = Math.sign(totalFlow) * DealerFlowPhysics.Y * 0.20 * Math.sqrt(Math.abs(totalFlow) / scaledVol);
      
      // update the last log's impact representation
      if (stepLogs[stepLogs.length - 1]) {
        stepLogs[stepLogs.length - 1].impact = pctImpact;
      }

      if (Math.abs(pctImpact) < 0.0002) {
        break;
      }

      currentSpot = currentSpot * (1.0 + pctImpact);
      path.push(Number(currentSpot.toFixed(2)));
      prevFlow = totalFlow;
      iteration++;
    }

    const fragility = Math.min((Math.abs(prevFlow) / (liquidity * 5_000_000)) * 100, 100);

    // Summary calculation metrics
    let netDeltaVal = 0;
    let netGammaVal = 0;
    let netVannaVal = 0;
    let netCharmVal = 0;

    options.forEach(opt => {
      const g = DealerFlowPhysics.calculateGreeks(spot, opt.strike, opt.t, opt.sigma, 0.05, 0.01, opt.type);
      const sign = opt.type === 'call' ? -1.0 : 1.0;
      netDeltaVal += g.delta * opt.oi * 100 * sign;
      netGammaVal += g.gamma * opt.oi * 100 * sign;
      netVannaVal += g.vanna * opt.oi * 100 * sign;
      netCharmVal += g.charm * opt.oi * 100 * sign;
    });

    return {
      path,
      flow: prevFlow,
      fragility: Number(fragility.toFixed(2)),
      mocData,
      liquidityCoeff: liquidity,
      netDelta: netDeltaVal,
      netGamma: netGammaVal,
      netVanna: netVannaVal,
      netCharm: netCharmVal,
      logs: stepLogs
    };
  }, [spot, options, timeMin, eventMode, mocSize, mocSide]);

  // Generate GEX Exposure Sensitivity Curve across price ranges
  const gexSensitivityArray = useMemo(() => {
    const rangeSteps = 15;
    const halfRange = Math.floor(rangeSteps / 2);
    const data: Array<{ price: number; gex: number; pct: number }> = [];

    for (let i = -halfRange; i <= halfRange; i++) {
      // price points from -3% to +3% of spot
      const pctShift = i * 0.004; // 0.4% step increment
      const testPrice = spot * (1 + pctShift);
      
      let testGex = 0;
      options.forEach(opt => {
        const g = DealerFlowPhysics.calculateGreeks(testPrice, opt.strike, opt.t, opt.sigma, 0.05, 0.01, opt.type);
        const sign = opt.type === 'call' ? -1.0 : 1.0;
        // Standard Dollar GEX metric
        const cGex = g.gamma * opt.oi * 100 * testPrice * testPrice * 0.01 * sign;
        testGex += cGex;
      });

      data.push({
        price: Number(testPrice.toFixed(1)),
        gex: Number(testGex.toFixed(0)),
        pct: Number((pctShift * 100).toFixed(1))
      });
    }

    // Locate Gamma Flip Level
    let flipLevelSpot = spot;
    for (let j = 0; j < data.length - 1; j++) {
      const currentG = data[j].gex;
      const nextG = data[j + 1].gex;
      if ((currentG < 0 && nextG > 0) || (currentG > 0 && nextG < 0)) {
        // Linear interpolation to approximate crossing point
        const ratio = Math.abs(currentG) / (Math.abs(currentG) + Math.abs(nextG));
        flipLevelSpot = data[j].price + ratio * (data[j + 1].price - data[j].price);
        break;
      }
    }

    return {
      curve: data,
      flipLevel: flipLevelSpot
    };
  }, [spot, options]);

  // Campaign predictor solver
  const activeCampaignState = useMemo(() => {
    return DealerFlowStateEngines.evaluateCampaignState(oiHist, flowHist, maxCapacity);
  }, [oiHist, flowHist, maxCapacity]);

  // Event Divergence results
  const eventDivergenceState = useMemo(() => {
    return DealerFlowStateEngines.evaluateEventDivergence(preEventPos, headlineRes);
  }, [preEventPos, headlineRes]);

  // SVG coordinate path creators
  const svgW = 600;
  const svgH = 220;
  const pathwayPoints = useMemo(() => {
    const path = detailedSimulation.path;
    if (path.length === 0) return '';
    const minS = Math.min(...path) * 0.9995;
    const maxS = Math.max(...path) * 1.0005;
    const diff = maxS - minS || 1.0;
    
    return path.map((pt, index) => {
      const x = (index / 24) * (svgW - 40) + 20;
      const y = svgH - ((pt - minS) / diff) * (svgH - 60) - 30;
      return `${x},${y}`;
    }).join(' ');
  }, [detailedSimulation.path]);

  // SVISurface / Pine simulated overlays
  const pineState = useMemo(() => {
    const isTrapActive = Math.abs(detailedSimulation.netCharm) > 1500000 && mocSide === 'neutral' && detailedSimulation.fragility < 35;
    const isAirPocket = detailedSimulation.liquidityCoeff < 0.5 || eventMode === 'extreme_event';
    const pathsDirection = detailedSimulation.flow > 0 ? 'DEALERS BUYING — PRICE RISING' : (detailedSimulation.flow < 0 ? 'DEALERS SELLING — PRICE FALLING' : 'MEAN REVERSION');
    
    const trapUpper = spot * 1.002;
    const trapLower = spot * 0.998;

    return {
      isTrapActive,
      isAirPocket,
      pathsDirection,
      trapUpper,
      trapLower
    };
  }, [detailedSimulation, spot, eventMode, mocSide]);

  const updateHistory = (idx: number, type: 'oi' | 'flow', val: number) => {
    if (type === 'oi') {
      const updated = [...oiHist];
      updated[idx] = val;
      setOiHist(updated);
    } else {
      const updated = [...flowHist];
      updated[idx] = val;
      setFlowHist(updated);
    }
  };

  return (
    <div className="w-full flex flex-col space-y-6" id="dealerflow-microlab-view">
      
      {/* 25-STEP RECURSIVE HEDGING CASCADE CARD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Plotting Column */}
        <div className="lg:col-span-2 bg-black/90 p-5 rounded-lg border border-black shadow-2xl relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black/40 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <div className="font-sans font-black text-xs tracking-widest text-zinc-100 uppercase">
                Dealer Hedging Chain Reaction (25-Step Simulation)
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 font-mono text-[9px] text-zinc-450 uppercase">
                <Clock className="w-3 h-3 text-[#4ADE80]" />
                Time: {formatTime(timeMin)}
              </span>
              <span className="text-zinc-800">|</span>
              <span className={`px-2 py-0.5 rounded-sm font-mono text-[8.5px] font-black border ${
                detailedSimulation.fragility > 70 
                  ? 'bg-rose-950/20 border-rose-900 text-rose-455 animate-pulse' 
                  : 'bg-black border-black text-[#4ADE80]'
              }`}>
                FRAGILITY: {detailedSimulation.fragility}%
              </span>
            </div>
          </div>

          {/* SVG Canvas for cascade vectors path mapping */}
          <div className="w-full bg-black border border-black rounded-md p-2.5 relative flex items-center justify-center min-h-[220px]">
            {/* Gridlines */}
            <div className="absolute inset-0 grid grid-cols-6 grid-rows-4 pointer-events-none opacity-[0.02]">
              {[...Array(24)].map((_, i) => (
                <div key={i} className="border border-white" />
              ))}
            </div>

            {/* TradingView Pine Script Indicator Annotations overlaid on chart canvas */}
            {pineState.isTrapActive && (
              <div className="absolute top-4 left-6 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1 text-left select-none animate-fadeIn z-10">
                <div className="flex items-center gap-1 font-mono text-[8px] text-amber-400 font-extrabold uppercase">
                  <Flame className="w-2.5 h-2.5" /> PRICE PIN ACTIVE
                </div>
                <div className="text-[7.5px] text-zinc-500 font-mono mt-0.5 uppercase">
                  Pinned range: ${pineState.trapLower.toFixed(1)} to ${pineState.trapUpper.toFixed(1)}
                </div>
              </div>
            )}

            {pineState.isAirPocket && (
              <div className="absolute bottom-4 right-6 bg-[#F87171]/10 border border-rose-500/20 rounded px-2 py-1 text-left select-none animate-pulse z-10">
                <div className="flex items-center gap-1 font-mono text-[8px] text-[#F87171] font-extrabold uppercase">
                  <AlertTriangle className="w-2.5 h-2.5" /> LIQUIDITY GAP (FAST-MOVE ZONE)
                </div>
                <div className="text-[7.5px] text-zinc-550 font-mono mt-0.5 uppercase">
                  Thin options OI — price can move quickly through this area
                </div>
              </div>
            )}

            {/* Custom dynamic visualizer for mathematical path */}
            {detailedSimulation.path.length > 0 ? (
              <svg width="100%" height={svgH} className="overflow-visible">
                {/* SVG Line path drawing */}
                <polyline
                  fill="none"
                  stroke={detailedSimulation.flow >= 0 ? '#4ADE80' : '#f43f5e'}
                  strokeWidth="2.5"
                  points={pathwayPoints}
                  strokeDasharray="1000"
                  strokeDashoffset="0"
                  className="transition-all duration-700 ease-in-out"
                />
                
                {/* Node endpoints highlighting recursive hedge updates */}
                {detailedSimulation.path.map((val, idx) => {
                  const minS = Math.min(...detailedSimulation.path) * 0.9995;
                  const maxS = Math.max(...detailedSimulation.path) * 1.0005;
                  const diff = maxS - minS || 1.0;
                  const cx = (idx / 24) * (svgW - 40) + 20;
                  const cy = svgH - ((val - minS) / diff) * (svgH - 60) - 30;

                  // Render only every 4th step or terminal to prevent clutter
                  if (idx % 4 !== 0 && idx !== 24) return null;

                  return (
                    <g key={idx}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r="3.5"
                        className={`${detailedSimulation.flow >= 0 ? 'fill-[#4ADE80]' : 'fill-rose-400'} stroke-[#030304] stroke-2`}
                      />
                      <text
                        x={cx}
                        y={idx % 8 === 0 ? cy - 8 : cy + 12}
                        className="fill-zinc-400 font-mono text-[7px] font-bold"
                        textAnchor="middle"
                      >
                        ${val.toFixed(1)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            ) : (
              <span className="text-zinc-650 text-[10px] font-mono">Add options above to run the simulation</span>
            )}
            
            <div className="absolute right-4 bottom-4 font-mono text-[7.5px] text-zinc-550 flex flex-col text-right">
              <span>STEP OFFSET CONSTANT Y: {DealerFlowPhysics.Y.toFixed(4)}</span>
              <span>PATH: {pineState.pathsDirection}</span>
            </div>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 w-full">
            <div className="bg-black border border-black/60 rounded p-2.5 text-left">
              <span className="text-[7.5px] text-zinc-550 font-extrabold uppercase tracking-widest block">Net Delta Exposure</span>
              <span className={`text-xs font-black font-mono block mt-1 ${detailedSimulation.netDelta >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                {detailedSimulation.netDelta.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <span className="text-[6.5px] text-[#38bdf8] block tracking-wider uppercase font-mono mt-0.5">DEALER DELTA HEDGE</span>
            </div>

            <div className="bg-black border border-black/60 rounded p-2.5 text-left">
              <span className="text-[7.5px] text-zinc-550 font-extrabold uppercase tracking-widest block">Net Gamma (dealer hedging bias)</span>
              <span className={`text-xs font-black font-mono block mt-1 ${detailedSimulation.netGamma >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                {detailedSimulation.netGamma.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>
              <span className="text-[6.5px] text-[#38bdf8] block tracking-wider uppercase font-mono mt-0.5">+ STABLE / - VOLATILE</span>
            </div>

            <div className="bg-black border border-black/60 rounded p-2.5 text-left">
              <span className="text-[7.5px] text-zinc-550 font-extrabold uppercase tracking-widest block">Vanna (IV-driven hedge flow)</span>
              <span className={`text-xs font-black font-mono block mt-1 ${detailedSimulation.netVanna >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                {detailedSimulation.netVanna.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>
              <span className="text-[6.5px] text-[#38bdf8] block tracking-wider uppercase font-mono mt-0.5">SENSITIVITY TO IV SHIFTS</span>
            </div>

            <div className="bg-black border border-black/60 rounded p-2.5 text-left">
              <span className="text-[7.5px] text-zinc-550 font-extrabold uppercase tracking-widest block">Final Dealer Flow ($)</span>
              <span className={`text-xs font-black font-mono block mt-1 ${detailedSimulation.flow >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                ${(detailedSimulation.flow / 1_000_000).toFixed(2)}M
              </span>
              <span className="text-[6.5px] text-[#38bdf8] block tracking-wider uppercase font-mono mt-0.5">DRIVES MOVE PERSISTENCE</span>
            </div>
          </div>
          
        </div>

        {/* Sliders Calibration Panel */}
        <div className="bg-black/90 p-5 rounded-lg border border-black shadow-2xl relative overflow-hidden text-left flex flex-col justify-between">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
          
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-black/40 pb-3 mb-1">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#4ADE80]" />
                <div className="font-sans font-black text-xs tracking-widest text-zinc-100 uppercase">
                  Simulation Controls
                </div>
              </div>

              {/* Dynamic Auto Play loop indicator */}
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                className={`p-1 rounded bg-black border ${
                  isPlaying ? 'border-black text-[#4ADE80]' : 'border-black text-zinc-500 hover:text-[#4ADE80]'
                } transition-all cursor-pointer`}
                title={isPlaying ? "Pause Real-Time Simulation Feed" : "Start Live Autoplay Ticks"}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5 shrink-0 animate-pulse" /> : <Play className="w-3.5 h-3.5 shrink-0" />}
              </button>
            </div>

            {/* Slider 1: Spot Price */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[8.5px] font-mono">
                <span className="text-zinc-450 font-extrabold uppercase">Spot Price</span>
                <span className="text-[#E5E5E5] font-black">${spot.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={selectedAsset.defaultPrice * 0.9}
                max={selectedAsset.defaultPrice * 1.1}
                step={selectedAsset.decimals === 2 ? 0.5 : 0.05}
                value={spot}
                onChange={(e) => setSpot(Number(e.target.value))}
                className="w-full accent-cyan-455"
              />
            </div>

            {/* Slider 2: Market Session Minutes */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[8.5px] font-mono">
                <span className="text-zinc-450 font-extrabold uppercase">Time of Day</span>
                <span className="text-[#E5E5E5] font-black">{timeMin} mins</span>
              </div>
              <input
                type="range"
                min="570"
                max="960"
                step="5"
                value={timeMin}
                onChange={(e) => setTimeMin(Number(e.target.value))}
                className="w-full accent-cyan-455"
              />
              <div className="flex justify-between items-center text-[7px] text-zinc-550 font-mono mt-0.5">
                <span>09:30 AM (OPEN)</span>
                <span>12:45 PM (LUNCH)</span>
                <span>04:00 PM (CLOSE)</span>
              </div>
            </div>

            {/* Selector 3: Event Slasher Volatility Impact */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[8.5px] text-zinc-400 font-extrabold uppercase block tracking-wider">Volatility Scenario</span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { value: 'none', label: 'NORMAL' },
                  { value: 'event', label: 'MACRO NEWS' },
                  { value: 'extreme_event', label: 'MARKET SHOCK' }
                ].map(mode => (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => setEventMode(mode.value as any)}
                    className={`py-1.5 text-[8px] font-black uppercase tracking-wider font-mono rounded cursor-pointer border transition-all ${
                      eventMode === mode.value 
                        ? 'bg-black/40 text-[#4ADE80] border-[#4ADE80]/40 shadow-[0_0_8px_rgba(6,182,212,0.06)]' 
                        : 'bg-black border-black text-zinc-600 hover:text-zinc-400'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <span className="text-[7.5px] leading-normal text-zinc-500 block">
                Liquidity scaling: <strong className="text-zinc-400">{(detailedSimulation.liquidityCoeff * 100).toFixed(0)}%</strong> of baseline.
              </span>
            </div>

            {/* Selector 4: MOC Imbalance parameters */}
            <div className="grid grid-cols-2 gap-3 border-t border-black/60 pt-3">
              <div className="space-y-1 text-left">
                <span className="text-[8.5px] text-zinc-440 font-bold uppercase block tracking-wider">MOC Side</span>
                <select
                  value={mocSide}
                  onChange={(e) => setMocSide(e.target.value as any)}
                  className="w-full mirror-panel py-1 px-2 text-[9px] font-mono text-[#4ADE80] rounded focus:border-[#4ADE80]/40 select-none outline-none cursor-pointer"
                >
                  <option value="neutral">NEUTRAL</option>
                  <option value="buy">BUY IMBALANCE</option>
                  <option value="sell">SELL IMBALANCE</option>
                </select>
              </div>

              <div className="space-y-1 text-left">
                <span className="text-[8.5px] text-zinc-440 font-bold uppercase block tracking-wider">MOC Size ($)</span>
                <input
                  type="number"
                  step="50000000"
                  min="0"
                  value={mocSize}
                  onChange={(e) => setMocSize(Math.max(0, Number(e.target.value)))}
                  className="w-full mirror-panel py-1 px-2 text-[9px] font-mono text-[#4ADE80] rounded focus:border-[#4ADE80]/40 select-none outline-none"
                />
              </div>
            </div>

            {detailedSimulation.mocData.active ? (
              <div className="bg-black/30 border border-amber-900/40 p-2 rounded flex items-center gap-2 mt-2">
                <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="text-[8px] font-mono leading-normal text-amber-400/90 uppercase">
                  MOC imbalance active (final 10 min). Flow injection: <strong className="text-[#E5E5E5]">${(detailedSimulation.mocData.delta_dollars / 1_000_000).toFixed(0)}M</strong> (multiplier: {detailedSimulation.mocData.multiplier.toFixed(2)}x)
                </span>
              </div>
            ) : (
              <div className="bg-black border border-black/60 p-2 rounded text-zinc-500 text-[8px] italic text-center">
                MOC inactive (only applies 15:50-16:00 EST when size exceeds ${DealerFlowPhysics.MOC_IMBALANCE_THRESHOLD / 1_000_000}M).
              </div>
            )}
          </div>

          <div className="border-t border-black/60 pt-4 mt-4 flex items-center justify-between text-[8px] font-mono text-zinc-500">
            <span>SIMULATION MODEL ACTIVE</span>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-black/40" />
              <span>CHECKS PASSED</span>
            </div>
          </div>
        </div>

      </div>

      {/* DETAILED INTERACTIVE TABS VIEW (CONSOLE TRACES, GEX SENSITIVITY OR CAMPAIGN SOLVERS) */}
      <div className="bg-black/90 rounded-lg border border-black shadow-2xl relative overflow-hidden text-left flex flex-col p-5">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
        
        {/* Tab Selector Headers */}
        <div className="flex items-center justify-between border-b border-black pb-3 mb-5">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#4ADE80]" />
            <div className="font-sans font-black text-xs tracking-widest text-[#FFFFFF] uppercase">
              Order Flow and Dealer Positioning Analysis
            </div>
          </div>

          <div className="flex gap-2">
            {[
              { id: 'terminal', label: 'Scenarios and Sim Log', icon: Terminal },
              { id: 'orderbook', label: 'Order Book and Flow', icon: Layers },
              { id: 'gex_chart', label: 'Dealer Support (GEX) Curve', icon: GitBranch },
              { id: 'campaigns', label: 'Positioning and Events', icon: Cpu },
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setLabTab(tab.id as any)}
                  className={`flex items-center gap-1 px-3 py-1.5 text-[8.5px] font-bold font-mono uppercase tracking-wider rounded border transition-all cursor-pointer ${
                    labTab === tab.id 
                      ? 'bg-black/40 border-[#4ADE80]/30 text-[#E5E5E5] shadow-[0_0_8px_rgba(6,182,212,0.08)]' 
                      : 'bg-black border-black text-zinc-500 hover:text-[#4ADE80]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0 text-[#4ADE80]" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* TAB 1: TACTICAL TERMINAL & PRESET SCENARIO TRIGGER DIRECTIVES */}
        {labTab === 'terminal' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
            
            {/* Scenarios Quick Loader Column */}
            <div className="lg:col-span-1 space-y-3 flex flex-col justify-between">
              <div>
                <span className="text-[9px] text-zinc-450 font-black tracking-widest uppercase block mb-1">Prebuilt Playbook Scenarios</span>
                <p className="text-[10px] text-zinc-400 leading-relaxed mb-4">
                  Load a preset scenario to see how different options setups affect price movement.
                </p>

                <div className="space-y-3">
                  {Object.entries(SCENARIOS).map(([key, item]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleLoadScenario(key as any)}
                      className="w-full bg-black border border-black hover:border-[#4ADE80]/40 p-3 rounded text-left transition-all group flex flex-col space-y-1 cursor-pointer select-none"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[9px] font-black text-zinc-100 group-hover:text-[#4ADE80] uppercase tracking-wide">
                          {item.name}
                        </span>
                        <Zap className="w-3 h-3 text-[#4ADE80] opacity-60 group-hover:opacity-100" />
                      </div>
                      <p className="text-[8.5px] text-zinc-500 leading-normal font-sans">
                        {item.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded mirror-panel flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#4ADE80] shrink-0" />
                <span className="text-[8px] font-mono text-zinc-450 tracking-wide uppercase leading-normal">
                  Scenarios use real options math to model how dealer hedging affects price.
                </span>
              </div>
            </div>

            {/* Real Calculation step-by-step scrolling raw terminal */}
            <div className="lg:col-span-2 space-y-2 flex flex-col">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-zinc-450 font-black tracking-widest uppercase block">Step-by-Step Hedge Simulation Log</span>
                <span className="text-[7.5px] text-zinc-550 font-mono">25 STEPS</span>
              </div>

              <div className="bg-black border border-black rounded p-4 h-[240px] overflow-y-auto font-mono text-[9px] text-[#4ADE80] space-y-1.5 scrollbar-thin select-text">
                <div className="text-[#4ADE80] font-extrabold select-none border-b border-black/60 pb-1.5 mb-2 flex items-center justify-between">
                  <span>DEALER HEDGE SIMULATION [BUILD V1.107]</span>
                  <span>UTC TIME: 22:15:40</span>
                </div>
                
                {detailedSimulation.logs.map((log) => {
                  const absoluteChange = Math.abs(log.spotPrice - spot);
                  const dirText = log.dealerFlow >= 0 ? 'BUY BACK' : 'LIQUIDATE';
                  const flowSign = log.dealerFlow >= 0 ? '+' : '';
                  const arrow = log.spotPrice >= spot ? '' : '';
                  
                  return (
                    <div key={log.step} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 hover:bg-black p-1 rounded transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-650">[Step {log.step.toString().padStart(2, '0')}]</span>
                        <span className="text-zinc-200">Spot: <strong className="text-[#E5E5E5]">${log.spotPrice.toFixed(2)}</strong></span>
                        <span className={`text-[8.5px] font-bold ${log.spotPrice >= spot ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                          {arrow} ${absoluteChange.toFixed(2)}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-500">Vol impact: <span className="text-zinc-350">{log.impact >= 0 ? '+' : ''}{(log.impact * 100).toFixed(4)}%</span></span>
                        <span className={`px-1 rounded-xs text-[7.5px] font-black ${
                          log.dominantGreek === 'GAMMA' ? 'bg-black/40 text-[#4ADE80]' : 'bg-black text-[#4ADE80]'
                        }`}>
                          {log.dominantGreek}
                        </span>
                        <span className={`font-semibold ${log.dealerFlow >= 0 ? 'text-[#4ADE80]' : 'text-rose-455'}`}>
                          {flowSign}${(log.dealerFlow / 1_000_000).toFixed(2)}M {dirText}
                        </span>
                      </div>
                    </div>
                  );
                })}
                
                <div className="text-[#4ADE80] border-t border-black/60 pt-2 mt-2 font-bold select-none flex items-center justify-between">
                  <span>&gt; SIMULATION COMPLETE.</span>
                  <span className="text-zinc-550 text-[8px]">TOTAL FLOW: ${(detailedSimulation.flow / 1_000_000).toFixed(2)}M</span>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: GEX SENSITIVITY CURVE PAYOFF PROFILE PLOTTER */}
        {labTab === 'gex_chart' && (
          <div className="space-y-4 animate-fadeIn" id="gex-sensitivity-curve-container">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-black/40 pb-2">
              <div>
                <span className="text-[10px] text-zinc-100 font-black tracking-wider uppercase block">Dealer Support (GEX) Curve</span>
                <p className="text-[9px] text-zinc-450 leading-relaxed max-w-xl">
                  Shows where dealers are net long or short gamma. Below the <strong className="text-amber-400">gamma flip level</strong>, dealers amplify selling; above it, they act as a cushion and dampen volatility.
                </p>
              </div>

              <div className="flex items-center gap-3 font-mono text-[8.5px] bg-black border border-black px-3 py-2 rounded">
                <span className="text-zinc-400">GAMMA FLIP LEVEL:</span>
                <span className="text-amber-400 font-extrabold font-mono">${gexSensitivityArray.flipLevel.toFixed(1)}</span>
                <span className="text-zinc-550">|</span>
                <span className="text-zinc-400">DEALER GAMMA:</span>
                <span className={`font-black ${detailedSimulation.netGamma >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                  {detailedSimulation.netGamma >= 0 ? 'POSITIVE (STABILIZING)' : 'NEGATIVE (AMPLIFYING)'}
                </span>
              </div>
            </div>

            {/* Custom SVG Line Chart for GEX Payoff Profile */}
            <div className="w-full bg-black border border-black rounded p-4 relative min-h-[220px] flex items-center justify-center">
              
              {/* Zero Line horizontal separator */}
              <div className="absolute left-0 right-0 h-[1.5px] bg-black pointer-events-none opacity-40 z-0 top-[110px]" />
              
              {/* Vertical dotted Line representing Current Spot Price */}
              <div className="absolute bottom-0 top-0 w-[1px] border-l border-dashed border-[#4ADE80]/50 pointer-events-none z-0 left-[50%]" />
              <div className="absolute top-2 left-[50.5%] font-mono text-[6.5px] text-[#4ADE80] font-black uppercase tracking-widest pointer-events-none select-none">
                SPOT
              </div>

              {/* Graphical Line rendering GEX curve */}
              <svg className="w-full h-[220px] overflow-visible z-10" viewBox="0 0 700 220">
                {(() => {
                  const points = gexSensitivityArray.curve;
                  const gValues = points.map(p => p.gex);
                  const maxG = Math.max(...gValues.map(Math.abs)) || 1.0;
                  
                  // Coordinate Mapper
                  const getCoords = (idx: number, gex: number) => {
                    const x = (idx / (points.length - 1)) * (700 - 65) + 35;
                    // Map +maxG to y=30, -maxG to y=190, 0 to y=110
                    const y = 110 - (gex / maxG) * 80;
                    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
                  };

                  const listPoints = points.map((p, idx) => {
                    const { x, y } = getCoords(idx, p.gex);
                    return `${x},${y}`;
                  }).join(' ');

                  return (
                    <>
                      {/* Plot Line */}
                      <polyline
                        fill="none"
                        stroke="#06b6d4"
                        strokeWidth="2.5"
                        points={listPoints}
                        className="transition-all duration-500 ease-in-out"
                      />

                      {/* Scatter Dots */}
                      {points.map((p, idx) => {
                        const { x, y } = getCoords(idx, p.gex);
                        const isFlipNear = Math.abs(p.price - gexSensitivityArray.flipLevel) < 25;
                        const isSpotNear = idx === 7;

                        return (
                          <g key={idx}>
                            <circle
                              cx={x}
                              cy={y}
                              r={isSpotNear ? '5' : '3.5'}
                              className={`${p.gex >= 0 ? 'fill-[#4ADE80]' : 'fill-rose-455'} stroke-black stroke-2 hover:r-6 cursor-pointer`}
                            >
                              <title>{`Price $${p.price} | GEX: ${p.gex.toLocaleString()}`}</title>
                            </circle>
                            
                            {/* Value tags corresponding to high-impact intervals */}
                            {(idx % 2 === 0 || idx === 7) && (
                              <text
                                x={x}
                                y={p.gex >= 0 ? y - 10 : y + 14}
                                className="fill-zinc-400 font-mono text-[7px]"
                                textAnchor="middle"
                              >
                                ${p.price}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>

              <div className="absolute left-4 top-4 font-mono text-[8px] text-zinc-500 flex flex-col uppercase">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-black/40" /> POSITIVE DEALER GAMMA [CUSHIONS MOVES]</span>
                <span className="flex items-center gap-1 mt-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-455" /> NEGATIVE DEALER GAMMA [AMPLIFIES MOVES]</span>
              </div>

              <div className="absolute right-4 bottom-4 font-mono text-[7px] text-zinc-550 text-right uppercase">
                <span>GEX curve convexity: 1.1448</span>
                <span className="block">Gamma flip level: ${gexSensitivityArray.flipLevel.toFixed(1)}</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: CAMPAIGNS & DIVERGENCE SYSTEMS */}
        {labTab === 'campaigns' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn">
            
            {/* Module A: Structural Campaign State Machine */}
            <div className="bg-black p-4 rounded-lg border border-black text-left flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 border-b border-black pb-2 mb-3">
                  <Cpu className="w-3.5 h-3.5 text-[#4ADE80]" />
                  <span className="font-mono text-[9px] font-black text-zinc-100 uppercase tracking-widest">Positioning Trend Tracker</span>
                </div>

                <p className="text-[10px] text-zinc-400 font-sans leading-normal mb-3">
                  Tracks how open interest and order flow are building or unwinding over time to identify institutional positioning trends.
                </p>

                {/* Visual State Ring / Indicator bar */}
                <div className="p-3 rounded bg-black/90 border border-black flex items-center justify-between mb-4 relative overflow-hidden select-none">
                  <div className="absolute top-0 right-0 h-full w-1.5 bg-[#4ADE80]" />
                  <div>
                    <span className="text-[7.5px] text-zinc-500 font-black block tracking-widest uppercase">CURRENT POSITION STATE</span>
                    <span className="text-xs font-black text-[#E5E5E5] font-mono uppercase tracking-wider block mt-0.5">
                      {activeCampaignState.state}
                    </span>
                    <span className="text-[7.5px] text-[#4ADE80] font-mono uppercase mt-1 block">
                      OI rate: {activeCampaignState.a_oi >= 0 ? '+' : ''}{activeCampaignState.a_oi.toLocaleString()} • Flow rate: {activeCampaignState.v_flow >= 0 ? '+' : ''}{activeCampaignState.v_flow.toLocaleString()}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[7.5px] text-zinc-500 font-black block tracking-widest uppercase">COMPLETION</span>
                    <span className="text-xs font-black text-[#4ADE80] font-mono block mt-0.5">
                      {activeCampaignState.completion}%
                    </span>
                  </div>
                </div>

                {/* Slider track adjustments */}
                <div className="space-y-3.5">
                  <span className="text-[8px] text-zinc-450 font-black tracking-widest uppercase block mb-1">OI and Flow History Inputs</span>

                  <div className="bg-black/40 border border-black/50 rounded p-3 space-y-2">
                    <div className="flex justify-between items-center text-[8.5px] font-mono">
                      <span className="text-zinc-500 uppercase">1. Max OI Capacity</span>
                      <input 
                        type="number" 
                        step="500000"
                        value={maxCapacity} 
                        onChange={(e) => setMaxCapacity(Math.max(1000000, Number(e.target.value)))}
                        className="mirror-panel text-[9px] px-1 py-0.5 w-24 text-right rounded font-mono text-[#E5E5E5] select-none outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-5 gap-2 pt-2 border-t border-black/60">
                      {oiHist.map((val, idx) => (
                        <div key={`oi-${idx}`} className="text-center space-y-1">
                          <span className="text-[7px] text-zinc-550 block uppercase font-mono">OI [t-{4-idx}]</span>
                          <input
                            type="number"
                            step="100000"
                            value={val}
                            onChange={(e) => updateHistory(idx, 'oi', Number(e.target.value))}
                            className="mirror-panel text-[#E5E5E5] font-mono text-[8px] py-1 px-0.5 w-full text-center rounded outline-none"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-5 gap-2 pt-1">
                      {flowHist.map((val, idx) => (
                        <div key={`flow-${idx}`} className="text-center space-y-1">
                          <span className="text-[7px] text-zinc-550 block uppercase font-mono">Flow [t-{4-idx}]</span>
                          <input
                            type="number"
                            step="2000000"
                            value={val}
                            onChange={(e) => updateHistory(idx, 'flow', Number(e.target.value))}
                            className="mirror-panel text-[#E5E5E5] font-mono text-[8px] py-1 px-0.5 w-full text-center rounded outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-black/60 pt-3 mt-4 text-[7px] text-zinc-550 font-mono text-right uppercase block">
                POSITIONING TREND TRACKER
              </div>
            </div>

            {/* Module B: Event Divergence & Sentiment Collisions */}
            <div className="bg-black p-4 rounded-lg border border-black text-left flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 border-b border-black pb-2 mb-3">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#4ADE80]" />
                  <span className="font-mono text-[9px] font-black text-zinc-100 uppercase tracking-widest">Event vs. Pre-Position Mismatch</span>
                </div>

                <p className="text-[10px] text-zinc-400 font-sans leading-normal mb-3">
                  Models how options hedges unwind when the actual headline outcome differs from where traders were positioned before the event.
                </p>

                {/* Layout Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div className="bg-black/80 p-3 rounded border border-black">
                    <span className="text-[8px] text-zinc-550 font-black tracking-wider block uppercase mb-1.5">Where traders were positioned before the event</span>
                    <div className="flex gap-1">
                      {(['bullish', 'neutral', 'bearish'] as const).map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setPreEventPos(val)}
                          className={`flex-1 py-1 font-mono text-[8px] font-black uppercase rounded cursor-pointer border transition-colors ${
                            preEventPos === val 
                              ? 'bg-black/10 text-[#4ADE80] border-black' 
                              : 'bg-black border-black text-zinc-500 hover:text-zinc-400'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-black/80 p-3 rounded border border-black">
                    <span className="text-[8px] text-zinc-550 font-black tracking-wider block uppercase mb-1.5">Headline Result Outcome</span>
                    <div className="flex gap-1">
                      {(['bullish', 'neutral', 'bearish'] as const).map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setHeadlineRes(val)}
                          className={`flex-1 py-1 font-mono text-[8px] font-black uppercase rounded cursor-pointer border transition-colors ${
                            headlineRes === val 
                              ? 'bg-[#F87171]/10 text-[#F87171] border-red-900/40' 
                              : 'bg-black border-black text-zinc-500 hover:text-zinc-400'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Results Grid displays */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-black border border-black p-2.5 rounded text-center">
                    <span className="text-[7px] text-zinc-550 font-bold block uppercase tracking-wider">Unwind Risk Level</span>
                    <span className={`text-xs font-mono font-black block mt-1 uppercase ${
                      eventDivergenceState.unwind_risk === 'Extreme' 
                        ? 'text-rose-455 animate-pulse' 
                        : eventDivergenceState.unwind_risk === 'High' 
                          ? 'text-amber-400' 
                          : 'text-zinc-400'
                    }`}>
                      {eventDivergenceState.unwind_risk}
                    </span>
                  </div>

                  <div className="bg-black border border-black p-2.5 rounded text-center">
                    <span className="text-[7px] text-zinc-550 font-bold block uppercase tracking-wider">IV Unwind Multiplier (Vanna)</span>
                    <span className="text-xs font-mono text-[#38bdf8] font-black block mt-1">
                      {eventDivergenceState.vanna_shock.toFixed(1)}x
                    </span>
                  </div>

                  <div className="bg-black border border-black p-2.5 rounded text-center">
                    <span className="text-[7px] text-zinc-550 font-bold block uppercase tracking-wider">Position vs. Outcome Gap</span>
                    <span className="text-xs font-mono text-zinc-200 font-black block mt-1">
                      {eventDivergenceState.divergence > 0 ? '+' : ''}{eventDivergenceState.divergence}
                    </span>
                  </div>
                </div>

                {eventDivergenceState.unwind_risk !== 'Low' && (
                  <div className="bg-rose-950/10 border border-red-955/40 p-2 rounded mt-3 text-left animate-fadeIn">
                    <span className="text-[7.5px] font-mono text-[#F87171] leading-tight uppercase block font-semibold">
                      ⚡ HEDGE UNWIND IN PROGRESS: Dealers repricing rapidly. IV-driven flow amplified {eventDivergenceState.vanna_shock.toFixed(1)}x above normal.
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t border-black/60 pt-3 mt-4 text-[7px] text-zinc-550 font-mono text-right uppercase block">
                EVENT VS. POSITION MISMATCH
              </div>
            </div>

          </div>
        )}

        {/* TAB 4: L2/L3 ORDER BOOK & TOXICITY ENGINE (Task 3) */}
        {labTab === 'orderbook' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 animate-fadeIn" id="microstructure-orderbook-container">
            
            {/* COLUMN 1: LEVEL 2 & 3 ORDER LADDER (Col span 7) */}
            <div className="xl:col-span-7 bg-[#050505] p-4.5 rounded-lg border border-[#1A1A1A] text-left flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-[#222] pb-2.5 mb-3.5">
                  <div className="flex items-center gap-2">
                    <Table className="w-4 h-4 text-[#4ADE80]" />
                    <span className="font-mono text-[9.5px] font-black text-zinc-100 uppercase tracking-widest">
                      {selectedAsset.ticker} Order Book (DOM)
                    </span>
                    <span
                      className="text-[7px] font-black uppercase tracking-widest px-1 py-0.5 rounded-sm border text-amber-400 border-amber-500/40 bg-amber-500/10"
                      title="Simulated order book anchored to live spot and real informed-trading (VPIN) data. Not a live exchange feed."
                    >
                      MODEL
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[7.5px] font-mono text-rose-455 font-bold uppercase tracking-widest">
                      LIVE SIMULATION ACTIVE
                    </span>
                  </div>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-1.5 mb-4">
                  <span className="text-[7.5px] text-zinc-500 font-extrabold uppercase tracking-widest mr-1">
                    FILTER:
                  </span>
                  {[
                    { id: 'all', label: 'ALL ORDERS' },
                    { id: 'institutional', label: 'LARGE ORDERS ONLY' },
                    { id: 'all_alerts', label: 'ALERTS ONLY' }
                  ].map(btn => (
                    <button
                      key={btn.id}
                      onClick={() => setBookFilter(btn.id as any)}
                      className={`text-[8px] font-mono font-bold tracking-wider px-2 py-1 rounded cursor-pointer border transition-colors ${
                        bookFilter === btn.id
                          ? 'bg-[#1a1a1a] border-cyan-500/40 text-cyan-400'
                          : 'bg-black border-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>

                {/* Order Ladder */}
                <div className="space-y-0.5 font-mono text-[10px] select-none">
                  {/* Ledger Headers */}
                  <div className="grid grid-cols-4 pb-1.5 text-zinc-550 border-b border-[#1A1A1A] font-black text-[8px] uppercase tracking-wider text-right px-1">
                    <div className="text-left">Price (${selectedAsset.ticker})</div>
                    <div>Size (Contracts)</div>
                    <div>Depth (Lots)</div>
                    <div>Order Type</div>
                  </div>

                  {/* ASKS (LADDER REVERSED SO HIGHEST IS ON TOP) */}
                  <div className="space-y-0.5 pt-1 border-b border-rose-955/25 pb-1">
                    {orderBookAsks
                      .slice()
                      .reverse()
                      .filter(ask => {
                        if (bookFilter === 'institutional') return ask.type === 'WALL' || ask.type === 'ICEBERG';
                        if (bookFilter === 'all_alerts') return ask.type !== 'MM';
                        return true;
                      })
                      .map((ask, i) => {
                        const depthPct = Math.min(100, (ask.size / 800) * 100);
                        return (
                          <div
                            key={`ask-${i}`}
                            className="grid grid-cols-4 items-center text-right hover:bg-rose-950/5 py-1 px-1 transition-colors relative"
                          >
                            <div
                              className="absolute inset-y-0 right-0 bg-rose-950/10 pointer-events-none transition-all"
                              style={{ width: `${depthPct}%` }}
                            />
                            <div className="text-rose-500 font-bold text-left z-10">${ask.price.toFixed(2)}</div>
                            <div className="text-zinc-250 z-10">{ask.size.toLocaleString()}</div>
                            <div className="text-zinc-450 z-10">{ask.cumulative.toLocaleString()}</div>
                            <div className="z-10">
                              <span
                                className={`text-[8px] font-black uppercase tracking-wider px-1 py-0.5 rounded ${
                                  ask.type === 'WALL'
                                    ? 'bg-red-500/15 text-red-100 border border-red-905/40'
                                    : ask.type === 'ICEBERG'
                                      ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-900/40'
                                      : ask.type === 'SPOOF'
                                        ? 'bg-amber-500/15 text-amber-400 border border-amber-900/40 animate-pulse'
                                        : 'text-zinc-650'
                                }`}
                              >
                                {ask.type === 'WALL' ? '⚡ LIMIT WALL' : ask.type === 'ICEBERG' ? '🛡️ ICEBERG' : ask.type === 'SPOOF' ? '⚠️ SPOOF FLAG' : 'MM LIMIT'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* SPREAD BAR (CLASSIC BOOK GAP) */}
                  <div className="grid grid-cols-4 items-center bg-[#0d0d0e] border border-[#1f1f22] my-1.5 py-1.5 px-2 font-black tracking-wider text-[11px] text-zinc-350 relative">
                    <div className="text-left font-mono font-black flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      MID: ${selectedAsset.defaultPrice.toFixed(2)}
                    </div>
                    <div className="text-right text-[9px] text-zinc-500">
                      GAP: ${(orderBookAsks[0]?.price - orderBookBids[0]?.price || 0.1).toFixed(2)} pts
                    </div>
                    <div className="text-right text-[10px] text-cyan-400">
                      OBI: {obiPercentage > 0 ? '+' : ''}{obiPercentage.toFixed(1)}%
                    </div>
                    <div className="text-right font-sans font-black text-[9.5px]">
                      SPREAD S0
                    </div>
                  </div>

                  {/* BIDS */}
                  <div className="space-y-0.5 pt-1">
                    {orderBookBids
                      .filter(bid => {
                        if (bookFilter === 'institutional') return bid.type === 'WALL' || bid.type === 'ICEBERG';
                        if (bookFilter === 'all_alerts') return bid.type !== 'MM';
                        return true;
                      })
                      .map((bid, i) => {
                        const depthPct = Math.min(100, (bid.size / 800) * 100);
                        return (
                          <div
                            key={`bid-${i}`}
                            className="grid grid-cols-4 items-center text-right hover:bg-emerald-950/5 py-1 px-1 transition-colors relative"
                          >
                            <div
                              className="absolute inset-y-0 right-0 bg-emerald-950/10 pointer-events-none transition-all"
                              style={{ width: `${depthPct}%` }}
                            />
                            <div className="text-emerald-500 font-bold text-left z-10">${bid.price.toFixed(2)}</div>
                            <div className="text-zinc-250 z-10">{bid.size.toLocaleString()}</div>
                            <div className="text-zinc-450 z-10">{bid.cumulative.toLocaleString()}</div>
                            <div className="z-10">
                              <span
                                className={`text-[8px] font-black uppercase tracking-wider px-1 py-0.5 rounded ${
                                  bid.type === 'WALL'
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-950/40'
                                    : bid.type === 'ICEBERG'
                                      ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-900/40'
                                      : bid.type === 'SPOOF'
                                        ? 'bg-amber-500/15 text-amber-400 border border-amber-900/40 animate-pulse'
                                        : 'text-zinc-650'
                                }`}
                              >
                                {bid.type === 'WALL' ? '⚡ LIMIT WALL' : bid.type === 'ICEBERG' ? '🛡️ ICEBERG' : bid.type === 'SPOOF' ? '⚠️ SPOOF FLAG' : 'MM LIMIT'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                </div>
              </div>

              <div className="border-t border-[#1F1F1F] pt-3.5 mt-5 text-[7px] text-zinc-550 font-mono text-right uppercase block">
                SIMULATED ORDER BOOK • ANCHORED TO LIVE DATA
              </div>
            </div>

            {/* COLUMN 2: ANALYTICAL METRICS HUD (Col span 5) */}
            <div className="xl:col-span-5 flex flex-col gap-4">
              
              {/* Module A: Microstructure Ratios */}
              <div className="bg-[#050505] p-4.5 rounded-lg border border-[#1A1A1A] text-left">
                <div className="flex items-center gap-1.5 border-b border-[#222] pb-2 mb-3.5">
                  <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-mono text-[9px] font-black text-zinc-100 uppercase tracking-widest">
                    Order Imbalance and Informed-Flow Meter
                  </span>
                </div>

                <p className="text-[10px] text-zinc-400 font-sans leading-normal mb-4">
                  OBI shows whether more size sits on bids or asks. VPIN (informed-trading pressure) rises when one side dominates, signaling non-random flow.
                </p>

                {/* Meter 1: OBI Gauge */}
                <div className="mb-4">
                  <div className="flex justify-between text-[8px] font-black uppercase text-zinc-400 tracking-wider mb-1.5">
                    <span>ASK DOMINATED (-100%)</span>
                    <span className="text-[#E5E5E5] font-black font-mono">
                      OBI: {obiPercentage > 0 ? '+' : ''}{obiPercentage.toFixed(1)}%
                    </span>
                    <span>BID DOMINATED (+100%)</span>
                  </div>
                  <div className="h-2 bg-[#141414] rounded overflow-hidden relative border border-[#222]">
                    <div className="absolute inset-y-0 left-1/2 w-[1px] bg-[#333] z-10" />
                    <div
                      className={`h-full transition-all duration-300 absolute ${
                        obiPercentage > 0 ? 'bg-emerald-500 left-1/2' : 'bg-rose-500 right-1/2'
                      }`}
                      style={{
                        width: `${Math.abs(obiPercentage) / 2}%`
                      }}
                    />
                  </div>
                </div>

                {/* Meter 2: VPIN Volume Toxicity */}
                <div className="mb-4">
                  <div className="flex justify-between items-center text-[8px] font-black uppercase text-zinc-400 tracking-wider mb-1.5">
                    <span>Informed-trading pressure (VPIN)</span>
                    <span className={`font-mono text-[9.5px] font-bold ${vpinToxicity > 65 ? 'text-rose-500 animate-pulse font-black' : 'text-cyan-400'}`}>
                      {vpinToxicity.toFixed(1)}% {vpinToxicity > 65 ? '[HIGH]' : '[NORMAL]'}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#141414] rounded overflow-hidden relative border border-[#222]">
                    <div
                      className={`h-full transition-all duration-500 ${
                        vpinToxicity > 65 ? 'bg-rose-500' : 'bg-cyan-500'
                      }`}
                      style={{ width: `${vpinToxicity}%` }}
                    />
                  </div>
                </div>

                {/* Meter 3: Absorption Strength */}
                <div>
                  <div className="flex justify-between items-center text-[8px] font-black uppercase text-zinc-400 tracking-wider mb-1.5">
                    <span>Market-maker absorption strength</span>
                    <span className="font-mono text-[9.5px] font-bold text-emerald-400">
                      {absorptionStrength.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#141414] rounded overflow-hidden relative border border-[#222]">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${absorptionStrength}%` }}
                    />
                  </div>
                </div>

              </div>

              {/* Module B: Custom Logging Activity Feed */}
              <div className="bg-[#050505] p-4.5 rounded-lg border border-[#1A1A1A] text-left flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 border-b border-[#222] pb-2 mb-3">
                    <Activity className="w-3.5 h-3.5 text-rose-500" />
                    <span className="font-mono text-[9px] font-black text-zinc-100 uppercase tracking-widest">
                      Live Order Book Alert Feed
                    </span>
                  </div>

                  {/* Scrolling alerts list */}
                  <div className="space-y-2 h-[220px] overflow-y-auto pr-1 select-none font-mono text-[9px]">
                    {microstructureFeeds.map(feed => (
                      <div
                        key={feed.id}
                        className="bg-black/30 border border-[#1A1A1A] p-2 rounded flex flex-col justify-between leading-snug animate-fadeIn"
                      >
                        <div className="flex items-center justify-between text-[8px] tracking-wider font-extrabold text-zinc-550 border-b border-zinc-900 pb-1 mb-1">
                          <span>TIME: {feed.time}</span>
                          <span className={feed.side === 'BID' ? 'text-emerald-500' : 'text-[#F87171]'}>
                            {feed.side} @ ${feed.price}
                          </span>
                        </div>
                        <p className={feed.style}>{feed.text}</p>
                      </div>
                    ))}
                    {microstructureFeeds.length === 0 && (
                      <div className="text-center text-zinc-650 py-10 italic">
                        Scanning incoming data streams...
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-[#1F1F1F] pt-2.5 mt-4 text-[7px] text-zinc-550 font-mono text-right uppercase block">
                  ORDER ACTIVITY FEED
                </div>
              </div>

            </div>

          </div>
        )}

      </div>

      {/* OPTIONS LIST CONFIGURATOR CARD */}
      <div className="bg-black/90 p-5 rounded-lg border border-black shadow-2xl relative text-left">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black/40 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#4ADE80]" />
            <div className="font-sans font-black text-xs tracking-widest text-[#FFFFFF] uppercase">
              Options Chain Builder
            </div>
          </div>
          <span className="font-mono text-[8px] text-zinc-550 uppercase">
            Currently calculating {options.length} custom contracts
          </span>
        </div>

        {/* Input adding grid */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 bg-black/40 border border-black/60 p-3 rounded mb-4 items-end">
          <div className="space-y-1">
            <span className="text-[7.5px] text-zinc-450 font-black uppercase tracking-wider block">Strike Price ($)</span>
            <input
              type="text"
              placeholder="e.g. 5000"
              value={newStrike}
              onChange={(e) => setNewStrike(e.target.value)}
              className="mirror-panel text-[#4ADE80] font-mono text-xs p-1.5 w-full rounded focus:border-[#4ADE80]/40 select-none outline-none"
            />
          </div>

          <div className="space-y-1">
            <span className="text-[7.5px] text-zinc-450 font-black uppercase tracking-wider block">Option Type</span>
            <div className="flex border border-black rounded bg-black overflow-hidden">
              <button
                type="button"
                onClick={() => setNewType('call')}
                className={`flex-1 py-1 px-2 font-mono text-[8.5px] font-black uppercase transition-all cursor-pointer ${
                  newType === 'call' ? 'bg-cyan-600/20 text-[#4ADE80] font-bold' : 'text-zinc-550 hover:text-zinc-400'
                }`}
              >
                CALL
              </button>
              <button
                type="button"
                onClick={() => setNewType('put')}
                className={`flex-1 py-1 px-2 font-mono text-[8.5px] font-black uppercase transition-all cursor-pointer ${
                  newType === 'put' ? 'bg-cyan-600/20 text-[#4ADE80] font-bold' : 'text-zinc-550 hover:text-zinc-400'
                }`}
              >
                PUT
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[7.5px] text-zinc-450 font-black uppercase tracking-wider block">Open Interest (OI)</span>
            <input
              type="number"
              step="5000"
              value={newOi}
              onChange={(e) => setNewOi(Math.max(10, Number(e.target.value)))}
              className="mirror-panel text-[#4ADE80] font-mono text-xs p-1.5 w-full rounded focus:border-[#4ADE80]/40 select-none outline-none"
            />
          </div>

          <div className="space-y-1">
            <span className="text-[7.5px] text-zinc-450 font-black uppercase tracking-wider block">Implied Vol (IV)</span>
            <input
              type="number"
              step="0.01"
              min="0.02"
              max="2.0"
              value={newVol}
              onChange={(e) => setNewVol(Number(e.target.value))}
              className="mirror-panel text-[#4ADE80] font-mono text-xs p-1.5 w-full rounded focus:border-[#4ADE80]/40 select-none outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleAddOption}
            className="bg-cyan-600/20 text-[#4ADE80] border border-[#4ADE80]/40 hover:bg-[#4ADE80] hover:text-[#E5E5E5] font-black font-mono text-[9px] uppercase tracking-wider py-1.5 px-4.5 rounded cursor-pointer transition-all flex items-center justify-center gap-1 w-full"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>ADD CONTRACT</span>
          </button>
        </div>

        {/* Existing option list */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-mono text-[9.5px]">
            <thead>
              <tr className="border-b border-black text-zinc-550 uppercase text-[8px] font-black tracking-widest bg-black/20">
                <th className="py-2 px-3">Contract Type</th>
                <th className="py-2 px-3 text-right">Strike Price</th>
                <th className="py-2 px-3 text-right">Days to Expiry</th>
                <th className="py-2 px-3 text-right">IV</th>
                <th className="py-2 px-3 text-right">Open Interest (OI)</th>
                <th className="py-2 px-3 text-right">Delta</th>
                <th className="py-2 px-3 text-right">Gamma</th>
                <th className="py-2 px-3 text-right">Charm (time decay of delta)</th>
                <th className="py-2 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {options.map((opt, idx) => {
                const g = DealerFlowPhysics.calculateGreeks(spot, opt.strike, opt.t, opt.sigma, 0.05, 0.01, opt.type);
                return (
                  <tr key={idx} className="border-b border-black hover:bg-black/30">
                    <td className="py-2 px-3">
                      <span className={`px-1.5 py-0.5 rounded-xs text-[8px] font-black uppercase ${
                        opt.type === 'call' ? 'bg-[#4ADE80] text-black/10 text-[#4ADE80] border border-black' : 'bg-rose-500/10 text-rose-455 border border-rose-500/20'
                      }`}>
                        {opt.type}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right text-[#E5E5E5] font-bold">${opt.strike}</td>
                    <td className="py-2 px-3 text-right text-zinc-400">{(opt.t * 365).toFixed(0)} days</td>
                    <td className="py-2 px-3 text-right text-zinc-350">{(opt.sigma * 100).toFixed(1)}%</td>
                    <td className="py-2 px-3 text-right text-[#4ADE80] font-bold">{opt.oi.toLocaleString()}</td>
                    <td className={`py-2 px-3 text-right font-bold ${g.delta >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>{g.delta.toFixed(3)}</td>
                    <td className="py-2 px-3 text-right text-zinc-400 font-mono">{g.gamma.toFixed(5)}</td>
                    <td className="py-2 px-3 text-right text-zinc-400 font-mono">{(g.charm * 100).toFixed(4)}%</td>
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(idx)}
                        className="text-zinc-600 hover:text-[#F87171] font-bold transition-colors cursor-pointer text-[10px]"
                        title="Remove option from simulation parameters"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {options.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-zinc-650 py-6 italic font-mono text-[9px]">
                    No options loaded. Add options using the form above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
