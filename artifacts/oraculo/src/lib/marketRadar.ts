import type { Candle } from './binance';

export type RadarDirection = 'COMPRA' | 'VENDA' | 'AGUARDAR';
export type RadarTrend = 'ALTA' | 'BAIXA' | 'LATERAL';
export type RadarSymbol = 'BTCUSDT' | 'ETHUSDT' | 'SOLUSDT';
export type ChecklistKey = 'trend1h' | 'trend15m' | 'trigger5m' | 'volume' | 'rr' | 'notLateral';

export interface RadarChecklistItem {
  key: ChecklistKey;
  label: string;
  passed: boolean;
  detail: string;
}

export interface RadarScoreItem {
  label: string;
  points: number;
  detail: string;
}

export interface RadarVolume {
  current: number;
  average20: number;
  relative: number;
  delta5: number;
  expanding: boolean;
  veryWeak: boolean;
}

export interface RadarEntryPlan {
  aggressive: number | null;
  conservative: number | null;
}

export interface MarketRadarAnalysis {
  symbol: RadarSymbol;
  displayPrice: number | null;
  decisionPrice: number | null;
  trend1h: RadarTrend;
  trend15m: RadarTrend;
  trigger5m: RadarDirection;
  suggestedDirection: RadarDirection;
  support: number | null;
  resistance: number | null;
  recentHigh: number | null;
  recentLow: number | null;
  aggressiveEntry: number | null;
  conservativeEntry: number | null;
  stop: number | null;
  target1: number | null;
  target2: number | null;
  rr: number | null;
  score: number;
  classification: 'AGUARDAR' | 'SINAL FRACO' | 'SINAL VALIDO' | 'SINAL FORTE';
  checklist: RadarChecklistItem[];
  blockedReasons: string[];
  confirmations: string[];
  risks: string[];
  scoreItems: RadarScoreItem[];
  volume: RadarVolume | null;
  generatedAt: string;
  signalKey: string;
}

interface TrendDetails {
  trend: RadarTrend;
  ema9: number;
  ema21: number;
  ema200: number | null;
  higherHighs: boolean;
  higherLows: boolean;
  lowerHighs: boolean;
  lowerLows: boolean;
  ema21Slope: number;
}

interface TriggerDetails {
  direction: RadarDirection;
  aggressive: number | null;
  conservative: number | null;
  confirmation: string | null;
  risk: string | null;
}

const MIN_1H_CANDLES = 205;
const MIN_15M_CANDLES = 40;
const MIN_5M_CANDLES = 30;
const MIN_EMA200_WARMUP = 200;

function finite(n: number): boolean {
  return Number.isFinite(n);
}

function validCandle(c: Candle): boolean {
  if (!finite(c.openTime) || !finite(c.closeTime)) return false;
  if (!finite(c.open) || !finite(c.high) || !finite(c.low) || !finite(c.close) || !finite(c.volume)) return false;
  if (c.open < 0 || c.high < 0 || c.low < 0 || c.close < 0 || c.volume < 0) return false;
  if (c.closeTime <= c.openTime) return false;
  if (c.high < Math.max(c.open, c.close, c.low)) return false;
  if (c.low > Math.min(c.open, c.close, c.high)) return false;
  return true;
}

function closedCandles(candles: Candle[], now = Date.now()): Candle[] {
  return candles.filter((c) => c.closeTime <= now && validCandle(c));
}

function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

