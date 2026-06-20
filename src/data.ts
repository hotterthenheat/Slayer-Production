/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AssetInfo, Candle, FairValueGap, LiquidityEvent, TimeframeVal } from './types';

export const ASSET_LIST: AssetInfo[] = [
  {
    key: 'SPX',
    ticker: 'SPX',
    name: 'S&P 500 Index',
    type: 'INDEXES',
    defaultPrice: 7623.00,
    decimals: 2,
    spread: 0.50,
    volatility: 0.55,
    unit: 'USD',
    forecastScale: 0.12,
    stabilityMax: 0.040,
  },
  {
    key: 'QQQ',
    ticker: 'QQQ',
    name: 'Invesco QQQ Trust',
    type: 'ETFS',
    defaultPrice: 445.50,
    decimals: 2,
    spread: 0.02,
    volatility: 0.8,
    unit: 'USD',
    forecastScale: 0.14,
    stabilityMax: 0.045,
  },
  {
    key: 'NDX',
    ticker: 'NDX',
    name: 'Nasdaq 100 Index',
    type: 'INDEXES',
    defaultPrice: 18250.00,
    decimals: 2,
    spread: 1.50,
    volatility: 0.75,
    unit: 'USD',
    forecastScale: 0.18,
    stabilityMax: 0.050,
  },
  {
    key: 'SPY',
    ticker: 'SPY',
    name: 'SPDR S&P 500 ETF',
    type: 'ETFS',
    defaultPrice: 512.30,
    decimals: 2,
    spread: 0.02,
    volatility: 0.6,
    unit: 'USD',
    forecastScale: 0.10,
    stabilityMax: 0.035,
  },
  {
    key: 'RUT',
    ticker: 'RUT',
    name: 'Russell 2000 Index',
    type: 'INDEXES',
    defaultPrice: 2025.00,
    decimals: 2,
    spread: 0.20,
    volatility: 0.70,
    unit: 'USD',
    forecastScale: 0.11,
    stabilityMax: 0.040,
  }
];

export const TIMEFRAMES: { val: TimeframeVal; label: string; minMultiplier: number }[] = [
  { val: '1m', label: '1 Minute', minMultiplier: 1 },
  { val: '2m', label: '2 Minutes', minMultiplier: 2 },
  { val: '3m', label: '3 Minutes', minMultiplier: 3 },
  { val: '5m', label: '5 Minutes', minMultiplier: 5 },
  { val: '15m', label: '15 Minutes', minMultiplier: 15 },
  { val: '30m', label: '30 Minutes', minMultiplier: 30 },
  { val: '1h', label: '1 Hour', minMultiplier: 60 },
  { val: '4h', label: '4 Hours', minMultiplier: 240 },
  { val: '1D', label: 'Daily', minMultiplier: 1440 },
  { val: '1W', label: 'Weekly', minMultiplier: 10080 },
];

/**
 * Generates initial candlesticks and simulates institutional trading conditions
 */
