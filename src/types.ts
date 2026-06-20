/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AssetType = 'STOCKS' | 'ETFS' | 'INDEXES' | 'FUTURES' | 'FOREX' | 'CRYPTO';

export interface AssetInfo {
  key?: string;
  ticker: string;
  name: string;
  type: AssetType;
  defaultPrice: number;
  decimals: number;
  spread: number;
  volatility: number;
  unit: string;
  forecastScale?: number;
  stabilityMax?: number;
}

export type TimeframeVal = '1m' | '2m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D' | '1W';

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
  isDisplacement?: boolean;
  displacementType?: 'bullish' | 'bearish' | null;
  displacementScore?: number;
  relativeVolume?: number;
}

export type FVGState = 'ARMED' | 'TESTED' | 'HELD' | 'INVALIDATED' | 'COMPLETED';

export interface FairValueGap {
  id: string;
  type: 'bullish' | 'bearish';
  top: number;
  bottom: number;
  equilibrium: number;
  state: FVGState;
  createdAtIdx: number;
  testedAtIdx?: number;
  heldAtIdx?: number;
  invalidatedAtIdx?: number;
  completedAtIdx?: number;
}

export interface LiquidityEvent {
  id: string;
  label: 'Liquidity Sweep High' | 'Liquidity Sweep Low' | 'Stop Run' | 'External Liquidity Grab' | 'Internal Liquidity Grab';
  price: number;
  candleIdx: number;
  type: 'bullish' | 'bearish' | 'neutral';
}

export interface TargetLevel {
  id: string;
  label: string;
  price: number;
  distancePct: number;
  probabilityPct: number;
  confidence: 'High' | 'Moderate' | 'Stretch';
}

export interface PerformanceLog {
  id: string;
  ticker: string;
  timeframe: string;
  date: string;
  direction: 'BULLISH' | 'BEARISH';
  displacementScore: number;
  entry: number;
  target: number;
  stopLoss: number;
  exitPrice: number;
  result15m: number;
  result30m: number;
  result60m: number;
  resultEOD: number;
  mfe: number;
  mae: number;
  pnl: number;
  rMultiple: number;
  isCompleted: boolean;
}

export interface V8TradeRecord {
  id: string;
  timestamp: string;
  underlying: string;
  contract: string;
  direction: 'BULLISH' | 'BEARISH';
  entryPrice: number;
  underlyingPrice: number;
  iv: number;
  greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
  };
  vwapState: string;
  rsiState: string;
  structureState: string;
  rvolState: string;
  gexState: string;
  dealerPositioning: string;
  expectedReturn: number;
  expectedDrawdown: number;
  probabilityPositive: number;
  thesisStability: number;
  recommendation: 'ENTER' | 'HOLD' | 'REDUCE' | 'EXIT';
  target1: number;
  target2: number;
  target3: number;
  stretchTarget: number;
  stopLoss: number;
  
  // Real-time tracking outcomes
  target1Hit: boolean;
  target2Hit: boolean;
  target3Hit: boolean;
  stretchTargetHit: boolean;
  target1HitTime: number | null; // seconds/minutes simulated elapsed
  target2HitTime: number | null;
  target3HitTime: number | null;
  stretchTargetHitTime: number | null;
  
  maxGain: number; // max percentage gain
  maxDrawdown: number; // max percentage drawdown
  timeTaken: number; // simulated elapsed time until exit
  whatTargetReachedFirst: string;
  finalOutcome: 'Target 1 Winner' | 'Target 2 Winner' | 'Target 3 Winner' | 'Stretch Winner' | 'Failure' | 'Active';
  failureReasons: string[];
  version?: string;
  closeTs?: string;
}

export interface CalibrationBucket {
  range: string; // e.g. "70-75%"
  minProb: number;
  maxProb: number;
  predictedCount: number;
  actualWins: number;
  winRate: number;
  calibrationState: 'Good' | 'Bad' | 'Under-performing' | 'No Data';
}

export interface TargetReliability {
  label: string;
  predictedProb: number;
  actualHitCount: number;
  totalAttempts: number;
  actualHitRate: number;
}

export interface StrategyInsight {
  bestRegime: string;
  worstRegime: string;
  bestTimeOfDay: string;
  bestGexState: string;
  bestRsiStructure: string;
}

export interface AuditStats {
  winRate: number;
  profitFactor: number;
  averageR: number;
  averageExpectancy: number; // Avg standard deviation/expectation of return
  totalTrades: number;
  bestCondition: string;
  worstCondition: string;
}

export interface SystemScore {
  total: number;
  displacementQuality: number;
  volumeExpansion: number;
  rsiCascade: number;
  vwapAlignment: number;
  structureQuality: number;
  liquiditySweep: number;
  htfAgreement: number;
  volatilityRegime: number;
  premiumDiscount: number;
  momentumAcceleration: number;
}

