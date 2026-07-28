export type RadarDirection = "COMPRA" | "VENDA" | "AGUARDAR";
export type RadarTrend = "ALTA" | "BAIXA" | "LATERAL";
export type TradeSide = "BUY" | "SELL";
export type DemoSymbol = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
export type RadarSymbol = DemoSymbol;
export type TriggerKind = "breakout" | "retest" | "pullback" | null;
export type TriggerStage = "confirmed" | "forming" | "none" | "invalid";
type QualitySeverity = "block" | "penalty";
export type DecisionState = "SEM_SETUP" | "CONTEXTO_FORMANDO" | "SETUP_QUASE_PRONTO" | "BLOQUEADO_RISCO" | "ENTRADA_APROVADA" | "ERRO";
export type MarketRegime =
  | "TREND_CLEAN"
  | "TREND_STRETCHED"
  | "MOMENTUM"
  | "TRANSITION"
  | "LATERAL"
  | "CHAOTIC"
  | "INSUFFICIENT_DATA";
export type AdaptiveStrategy = "CONTINUATION_RETEST" | "CONTINUATION_MOMENTUM" | "NONE";

export interface DemoSignalInput {
  pair: string;
  decision: "BUY" | "SELL" | "SEM ENTRADA";
  entryNum: number | null;
  stopLossNum: number | null;
  target1Num: number | null;
  target2Num: number | null;
  riskReward: string | null;
  signalKey?: string;
  steps?: Array<{ number?: number; name?: string; value?: string; reason?: string }>;
}

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface LastTradeContext {
  direction: TradeSide;
  exitReason: string | null;
  target1Hit: boolean;
  target2Hit: boolean;
  closeTime: number | null;
  signalKey?: string | null;
}

export interface MarketReorganizationResult {
  reorganized: boolean;
  reasons: string[];
  missingConditions: string[];
}

export interface MarketRegimeAnalysis {
  regime: MarketRegime;
  confidence: number;
  direction: TradeSide | "NONE";
  reasons: string[];
  warnings: string[];
  ema200DistancePctSigned: number | null;
  ema200DistanceAtr: number | null;
  ema9DistancePct: number | null;
  ema21DistancePct: number | null;
  atr5m: number | null;
  atr15m: number | null;
  atr1h: number | null;
  sameDirectionCandles: number;
  candleAlternationRate: number;
  averageWickBodyRatio: number | null;
  volumeRelative: number | null;
  volumeDelta: number | null;
  trendEfficiency: number | null;
  stretchedEvidence: {
    move5Pct: number | null;
    move5AtrMultiple: number | null;
    ema9DistancePct: number | null;
    ema21DistancePct: number | null;
    ema200Far: boolean;
    ema200CombinedExtension: boolean;
    ema200CombinedEvidence: string[];
    sameDirectionCandles: number;
    extreme: boolean;
  };
  chaoticEvidence: {
    candleAlternationRate: number;
    averageWickBodyRatio: number | null;
    trendEfficiency: number | null;
    high: boolean;
  };
}

export interface StrategySelection {
  selectedStrategy: AdaptiveStrategy;
  direction: TradeSide | "NONE";
  approved: boolean;
  reason: string;
  blockedReasons: string[];
  requiredConditions: string[];
  regime: MarketRegime;
  confidence: number;
  score: number;
  conditionsPassed: string[];
  conditionsMissing: string[];
}

export interface TrendDetails {
  trend: RadarTrend;
  ema9: number;
  ema21: number;
  ema200: number | null;
  ema21Slope: number;
  higherHighs: boolean;
  higherLows: boolean;
  lowerHighs: boolean;
  lowerLows: boolean;
  bullishVotes: number;
  bearishVotes: number;
}

export interface QualityFilter {
  name: string;
  passed: boolean;
  reason: string;
  penalty?: number;
  severity?: QualitySeverity;
  details?: Record<string, string | number | boolean | null>;
}

export type ChecklistKey = "trend1h" | "trend15m" | "trigger5m" | "volume" | "rr" | "notLateral";

export interface RadarChecklistItem {
  key: ChecklistKey;
  label: string;
  passed: boolean;
  detail: string;
}

export interface RadarEntryPlan {
  aggressive: number | null;
  conservative: number | null;
}

interface TriggerResult {
  direction: RadarDirection;
  aggressive: number | null;
  conservative: number | null;
  confirmation: string | null;
  risk: string | null;
  kind: TriggerKind;
  stage: TriggerStage;
  level: number | null;
  retestValid: boolean;
  missing: string | null;
}

export interface RadarLikeAnalysis {
  symbol: DemoSymbol;
  displayPrice: number | null;
  decisionPrice: number | null;
  trend1h: RadarTrend;
  trend15m: RadarTrend;
  trigger5m: RadarDirection;
  triggerKind: TriggerKind;
  triggerLevel: number | null;
  retestValid: boolean;
  suggestedDirection: RadarDirection;
  support: number | null;
  resistance: number | null;
  aggressiveEntry: number | null;
  conservativeEntry: number | null;
  stop: number | null;
  target1: number | null;
  target2: number | null;
  rr: number | null;
  score: number;
  scoreContextual: number;
  scoreOperacional: number;
  decisionState: DecisionState;
  missingConditions: string[];
  decisiveReason: string;
  triggerStage: TriggerStage;
  rrStatus: "pending" | "valid" | "invalid";
  classification: "AGUARDAR" | "SINAL FRACO" | "SINAL VALIDO" | "SINAL FORTE";
  checklist: RadarChecklistItem[];
  recentHigh: number | null;
  recentLow: number | null;
  generatedAt: string;
  confirmations: string[];
  blockedReasons: string[];
  criticalBlockedReasons: string[];
  warnings: string[];
  qualityPenalties: string[];
  risks: string[];
  scoreItems: Array<{ label: string; points: number; detail: string }>;
  qualityFilters: QualityFilter[];
  volume: { current: number; average20: number; relative: number; delta5: number; expanding: boolean; veryWeak: boolean } | null;
  signalKey: string;
  marketRegime: MarketRegimeAnalysis;
  strategySelection: StrategySelection;
  selectedStrategy: AdaptiveStrategy;
  strategyScore: number;
  ema200DistancePctSigned: number | null;
  ema200DistanceAtr: number | null;
  stretchedEvidence: MarketRegimeAnalysis["stretchedEvidence"];
  chaoticEvidence: MarketRegimeAnalysis["chaoticEvidence"];
  lastTradeDirection: TradeSide | null;
  lastTradeExitReason: string | null;
  lastTradeTarget1Hit: boolean | null;
  lastTradeTarget2Hit: boolean | null;
  marketReorganized: boolean | null;
  reorganizationReasons: string[];
  momentumConditionsPassed: string[];
  momentumConditionsMissing: string[];
  diagnostics: {
    trend1h: TrendDetails | null;
    trend15m: TrendDetails | null;
    rawScore: number;
    supportResistanceZone: string;
  };
}