function last<T>(items: T[]): T | null {
  return items.length > 0 ? items[items.length - 1] : null;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function swingHighIndices(candles: Candle[], lookback = 2): number[] {
  const out: number[] = [];
  // A pivot is only considered confirmed after the next two candles have closed.
  // Future tests/backtests must not treat the pivot candle itself as the signal time.
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
  // A pivot is only considered confirmed after the next two candles have closed.
  // Future tests/backtests must not treat the pivot candle itself as the signal time.
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
  const higherHighs = highs.length >= 2 && highs[highs.length - 1].value > highs[highs.length - 2].value;
  const lowerHighs = highs.length >= 2 && highs[highs.length - 1].value < highs[highs.length - 2].value;
  const higherLows = lows.length >= 2 && lows[lows.length - 1].value > lows[lows.length - 2].value;
  const lowerLows = lows.length >= 2 && lows[lows.length - 1].value < lows[lows.length - 2].value;
  return { higherHighs, higherLows, lowerHighs, lowerLows };
}

function trendFor(candles: Candle[], includeEma200: boolean): TrendDetails {
  if (includeEma200 && candles.length < MIN_EMA200_WARMUP) {
    return {
      trend: 'LATERAL',
      ema9: 0,
      ema21: 0,
      ema200: null,
      ema21Slope: 0,
      higherHighs: false,
      higherLows: false,
      lowerHighs: false,
      lowerLows: false,
    };
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

  let trend: RadarTrend = 'LATERAL';
  if (bullishVotes === 4) trend = 'ALTA';
  if (bearishVotes === 4) trend = 'BAIXA';

  return { trend, ema9, ema21, ema200, ema21Slope, ...structure };
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
  const recentHigh = recent.length ? Math.max(...recent.map((c) => c.high)) : null;
  const recentLow = recent.length ? Math.min(...recent.map((c) => c.low)) : null;
  return { support, resistance, breakoutResistance, breakdownSupport, recentHigh, recentLow };
}

function volumeDetails(candles: Candle[]): RadarVolume | null {
  if (candles.length < 26) return null;
  const current = candles[candles.length - 1].volume;
  const previous20 = candles.slice(-21, -1).map((c) => c.volume);
  const average20 = average(previous20);
  const relative = average20 > 0 ? current / average20 : 0;
  const last5 = candles.slice(-5).map((c) => c.volume);
  const prev5 = candles.slice(-10, -5).map((c) => c.volume);
  const prevAvg = average(prev5);
  const currentAvg = average(last5);
  const delta5 = prevAvg > 0 ? (currentAvg - prevAvg) / prevAvg : 0;
  const expanding = relative >= 1 && delta5 > 0.08;
  return { current, average20, relative, delta5, expanding, veryWeak: relative < 0.5 };
}

function candleConfirms(candle: Candle, direction: Exclude<RadarDirection, 'AGUARDAR'>): boolean {
  const body = Math.abs(candle.close - candle.open);
  const range = Math.max(candle.high - candle.low, 1);
  const bodyRatio = body / range;
  if (direction === 'COMPRA') return candle.close > candle.open && bodyRatio >= 0.35;
  return candle.close < candle.open && bodyRatio >= 0.35;
}

function trigger5m(
  candles5m: Candle[],
  direction: RadarDirection,
  support: number | null,
  resistance: number | null,
  breakoutResistance: number | null,
  breakdownSupport: number | null,
  volume: RadarVolume | null,
): TriggerDetails {
  if (direction === 'AGUARDAR') {
    return { direction: 'AGUARDAR', aggressive: null, conservative: null, confirmation: null, risk: 'Timeframes maiores sem direcao operacional.' };
  }
  const lastClosed = last(candles5m);
  const previous = candles5m[candles5m.length - 2] ?? null;
  if (!lastClosed || !previous) {
    return { direction: 'AGUARDAR', aggressive: null, conservative: null, confirmation: null, risk: 'Dados insuficientes no 5m.' };
  }

  const volumeOk = volume ? volume.relative >= 0.8 : false;
  if (direction === 'COMPRA') {
    const level = breakoutResistance;
    if (!level) return { direction: 'AGUARDAR', aggressive: null, conservative: null, confirmation: null, risk: 'Sem resistencia confirmada para validar rompimento.' };
    const breakout = previous.close <= level && lastClosed.close > level && candleConfirms(lastClosed, 'COMPRA') && volumeOk;
    const retest = previous.low <= level * 1.0015 && lastClosed.low <= level * 1.0015 && lastClosed.close > level && candleConfirms(lastClosed, 'COMPRA') && volumeOk;
    return {
      direction: breakout || retest ? 'COMPRA' : 'AGUARDAR',
      aggressive: breakout ? lastClosed.close : level * 1.001,
      conservative: retest ? lastClosed.close : level,
      confirmation: breakout ? 'Rompimento confirmado no 5m.' : retest ? 'Reteste confirmado no 5m.' : null,
      risk: breakout || retest ? null : 'Aguardando rompimento ou reteste confirmado no 5m.',
    };
  }

  const level = breakdownSupport;
  if (!level) return { direction: 'AGUARDAR', aggressive: null, conservative: null, confirmation: null, risk: 'Sem suporte confirmado para validar rompimento.' };
  const breakout = previous.close >= level && lastClosed.close < level && candleConfirms(lastClosed, 'VENDA') && volumeOk;
  const retest = previous.high >= level * 0.9985 && lastClosed.high >= level * 0.9985 && lastClosed.close < level && candleConfirms(lastClosed, 'VENDA') && volumeOk;
  return {
    direction: breakout || retest ? 'VENDA' : 'AGUARDAR',
    aggressive: breakout ? lastClosed.close : level * 0.999,
    conservative: retest ? lastClosed.close : level,
    confirmation: breakout ? 'Rompimento confirmado no 5m.' : retest ? 'Reteste confirmado no 5m.' : null,
    risk: breakout || retest ? null : 'Aguardando rompimento ou reteste confirmado no 5m.',
  };
}

function rrPlan(
  direction: RadarDirection,
  entry: number | null,
  support: number | null,
  resistance: number | null,
  breakoutResistance: number | null,
  breakdownSupport: number | null,
) {
  if (direction === 'AGUARDAR' || entry === null) {
    return { stop: null, target1: null, target2: null, rr: null, stopTooFar: false, valid: false };
  }
  const stop = direction === 'COMPRA'
    ? [support, breakoutResistance]
        .filter((value): value is number => value !== null && value < entry)
        .map((value) => value * 0.999)
        .sort((a, b) => b - a)[0] ?? null
    : [resistance, breakdownSupport]
        .filter((value): value is number => value !== null && value > entry)
        .map((value) => value * 1.001)
        .sort((a, b) => a - b)[0] ?? null;
  if (stop === null || !finite(entry) || !finite(stop) || entry <= 0 || stop <= 0) {
    return { stop, target1: null, target2: null, rr: null, stopTooFar: false, valid: false };
  }
  const risk = Math.abs(entry - stop);
  const stopTooFar = risk / entry > 0.012;
  if (!finite(risk) || risk <= 0) return { stop, target1: null, target2: null, rr: null, stopTooFar, valid: false };
  const target1 = direction === 'COMPRA' ? entry + risk * 2 : entry - risk * 2;
  const target2 = direction === 'COMPRA' ? entry + risk * 3 : entry - risk * 3;
  const reward = Math.abs(target1 - entry);
  const rr = reward / risk;
  const values = [entry, stop, target1, target2, rr, risk];
  const validNumbers = values.every((value) => finite(value) && value > 0);
  const validBuy = direction !== 'COMPRA' || (stop < entry && target1 > entry && target2 > target1);
  const validSell = direction !== 'VENDA' || (stop > entry && target1 < entry && target2 < target1);
  const valid = validNumbers && validBuy && validSell;
  return valid
    ? { stop, target1, target2, rr, stopTooFar, valid }
    : { stop: null, target1: null, target2: null, rr: null, stopTooFar, valid };
}

function classification(score: number, direction: RadarDirection): MarketRadarAnalysis['classification'] {
  if (direction === 'AGUARDAR' || score < 50) return 'AGUARDAR';
  if (score < 70) return 'SINAL FRACO';
  if (score < 85) return 'SINAL VALIDO';
  return 'SINAL FORTE';
}

export function analyzeMarketRadar(input: {
  symbol: RadarSymbol;
  displayPrice: number | null;
  candles1h: Candle[];
  candles15m: Candle[];
  candles5m: Candle[];
  now?: number;
}): MarketRadarAnalysis {
  const now = input.now ?? Date.now();
  const generatedAt = new Date(now).toISOString();
  const candles1h = closedCandles(input.candles1h, now);
  const candles15m = closedCandles(input.candles15m, now);
  const candles5m = closedCandles(input.candles5m, now);
  const decisionPrice = last(candles5m)?.close ?? last(candles15m)?.close ?? last(candles1h)?.close ?? null;
  const displayPrice = input.displayPrice !== null && finite(input.displayPrice) && input.displayPrice > 0 ? input.displayPrice : decisionPrice;
  const blockedReasons: string[] = [];
  const confirmations: string[] = [];
  const risks: string[] = [];
  const scoreItems: RadarScoreItem[] = [];

  if (decisionPrice === null || candles1h.length < MIN_1H_CANDLES || candles15m.length < MIN_15M_CANDLES || candles5m.length < MIN_5M_CANDLES) {
    blockedReasons.push('Dados insuficientes para calcular o Radar sem usar vela aberta.');
  }
  if (candles1h.length < MIN_EMA200_WARMUP) {
    blockedReasons.push('Dados insuficientes para warm-up minimo da EMA 200.');
  }

  const trend1hDetails = candles1h.length >= MIN_EMA200_WARMUP ? trendFor(candles1h, true) : null;
  const trend15mDetails = candles15m.length >= 25 ? trendFor(candles15m, false) : null;
  const trend1h = trend1hDetails?.trend ?? 'LATERAL';
  const trend15m = trend15mDetails?.trend ?? 'LATERAL';
  const levels = decisionPrice !== null
    ? supportResistance(candles15m, decisionPrice)
    : { support: null, resistance: null, breakoutResistance: null, breakdownSupport: null, recentHigh: null, recentLow: null };
  const volume = volumeDetails(candles15m);

  if (trend1h === 'LATERAL') risks.push('1h sem consenso entre EMA 200, EMA 9/21, estrutura e inclinacao da EMA 21.');
  if (trend15m === 'LATERAL') risks.push('15m sem estrutura direcional limpa.');
  if (trend1h !== 'LATERAL' && trend15m !== 'LATERAL' && trend1h !== trend15m) blockedReasons.push('1h e 15m estao em direcoes opostas.');
  if (volume?.veryWeak) blockedReasons.push('Volume muito baixo em relacao a media.');

  const alignedDirection: RadarDirection = trend1h === trend15m && trend1h === 'ALTA'
    ? 'COMPRA'
    : trend1h === trend15m && trend1h === 'BAIXA'
    ? 'VENDA'
    : 'AGUARDAR';
  const trigger = trigger5m(
    candles5m,
    alignedDirection,
    levels.support,
    levels.resistance,
    levels.breakoutResistance,
    levels.breakdownSupport,
    volume,
  );
  const entry = trigger.conservative ?? trigger.aggressive;
  const plan = rrPlan(
    trigger.direction,
    entry,
    levels.support,
    levels.resistance,
    levels.breakoutResistance,
    levels.breakdownSupport,
  );

  const range = levels.support !== null && levels.resistance !== null ? levels.resistance - levels.support : 0;
  const rangePosition = decisionPrice !== null && range > 0 ? (decisionPrice - levels.support!) / range : null;
  const inMiddleOfLateralZone = trend15m === 'LATERAL' && rangePosition !== null && rangePosition >= 0.35 && rangePosition <= 0.65;
  if (inMiddleOfLateralZone) blockedReasons.push('Preco no meio de zona lateral.');
  if (plan.rr !== null && plan.rr < 2) blockedReasons.push('Relacao risco/retorno menor que 1:2.');
  if (plan.stopTooFar) blockedReasons.push('Stop excessivamente distante para o setup intraday.');
  if (trigger.direction !== 'AGUARDAR' && !plan.valid) blockedReasons.push('Plano matematicamente inválido');

  const checklist: RadarChecklistItem[] = [
    { key: 'trend1h', label: 'Tendencia 1h', passed: trend1h !== 'LATERAL', detail: trend1h },
    { key: 'trend15m', label: 'Tendencia 15m', passed: trend15m !== 'LATERAL' && trend15m === trend1h, detail: trend15m },
    { key: 'trigger5m', label: 'Gatilho 5m', passed: trigger.direction !== 'AGUARDAR', detail: trigger.confirmation ?? trigger.risk ?? 'Sem gatilho.' },
    { key: 'volume', label: 'Volume', passed: !!volume && volume.relative >= 0.8 && !volume.veryWeak, detail: volume ? `${(volume.relative * 100).toFixed(0)}% da media` : 'Indisponivel' },
    { key: 'rr', label: 'R/R >= 2', passed: plan.rr !== null && plan.rr >= 2, detail: plan.rr !== null ? `1:${plan.rr.toFixed(2)}` : 'Indisponivel' },
    { key: 'notLateral', label: 'Fora da zona lateral', passed: !inMiddleOfLateralZone && trend1h !== 'LATERAL' && trend15m !== 'LATERAL', detail: inMiddleOfLateralZone ? 'Meio do range' : 'OK' },
  ];

  if (trend1h !== 'LATERAL') { scoreItems.push({ label: '+25 tendencia 1h', points: 25, detail: trend1h }); confirmations.push(`Tendencia 1h em ${trend1h}.`); }
  else scoreItems.push({ label: '-10 lateralizacao 1h', points: -10, detail: 'Conflito entre criterios da tendencia maior.' });
  if (trend15m !== 'LATERAL' && trend15m === trend1h) { scoreItems.push({ label: '+20 confirmacao 15m', points: 20, detail: trend15m }); confirmations.push(`15m alinhado em ${trend15m}.`); }
  else scoreItems.push({ label: '-10 conflito/lateral 15m', points: -10, detail: '15m nao confirma o 1h.' });
  if (trigger.direction !== 'AGUARDAR') { scoreItems.push({ label: '+20 gatilho 5m', points: 20, detail: trigger.confirmation ?? 'Gatilho aprovado.' }); confirmations.push(trigger.confirmation ?? 'Gatilho 5m aprovado.'); }
  else scoreItems.push({ label: '-10 sem gatilho 5m', points: -10, detail: trigger.risk ?? 'Sem gatilho confirmado.' });
  if (volume && volume.relative >= 0.8) { scoreItems.push({ label: '+15 volume', points: 15, detail: volume.expanding ? 'Volume relativo com expansao.' : 'Volume proximo/acima da media.' }); confirmations.push(volume.expanding ? 'Volume em expansao.' : 'Volume suficiente.'); }
  else scoreItems.push({ label: '-20 volume fraco', points: -20, detail: 'Volume abaixo do minimo operacional.' });
  if (levels.support !== null && levels.resistance !== null) { scoreItems.push({ label: '+10 suporte/resistencia', points: 10, detail: 'Niveis estruturais encontrados.' }); confirmations.push('Suporte e resistencia mapeados.'); }
  else scoreItems.push({ label: '-10 sem nivel claro', points: -10, detail: 'Suporte ou resistencia principal ausente.' });
  if (plan.rr !== null && plan.rr >= 2) { scoreItems.push({ label: '+10 R/R >= 2', points: 10, detail: `1:${plan.rr.toFixed(2)}` }); confirmations.push('R/R minimo aprovado.'); }
  else scoreItems.push({ label: '-20 risco alto', points: -20, detail: plan.rr !== null ? `1:${plan.rr.toFixed(2)}` : 'R/R indisponivel.' });

  if (plan.stopTooFar) scoreItems.push({ label: '-20 stop distante', points: -20, detail: 'Stop acima do limite de 1,2%.' });
  if (inMiddleOfLateralZone) scoreItems.push({ label: '-10 lateralizacao', points: -10, detail: 'Preco no meio do range.' });

  const rawScore = scoreItems.reduce((sum, item) => sum + item.points, 0);
  const score = Math.max(0, Math.min(100, rawScore));
  const checklistFailed = checklist.some((item) => !item.passed);
  const suggestedDirection: RadarDirection = checklistFailed || blockedReasons.length > 0 ? 'AGUARDAR' : trigger.direction;

  if (trigger.risk) risks.push(trigger.risk);
  if (plan.rr !== null && plan.rr < 2) risks.push(`R/R atual em 1:${plan.rr.toFixed(2)}.`);
  if (plan.stopTooFar) risks.push('Stop acima de 1,2% da entrada.');
  if (!volume) risks.push('Volume indisponivel.');
  if (blockedReasons.length === 0 && risks.length === 0) risks.push('Sem bloqueios criticos no MVP.');

  const signalKey = [
    suggestedDirection,
    candles1h[candles1h.length - 1]?.closeTime ?? 0,
    candles15m[candles15m.length - 1]?.closeTime ?? 0,
    candles5m[candles5m.length - 1]?.closeTime ?? 0,
    entry?.toFixed(2) ?? 'none',
    plan.stop?.toFixed(2) ?? 'none',
  ].join('|');

  return {
    symbol: input.symbol,
    displayPrice,
    decisionPrice,
    trend1h,
    trend15m,
    trigger5m: trigger.direction,
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
    classification: classification(score, suggestedDirection),
    checklist,
    blockedReasons,
    confirmations: confirmations.slice(0, 6),
    risks: risks.slice(0, 6),
    scoreItems,
    volume,
    generatedAt,
    signalKey,
  };
}