export function generateInitialCandles(asset: AssetInfo, timeframe: TimeframeVal, count = 46): Candle[] {
  const candles: Candle[] = [];
  const basePrice = asset.defaultPrice;
  const vol = asset.volatility;
  
  // Set timeframe scale factors
  let tfScale = 1;
  let minMultiplier = 15;
  const tfObj = TIMEFRAMES.find(t => t.val === timeframe);
  if (tfObj) {
    tfScale = Math.sqrt(tfObj.minMultiplier) * 0.15 + 0.85;
    minMultiplier = tfObj.minMultiplier;
  }

  let currentPrice = basePrice * (1 - vol * 0.015); // Start slightly lower to build a trend pattern
  let accumulatedVolPrice = 0;
  let accumulatedVol = 0;
  
  const startTime = Date.now() - count * minMultiplier * 60000;

  for (let i = 0; i < count; i++) {
    const timestamp = startTime + i * minMultiplier * 60000;
    
    // Create random-walk price bars, but add institutional expansion pockets
    let isHeavyDisplacement = false;
    let displacementDir: 'bullish' | 'bearish' | null = null;
    let biasFactor = 0.05; // general bullish bias for neat look
    
    // Inject institutional displacement on specific historic candles (e.g., at i=12, i=24, i=35)
    if (i === 15 || i === 28 || i === 38) {
      isHeavyDisplacement = true;
      displacementDir = i === 28 ? 'bearish' : 'bullish';
      biasFactor = i === 28 ? -2.2 * vol : 2.5 * vol;
    } else if (i > 15 && i < 22) {
      // gentle pullbacks
      biasFactor = -0.3 * vol;
    } else if (i > 28 && i < 33) {
      // bearish momentum continuation
      biasFactor = -0.6 * vol;
    } else {
      biasFactor = (Math.random() - 0.44) * 0.4 * vol;
    }

    const priceChange = basePrice * (biasFactor / 100) * tfScale;
    const open = currentPrice;
    const close = currentPrice + priceChange;
    
    let high = Math.max(open, close) + (Math.random() * 0.08 * vol * basePrice) / 100;
    let low = Math.min(open, close) - (Math.random() * 0.08 * vol * basePrice) / 100;
    
    // Stretch candle body for institutional displacement
    if (isHeavyDisplacement) {
      if (displacementDir === 'bullish') {
        high = close + (Math.random() * 0.01 * basePrice) / 100;
        low = open - (Math.random() * 0.005 * basePrice) / 100;
      } else {
        high = open + (Math.random() * 0.005 * basePrice) / 100;
        low = close - (Math.random() * 0.01 * basePrice) / 100;
      }
    }

    const absBody = Math.abs(close - open);
    const range = high - low;

    // Relative volume expands during institutional activity
    const baseVolume = 100000 * (asset.decimals === 5 ? 0.01 : 1);
    let volume = Math.floor(baseVolume * (0.5 + Math.random() * 1.5));
    if (isHeavyDisplacement) {
      volume = Math.floor(baseVolume * (3.5 + Math.random() * 2));
    } else if (Math.abs(priceChange) > (basePrice * vol * 0.003)) {
      volume = Math.floor(baseVolume * (1.8 + Math.random() * 1.2));
    }

    currentPrice = close;

    // VWAP calculation
    const typicalPrice = (high + low + close) / 3;
    accumulatedVolPrice += typicalPrice * volume;
    accumulatedVol += volume;
    const vwap = accumulatedVolPrice / accumulatedVol;

    // Create Candle Structure
    candles.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      vwap,
      isDisplacement: isHeavyDisplacement,
      displacementType: displacementDir,
      relativeVolume: Number((volume / baseVolume).toFixed(2))
    });
  }

  // Calculate dynamic momentum and secondary filters on the set
  return candles;
}

/**
 * Calculates Fair Value Gaps on the current set of candles.
 */
export function calculateFVGs(candles: Candle[]): FairValueGap[] {
  const fvgs: FairValueGap[] = [];
  
  // Need at least 3 candles to establish a gap (i-2, i-1, i)
  for (let i = 2; i < candles.length; i++) {
    const cPrevPrev = candles[i - 2];
    const cMiddle = candles[i - 1];
    const cCurr = candles[i];
    
    // Bullish FVG check
    // Low of current candle [i] is above High of previous-previous candle [i-2]
    if (cCurr.low > cPrevPrev.high) {
      // Body of middle candle must be substantially large to denote genuine institutional imbalance
      const cMiddleBody = Math.abs(cMiddle.close - cMiddle.open);
      const cMiddleTotal = cMiddle.high - cMiddle.low;
      
      if (cMiddleBody > 0.4 * cMiddleTotal || cMiddle.isDisplacement) {
        const top = cCurr.low;
        const bottom = cPrevPrev.high;
        const eq = bottom + (top - bottom) / 2;
        
        fvgs.push({
          id: `fvg-bull-${i}`,
          type: 'bullish',
          top,
          bottom,
          equilibrium: eq,
          state: 'ARMED',
          createdAtIdx: i
        });
      }
    }
    
    // Bearish FVG check
    // High of current candle [i] is below Low of previous-previous candle [i-2]
    if (cCurr.high < cPrevPrev.low) {
      const cMiddleBody = Math.abs(cMiddle.close - cMiddle.open);
      const cMiddleTotal = cMiddle.high - cMiddle.low;
      
      if (cMiddleBody > 0.4 * cMiddleTotal || cMiddle.isDisplacement) {
        const top = cPrevPrev.low;
        const bottom = cCurr.high;
        const eq = bottom + (top - bottom) / 2;
        
        fvgs.push({
          id: `fvg-bear-${i}`,
          type: 'bearish',
          top,
          bottom,
          equilibrium: eq,
          state: 'ARMED',
          createdAtIdx: i
        });
      }
    }
  }

  // Simulate states and updates on those FVGs as price continues to interact:
  // TESTED: when price moves back inside the gap
  // HELD: when price touches the gap (but doesn't cross the equilibrium or bottom of bullish gap / top of bearish gap) and bounces
  // INVALIDATED: when price closes fully below the bullish gap / above the bearish gap
  // COMPLETED: when price fills the entire gap
  fvgs.forEach(fvg => {
    let touched = false;
    let closedPastEq = false;
    let fullyBroken = false;
    
    // Look at candles after the creation index
    for (let j = fvg.createdAtIdx + 1; j < candles.length; j++) {
      const candle = candles[j];
      
      if (fvg.type === 'bullish') {
        // Did price enter the gap?
        if (candle.low <= fvg.top && candle.high >= fvg.bottom) {
          touched = true;
          fvg.testedAtIdx = j;
          
          if (candle.low < fvg.equilibrium) {
            closedPastEq = true;
          }
          
          // Close below bottom of bullish FVG is invalidation
          if (candle.close < fvg.bottom) {
            fullyBroken = true;
            fvg.invalidatedAtIdx = j;
            break;
          }
        }
      } else {
        // Bearish
        // Did price enter the gap?
        if (candle.high >= fvg.bottom && candle.low <= fvg.top) {
          touched = true;
          fvg.testedAtIdx = j;
          
          if (candle.high > fvg.equilibrium) {
            closedPastEq = true;
          }
          
          // Close above top of bearish FVG is invalidation
          if (candle.close > fvg.top) {
            fullyBroken = true;
            fvg.invalidatedAtIdx = j;
            break;
          }
        }
      }
    }

    if (fullyBroken) {
      fvg.state = 'INVALIDATED';
    } else if (touched) {
      if (closedPastEq) {
        fvg.state = 'TESTED';
      } else {
        fvg.state = 'HELD';
      }
    } else {
      fvg.state = 'ARMED';
    }
  });

  return fvgs;
}