const ALLOWED_SYMBOLS = new Set<DemoSymbol>(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
const MIN_1H_CANDLES = 205;
const MIN_15M_CANDLES = 40;
const MIN_5M_CANDLES = 30;
const MIN_EMA200_WARMUP = 200;

export const DEMO_EXHAUSTION_CONFIG = {
  minRiskReward: 2,
  retestTolerancePct: 0.0015,
  maxStretchedMovePct: 0.012,
  stretchedAtrMultiple: 1.6,
  extremeStretchedMovePct: 0.024,
  extremeStretchedAtrMultiple: 3.2,
  maxSameDirectionCandles: 3,
  allowedFourthCandle: 4,
  climaxRangeAtrMultiple: 2.2,
  climaxBodyAvgMultiple: 1.8,
  rejectionWickBodyMultiple: 1.5,
  aggressiveRejectionWickBodyMultiple: 1.2,
  minVolumeRelative: 0.8,
  preferredVolumeRelative: 1,
  volumeExhaustionRelative: 1.8,
  bySymbol: {
    BTCUSDT: { maxEma9DistancePct: 0.004, maxEma21DistancePct: 0.006 },
    ETHUSDT: { maxEma9DistancePct: 0.004, maxEma21DistancePct: 0.006 },
    SOLUSDT: { maxEma9DistancePct: 0.006, maxEma21DistancePct: 0.008 },
  } satisfies Record<DemoSymbol, { maxEma9DistancePct: number; maxEma21DistancePct: number }>,
};

export const DEMO_ADAPTIVE_CONFIG = {
  minOperationalScore: 70,
  momentumMinVolumeRelative: 1,
  momentumPreferredVolumeRelative: 1.12,
  momentumStrongBodyRatio: 0.55,
  chaoticAlternationRate: 0.68,
  chaoticWickBodyRatio: 1.8,
  chaoticTrendEfficiency: 0.35,
  cleanTrendEfficiency: 0.48,
  ema200FarDistancePct: 0.025,
  ema200FarAtrMultiple: 8,
  reorganizationMaxSameDirectionCandles: 2,
  reorganizationMaxVolumeRelative: 1.5,
  reorganizationMinVolumeRelative: 0.8,
};

function finite(n: number): boolean {
  return Number.isFinite(n);
}

function validCandle(candle: Candle): boolean {
  const values = [candle.openTime, candle.open, candle.high, candle.low, candle.close, candle.volume, candle.closeTime];
  if (values.some((value) => !Number.isFinite(value))) return false;
  if (candle.closeTime <= candle.openTime) return false;
  if (candle.open < 0 || candle.high < 0 || candle.low < 0 || candle.close < 0 || candle.volume < 0) return false;
  if (candle.high < Math.max(candle.open, candle.close, candle.low)) return false;
  if (candle.low > Math.min(candle.open, candle.close, candle.high)) return false;
  return true;
}

function closedCandles(candles: Candle[], now = Date.now()): Candle[] {
  return candles.filter((candle) => candle.closeTime <= now && validCandle(candle));
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

function last<T>(items: T[]): T | null {
  return items.length > 0 ? items[items.length - 1] : null;
}

function swingHighIndices(candles: Candle[], lookback = 2): number[] {
  const out: number[] = [];
  // Pivos so sao confirmados depois das duas velas seguintes fecharem.
  // Backtests futuros nao devem tratar a vela do pivo como momento do sinal.
  for (let i = lookback; i < candles.length - lookback; i++) {
    const high = candles[i].high;
    const left = candles.slice(i - lookback, i);
    const right = candles.slice(i + 1, i + lookback + 1);
    if (left.every((c) => c.high < high) && right.every((c) => c.high < high)) out.push(i);
  }
  return out;
}

function swingLowIndices(candles: Candle[], lookback = 2): number[] {
  const out: number[] = [];
  // Pivos so sao confirmados depois das duas velas seguintes fecharem.
  // Backtests futuros nao devem tratar a vela do pivo como momento do sinal.
  for (let i = lookback; i < candles.length - lookback; i++) {
    const low = candles[i].low;
    const left = candles.slice(i - lookback, i);
    const right = candles.slice(i + 1, i + lookback + 1);
    if (left.every((c) => c.low > low) && right.every((c) => c.low > low)) out.push(i);
  }
  return out;
}

function pivots(candles: Candle[]) {
  return {
    highs: swingHighIndices(candles).map((index) => ({ index, value: candles[index].high })),
    lows: swingLowIndices(candles).map((index) => ({ index, value: candles[index].low })),
  };
}

function structureFromPivots(candles: Candle[]) {
  const p = pivots(candles);
  const highs = p.highs.slice(-3);
  const lows = p.lows.slice(-3);
  return {
    higherHighs: highs.length >= 2 && highs[highs.length - 1].value > highs[highs.length - 2].value,
    lowerHighs: highs.length >= 2 && highs[highs.length - 1].value < highs[highs.length - 2].value,
    higherLows: lows.length >= 2 && lows[lows.length - 1].value > lows[lows.length - 2].value,
    lowerLows: lows.length >= 2 && lows[lows.length - 1].value < lows[lows.length - 2].value,
  };
}

function trendFor(candles: Candle[], includeEma200: boolean): TrendDetails {
  if (includeEma200 && candles.length < MIN_EMA200_WARMUP) {
    return { trend: "LATERAL", ema9: 0, ema21: 0, ema200: null, ema21Slope: 0, higherHighs: false, higherLows: false, lowerHighs: false, lowerLows: false, bullishVotes: 0, bearishVotes: 0 };
  }
  const closes = candles.map((c) => c.close);
  const ema9Series = ema(closes, 9);
  const ema21Series = ema(closes, 21);
  const ema200Series = includeEma200 ? ema(closes, 200) : [];
  const current = last(candles)?.close ?? 0;
  const ema9 = last(ema9Series) ?? 0;
  const ema21 = last(ema21Series) ?? 0;
  const ema200 = includeEma200 ? last(ema200Series) ?? null : null;
  const ema21Prev = ema21Series[Math.max(0, ema21Series.length - 6)] ?? ema21;
  const ema21Slope = ema21 > 0 ? (ema21 - ema21Prev) / ema21 : 0;
  const structure = structureFromPivots(candles);
  const bullishVotes = [
    includeEma200 ? current > (ema200 ?? Number.POSITIVE_INFINITY) : current > ema21,
    ema9 > ema21,
    structure.higherHighs && structure.higherLows,
    ema21Slope > 0,
  ].filter(Boolean).length;
  const bearishVotes = [
    includeEma200 ? current < (ema200 ?? Number.NEGATIVE_INFINITY) : current < ema21,
    ema9 < ema21,
    structure.lowerHighs && structure.lowerLows,
    ema21Slope < 0,
  ].filter(Boolean).length;
  let trend: RadarTrend = "LATERAL";
  if (bullishVotes >= 3) trend = "ALTA";
  if (bearishVotes >= 3) trend = "BAIXA";
  return { trend, ema9, ema21, ema200, ema21Slope, ...structure, bullishVotes, bearishVotes };
}

function supportResistance(candles: Candle[], price: number) {
  const p = pivots(candles);
  const highs = p.highs.map((item) => item.value);
  const lows = p.lows.map((item) => item.value);
  const resistance = highs.filter((value) => value > price * 1.0003).sort((a, b) => a - b)[0] ?? null;
  const support = lows.filter((value) => value < price * 0.9997).sort((a, b) => b - a)[0] ?? null;
  const breakoutResistance = highs.filter((value) => value < price * 1.001).sort((a, b) => b - a)[0] ?? resistance;
  const breakdownSupport = lows.filter((value) => value > price * 0.999).sort((a, b) => a - b)[0] ?? support;
  const recent = candles.slice(-20);
  const recentHigh = recent.length > 0 ? Math.max(...recent.map((c) => c.high)) : null;
  const recentLow = recent.length > 0 ? Math.min(...recent.map((c) => c.low)) : null;
  return { support, resistance, breakoutResistance, breakdownSupport, recentHigh, recentLow };
}

function volumeDetails(candles: Candle[]) {
  if (candles.length < 26) return null;
  const current = candles[candles.length - 1].volume;
  const average20 = average(candles.slice(-21, -1).map((c) => c.volume));
  const prevAvg = average(candles.slice(-10, -5).map((c) => c.volume));
  const currentAvg = average(candles.slice(-5).map((c) => c.volume));
  const relative = average20 > 0 ? current / average20 : 0;
  const delta5 = prevAvg > 0 ? (currentAvg - prevAvg) / prevAvg : 0;
  return { current, average20, relative, delta5, expanding: relative >= 1 && delta5 > 0.08, veryWeak: relative < 0.5 };
}

function candleConfirms(candle: Candle, direction: Exclude<RadarDirection, "AGUARDAR">): boolean {
  const body = Math.abs(candle.close - candle.open);
  const range = candle.high - candle.low;
  if (!finite(range) || range <= 0) return false;
  const bodyRatio = body / range;
  return direction === "COMPRA"
    ? candle.close > candle.open && bodyRatio >= 0.35
    : candle.close < candle.open && bodyRatio >= 0.35;
}

function trigger5m(candles5m: Candle[], direction: RadarDirection, breakoutResistance: number | null, breakdownSupport: number | null, volumeOk: boolean): TriggerResult {
  const lastClosed = last(candles5m);
  const previous = candles5m[candles5m.length - 2] ?? null;
  if (direction === "AGUARDAR" || !lastClosed || !previous) {
    return { direction: "AGUARDAR", aggressive: null, conservative: null, confirmation: null, risk: "Timeframes maiores sem direcao operacional.", kind: null, stage: "none", level: null, retestValid: false, missing: "direcao operacional" };
  }
  const tolerance = DEMO_EXHAUSTION_CONFIG.retestTolerancePct;
  const atr5 = atr(candles5m, 14);
  const zoneTolerance = Math.max(tolerance, lastClosed.close > 0 ? (atr5 / lastClosed.close) * 0.35 : tolerance);
  if (direction === "COMPRA") {
    const level = breakoutResistance;
    if (!level) return { direction: "AGUARDAR", aggressive: null, conservative: null, confirmation: null, risk: "Sem resistencia confirmada para validar rompimento.", kind: null, stage: "none", level: null, retestValid: false, missing: "resistencia confirmada" };
    const breakout = previous.close <= level && lastClosed.close > level && candleConfirms(lastClosed, "COMPRA") && volumeOk;
    const forming = lastClosed.close > previous.close && lastClosed.close > lastClosed.open && lastClosed.close >= level * (1 - zoneTolerance);
    // Reteste real exige que o nivel ja tenha sido rompido ANTES desta vela (previous.close > level).
    // A propria vela de rompimento inicial nao pode se autoclassificar como reteste.
    const levelAlreadyBroken = previous.close > level;
    const touchedRetestZone = levelAlreadyBroken && lastClosed.low <= level * (1 + zoneTolerance);
    const reactedFromRetest = lastClosed.close > level && lastClosed.close > lastClosed.open && candleConfirms(lastClosed, "COMPRA");
    const previousAlreadyConfirmed = previous.low <= level * (1 + zoneTolerance)
      && previous.close > level
      && previous.close > previous.open
      && candleConfirms(previous, "COMPRA");
    const controlledPullback = levelAlreadyBroken && previous.low <= level * (1 + zoneTolerance * 1.5) && lastClosed.close > previous.close && candleConfirms(lastClosed, "COMPRA");
    const retest = !previousAlreadyConfirmed && touchedRetestZone && reactedFromRetest && volumeOk;
    const pullback = !previousAlreadyConfirmed && !retest && controlledPullback && volumeOk && !breakout;
    return {
      direction: breakout || retest || pullback ? "COMPRA" : "AGUARDAR",
      aggressive: breakout ? lastClosed.close : level * 1.001,
      conservative: retest || pullback ? lastClosed.close : null,
      confirmation: retest ? "Reteste real confirmado no 5m." : pullback ? "Retomada conservadora dentro da zona/ATR confirmada no 5m." : breakout ? "Rompimento confirmado no 5m; aguardando reteste para o robo." : null,
      risk: breakout || retest || pullback ? null : "Aguardando rompimento, retomada ou reteste confirmado no 5m.",
      kind: retest ? "retest" : pullback ? "pullback" : breakout ? "breakout" : null,
      stage: retest || pullback ? "confirmed" : breakout || forming ? "forming" : "none",
      level,
      retestValid: retest || pullback,
      missing: retest || pullback ? null : breakout || forming ? "reteste/confirmacao conservadora" : "gatilho 5m",
    };
  }
  const level = breakdownSupport;
  if (!level) return { direction: "AGUARDAR", aggressive: null, conservative: null, confirmation: null, risk: "Sem suporte confirmado para validar rompimento.", kind: null, stage: "none", level: null, retestValid: false, missing: "suporte confirmado" };
  const breakout = previous.close >= level && lastClosed.close < level && candleConfirms(lastClosed, "VENDA") && volumeOk;
  const forming = lastClosed.close < previous.close && lastClosed.close < lastClosed.open && lastClosed.close <= level * (1 + zoneTolerance);
  // Reteste real exige que o nivel ja tenha sido rompido ANTES desta vela (previous.close < level).
  // A propria vela de rompimento inicial nao pode se autoclassificar como reteste.
  const levelAlreadyBrokenDown = previous.close < level;
  const touchedRetestZone = levelAlreadyBrokenDown && lastClosed.high >= level * (1 - zoneTolerance);
  const reactedFromRetest = lastClosed.close < level && lastClosed.close < lastClosed.open && candleConfirms(lastClosed, "VENDA");
  const previousAlreadyConfirmed = previous.high >= level * (1 - zoneTolerance)
    && previous.close < level
    && previous.close < previous.open
    && candleConfirms(previous, "VENDA");
  const controlledPullback = levelAlreadyBrokenDown && previous.high >= level * (1 - zoneTolerance * 1.5) && lastClosed.close < previous.close && candleConfirms(lastClosed, "VENDA");
  const retest = !previousAlreadyConfirmed && touchedRetestZone && reactedFromRetest && volumeOk;
  const pullback = !previousAlreadyConfirmed && !retest && controlledPullback && volumeOk && !breakout;
  return {
    direction: breakout || retest || pullback ? "VENDA" : "AGUARDAR",
    aggressive: breakout ? lastClosed.close : level * 0.999,
    conservative: retest || pullback ? lastClosed.close : null,
    confirmation: retest ? "Reteste real confirmado no 5m." : pullback ? "Retomada conservadora dentro da zona/ATR confirmada no 5m." : breakout ? "Rompimento confirmado no 5m; aguardando reteste para o robo." : null,
    risk: breakout || retest || pullback ? null : "Aguardando rompimento, retomada ou reteste confirmado no 5m.",
    kind: retest ? "retest" : pullback ? "pullback" : breakout ? "breakout" : null,
    stage: retest || pullback ? "confirmed" : breakout || forming ? "forming" : "none",
    level,
    retestValid: retest || pullback,
    missing: retest || pullback ? null : breakout || forming ? "reteste/confirmacao conservadora" : "gatilho 5m",
  };
}

function rrPlan(direction: RadarDirection, entry: number | null, support: number | null, resistance: number | null, breakoutResistance: number | null, breakdownSupport: number | null) {
  if (direction === "AGUARDAR" || entry === null) return { stop: null, target1: null, target2: null, rr: null, valid: false, stopTooFar: false };
  const stop = direction === "COMPRA"
    ? [support, breakoutResistance].filter((value): value is number => value !== null && value < entry).map((value) => value * 0.999).sort((a, b) => b - a)[0] ?? null
    : [resistance, breakdownSupport].filter((value): value is number => value !== null && value > entry).map((value) => value * 1.001).sort((a, b) => a - b)[0] ?? null;
  if (stop === null || entry <= 0 || stop <= 0 || !finite(entry) || !finite(stop)) return { stop, target1: null, target2: null, rr: null, valid: false, stopTooFar: false };
  const risk = Math.abs(entry - stop);
  const stopTooFar = risk / entry > 0.012;
  const target1 = direction === "COMPRA" ? entry + risk * 2 : entry - risk * 2;
  const target2 = direction === "COMPRA" ? entry + risk * 3 : entry - risk * 3;
  const rr = risk > 0 ? Math.abs(target1 - entry) / risk : null;
  const values = [entry, stop, target1, target2, rr ?? 0, risk];
  const validNumbers = values.every((value) => finite(value) && value > 0);
  const validBuy = direction !== "COMPRA" || (stop < entry && target1 > entry && target2 > target1);
  const validSell = direction !== "VENDA" || (stop > entry && target1 < entry && target2 < target1);
  const valid = validNumbers && validBuy && validSell;
  return valid
    ? { stop, target1, target2, rr, valid, stopTooFar }
    : { stop, target1: null, target2: null, rr: null, valid: false, stopTooFar };
}

function atr(candles: Candle[], period: number): number {
  const trs = candles.slice(1).map((c, index) => {
    const prev = candles[index];
    return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  });
  return average(trs.slice(-period));
}

function sameDirectionRun(candles: Candle[], side: TradeSide): number {
  let count = 0;
  for (const candle of candles.slice(-8).reverse()) {
    const same = side === "BUY" ? candle.close > candle.open : candle.close < candle.open;
    if (!same) break;
    count++;
  }
  return count;
}

function pctDistance(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || !finite(a) || !finite(b) || a <= 0) return null;
  return Math.abs(a - b) / a;
}

function signedPctDistance(price: number | null, reference: number | null | undefined): number | null {
  if (price == null || reference == null || !finite(price) || !finite(reference) || price <= 0) return null;
  return (price - reference) / price;
}

function candleDirection(candle: Candle): TradeSide | "NONE" {
  if (candle.close > candle.open) return "BUY";
  if (candle.close < candle.open) return "SELL";
  return "NONE";
}

function candleAlternationRate(candles: Candle[]): number {
  const recent = candles.slice(-16).map(candleDirection).filter((direction) => direction !== "NONE");
  if (recent.length < 2) return 0;
  let alternations = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] !== recent[i - 1]) alternations++;
  }
  return alternations / (recent.length - 1);
}