export interface GexStrikeDetail {
  strike: number;
  index?: number;
  callGex: number;
  putGex: number;
  netGex: number;
  callOi: number;
  putOi: number;
  callVolume: number;
  putVolume: number;
  callDex?: number;
  putDex?: number;
  netDex?: number;
  callVex?: number;
  putVex?: number;
  netVex?: number;
}

export interface GexProfileData {
  spot?: number;
  netGex?: number;
  netDex?: number;
  netVex?: number;
  callWall?: number;
  putWall?: number;
  gammaFlip?: number;
  magnet?: number;
  totalCallOi?: number;
  totalPutOi?: number;
  callPutOiRatio?: string;
  expectedMovePct?: number;
  feed?: string;
  strikes?: GexStrikeDetail[];
}

export interface DealerComponent {
  name: string;
  detail: string;
  value: number;
  weight: number;
}

export interface DealerFlowData {
  bias?: string;
  pressure?: number;
  headline?: string;
  components?: DealerComponent[];
}

export interface VolatilityData {
  energy?: number;
  atrPercentile?: number | string;
  atrSlope?: number;
  regime?: string;
  squeeze?: boolean;
}

export interface StructureEvent {
  id: string;
  kind: string;
  direction: string;
  price: number;
}

export interface MarketStructure {
  trend?: string;
  pricePosition?: string;
  events?: StructureEvent[];
}

export interface DisplacementZone {
  id: string;
  type: string;
  bottom: number;
  top: number;
  state: string;
  atrMultiple: number;
  bodyDominance: number;
  score: number;
}

export interface DisplacementData {
  volatility?: VolatilityData;
  structure?: MarketStructure;
  zones?: DisplacementZone[];
  fvgs?: FairValueGap[];
  sweeps?: LiquidityEvent[];
}

export interface ExpectedMoveData {
  pct?: string;
  [key: string]: any;
}

export interface PinpointLevel {
  strike: number;
  gexDollars?: number;
  strength: number;
  label?: string;
  isPutWall?: boolean;
  isCallWall?: boolean;
}

export interface PinpointMapData {
  levels?: PinpointLevel[];
  spot_price?: number;
  step?: number;
}

export interface ProvenanceInputs {
  option_type?: 'C' | 'P';
  underlying_price?: number;
  [key: string]: any;
}

export interface ProvenanceData {
  inputs?: ProvenanceInputs;
  audit_id?: string;
  [key: string]: any;
}

export interface DealerMetricsData {
  bias?: string;
  volState?: string;
  magnetStrike?: number;
  flipLevel?: number;
  callWall?: number;
  putWall?: number;
  dealerScore?: number;
}

export interface StrikeMetricsData {
  gammaContribution?: string;
  totalOi?: number;
  netExposure?: string;
  callPutRatio?: string;
  hedgeSensitivity?: string;
  dealerExposure?: string;
  deltaContribution?: string;
}

export interface ImpactContract {
  rank: number;
  contract: string;
  expiration: string;
  oi: number;
  volume: number;
  deltaNotional: string;
  gammaContribution: string;
}

export interface WhaleDirectionData {
  contract: string;
  size: string;
}

export interface WhaleDetectionData {
  bullish?: WhaleDirectionData;
  bearish?: WhaleDirectionData;
  largestCall?: string;
  largestPut?: string;
}

export interface FlowFeedItem {
  id: string;
  type: string;
  contract: string;
  desc: string;
}

export interface DeepIntelligenceData {
  dealer_metrics?: DealerMetricsData;
  strike_metrics?: StrikeMetricsData;
  commentary?: string[];
  impact_contracts?: ImpactContract[];
  whale_detection?: WhaleDetectionData;
  flow_feed?: FlowFeedItem[];
}

export interface ServerStatePayload {
  [key: string]: any;
  contract: string;
  recommendation: 'ENTER' | 'HOLD' | 'REDUCE' | 'EXIT';
  optionPremiumFloat: number;
  optionStrike: number;
  data_source: string;
  api_status_message?: string;
  trade_health: number;
  expected_move?: ExpectedMoveData;
  targets?: any[];
  candles?: Candle[];
  trade_archive?: V8TradeRecord[];
  gex_profile?: GexProfileData;
  dealer_flow?: DealerFlowData;
  displacement?: DisplacementData;
  candle_feed?: string;
  pinpoint_map?: PinpointMapData;
  provenance?: ProvenanceData;
  deep_intelligence?: DeepIntelligenceData;
  hud_metrics?: {
    reflexivity_vector: string;
    systemic_fragility: string;
    campaign_state: string;
    propagation_path: string;
  };
}