/**
 * Calculates liquidity sweeps
 */
export function calculateLiquidityEvents(candles: Candle[]): LiquidityEvent[] {
  const events: LiquidityEvent[] = [];
  
  for (let i = 2; i < candles.length; i++) {
    const prevCandles = candles.slice(Math.max(0, i - 12), i);
    const highs = prevCandles.map(c => c.high);
    const lows = prevCandles.map(c => c.low);
    const localMax = Math.max(...highs);
    const localMin = Math.min(...lows);
    
    const curr = candles[i];
    
    // Liquidity Sweep High: Price went above local max of past 8 candles, but closed lower
    if ((curr.high >= localMax && curr.close < localMax) || (curr.high > localMax * 0.9995 && Math.random() > 0.85)) {
      events.push({
        id: `liq-swp-h-${i}`,
        label: i % 3 === 0 ? 'External Liquidity Grab' : 'Liquidity Sweep High',
        price: curr.high,
        candleIdx: i,
        type: 'bearish'
      });
    }
    
    // Liquidity Sweep Low: Price went below local min of past 8 candles, but closed higher
    if ((curr.low <= localMin && curr.close > localMin) || (curr.low < localMin * 1.0005 && Math.random() > 0.85)) {
      events.push({
        id: `liq-swp-l-${i}`,
        label: i % 5 === 0 ? 'Stop Run' : (i % 3 === 0 ? 'Internal Liquidity Grab' : 'Liquidity Sweep Low'),
        price: curr.low,
        candleIdx: i,
        type: 'bullish'
      });
    }
  }
  
  return events;
}

/**
 * Calculates EMA for a given length
 */
export function calculateEMA(candles: Candle[], length: number): number[] {
  const emas: number[] = [];
  if (candles.length === 0) return emas;
  
  const k = 2 / (length + 1);
  let ema = candles[0].close;
  emas.push(ema);
  
  for (let i = 1; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
    emas.push(ema);
  }
  return emas;
}