function averageWickBodyRatio(candles: Candle[]): number | null {
  const ratios = candles.slice(-12).map((candle) => {
    const body = Math.abs(candle.close - candle.open);
    const wick = (candle.high - candle.low) - body;
    return body > 0 && finite(wick) ? Math.max(0, wick) / body : null;
  }).filter((value): value is number => value !== null);
  return ratios.length > 0 ? average(ratios) : null;
}

function trendEfficiency(candles: Candle[]): number | null {
  const recent = candles.slice(-20);
  if (recent.length < 2) return null;
  const net = Math.abs(recent[recent.length - 1].close - recent[0].close);
  let path = 0;
  for (let i = 1; i < recent.length; i++) path += Math.abs(recent[i].close - recent[i - 1].close);
  return path > 0 ? net / path : null;
}

function directionFromRadar(direction: RadarDirection): TradeSide | "NONE" {
  if (direction === "COMPRA") return "BUY";
  if (direction === "VENDA") return "SELL";
  return "NONE";
}

function closeBeyondLevel(candle: Candle | null | undefined, side: TradeSide, level: number | null): boolean {
  if (!candle || level == null) return false;
  return side === "BUY" ? candle.close > level : candle.close < level;
}

function candleBodyRatio(candle: Candle | null | undefined): number {
  if (!candle) return 0;
  const range = candle.high - candle.low;
  return range > 0 ? Math.abs(candle.close - candle.open) / range : 0;
}