export const INITIAL_DISCOVERY_CONTRACTS = [
  // SHELF: CONVICTION
  {
    id: 'spx-7620-c',
    ticker: 'SPX',
    strike: 7620,
    isCall: true,
    health: 96,
    expectedMove: '+42.5%',
    action: 'ENTER' as const,
    narrative: 'Heavy institutional volume cluster matched. Dealer buy walls are perfectly positioned.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.54,
    gamma: 0.024,
    vega: 0.14,
    theta: -0.81,
    volume: 14205,
    price: 5.40,
    bid: 5.35,
    ask: 5.45,
    t1: 7.20,
    p1: 33
  },
  {
    id: 'spy-515-c',
    ticker: 'SPY',
    strike: 515,
    isCall: true,
    health: 93,
    expectedMove: '+36.2%',
    action: 'ENTER' as const,
    narrative: 'Unusually clean volume profile confirms call momentum.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.48,
    gamma: 0.038,
    vega: 0.12,
    theta: -0.45,
    volume: 38201,
    price: 3.20,
    bid: 3.18,
    ask: 3.22,
    t1: 4.35,
    p1: 36
  },
  {
    id: 'qqq-448-c',
    ticker: 'QQQ',
    strike: 448,
    isCall: true,
    health: 91,
    expectedMove: '+29.0%',
    action: 'ENTER' as const,
    narrative: 'Dealer block purchases confirm near-term floor.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.52,
    gamma: 0.041,
    vega: 0.15,
    theta: -0.55,
    volume: 22401,
    price: 4.20,
    bid: 4.15,
    ask: 4.25,
    t1: 5.40,
    p1: 29
  },
  {
    id: 'ndx-18350-c',
    ticker: 'NDX',
    strike: 18350,
    isCall: true,
    health: 90,
    expectedMove: '+31.4%',
    action: 'ENTER' as const,
    narrative: 'Rapid acceleration in derivative order flow on Nasdaq nodes.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.49,
    gamma: 0.015,
    vega: 0.18,
    theta: -1.25,
    volume: 5204,
    price: 15.50,
    bid: 15.30,
    ask: 15.70,
    t1: 20.30,
    p1: 31
  },
  {
    id: 'spx-7600-c',
    ticker: 'SPX',
    strike: 7600,
    isCall: true,
    health: 95,
    expectedMove: '+39.1%',
    action: 'ENTER' as const,
    narrative: 'Below spot magnet concentration attracts structural institutional buyer hedging.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.62,
    gamma: 0.021,
    vega: 0.13,
    theta: -0.92,
    volume: 18940,
    price: 11.20,
    bid: 11.10,
    ask: 11.30,
    t1: 15.60,
    p1: 39
  },
  {
    id: 'spy-510-c',
    ticker: 'SPY',
    strike: 510,
    isCall: true,
    health: 92,
    expectedMove: '+34.8%',
    action: 'ENTER' as const,
    narrative: 'Slayer deep learning index detects massive localized volume sweep.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.58,
    gamma: 0.035,
    vega: 0.13,
    theta: -0.48,
    volume: 45100,
    price: 5.10,
    bid: 5.05,
    ask: 5.15,
    t1: 6.85,
    p1: 34
  },
  // SHELF: IMPROVED / VELOCITY
  {
    id: 'ndx-18300-c',
    ticker: 'NDX',
    strike: 18300,
    isCall: true,
    health: 89,
    expectedMove: '+55.2%',
    action: 'ENTER' as const,
    narrative: 'Rapid jump in scoring index over the last 15 minutes. High expansion.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.58,
    gamma: 0.018,
    vega: 0.19,
    theta: -1.15,
    volume: 6310,
    price: 14.20,
    bid: 14.05,
    ask: 14.35,
    t1: 22.01,
    p1: 55
  },
  {
    id: 'qqq-446-c',
    ticker: 'QQQ',
    strike: 446,
    isCall: true,
    health: 88,
    expectedMove: '+32.4%',
    action: 'ENTER' as const,
    narrative: 'Dealer short blocks have dissolved, freeing up massive room overhead.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.54,
    gamma: 0.043,
    vega: 0.16,
    theta: -0.58,
    volume: 29402,
    price: 3.80,
    bid: 3.75,
    ask: 3.85,
    t1: 5.05,
    p1: 32
  },
  {
    id: 'spy-514-c',
    ticker: 'SPY',
    strike: 514,
    isCall: true,
    health: 87,
    expectedMove: '+28.5%',
    action: 'ENTER' as const,
    narrative: 'Score rating surges as dealers transition from negative gamma to neutral gamma.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.51,
    gamma: 0.039,
    vega: 0.12,
    theta: -0.46,
    volume: 18920,
    price: 2.80,
    bid: 2.77,
    ask: 2.83,
    t1: 3.60,
    p1: 28
  },
  {
    id: 'spx-7660-c',
    ticker: 'SPX',
    strike: 7660,
    isCall: true,
    health: 86,
    expectedMove: '+45.0%',
    action: 'ENTER' as const,
    narrative: 'Breakout momentum identified. Standard dispersion limit predicts vol expansion.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.42,
    gamma: 0.019,
    vega: 0.14,
    theta: -0.84,
    volume: 9811,
    price: 4.80,
    bid: 4.70,
    ask: 4.90,
    t1: 6.95,
    p1: 45
  },
  {
    id: 'qqq-450-c',
    ticker: 'QQQ',
    strike: 450,
    isCall: true,
    health: 85,
    expectedMove: '+26.8%',
    action: 'ENTER' as const,
    narrative: 'Derivative speed indices ticking straight up; fast buy feedback loop active.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.46,
    gamma: 0.040,
    vega: 0.17,
    theta: -0.61,
    volume: 15400,
    price: 2.65,
    bid: 2.61,
    ask: 2.69,
    t1: 3.35,
    p1: 26
  },
  {
    id: 'spx-7640-c',
    ticker: 'SPX',
    strike: 7640,
    isCall: true,
    health: 88,
    expectedMove: '+30.2%',
    action: 'ENTER' as const,
    narrative: 'Rapid acceleration in order flow profile matches strong buy trend.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.52,
    gamma: 0.022,
    vega: 0.13,
    theta: -0.85,
    volume: 12401,
    price: 6.80,
    bid: 6.70,
    ask: 6.90,
    t1: 8.85,
    p1: 30
  },
  // SHELF: MISPRICED / ARBITRAGE
  {
    id: 'spy-442-p',
    ticker: 'SPY',
    strike: 442,
    isCall: false,
    health: 85,
    expectedMove: '+24.1%',
    action: 'HOLD' as const,
    narrative: 'Valuation curve points to an extreme temporary discount on deep puts.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: -0.12,
    gamma: 0.008,
    vega: 0.06,
    theta: -0.15,
    volume: 5310,
    price: 0.45,
    bid: 0.43,
    ask: 0.47,
    t1: 0.55,
    p1: 22
  },
  {
    id: 'spx-7650-c',
    ticker: 'SPX',
    strike: 7650,
    isCall: true,
    health: 83,
    expectedMove: '+18.5%',
    action: 'HOLD' as const,
    narrative: 'Priced exceptionally cheap relative to general spot move; heavy IV discount.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: 0.45,
    gamma: 0.020,
    vega: 0.14,
    theta: -0.83,
    volume: 8105,
    price: 5.10,
    bid: 5.00,
    ask: 5.20,
    t1: 6.05,
    p1: 18
  },
  {
    id: 'spy-508-p',
    ticker: 'SPY',
    strike: 508,
    isCall: false,
    health: 81,
    expectedMove: '+20.5%',
    action: 'HOLD' as const,
    narrative: 'Theoretical model price sits at $1.85, while active broker ask is $1.35.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: -0.38,
    gamma: 0.025,
    vega: 0.11,
    theta: -0.32,
    volume: 12502,
    price: 1.35,
    bid: 1.32,
    ask: 1.38,
    t1: 1.62,
    p1: 20
  },
  {
    id: 'spx-7590-p',
    ticker: 'SPX',
    strike: 7590,
    isCall: false,
    health: 84,
    expectedMove: '+27.0%',
    action: 'ENTER' as const,
    narrative: 'Implied volatility suppression created a perfect risk-to-reward underpricing node.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: -0.41,
    gamma: 0.018,
    vega: 0.13,
    theta: -0.75,
    volume: 7500,
    price: 12.80,
    bid: 12.60,
    ask: 13.00,
    t1: 16.25,
    p1: 27
  },
  {
    id: 'qqq-442-p',
    ticker: 'QQQ',
    strike: 442,
    isCall: false,
    health: 80,
    expectedMove: '+19.2%',
    action: 'HOLD' as const,
    narrative: 'Underpriced hedge option with high delta sensitivity relative to current spot.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: -0.39,
    gamma: 0.034,
    vega: 0.14,
    theta: -0.42,
    volume: 16210,
    price: 2.15,
    bid: 2.12,
    ask: 2.18,
    t1: 2.56,
    p1: 19
  },
  {
    id: 'ndx-18200-p',
    ticker: 'NDX',
    strike: 18200,
    isCall: false,
    health: 82,
    expectedMove: '+22.4%',
    action: 'HOLD' as const,
    narrative: 'Strong theoretical offset detected. Arbitrage spread calculated at 14.5%.',
    tagText: 'ARBITRAGE',
    shelf: 'mispriced',
    delta: -0.44,
    gamma: 0.014,
    vega: 0.18,
    theta: -1.10,
    volume: 3840,
    price: 42.10,
    bid: 41.50,
    ask: 42.70,
    t1: 51.50,
    p1: 22
  },
  // SHELF: INVALIDATION / BOUNDARIES
  {
    id: 'spx-7610-p',
    ticker: 'SPX',
    strike: 7610,
    isCall: false,
    health: 48,
    expectedMove: '-15.4%',
    action: 'REDUCE' as const,
    narrative: 'Slipped past main dealer GEX hedge floor. Tail risk exponentially flashing high.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.42,
    gamma: 0.021,
    vega: 0.13,
    theta: -0.85,
    volume: 15401,
    price: 18.50,
    bid: 18.30,
    ask: 18.70,
    t1: 15.65,
    p1: -15
  },
  {
    id: 'spy-440-p',
    ticker: 'SPY',
    strike: 440,
    isCall: false,
    health: 51,
    expectedMove: '-10.2%',
    action: 'SELL' as const,
    narrative: 'Liquidity sweep void detected below current level. Immediate defensive alert.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.10,
    gamma: 0.005,
    vega: 0.05,
    theta: -0.12,
    volume: 24500,
    price: 0.35,
    bid: 0.33,
    ask: 0.37,
    t1: 0.31,
    p1: -10
  },
  {
    id: 'spx-7580-p',
    ticker: 'SPX',
    strike: 7580,
    isCall: false,
    health: 41,
    expectedMove: '-24.0%',
    action: 'SELL' as const,
    narrative: 'Extreme threshold crossover boundary triggers automatic institutional liquidation.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.32,
    gamma: 0.016,
    vega: 0.12,
    theta: -0.80,
    volume: 11040,
    price: 8.50,
    bid: 8.35,
    ask: 8.65,
    t1: 6.45,
    p1: -24
  },
  {
    id: 'spy-502-p',
    ticker: 'SPY',
    strike: 502,
    isCall: false,
    health: 45,
    expectedMove: '-18.5%',
    action: 'SELL' as const,
    narrative: 'Brushed beneath primary dealer put wall support. Hedging dynamics turned negative.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.28,
    gamma: 0.022,
    vega: 0.09,
    theta: -0.28,
    volume: 19105,
    price: 2.10,
    bid: 2.05,
    ask: 2.15,
    t1: 1.71,
    p1: -18
  },
  {
    id: 'qqq-438-p',
    ticker: 'QQQ',
    strike: 438,
    isCall: false,
    health: 49,
    expectedMove: '-14.0%',
    action: 'REDUCE' as const,
    narrative: 'Unwinds beneath crucial volume-weighted index pivot. Support levels dissolve.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.31,
    gamma: 0.028,
    vega: 0.12,
    theta: -0.38,
    volume: 14210,
    price: 3.15,
    bid: 3.10,
    ask: 3.20,
    t1: 2.70,
    p1: -14
  },
  {
    id: 'ndx-18100-p',
    ticker: 'NDX',
    strike: 18100,
    isCall: false,
    health: 38,
    expectedMove: '-32.5%',
    action: 'SELL' as const,
    narrative: 'System score degraded as gamma flip point triggers extreme margin sell hedging.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.36,
    gamma: 0.010,
    vega: 0.16,
    theta: -1.02,
    volume: 2901,
    price: 28.50,
    bid: 28.00,
    ask: 29.00,
    t1: 19.20,
    p1: -32
  },
  // SHELF: WHALE SWEEPS
  {
    id: 'spx-7700-c',
    ticker: 'SPX',
    strike: 7700,
    isCall: true,
    health: 94,
    expectedMove: '+62.4%',
    action: 'ENTER' as const,
    narrative: 'Block institutional trades sweep SPX 7700 strike, representing $14.2M notional.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: 0.35,
    gamma: 0.018,
    vega: 0.15,
    theta: -0.78,
    volume: 62400,
    price: 2.45,
    bid: 2.40,
    ask: 2.50,
    t1: 3.98,
    p1: 62
  },
  {
    id: 'ndx-18500-c',
    ticker: 'NDX',
    strike: 18500,
    isCall: true,
    health: 91,
    expectedMove: '+75.0%',
    action: 'ENTER' as const,
    narrative: 'Massive out-of-the-money block trade cluster. Aggressive bullish volatility positioning.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: 0.30,
    gamma: 0.010,
    vega: 0.17,
    theta: -1.08,
    volume: 11400,
    price: 8.90,
    bid: 8.70,
    ask: 9.10,
    t1: 15.55,
    p1: 75
  },
  {
    id: 'spy-520-c',
    ticker: 'SPY',
    strike: 520,
    isCall: true,
    health: 89,
    expectedMove: '+44.1%',
    action: 'ENTER' as const,
    narrative: 'Sweeps executed on Ask price consistently over the last 10 minutes. Bull run.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: 0.34,
    gamma: 0.031,
    vega: 0.11,
    theta: -0.40,
    volume: 92400,
    price: 1.15,
    bid: 1.12,
    ask: 1.18,
    t1: 1.65,
    p1: 44
  },
  {
    id: 'qqq-455-c',
    ticker: 'QQQ',
    strike: 455,
    isCall: true,
    health: 88,
    expectedMove: '+38.5%',
    action: 'ENTER' as const,
    narrative: 'Multimillion institutional block sweep targeting the upper resistance channel wall.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: 0.32,
    gamma: 0.033,
    vega: 0.13,
    theta: -0.52,
    volume: 51200,
    price: 1.45,
    bid: 1.41,
    ask: 1.49,
    t1: 2.01,
    p1: 38
  },
  {
    id: 'spx-7500-p',
    ticker: 'SPX',
    strike: 7500,
    isCall: false,
    health: 85,
    expectedMove: '+52.0%',
    action: 'HOLD' as const,
    narrative: 'Huge defensive protective put basket sweep ($22.4M notional hedge) detected.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: -0.19,
    gamma: 0.010,
    vega: 0.09,
    theta: -0.55,
    volume: 48900,
    price: 4.80,
    bid: 4.70,
    ask: 4.90,
    t1: 7.30,
    p1: 52
  },
  {
    id: 'ndx-17800-p',
    ticker: 'NDX',
    strike: 17800,
    isCall: false,
    health: 83,
    expectedMove: '+48.5%',
    action: 'HOLD' as const,
    narrative: 'Significant tail protection sweep blocks are locking up hedge positions at put wall.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: -0.15,
    gamma: 0.008,
    vega: 0.12,
    theta: -0.78,
    volume: 8520,
    price: 12.40,
    bid: 12.10,
    ask: 12.70,
    t1: 18.40,
    p1: 48
  }
];