export function classifyMarketRegime(input: {
  symbol: DemoSymbol;
  decisionPrice: number | null;
  candles1h: Candle[];
  candles15m: Candle[];
  candles5m: Candle[];
  trend1h: TrendDetails | null;
  trend15m: TrendDetails | null;
  contextDirection: RadarDirection;
  volume: RadarLikeAnalysis["volume"];
  insufficient: boolean;
}): MarketRegimeAnalysis {
  const side = directionFromRadar(input.contextDirection);
  const last5m = last(input.candles5m);
  const atr5m = atr(input.candles5m, 14) || null;
  const atr15m = atr(input.candles15m, 14) || null;
  const atr1h = atr(input.candles1h, 14) || null;
  const ema200DistancePctSigned = signedPctDistance(input.decisionPrice, input.trend1h?.ema200);
  const ema200DistanceAtr = input.decisionPrice != null && input.trend1h?.ema200 != null && atr1h && atr1h > 0
    ? (input.decisionPrice - input.trend1h.ema200) / atr1h
    : null;
  const ema9DistancePct = pctDistance(input.decisionPrice, input.trend15m?.ema9);
  const ema21DistancePct = pctDistance(input.decisionPrice, input.trend15m?.ema21);
  const move5Abs = input.candles5m.length >= 6 && input.decisionPrice != null ? Math.abs(input.decisionPrice - input.candles5m[input.candles5m.length - 6].close) : null;
  const move5Pct = move5Abs != null && input.decisionPrice != null && input.decisionPrice > 0 ? move5Abs / input.decisionPrice : null;
  const move5AtrMultiple = move5Abs != null && atr5m && atr5m > 0 ? move5Abs / atr5m : null;
  const sameDirectionCandles = side === "NONE"
    ? Math.max(sameDirectionRun(input.candles5m, "BUY"), sameDirectionRun(input.candles5m, "SELL"))
    : sameDirectionRun(input.candles5m, side);
  const alternationRate = candleAlternationRate(input.candles5m);
  const wickBodyRatio = averageWickBodyRatio(input.candles5m);
  const efficiency = trendEfficiency(input.candles5m);
  const symbolCfg = DEMO_EXHAUSTION_CONFIG.bySymbol[input.symbol];
  const extreme = (move5Pct ?? 0) > DEMO_EXHAUSTION_CONFIG.extremeStretchedMovePct
    || (move5AtrMultiple ?? 0) > DEMO_EXHAUSTION_CONFIG.extremeStretchedAtrMultiple;
  const ema200Far = Math.abs(ema200DistancePctSigned ?? 0) >= DEMO_ADAPTIVE_CONFIG.ema200FarDistancePct
    || Math.abs(ema200DistanceAtr ?? 0) >= DEMO_ADAPTIVE_CONFIG.ema200FarAtrMultiple;
  const ema200CombinedEvidence = [
    ["extensao recente em ATR", (move5AtrMultiple ?? 0) > DEMO_EXHAUSTION_CONFIG.stretchedAtrMultiple],
    ["distancia da EMA9", (ema9DistancePct ?? 0) > symbolCfg.maxEma9DistancePct],
    ["distancia da EMA21", (ema21DistancePct ?? 0) > symbolCfg.maxEma21DistancePct],
    ["sequencia de candles", sameDirectionCandles > DEMO_EXHAUSTION_CONFIG.maxSameDirectionCandles],
    ["candle climatico ou movimento extremo", extreme],
    ["exaustao ou perda de eficiencia", (efficiency ?? 1) <= DEMO_ADAPTIVE_CONFIG.chaoticTrendEfficiency],
    ["volume de exaustao", (input.volume?.relative ?? 0) >= DEMO_EXHAUSTION_CONFIG.volumeExhaustionRelative],
  ].filter(([, present]) => present).map(([name]) => name as string);
  const ema200CombinedExtension = ema200Far && ema200CombinedEvidence.length > 0;
  const stretched = extreme
    || ((move5Pct ?? 0) > DEMO_EXHAUSTION_CONFIG.maxStretchedMovePct && (move5AtrMultiple ?? 0) > DEMO_EXHAUSTION_CONFIG.stretchedAtrMultiple)
    || (ema9DistancePct ?? 0) > symbolCfg.maxEma9DistancePct
    || (ema21DistancePct ?? 0) > symbolCfg.maxEma21DistancePct
    || sameDirectionCandles > DEMO_EXHAUSTION_CONFIG.maxSameDirectionCandles
    || ema200CombinedExtension;
  const chaotic = alternationRate >= DEMO_ADAPTIVE_CONFIG.chaoticAlternationRate
    && (wickBodyRatio ?? 0) >= DEMO_ADAPTIVE_CONFIG.chaoticWickBodyRatio
    && (efficiency ?? 1) <= DEMO_ADAPTIVE_CONFIG.chaoticTrendEfficiency;
  const aligned = input.trend1h !== null
    && input.trend15m !== null
    && input.trend1h.trend !== "LATERAL"
    && input.trend1h.trend === input.trend15m.trend;
  const momentum = aligned
    && !!input.volume
    && input.volume.relative >= DEMO_ADAPTIVE_CONFIG.momentumPreferredVolumeRelative
    && (efficiency ?? 0) >= DEMO_ADAPTIVE_CONFIG.cleanTrendEfficiency
    && last5m !== null
    && candleConfirms(last5m, input.trend1h?.trend === "ALTA" ? "COMPRA" : "VENDA");

  let regime: MarketRegime = "LATERAL";
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (input.insufficient) {
    regime = "INSUFFICIENT_DATA";
    reasons.push("Candles fechados insuficientes para classificar o regime.");
  } else if (chaotic) {
    regime = "CHAOTIC";
    reasons.push("Alternancia alta, pavios relevantes e baixa eficiencia direcional.");
  } else if (momentum && !extreme && !ema200CombinedExtension) {
    regime = "MOMENTUM";
    reasons.push("Tendencias alinhadas com participacao de volume e impulso direcional.");
  } else if (stretched) {
    regime = "TREND_STRETCHED";
    reasons.push("Tendencia com sinais de extensao; exige nova estrutura para continuar.");
  } else if (aligned) {
    regime = "TREND_CLEAN";
    reasons.push("Tendencias 1h e 15m alinhadas sem evidencia forte de exaustao.");
  } else if (input.contextDirection !== "AGUARDAR") {
    regime = "TRANSITION";
    reasons.push("Contexto direcional existe, mas ainda depende de confirmacao.");
  } else {
    reasons.push("Mercado sem tendencia operacional clara.");
  }
  if (extreme) warnings.push("Extensao extrema detectada.");
  if (ema200DistancePctSigned !== null) reasons.push(`Distancia assinada da EMA200: ${(ema200DistancePctSigned * 100).toFixed(2)}%.`);
  if (ema200CombinedExtension) reasons.push(`EMA200 distante combinada com: ${ema200CombinedEvidence.join(", ")}.`);

  const confidenceBase = input.insufficient ? 15
    : chaotic ? 72
    : stretched ? 70
    : momentum ? 78
    : aligned ? 74
    : input.contextDirection !== "AGUARDAR" ? 58
    : 45;
  const confidence = Math.max(0, Math.min(100, confidenceBase + Math.round(((input.volume?.relative ?? 0) - 1) * 8)));

  return {
    regime,
    confidence,
    direction: side,
    reasons,
    warnings,
    ema200DistancePctSigned,
    ema200DistanceAtr,
    ema9DistancePct,
    ema21DistancePct,
    atr5m,
    atr15m,
    atr1h,
    sameDirectionCandles,
    candleAlternationRate: alternationRate,
    averageWickBodyRatio: wickBodyRatio,
    volumeRelative: input.volume?.relative ?? null,
    volumeDelta: input.volume?.delta5 ?? null,
    trendEfficiency: efficiency,
    stretchedEvidence: { move5Pct, move5AtrMultiple, ema9DistancePct, ema21DistancePct, ema200Far, ema200CombinedExtension, ema200CombinedEvidence, sameDirectionCandles, extreme },
    chaoticEvidence: { candleAlternationRate: alternationRate, averageWickBodyRatio: wickBodyRatio, trendEfficiency: efficiency, high: chaotic },
  };
}

export function evaluateMarketReorganization(input: {
  lastTrade: LastTradeContext | null;
  currentDirection: TradeSide | "NONE";
  signalKey: string;
  sameDirectionCandles: number;
  ema9DistancePct: number | null;
  ema21DistancePct: number | null;
  volumeRelative: number | null;
  triggerLevel: number | null;
  symbol: DemoSymbol;
}): MarketReorganizationResult {
  const lastTrade = input.lastTrade;
  if (!lastTrade || input.currentDirection === "NONE") {
    return { reorganized: true, reasons: ["Sem memoria operacional relevante para este ativo."], missingConditions: [] };
  }
  if (lastTrade.direction !== input.currentDirection) {
    return { reorganized: true, reasons: ["Direcao diferente do ultimo trade; memoria nao bloqueia reversao futura."], missingConditions: [] };
  }
  const requiresReorganization = lastTrade.target2Hit || lastTrade.exitReason === "TARGET_2";
  if (!requiresReorganization) {
    return { reorganized: true, reasons: ["Ultimo trade nao exige reorganizacao pos-alvo."], missingConditions: [] };
  }

  const cfg = DEMO_EXHAUSTION_CONFIG.bySymbol[input.symbol];
  const reasons: string[] = [];
  const missingConditions: string[] = [];
  if (input.sameDirectionCandles <= DEMO_ADAPTIVE_CONFIG.reorganizationMaxSameDirectionCandles) reasons.push("Sequencia direcional foi interrompida.");
  else missingConditions.push("interrupcao da sequencia direcional");
  if ((input.ema9DistancePct ?? Number.POSITIVE_INFINITY) <= cfg.maxEma9DistancePct && (input.ema21DistancePct ?? Number.POSITIVE_INFINITY) <= cfg.maxEma21DistancePct) reasons.push("Preco retornou de forma controlada para EMA9/EMA21.");
  else missingConditions.push("retorno controlado para EMA9/EMA21");
  if (input.triggerLevel !== null && input.signalKey !== (lastTrade.signalKey ?? null)) reasons.push("Nova estrutura/signalKey detectada.");
  else missingConditions.push("nova estrutura confirmada");
  if ((input.volumeRelative ?? 0) >= DEMO_ADAPTIVE_CONFIG.reorganizationMinVolumeRelative && (input.volumeRelative ?? 0) <= DEMO_ADAPTIVE_CONFIG.reorganizationMaxVolumeRelative) reasons.push("Volume normalizado apos o impulso anterior.");
  else missingConditions.push("volume normalizado");

  return { reorganized: missingConditions.length === 0, reasons, missingConditions };
}

export function qualityFilters(
  symbol: DemoSymbol,
  side: TradeSide,
  entry: number,
  candles5m: Candle[],
  trend15m: TrendDetails,
  volume: RadarLikeAnalysis["volume"],
  trigger: Pick<TriggerResult, "kind" | "level" | "retestValid"> = { kind: "retest", level: null, retestValid: true },
): QualityFilter[] {
  const cfg = DEMO_EXHAUSTION_CONFIG;
  const symbolCfg = cfg.bySymbol[symbol];
  const lastClosed = last(candles5m);
  const recent = candles5m.slice(-20);
  const currentAtr = atr(candles5m, 14);
  const lastRange = lastClosed ? lastClosed.high - lastClosed.low : 0;
  const lastBody = lastClosed ? Math.abs(lastClosed.close - lastClosed.open) : 0;
  const avgBody = average(recent.map((c) => Math.abs(c.close - c.open)));
  const ema21Distance = trend15m.ema21 > 0 ? Math.abs(entry - trend15m.ema21) / entry : Number.POSITIVE_INFINITY;
  const ema9Distance = trend15m.ema9 > 0 ? Math.abs(entry - trend15m.ema9) / entry : Number.POSITIVE_INFINITY;
  const move5Abs = candles5m.length >= 6 ? Math.abs(entry - candles5m[candles5m.length - 6].close) : 0;
  const move5 = entry > 0 ? move5Abs / entry : Number.POSITIVE_INFINITY;
  const move5AtrMultiple = currentAtr > 0 ? move5Abs / currentAtr : Number.POSITIVE_INFINITY;
  const run = sameDirectionRun(candles5m, side);
  const upperWick = lastClosed ? lastClosed.high - Math.max(lastClosed.open, lastClosed.close) : 0;
  const lowerWick = lastClosed ? Math.min(lastClosed.open, lastClosed.close) - lastClosed.low : 0;
  const rejectionWick = side === "BUY" ? upperWick : lowerWick;
  const emaWithin = ema21Distance <= symbolCfg.maxEma21DistancePct && ema9Distance <= symbolCfg.maxEma9DistancePct;
  const climactic = currentAtr > 0 && avgBody > 0 && (lastRange > currentAtr * cfg.climaxRangeAtrMultiple || lastBody > avgBody * cfg.climaxBodyAvgMultiple);
  const climacticSevere = currentAtr > 0 && avgBody > 0 && (lastRange > currentAtr * 3 || lastBody > avgBody * 2.4);
  const volumeRelative = volume?.relative ?? 0;
  const volumeExhaustion = !!volume && volume.relative >= cfg.volumeExhaustionRelative && volume.delta5 < -0.1;
  const fourthAllowed = run === cfg.allowedFourthCandle && trigger.retestValid && !climactic && emaWithin && !volumeExhaustion;
  const extensionRelevant = move5 > cfg.maxStretchedMovePct && move5AtrMultiple > cfg.stretchedAtrMultiple;
  const extensionExtreme = move5 > cfg.extremeStretchedMovePct || move5AtrMultiple > cfg.extremeStretchedAtrMultiple;
  const wickLimit = trigger.kind === "breakout" ? cfg.aggressiveRejectionWickBodyMultiple : cfg.rejectionWickBodyMultiple;
  const wickExcess = lastBody > 0 ? rejectionWick > lastBody * wickLimit : true;
  const wickSevere = lastBody > 0 ? rejectionWick > lastBody * (wickLimit + 0.7) : true;
  const exhaustionCompanion = climactic || run > cfg.maxSameDirectionCandles || wickExcess || volumeExhaustion;
  
  // Reclassified filter limits
  const movementBlocks = extensionExtreme;
  const ema21Severe = ema21Distance > symbolCfg.maxEma21DistancePct * 2.5;
  const ema9Severe = ema9Distance > symbolCfg.maxEma9DistancePct * 2.5;
  const sequenceBlocks = run > 5;
  
  const volumePasses = !!volume && (
    volume.relative >= cfg.preferredVolumeRelative
    || (volume.relative >= cfg.minVolumeRelative && (volume.delta5 > 0 || trigger.retestValid))
  );
  const volumeSeverity: QualitySeverity = volumeRelative < 0.5 ? "block" : "penalty";
  const conservativeRetestAccepted = (trigger.kind === "retest" || trigger.kind === "pullback" || trigger.kind === "breakout") && trigger.retestValid;

  // Avoid double penalization
  const ema21Penalty = extensionRelevant ? 0 : -20;
  const ema9Penalty = extensionRelevant ? 0 : -10;
  const sequencePenalty = extensionRelevant ? 0 : -15;

  return [
    {
      name: "Reteste conservador",
      passed: conservativeRetestAccepted,
      reason: conservativeRetestAccepted
        ? `Reteste/retomada conservadora valida com tolerancia de ${(cfg.retestTolerancePct * 100).toFixed(2)}% na zona ${trigger.level?.toFixed(4) ?? "estrutural"}.`
        : "Rompimento imediato nao abre trade demo; falta toque e fechamento posterior a favor.",
      severity: "block",
      details: { kind: trigger.kind, level: trigger.level, retestValid: trigger.retestValid },
    },
    {
      name: "Distancia da EMA21",
      passed: ema21Distance <= symbolCfg.maxEma21DistancePct,
      reason: `Distancia da EMA21 em ${(ema21Distance * 100).toFixed(2)}% (max ${(symbolCfg.maxEma21DistancePct * 100).toFixed(2)}% para ${symbol}).`,
      penalty: ema21Penalty,
      severity: ema21Severe ? "block" : "penalty",
      details: { ema21: trend15m.ema21, distancePct: ema21Distance, maxDistancePct: symbolCfg.maxEma21DistancePct },
    },
    {
      name: "Distancia da EMA9",
      passed: ema9Distance <= symbolCfg.maxEma9DistancePct,
      reason: `Distancia da EMA9 em ${(ema9Distance * 100).toFixed(2)}% (max ${(symbolCfg.maxEma9DistancePct * 100).toFixed(2)}% para ${symbol}).`,
      penalty: ema9Penalty,
      severity: ema9Severe ? "block" : "penalty",
      details: { ema9: trend15m.ema9, distancePct: ema9Distance, maxDistancePct: symbolCfg.maxEma9DistancePct },
    },
    {
      name: "Movimento esticado",
      passed: !movementBlocks && !extensionRelevant,
      reason: `Movimento 5 velas ${(move5 * 100).toFixed(2)}%; ${move5AtrMultiple.toFixed(2)}x ATR. ${movementBlocks ? "Extensao relevante combinada com exaustao." : extensionRelevant ? "Extensao isolada vira penalidade, nao bloqueio." : "Dentro do contexto."}`,
      penalty: -20,
      severity: movementBlocks ? "block" : "penalty",
      details: { move5Pct: move5, move5AtrMultiple, atr: currentAtr, extensionRelevant, extensionExtreme },
    },
    {
      name: "Sequencia de candles",
      passed: run <= cfg.maxSameDirectionCandles || fourthAllowed,
      reason: `${run} velas consecutivas na direcao da entrada. Quarta vela ${fourthAllowed ? "permitida por reteste, EMAs, volume e candle nao climatico" : "exige reteste valido sem exaustao"}.`,
      penalty: sequencePenalty,
      severity: sequenceBlocks ? "block" : "penalty",
      details: { sameDirectionCandles: run, fourthAllowed },
    },
    {
      name: "Candle climatico",
      passed: currentAtr > 0 && avgBody > 0 && !climactic,
      reason: `Range ${(currentAtr > 0 ? lastRange / currentAtr : 0).toFixed(2)}x ATR; corpo ${(avgBody > 0 ? lastBody / avgBody : 0).toFixed(2)}x media.`,
      penalty: -25,
      severity: climacticSevere ? "block" : "penalty",
      details: { atr: currentAtr, rangeAtrMultiple: currentAtr > 0 ? lastRange / currentAtr : null, bodyAverageMultiple: avgBody > 0 ? lastBody / avgBody : null, climactic },
    },
    {
      name: "Pavio contra entrada",
      passed: !wickExcess,
      reason: `Pavio contra entrada em ${(lastBody > 0 ? rejectionWick / lastBody : 0).toFixed(2)}x o corpo (max ${wickLimit.toFixed(1)}x).`,
      penalty: -15,
      severity: wickSevere ? "block" : "penalty",
      details: { rejectionWickBodyMultiple: lastBody > 0 ? rejectionWick / lastBody : null, wickLimit, wickExcess },
    },
    {
      name: "Volume compativel",
      passed: volumePasses,
      reason: volume
        ? `Volume relativo ${volume.relative.toFixed(2)}x; delta 5 velas ${(volume.delta5 * 100).toFixed(1)}%. ${volume.relative >= cfg.preferredVolumeRelative ? "Qualidade cheia." : "Aceito abaixo de 1.0 apenas com contexto forte/expansao."}`
        : "Volume indisponivel.",
      penalty: -20,
      severity: volumeSeverity,
      details: { volumeRelative, volumeDelta5: volume?.delta5 ?? null, expanding: volume?.expanding ?? false, veryWeak: volume?.veryWeak ?? false },
    },
  ];
}

export function blockingQualityFailures(filters: QualityFilter[]): QualityFilter[] {
  return filters.filter((filter) => !filter.passed && filter.severity !== "penalty");
}

export function riskRewardMeetsMinimum(rr: number | null, minRr = DEMO_EXHAUSTION_CONFIG.minRiskReward): boolean {
  return rr !== null && Number.isFinite(rr) && rr >= minRr;
}

function contextualDirection(trend1h: RadarTrend, trend15m: RadarTrend, trend15mDetails: TrendDetails | null): { direction: RadarDirection; correction: boolean; blocked: boolean; reason: string | null } {
  if (trend1h === "LATERAL") return { direction: "AGUARDAR", correction: false, blocked: false, reason: "1h sem tendencia direcional limpa." };
  if (trend15m === trend1h) return { direction: trend1h === "ALTA" ? "COMPRA" : "VENDA", correction: false, blocked: false, reason: null };
  if (!trend15mDetails) return { direction: "AGUARDAR", correction: false, blocked: false, reason: "15m indisponivel." };
  const opposite = (trend1h === "ALTA" && trend15m === "BAIXA") || (trend1h === "BAIXA" && trend15m === "ALTA");
  const controlledBullCorrection = trend1h === "ALTA"
    && trend15m !== "BAIXA"
    && trend15mDetails.ema21Slope >= -0.0008
    && trend15mDetails.ema9 >= trend15mDetails.ema21 * 0.997
    && trend15mDetails.bullishVotes >= 2
    && trend15mDetails.bearishVotes < 3;
  const controlledBearCorrection = trend1h === "BAIXA"
    && trend15m !== "ALTA"
    && trend15mDetails.ema21Slope <= 0.0008
    && trend15mDetails.ema9 <= trend15mDetails.ema21 * 1.003
    && trend15mDetails.bearishVotes >= 2
    && trend15mDetails.bullishVotes < 3;
  if (controlledBullCorrection) return { direction: "COMPRA", correction: true, blocked: false, reason: "15m em correcao controlada dentro da tendencia 1h." };
  if (controlledBearCorrection) return { direction: "VENDA", correction: true, blocked: false, reason: "15m em correcao controlada dentro da tendencia 1h." };
  return { direction: "AGUARDAR", correction: false, blocked: opposite, reason: opposite ? "1h e 15m estao em direcoes opostas." : "15m lateral sem correcao controlada." };
}