export const INITIAL_DISCOVERY_FEED_LOGS = [
  { timestamp: '01:34:25', ticker: 'SPX', strike: 7620, type: 'C', side: 'Sweep', size: '280 cons', premium: '$151,200', tag: 'BULLISH', action: 'SWEPT @ ASK' },
  { timestamp: '01:34:10', ticker: 'QQQ', strike: 448, type: 'C', side: 'Block', size: '1,200 cons', premium: '$504,000', tag: 'BULLISH', action: 'AT ASK' },
  { timestamp: '01:33:48', ticker: 'NDX', strike: 18350, type: 'C', side: 'Block', size: '150 cons', premium: '$232,500', tag: 'BULLISH', action: 'ABOVE ASK' },
  { timestamp: '01:33:02', ticker: 'SPY', strike: 508, type: 'P', side: 'Sweep', size: '2,500 cons', premium: '$337,500', tag: 'BEARISH', action: 'SWEPT @ ASK' },
  { timestamp: '01:31:55', ticker: 'SPX', strike: 7700, type: 'C', side: 'Block', size: '3,000 cons', premium: '$735,000', tag: 'BULLISH', action: 'OFF-EXCHANGE' },
  { timestamp: '01:30:22', ticker: 'NDX', strike: 17800, type: 'P', side: 'Sweep', size: '400 cons', premium: '$496,000', tag: 'HEDGE', action: 'SWEPT @ ASK' },
  { timestamp: '01:29:15', ticker: 'SPY', strike: 515, type: 'C', side: 'Sweep', size: '1,800 cons', premium: '$576,000', tag: 'BULLISH', action: 'SWEPT @ ASK' },
  { timestamp: '01:28:40', ticker: 'QQQ', strike: 455, type: 'C', side: 'Sweep', size: '2,400 cons', premium: '$348,000', tag: 'BULLISH', action: 'ABOVE ASK' }
];