function decisionState(params: {
  hasCriticalBlock: boolean;
  hasDirection: boolean;
  trigger: TriggerResult;
  planValid: boolean;
  rrStatus: "pending" | "valid" | "invalid";
  operationalScore: number;
}): DecisionState {
  if (params.hasCriticalBlock && (params.rrStatus === "invalid" || params.trigger.stage === "confirmed")) return "BLOQUEADO_RISCO";
  if (!params.hasDirection) return "SEM_SETUP";
  if (params.trigger.stage === "none" || params.trigger.stage === "invalid") return "CONTEXTO_FORMANDO";
  if (params.trigger.stage === "forming" || !params.planValid || params.rrStatus === "pending") return "SETUP_QUASE_PRONTO";
  if (params.hasCriticalBlock) return "BLOQUEADO_RISCO";
  if (params.operationalScore >= 70) return "ENTRADA_APROVADA";
  return "SETUP_QUASE_PRONTO";
}

function classification(score: number, direction: RadarDirection): RadarLikeAnalysis["classification"] {
  if (direction === "AGUARDAR" || score < 50) return "AGUARDAR";
  if (score < 70) return "SINAL FRACO";
  if (score < 85) return "SINAL VALIDO";
  return "SINAL FORTE";
}

function noSignal(symbol: DemoSymbol, reason: string, closeTime: number, extraSteps: DemoSignalInput["steps"] = []): DemoSignalInput {
  return {
    pair: symbol,
    decision: "SEM ENTRADA",
    entryNum: null,
    stopLossNum: null,
    target1Num: null,
    target2Num: null,
    riskReward: null,
    signalKey: `none:${symbol}:${closeTime}`,
    steps: [{ number: 0, name: "Radar servidor", value: "SEM ENTRADA", reason }, ...(extraSteps ?? [])],
  };
}

export function analyzeMarketDecision(input: {
  symbol: DemoSymbol;
  displayPrice: number | null;
  candles1h: Candle[];
  candles15m: Candle[];
  candles5m: Candle[];
  lastTrade?: LastTradeContext | null;
  now?: number;
}): RadarLikeAnalysis {
  const now = input.now ?? Date.now();
  const generatedAt = new Date(now).toISOString();
  const candles1h = closedCandles(input.candles1h, now);
  const candles15m = closedCandles(input.candles15m, now);
  const candles5m = closedCandles(input.candles5m, now);
  const decisionPrice = last(candles5m)?.close ?? last(candles15m)?.close ?? last(candles1h)?.close ?? null;
  const displayPrice = input.displayPrice !== null && finite(input.displayPrice) && input.displayPrice > 0 ? input.displayPrice : decisionPrice;
  const criticalBlockedReasons: string[] = [];
  const warnings: string[] = [];
  const qualityPenalties: string[] = [];
  const confirmations: string[] = [];
  const risks: string[] = [];
  const scoreItems: RadarLikeAnalysis["scoreItems"] = [];

  const insufficientData = decisionPrice === null || candles1h.length < MIN_1H_CANDLES || candles15m.length < MIN_15M_CANDLES || candles5m.length < MIN_5M_CANDLES;
  if (insufficientData) {
    criticalBlockedReasons.push("Dados insuficientes para calcular o Radar sem usar vela aberta.");
  }
  if (candles1h.length < MIN_EMA200_WARMUP) criticalBlockedReasons.push("Dados insuficientes para warm-up minimo da EMA 200.");

  const trend1hDetails = candles1h.length >= MIN_EMA200_WARMUP ? trendFor(candles1h, true) : null;
  const trend15mDetails = candles15m.length >= 25 ? trendFor(candles15m, false) : null;
  const trend1h = trend1hDetails?.trend ?? "LATERAL";
  const trend15m = trend15mDetails?.trend ?? "LATERAL";
  const levels = decisionPrice !== null
    ? supportResistance(candles15m, decisionPrice)
    : { support: null, resistance: null, breakoutResistance: null, breakdownSupport: null, recentHigh: null, recentLow: null };
  const volume = volumeDetails(candles15m);
  const context = contextualDirection(trend1h, trend15m, trend15mDetails);
  
  if (context.blocked && context.reason) criticalBlockedReasons.push(context.reason);
  if (volume?.veryWeak) criticalBlockedReasons.push("Volume extremamente baixo em relacao a media.");
  
  // Base trigger check
  const trigger = trigger5m(candles5m, context.direction, levels.breakoutResistance, levels.breakdownSupport, !!volume && volume.relative >= 0.5);
  const marketRegime = classifyMarketRegime({
    symbol: input.symbol,
    decisionPrice,
    candles1h,
    candles15m,
    candles5m,
    trend1h: trend1hDetails,
    trend15m: trend15mDetails,
    contextDirection: context.direction,
    volume,
    insufficient: insufficientData || candles1h.length < MIN_EMA200_WARMUP,
  });

  // Adaptive momentum candidate check. Retest remains the conservative default.
  let isStrongBreakout = false;
  let momentumScore = 0;
  let momentumConditionsPassed: string[] = [];
  let momentumConditionsMissing: string[] = [];
  let marketReorganization = evaluateMarketReorganization({
    lastTrade: input.lastTrade ?? null,
    currentDirection: marketRegime.direction,
    signalKey: "pending",
    sameDirectionCandles: marketRegime.sameDirectionCandles,
    ema9DistancePct: marketRegime.ema9DistancePct,
    ema21DistancePct: marketRegime.ema21DistancePct,
    volumeRelative: marketRegime.volumeRelative,
    triggerLevel: trigger.level,
    symbol: input.symbol,
  });
  if (
    context.direction !== "AGUARDAR" &&
    volume !== null
  ) {
    const side = directionFromRadar(context.direction);
    const level = side === "BUY" ? levels.breakoutResistance : side === "SELL" ? levels.breakdownSupport : null;
    const lastClosed = last(candles5m);
    const previous = candles5m[candles5m.length - 2] ?? null;
    const candidateEntry = lastClosed?.close ?? null;
    const twoClosesBeyond = side !== "NONE" && closeBeyondLevel(previous, side, level) && closeBeyondLevel(lastClosed, side, level);
    const strongCloseBeyond = side !== "NONE"
      && closeBeyondLevel(lastClosed, side, level)
      && candleConfirms(lastClosed!, context.direction)
      && candleBodyRatio(lastClosed) >= DEMO_ADAPTIVE_CONFIG.momentumStrongBodyRatio
      && volume.relative >= DEMO_ADAPTIVE_CONFIG.momentumPreferredVolumeRelative
      && volume.expanding;
    const structuralBreakout = side !== "NONE" && level !== null && closeBeyondLevel(lastClosed, side, level);
    const candidatePlan = side !== "NONE" && candidateEntry !== null
      ? rrPlan(context.direction, candidateEntry, levels.support, levels.resistance, levels.breakoutResistance, levels.breakdownSupport)
      : { stop: null, target1: null, target2: null, rr: null, valid: false, stopTooFar: false };
    const candidateRrStatus: "pending" | "valid" | "invalid" = candidatePlan.rr === null ? "pending" : riskRewardMeetsMinimum(candidatePlan.rr) ? "valid" : "invalid";
    const candidateFilters = side !== "NONE" && candidateEntry !== null && trend15mDetails !== null
      ? qualityFilters(input.symbol, side, candidateEntry, candles5m, trend15mDetails, volume, {
          kind: "breakout",
          level,
          retestValid: true,
        })
      : [];
    const hasSevereExhaustion = candidateFilters
      .filter((f) => f.name !== "Reteste conservador")
      .some((f) => !f.passed && f.severity === "block");
    const proposedMomentumKey = [
      "CONTINUATION_MOMENTUM",
      marketRegime.regime,
      side,
      level?.toFixed(2) ?? "none",
      lastClosed?.closeTime ?? 0,
    ].join("|");
    marketReorganization = evaluateMarketReorganization({
      lastTrade: input.lastTrade ?? null,
      currentDirection: side,
      signalKey: proposedMomentumKey,
      sameDirectionCandles: marketRegime.sameDirectionCandles,
      ema9DistancePct: marketRegime.ema9DistancePct,
      ema21DistancePct: marketRegime.ema21DistancePct,
      volumeRelative: marketRegime.volumeRelative,
      triggerLevel: level,
      symbol: input.symbol,
    });
    const momentumChecks: Array<[string, boolean]> = [
      ["tendencias 1h/15m alinhadas", trend1h !== "LATERAL" && trend1h === trend15m],
      ["rompimento estrutural 5m", structuralBreakout],
      ["fechamento alem do nivel", side !== "NONE" && closeBeyondLevel(lastClosed, side, level)],
      ["participacao de volume", volume.relative >= DEMO_ADAPTIVE_CONFIG.momentumMinVolumeRelative],
      ["mercado nao caotico", marketRegime.regime !== "CHAOTIC"],
      ["sem extensao extrema", !marketRegime.stretchedEvidence.extreme],
      ["plano e R/R validos", candidatePlan.valid && candidateRrStatus === "valid" && !candidatePlan.stopTooFar],
      ["confirmacao por dois fechamentos ou vela forte", twoClosesBeyond || strongCloseBeyond],
      ["sem exaustao severa", !hasSevereExhaustion],
      ["mercado reorganizado apos alvo anterior", marketReorganization.reorganized],
    ];
    momentumConditionsPassed = momentumChecks.filter(([, passed]) => passed).map(([name]) => name);
    momentumConditionsMissing = momentumChecks.filter(([, passed]) => !passed).map(([name]) => name);
    momentumScore = Math.max(0, Math.min(100, 35 + momentumConditionsPassed.length * 7 - momentumConditionsMissing.length * 6));

    if (momentumConditionsMissing.length === 0 && candidateEntry !== null) {
      isStrongBreakout = true;
      trigger.direction = context.direction;
      trigger.aggressive = candidateEntry;
      trigger.conservative = candidateEntry;
      trigger.retestValid = true;
      trigger.stage = "confirmed";
      trigger.kind = "breakout";
      trigger.level = level;
      trigger.confirmation = twoClosesBeyond
        ? "Momentum confirmado por dois fechamentos 5m alem da estrutura."
        : "Momentum confirmado por vela forte com volume em expansao.";
      trigger.missing = null;
    }
  }

  const entry = trigger.conservative;
  const plan = rrPlan(trigger.direction, entry, levels.support, levels.resistance, levels.breakoutResistance, levels.breakdownSupport);
  const rrStatus: "pending" | "valid" | "invalid" = plan.rr === null ? "pending" : riskRewardMeetsMinimum(plan.rr) ? "valid" : "invalid";
  
  if (trigger.stage === "forming") warnings.push("Gatilho em formacao; falta reteste ou confirmacao conservadora.");
  if (trigger.direction !== "AGUARDAR" && trigger.conservative === null) warnings.push("Robo demo exige reteste real; rompimento imediato nao abre operacao.");
  if (rrStatus === "invalid") criticalBlockedReasons.push("Relacao risco/retorno menor que 1:2.");
  if (plan.stopTooFar) criticalBlockedReasons.push("Stop excessivamente distante para o setup intraday.");
  if (trigger.direction !== "AGUARDAR" && !plan.valid) criticalBlockedReasons.push("Plano matematicamente invalido.");
  
  const candidateSide: TradeSide | null = trigger.direction === "COMPRA" ? "BUY" : trigger.direction === "VENDA" ? "SELL" : null;
  const qualityFilterEntry = trigger.conservative ?? trigger.aggressive;
  const qualityFilterResults = candidateSide !== null && qualityFilterEntry !== null && trend15mDetails !== null
    ? qualityFilters(input.symbol, candidateSide, qualityFilterEntry, candles5m, trend15mDetails, volume, {
        kind: trigger.kind,
        level: trigger.level,
        retestValid: trigger.retestValid,
      })
    : [];

  const selectedStrategyCandidate: AdaptiveStrategy = isStrongBreakout
    ? "CONTINUATION_MOMENTUM"
    : trigger.kind === "retest" || trigger.kind === "pullback"
      ? "CONTINUATION_RETEST"
      : "NONE";
  const adaptiveSignalKeySeed = [
    selectedStrategyCandidate,
    marketRegime.regime,
    directionFromRadar(trigger.direction),
    trigger.level?.toFixed(2) ?? "none",
    candles5m[candles5m.length - 1]?.closeTime ?? 0,
    entry?.toFixed(2) ?? "none",
  ].join("|");
  marketReorganization = evaluateMarketReorganization({
    lastTrade: input.lastTrade ?? null,
    currentDirection: directionFromRadar(trigger.direction),
    signalKey: adaptiveSignalKeySeed,
    sameDirectionCandles: marketRegime.sameDirectionCandles,
    ema9DistancePct: marketRegime.ema9DistancePct,
    ema21DistancePct: marketRegime.ema21DistancePct,
    volumeRelative: marketRegime.volumeRelative,
    triggerLevel: trigger.level,
    symbol: input.symbol,
  });
  if (!marketReorganization.reorganized && trigger.direction !== "AGUARDAR") {
    criticalBlockedReasons.push("Mercado ainda nao reorganizou apos ultimo alvo no mesmo sentido.");
  }
    
  const qualityBlocks = blockingQualityFailures(qualityFilterResults);
  for (const filter of qualityBlocks) {
    if (!criticalBlockedReasons.includes(filter.reason)) criticalBlockedReasons.push(filter.reason);
  }
  
  const failedPenalties = qualityFilterResults.filter((f) => !f.passed && f.severity === "penalty");
  for (const filter of failedPenalties) {
    qualityPenalties.push(filter.reason);
  }

  const checklist: RadarChecklistItem[] = [
    { key: "trend1h", label: "Tendencia 1h", passed: trend1h !== "LATERAL", detail: trend1h },
    { key: "trend15m", label: "Tendencia 15m", passed: context.direction !== "AGUARDAR", detail: context.correction ? "CORRECAO CONTROLADA" : trend15m },
    { key: "trigger5m", label: "Gatilho 5m", passed: trigger.stage === "confirmed", detail: trigger.confirmation ?? trigger.risk ?? "Sem gatilho." },
    { key: "volume", label: "Volume", passed: !!volume && volume.relative >= 0.5 && !volume.veryWeak, detail: volume ? `${(volume.relative * 100).toFixed(0)}% da media` : "Indisponivel" },
    { key: "rr", label: "R/R >= 2", passed: rrStatus === "valid", detail: rrStatus === "pending" ? "Pendente" : plan.rr !== null ? `1:${plan.rr.toFixed(2)}` : "Indisponivel" },
    { key: "notLateral", label: "Fora da zona lateral", passed: context.direction !== "AGUARDAR", detail: context.direction !== "AGUARDAR" ? "OK" : "Sem contexto direcional" },
  ];

  if (trend1h !== "LATERAL") {
    const isStrong1h = trend1hDetails && (trend1hDetails.bullishVotes === 4 || trend1hDetails.bearishVotes === 4);
    const trendPts = isStrong1h ? 30 : 25;
    scoreItems.push({ label: `+${trendPts} tendencia 1h${isStrong1h ? " forte (4/4)" : ""}`, points: trendPts, detail: trend1h });
    confirmations.push(`Tendencia 1h em ${trend1h}${isStrong1h ? " (Forte)" : ""}.`);
  } else {
    scoreItems.push({ label: "+0 1h sem tendencia", points: 0, detail: "Conflito nos criterios da tendencia maior." });
  }

  if (trend15m !== "LATERAL" && trend15m === trend1h) {
    const isStrong15m = trend15mDetails && (trend15mDetails.bullishVotes === 4 || trend15mDetails.bearishVotes === 4);
    const confirmPts = isStrong15m ? 25 : 20;
    scoreItems.push({ label: `+${confirmPts} confirmacao 15m${isStrong15m ? " forte (4/4)" : ""}`, points: confirmPts, detail: trend15m });
    confirmations.push(`15m alinhado em ${trend15m}${isStrong15m ? " (Forte)" : ""}.`);
  } else if (context.correction) {
    scoreItems.push({ label: "+12 correcao 15m controlada", points: 12, detail: context.reason ?? "15m em correcao controlada." });
    confirmations.push("15m em correcao controlada.");
  } else {
    scoreItems.push({ label: "+0 15m sem confirmacao", points: 0, detail: context.reason ?? "15m nao confirma o 1h." });
  }

  if (trigger.stage === "confirmed") {
    scoreItems.push({ label: "+20 gatilho confirmado", points: 20, detail: trigger.confirmation ?? "Gatilho aprovado." });
    confirmations.push(trigger.confirmation ?? "Gatilho 5m aprovado.");
  } else if (trigger.stage === "forming") {
    scoreItems.push({ label: "+8 gatilho em formacao", points: 8, detail: trigger.missing ?? "Aguardando reteste." });
  } else {
    scoreItems.push({ label: "+0 sem gatilho 5m", points: 0, detail: trigger.risk ?? "Sem gatilho confirmado." });
  }

  if (volume && volume.relative >= DEMO_EXHAUSTION_CONFIG.minVolumeRelative) {
    scoreItems.push({ label: "+15 volume", points: 15, detail: volume.expanding ? "Volume relativo com expansao." : "Volume suficiente." });
    confirmations.push(volume.expanding ? "Volume em expansao." : "Volume suficiente.");
  } else if (volume && volume.relative >= 0.7) {
    scoreItems.push({ label: "+7 volume moderado", points: 7, detail: `Volume relativo ${volume.relative.toFixed(2)}x com penalidade leve.` });
  } else {
    scoreItems.push({ label: "+0 volume fraco", points: 0, detail: "Volume abaixo do minimo operacional." });
  }

  if (levels.support !== null && levels.resistance !== null) {
    scoreItems.push({ label: "+10 suporte/resistencia", points: 10, detail: "Niveis estruturais encontrados." });
    confirmations.push("Suporte e resistencia mapeados.");
  } else {
    scoreItems.push({ label: "+0 sem nivel claro", points: 0, detail: "Suporte ou resistencia principal ausente." });
  }

  if (rrStatus === "valid") {
    scoreItems.push({ label: "+10 R/R >= 2", points: 10, detail: `1:${plan.rr?.toFixed(2)}` });
    confirmations.push("R/R minimo aprovado.");
  } else if (rrStatus === "pending") {
    scoreItems.push({ label: "+0 R/R pendente", points: 0, detail: "R/R sera avaliado quando entrada/stop/alvos existirem." });
  } else {
    scoreItems.push({ label: "-20 risco alto", points: -20, detail: `1:${plan.rr?.toFixed(2)}` });
  }

  const rawScore = scoreItems.reduce((sum, item) => sum + item.points, 0);
  const scoreContextual = Math.max(0, Math.min(100, rawScore));
  if (trigger.kind === "pullback" && (scoreContextual < 95 || !volume || volume.relative < DEMO_EXHAUSTION_CONFIG.preferredVolumeRelative)) {
    criticalBlockedReasons.push("Pullback conservador sem toque perfeito exige contexto >=95 e volume relativo >=1.0.");
  }
  const operationalBase = (trigger.stage === "confirmed" ? 35 : trigger.stage === "forming" ? 15 : 0)
    + (trigger.retestValid ? 20 : 0)
    + (rrStatus === "valid" ? 20 : rrStatus === "pending" ? 0 : -20)
    + (volume && volume.relative >= DEMO_EXHAUSTION_CONFIG.minVolumeRelative ? 10 : volume && volume.relative >= 0.7 ? 5 : 0)
    + (context.direction !== "AGUARDAR" ? 15 : 0);
  const qualityPenalty = qualityFilterResults
    .filter((filter) => !filter.passed)
    .reduce((sum, filter) => sum + (filter.penalty ?? (filter.severity === "block" ? -25 : -10)), 0);
  const scoreOperacional = Math.max(0, Math.min(100, operationalBase + qualityPenalty));
  const state = decisionState({
    hasCriticalBlock: criticalBlockedReasons.length > 0,
    hasDirection: context.direction !== "AGUARDAR",
    trigger,
    planValid: plan.valid,
    rrStatus,
    operationalScore: scoreOperacional,
  });
  const suggestedDirection = state === "ENTRADA_APROVADA" && trigger.conservative !== null ? trigger.direction : "AGUARDAR";
  const score = scoreOperacional;
  const missingConditions = [
    context.direction === "AGUARDAR" ? (context.reason ?? "direcao operacional") : null,
    trigger.stage !== "confirmed" ? (trigger.missing ?? "gatilho confirmado") : null,
    rrStatus === "pending" ? "R/R pendente" : rrStatus === "invalid" ? "R/R minimo 2:1" : null,
    volume && volume.relative < DEMO_EXHAUSTION_CONFIG.minVolumeRelative ? "volume ideal" : null,
  ].filter((item): item is string => item !== null);
  
  const blockedReasons = [...criticalBlockedReasons, ...warnings];
  const decisiveReason = blockedReasons[0] ?? missingConditions[0] ?? (state === "ENTRADA_APROVADA" ? "Entrada aprovada pelo funil operacional." : "Contexto em formacao.");
  const selectedStrategy: AdaptiveStrategy = state === "ENTRADA_APROVADA" || trigger.stage !== "none"
    ? selectedStrategyCandidate
    : "NONE";
  const strategyScore = selectedStrategy === "CONTINUATION_MOMENTUM" ? Math.max(momentumScore, scoreOperacional) : scoreOperacional;
  const strategySelection: StrategySelection = {
    selectedStrategy,
    direction: directionFromRadar(trigger.direction),
    approved: state === "ENTRADA_APROVADA",
    reason: selectedStrategy === "CONTINUATION_MOMENTUM"
      ? (state === "ENTRADA_APROVADA" ? "Momentum aprovado pelo seletor adaptativo." : "Momentum avaliado, mas ainda incompleto.")
      : selectedStrategy === "CONTINUATION_RETEST"
        ? (state === "ENTRADA_APROVADA" ? "Reteste/retomada conservadora aprovado pelo seletor adaptativo." : "Reteste/retomada conservadora ainda incompleto.")
        : "Nenhuma estrategia compativel foi selecionada.",
    blockedReasons,
    requiredConditions: selectedStrategy === "CONTINUATION_MOMENTUM"
      ? momentumConditionsMissing
      : missingConditions,
    regime: marketRegime.regime,
    confidence: marketRegime.confidence,
    score: strategyScore,
    conditionsPassed: selectedStrategy === "CONTINUATION_MOMENTUM"
      ? momentumConditionsPassed
      : checklist.filter((item) => item.passed).map((item) => item.label),
    conditionsMissing: selectedStrategy === "CONTINUATION_MOMENTUM"
      ? momentumConditionsMissing
      : missingConditions,
  };
  const signalKey = [
    selectedStrategy,
    marketRegime.regime,
    suggestedDirection,
    candles1h[candles1h.length - 1]?.closeTime ?? 0,
    candles15m[candles15m.length - 1]?.closeTime ?? 0,
    candles5m[candles5m.length - 1]?.closeTime ?? 0,
    trigger.level?.toFixed(2) ?? "none",
    entry?.toFixed(2) ?? "none",
    plan.stop?.toFixed(2) ?? "none",
  ].join("|");
  return {
    symbol: input.symbol,
    displayPrice,
    decisionPrice,
    trend1h,
    trend15m,
    trigger5m: trigger.direction,
    triggerKind: trigger.kind,
    triggerLevel: trigger.level,
    retestValid: trigger.retestValid,
    suggestedDirection,
    support: levels.support,
    resistance: levels.resistance,
    recentHigh: levels.recentHigh,
    recentLow: levels.recentLow,
    aggressiveEntry: trigger.aggressive,
    conservativeEntry: trigger.conservative,
    stop: plan.stop,
    target1: plan.target1,
    target2: plan.target2,
    rr: plan.rr,
    score,
    scoreContextual,
    scoreOperacional,
    decisionState: state,
    missingConditions,
    decisiveReason,
    triggerStage: trigger.stage,
    rrStatus,
    classification: classification(scoreOperacional, suggestedDirection),
    checklist,
    confirmations: confirmations.slice(0, 8),
    blockedReasons,
    criticalBlockedReasons,
    warnings,
    qualityPenalties,
    risks,
    scoreItems,
    qualityFilters: qualityFilterResults,
    volume,
    generatedAt,
    signalKey,
    marketRegime,
    strategySelection,
    selectedStrategy,
    strategyScore,
    ema200DistancePctSigned: marketRegime.ema200DistancePctSigned,
    ema200DistanceAtr: marketRegime.ema200DistanceAtr,
    stretchedEvidence: marketRegime.stretchedEvidence,
    chaoticEvidence: marketRegime.chaoticEvidence,
    lastTradeDirection: input.lastTrade?.direction ?? null,
    lastTradeExitReason: input.lastTrade?.exitReason ?? null,
    lastTradeTarget1Hit: input.lastTrade?.target1Hit ?? null,
    lastTradeTarget2Hit: input.lastTrade?.target2Hit ?? null,
    marketReorganized: input.lastTrade ? marketReorganization.reorganized : null,
    reorganizationReasons: marketReorganization.reorganized ? marketReorganization.reasons : marketReorganization.missingConditions,
    momentumConditionsPassed,
    momentumConditionsMissing,
    diagnostics: {
      trend1h: trend1hDetails,
      trend15m: trend15mDetails,
      rawScore,
      supportResistanceZone: levels.support !== null && levels.resistance !== null ? "fora_da_zona_lateral" : "zona_indefinida",
    },
  };
}

export function analyzeDemoCandles(input: {
  symbol: DemoSymbol;
  displayPrice: number | null;
  candles1h: Candle[];
  candles15m: Candle[];
  candles5m: Candle[];
  lastTrade?: LastTradeContext | null;
  now?: number;
}): { price: number; signal: DemoSignalInput; analysis: RadarLikeAnalysis; filters: QualityFilter[] } {
  if (!ALLOWED_SYMBOLS.has(input.symbol)) throw new Error(`Unsupported demo symbol ${input.symbol}`);
  const now = input.now ?? Date.now();
  const candles5m = closedCandles(input.candles5m, now);
  const analysis = analyzeMarketDecision({ ...input, now });
  const closeTime = candles5m.at(-1)?.closeTime ?? now;
  const price = analysis.displayPrice ?? analysis.decisionPrice ?? 0;
  const filters = analysis.qualityFilters;
  if (!analysis.decisionPrice || analysis.suggestedDirection === "AGUARDAR") {
    return { price, analysis, filters, signal: noSignal(input.symbol, analysis.decisiveReason ?? analysis.blockedReasons[0] ?? "Radar sem entrada operacional.", closeTime, filters.map((filter, index) => ({
      number: index + 1,
      name: filter.name,
      value: filter.passed ? "APROVADO" : filter.severity === "penalty" ? "PENALIDADE" : "BLOQUEADO",
      reason: filter.reason,
    }))) };
  }
  if (analysis.conservativeEntry === null || analysis.stop === null || analysis.target1 === null || analysis.target2 === null || analysis.rr === null) {
    return { price, analysis, filters: [], signal: noSignal(input.symbol, "Plano incompleto: entrada conservadora, stop ou alvo indisponivel.", closeTime) };
  }
  const failed = blockingQualityFailures(filters);
  if (failed.length > 0) {
    return {
      price,
      analysis,
      filters,
      signal: noSignal(input.symbol, failed.map((filter) => filter.reason).join(" | "), closeTime, filters.map((filter, index) => ({
        number: index + 1,
        name: filter.name,
        value: filter.passed ? "APROVADO" : filter.severity === "penalty" ? "PENALIDADE" : "BLOQUEADO",
        reason: filter.reason,
      }))),
    };
  }
  const side: TradeSide = analysis.suggestedDirection === "COMPRA" ? "BUY" : "SELL";
  const steps: DemoSignalInput["steps"] = [
    ...analysis.scoreItems.map((item, index) => ({ number: index + 1, name: item.label, value: `${item.points}`, reason: item.detail })),
    { number: analysis.scoreItems.length + 1, name: "Score final", value: `${analysis.score}/100`, reason: "Score final calculado antes dos filtros anti-exaustao." },
    ...filters.map((filter, index) => ({
      number: analysis.scoreItems.length + index + 2,
      name: filter.name,
      value: filter.passed ? "APROVADO" : filter.severity === "penalty" ? "PENALIDADE" : "BLOQUEADO",
      reason: filter.reason,
    })),
  ];
  return {
    price,
    analysis,
    filters,
    signal: {
      pair: input.symbol,
      decision: side,
      entryNum: analysis.conservativeEntry,
      stopLossNum: analysis.stop,
      target1Num: analysis.target1,
      target2Num: analysis.target2,
      riskReward: `1:${analysis.rr.toFixed(2)}`,
      signalKey: `${input.symbol}:${side}:${analysis.signalKey}`,
      steps,
    },
  };
}
