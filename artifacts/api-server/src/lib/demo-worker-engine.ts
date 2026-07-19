import type { DemoSignalInput } from "./demo-store";

type RadarDirection = "COMPRA" | "VENDA" | "AGUARDAR";
type RadarTrend = "ALTA" | "BAIXA" | "LATERAL";
type TradeSide = "BUY" | "SELL";
type DemoSymbol = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

interface TrendDetails {
  trend: RadarTrend;
  ema9: number;
  ema21: number;
  ema200: number | null;
  ema21Slope: number;
}

interface QualityFilter {
  name: string;
  passed: boolean;
  reason: string;
  penalty?: number;
}

interface RadarLikeAnalysis {
  symbol: DemoSymbol;
  displayPrice: number | null;
  decisionPrice: number | null;
  trend1h: RadarTrend;
  trend15m: RadarTrend;
  trigger5m: RadarDirection;
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
  confirmations: string[];
  blockedReasons: string[];
  risks: string[];
  scoreItems: Array<{ label: string; points: number; detail: string }>;
  volume: { current: number; average20: number; relative: number; delta5: number; expanding: boolean; veryWeak: boolean } | null;
  signalKey: string;
}

const BINANCE_BASE = "https://api.binance.us/api/v3";
const ALLOWED_SYMBOLS = new Set<DemoSymbol>(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
const MIN_1H_CANDLES = 205;
const MIN_15M_CANDLES = 40;
const MIN_5M_CANDLES = 30;
const MIN_EMA200_WARMUP = 200;
const MAX_EMA21_DISTANCE_PCT = 0.006;
const MAX_EMA9_DISTANCE_PCT = 0.004;
const MAX_STRETCHED_MOVE_PCT = 0.012;
const MAX_SAME_DIRECTION_CANDLES = 3;
const CLIMAX_RANGE_ATR_MULTIPLE = 2.2;
const CLIMAX_BODY_AVG_MULTIPLE = 1.8;
const MIN_VOLUME_RELATIVE = 0.8;
const MIN_RR = 2;

async function binanceJson(path: string): Promise<unknown> {
  const res = await fetch(`${BINANCE_BASE}${path}`);
  if (!res.ok) throw new Error(`Binance upstream error ${res.status}: ${res.statusText}`);
  return await res.json();
}

function finite(n: number): boolean {
  return Number.isFinite(n);
}

function toCandle(row: unknown): Candle | null {
  if (!Array.isArray(row) || row.length < 7) return null;
  const candle: Candle = {
    openTime: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
    closeTime: Number(row[6]),
  };
  return validCandle(candle) ? candle : null;
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

async function fetchKlines(symbol: string, interval: string, limit: number): Promise<Candle[]> {
  const raw = await binanceJson(`/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  if (!Array.isArray(raw)) return [];
  return raw.map(toCandle).filter((candle): candle is Candle => candle !== null);
}

export async function fetchDisplayPrice(symbol: string): Promise<number> {
  const data = await binanceJson(`/ticker/price?symbol=${symbol}`) as { price?: unknown };
  const price = Number(data.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Invalid Binance price");
  return price;
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
    return { trend: "LATERAL", ema9: 0, ema21: 0, ema200: null, ema21Slope: 0 };
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
  if (bullishVotes === 4) trend = "ALTA";
  if (bearishVotes === 4) trend = "BAIXA";
  return { trend, ema9, ema21, ema200, ema21Slope };
}

function supportResistance(candles: Candle[], price: number) {
  const p = pivots(candles);
  const highs = p.highs.map((item) => item.value);
  const lows = p.lows.map((item) => item.value);
  const resistance = highs.filter((value) => value > price * 1.0003).sort((a, b) => a - b)[0] ?? null;
  const support = lows.filter((value) => value < price * 0.9997).sort((a, b) => b - a)[0] ?? null;
  const breakoutResistance = highs.filter((value) => value < price * 1.001).sort((a, b) => b - a)[0] ?? resistance;
  const breakdownSupport = lows.filter((value) => value > price * 0.999).sort((a, b) => a - b)[0] ?? support;
  return { support, resistance, breakoutResistance, breakdownSupport };
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
  const range = Math.max(candle.high - candle.low, 1);
  const bodyRatio = body / range;
  return direction === "COMPRA"
    ? candle.close > candle.open && bodyRatio >= 0.35
    : candle.close < candle.open && bodyRatio >= 0.35;
}

function trigger5m(candles5m: Candle[], direction: RadarDirection, breakoutResistance: number | null, breakdownSupport: number | null, volumeOk: boolean) {
  const lastClosed = last(candles5m);
  const previous = candles5m[candles5m.length - 2] ?? null;
  if (direction === "AGUARDAR" || !lastClosed || !previous) {
    return { direction: "AGUARDAR" as const, aggressive: null, conservative: null, confirmation: null, risk: "Timeframes maiores sem direcao operacional." };
  }
  if (direction === "COMPRA") {
    const level = breakoutResistance;
    if (!level) return { direction: "AGUARDAR" as const, aggressive: null, conservative: null, confirmation: null, risk: "Sem resistencia confirmada para validar rompimento." };
    const breakout = previous.close <= level && lastClosed.close > level && candleConfirms(lastClosed, "COMPRA") && volumeOk;
    const retest = previous.low <= level * 1.0015 && lastClosed.low <= level * 1.0015 && lastClosed.close > level && candleConfirms(lastClosed, "COMPRA") && volumeOk;
    return {
      direction: breakout || retest ? "COMPRA" as const : "AGUARDAR" as const,
      aggressive: breakout ? lastClosed.close : level * 1.001,
      conservative: retest ? lastClosed.close : level,
      confirmation: retest ? "Reteste real confirmado no 5m." : breakout ? "Rompimento confirmado no 5m; aguardando reteste para o robo." : null,
      risk: breakout || retest ? null : "Aguardando rompimento ou reteste confirmado no 5m.",
    };
  }
  const level = breakdownSupport;
  if (!level) return { direction: "AGUARDAR" as const, aggressive: null, conservative: null, confirmation: null, risk: "Sem suporte confirmado para validar rompimento." };
  const breakout = previous.close >= level && lastClosed.close < level && candleConfirms(lastClosed, "VENDA") && volumeOk;
  const retest = previous.high >= level * 0.9985 && lastClosed.high >= level * 0.9985 && lastClosed.close < level && candleConfirms(lastClosed, "VENDA") && volumeOk;
  return {
    direction: breakout || retest ? "VENDA" as const : "AGUARDAR" as const,
    aggressive: breakout ? lastClosed.close : level * 0.999,
    conservative: retest ? lastClosed.close : level,
    confirmation: retest ? "Reteste real confirmado no 5m." : breakout ? "Rompimento confirmado no 5m; aguardando reteste para o robo." : null,
    risk: breakout || retest ? null : "Aguardando rompimento ou reteste confirmado no 5m.",
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
  return { stop, target1, target2, rr, valid: validNumbers && validBuy && validSell, stopTooFar };
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

export function qualityFilters(side: TradeSide, entry: number, candles5m: Candle[], trend15m: TrendDetails, volume: RadarLikeAnalysis["volume"]): QualityFilter[] {
  const lastClosed = last(candles5m);
  const recent = candles5m.slice(-20);
  const currentAtr = atr(candles5m, 14);
  const lastRange = lastClosed ? lastClosed.high - lastClosed.low : 0;
  const lastBody = lastClosed ? Math.abs(lastClosed.close - lastClosed.open) : 0;
  const avgBody = average(recent.map((c) => Math.abs(c.close - c.open)));
  const ema21Distance = trend15m.ema21 > 0 ? Math.abs(entry - trend15m.ema21) / entry : Number.POSITIVE_INFINITY;
  const ema9Distance = trend15m.ema9 > 0 ? Math.abs(entry - trend15m.ema9) / entry : Number.POSITIVE_INFINITY;
  const move5 = candles5m.length >= 6 ? Math.abs(entry - candles5m[candles5m.length - 6].close) / entry : 0;
  const run = sameDirectionRun(candles5m, side);
  const upperWick = lastClosed ? lastClosed.high - Math.max(lastClosed.open, lastClosed.close) : 0;
  const lowerWick = lastClosed ? Math.min(lastClosed.open, lastClosed.close) - lastClosed.low : 0;
  const rejectionWick = side === "BUY" ? upperWick : lowerWick;
  return [
    {
      name: "Reteste conservador",
      passed: true,
      reason: "Entrada usa apenas reteste confirmado; rompimento imediato nao abre trade demo.",
    },
    {
      name: "Distancia da EMA21",
      passed: ema21Distance <= MAX_EMA21_DISTANCE_PCT,
      reason: `Distancia da EMA21 em ${(ema21Distance * 100).toFixed(2)}% (max ${(MAX_EMA21_DISTANCE_PCT * 100).toFixed(2)}%).`,
      penalty: -20,
    },
    {
      name: "Distancia da EMA9",
      passed: ema9Distance <= MAX_EMA9_DISTANCE_PCT,
      reason: `Distancia da EMA9 em ${(ema9Distance * 100).toFixed(2)}% (max ${(MAX_EMA9_DISTANCE_PCT * 100).toFixed(2)}%).`,
      penalty: -10,
    },
    {
      name: "Movimento esticado",
      passed: move5 <= MAX_STRETCHED_MOVE_PCT,
      reason: `Movimento das ultimas 5 velas em ${(move5 * 100).toFixed(2)}% (max ${(MAX_STRETCHED_MOVE_PCT * 100).toFixed(2)}%).`,
      penalty: -20,
    },
    {
      name: "Sequencia de candles",
      passed: run <= MAX_SAME_DIRECTION_CANDLES,
      reason: `${run} velas consecutivas na direcao da entrada (max ${MAX_SAME_DIRECTION_CANDLES}).`,
      penalty: -15,
    },
    {
      name: "Candle climatico",
      passed: currentAtr > 0 && avgBody > 0 && lastRange <= currentAtr * CLIMAX_RANGE_ATR_MULTIPLE && lastBody <= avgBody * CLIMAX_BODY_AVG_MULTIPLE,
      reason: `Range ${(currentAtr > 0 ? lastRange / currentAtr : 0).toFixed(2)}x ATR; corpo ${(avgBody > 0 ? lastBody / avgBody : 0).toFixed(2)}x media.`,
      penalty: -25,
    },
    {
      name: "Pavio contra entrada",
      passed: lastBody > 0 && rejectionWick <= lastBody * 1.5,
      reason: `Pavio contra entrada em ${(lastBody > 0 ? rejectionWick / lastBody : 0).toFixed(2)}x o corpo.`,
      penalty: -15,
    },
    {
      name: "Volume compativel",
      passed: !!volume && volume.relative >= MIN_VOLUME_RELATIVE,
      reason: volume ? `Volume relativo ${(volume.relative * 100).toFixed(0)}%.` : "Volume indisponivel.",
      penalty: -20,
    },
  ];
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

function analyzeRadarLike(input: {
  symbol: DemoSymbol;
  displayPrice: number | null;
  candles1h: Candle[];
  candles15m: Candle[];
  candles5m: Candle[];
  now?: number;
}): RadarLikeAnalysis {
  const now = input.now ?? Date.now();
  const candles1h = closedCandles(input.candles1h, now);
  const candles15m = closedCandles(input.candles15m, now);
  const candles5m = closedCandles(input.candles5m, now);
  const decisionPrice = last(candles5m)?.close ?? last(candles15m)?.close ?? last(candles1h)?.close ?? null;
  const displayPrice = input.displayPrice !== null && finite(input.displayPrice) && input.displayPrice > 0 ? input.displayPrice : decisionPrice;
  const blockedReasons: string[] = [];
  const confirmations: string[] = [];
  const risks: string[] = [];
  const scoreItems: RadarLikeAnalysis["scoreItems"] = [];

  if (decisionPrice === null || candles1h.length < MIN_1H_CANDLES || candles15m.length < MIN_15M_CANDLES || candles5m.length < MIN_5M_CANDLES) {
    blockedReasons.push("Dados insuficientes para calcular o Radar sem usar vela aberta.");
  }
  if (candles1h.length < MIN_EMA200_WARMUP) blockedReasons.push("Dados insuficientes para warm-up minimo da EMA 200.");

  const trend1hDetails = candles1h.length >= MIN_EMA200_WARMUP ? trendFor(candles1h, true) : null;
  const trend15mDetails = candles15m.length >= 25 ? trendFor(candles15m, false) : null;
  const trend1h = trend1hDetails?.trend ?? "LATERAL";
  const trend15m = trend15mDetails?.trend ?? "LATERAL";
  const levels = decisionPrice !== null
    ? supportResistance(candles15m, decisionPrice)
    : { support: null, resistance: null, breakoutResistance: null, breakdownSupport: null };
  const volume = volumeDetails(candles15m);
  if (trend1h !== "LATERAL" && trend15m !== "LATERAL" && trend1h !== trend15m) blockedReasons.push("1h e 15m estao em direcoes opostas.");
  if (volume?.veryWeak) blockedReasons.push("Volume muito baixo em relacao a media.");
  const alignedDirection: RadarDirection = trend1h === trend15m && trend1h === "ALTA" ? "COMPRA" : trend1h === trend15m && trend1h === "BAIXA" ? "VENDA" : "AGUARDAR";
  const trigger = trigger5m(candles5m, alignedDirection, levels.breakoutResistance, levels.breakdownSupport, !!volume && volume.relative >= MIN_VOLUME_RELATIVE);
  const entry = trigger.conservative;
  const plan = rrPlan(trigger.direction, entry, levels.support, levels.resistance, levels.breakoutResistance, levels.breakdownSupport);
  if (trigger.direction !== "AGUARDAR" && trigger.conservative === null) blockedReasons.push("Robo demo exige reteste real; rompimento imediato nao abre operacao.");
  if (plan.rr !== null && plan.rr < MIN_RR) blockedReasons.push("Relacao risco/retorno menor que 1:2.");
  if (plan.stopTooFar) blockedReasons.push("Stop excessivamente distante para o setup intraday.");
  if (trigger.direction !== "AGUARDAR" && !plan.valid) blockedReasons.push("Plano matematicamente invalido.");

  if (trend1h !== "LATERAL") { scoreItems.push({ label: "+25 tendencia 1h", points: 25, detail: trend1h }); confirmations.push(`Tendencia 1h em ${trend1h}.`); }
  else scoreItems.push({ label: "-10 lateralizacao 1h", points: -10, detail: "Conflito nos criterios da tendencia maior." });
  if (trend15m !== "LATERAL" && trend15m === trend1h) { scoreItems.push({ label: "+20 confirmacao 15m", points: 20, detail: trend15m }); confirmations.push(`15m alinhado em ${trend15m}.`); }
  else scoreItems.push({ label: "-10 conflito/lateral 15m", points: -10, detail: "15m nao confirma o 1h." });
  if (trigger.direction !== "AGUARDAR" && trigger.conservative !== null) { scoreItems.push({ label: "+20 reteste 5m", points: 20, detail: trigger.confirmation ?? "Reteste aprovado." }); confirmations.push(trigger.confirmation ?? "Reteste 5m aprovado."); }
  else scoreItems.push({ label: "-20 sem reteste 5m", points: -20, detail: trigger.risk ?? "Sem reteste confirmado." });
  if (volume && volume.relative >= MIN_VOLUME_RELATIVE) { scoreItems.push({ label: "+15 volume", points: 15, detail: volume.expanding ? "Volume relativo com expansao." : "Volume suficiente." }); confirmations.push(volume.expanding ? "Volume em expansao." : "Volume suficiente."); }
  else scoreItems.push({ label: "-20 volume fraco", points: -20, detail: "Volume abaixo do minimo operacional." });
  if (levels.support !== null && levels.resistance !== null) { scoreItems.push({ label: "+10 suporte/resistencia", points: 10, detail: "Niveis estruturais encontrados." }); confirmations.push("Suporte e resistencia mapeados."); }
  else scoreItems.push({ label: "-10 sem nivel claro", points: -10, detail: "Suporte ou resistencia principal ausente." });
  if (plan.rr !== null && plan.rr >= MIN_RR) { scoreItems.push({ label: "+10 R/R >= 2", points: 10, detail: `1:${plan.rr.toFixed(2)}` }); confirmations.push("R/R minimo aprovado."); }
  else scoreItems.push({ label: "-20 risco alto", points: -20, detail: plan.rr !== null ? `1:${plan.rr.toFixed(2)}` : "R/R indisponivel." });
  const rawScore = scoreItems.reduce((sum, item) => sum + item.points, 0);
  const score = Math.max(0, Math.min(100, rawScore));
  const suggestedDirection = blockedReasons.length > 0 || trigger.conservative === null ? "AGUARDAR" : trigger.direction;
  const signalKey = [
    suggestedDirection,
    candles1h[candles1h.length - 1]?.closeTime ?? 0,
    candles15m[candles15m.length - 1]?.closeTime ?? 0,
    candles5m[candles5m.length - 1]?.closeTime ?? 0,
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
    suggestedDirection,
    support: levels.support,
    resistance: levels.resistance,
    aggressiveEntry: trigger.aggressive,
    conservativeEntry: trigger.conservative,
    stop: plan.stop,
    target1: plan.target1,
    target2: plan.target2,
    rr: plan.rr,
    score,
    confirmations: confirmations.slice(0, 8),
    blockedReasons,
    risks,
    scoreItems,
    volume,
    signalKey,
  };
}

export function analyzeDemoCandles(input: {
  symbol: DemoSymbol;
  displayPrice: number | null;
  candles1h: Candle[];
  candles15m: Candle[];
  candles5m: Candle[];
  now?: number;
}): { price: number; signal: DemoSignalInput; analysis: RadarLikeAnalysis; filters: QualityFilter[] } {
  if (!ALLOWED_SYMBOLS.has(input.symbol)) throw new Error(`Unsupported demo symbol ${input.symbol}`);
  const now = input.now ?? Date.now();
  const candles5m = closedCandles(input.candles5m, now);
  const analysis = analyzeRadarLike({ ...input, now });
  const closeTime = candles5m.at(-1)?.closeTime ?? now;
  const price = analysis.displayPrice ?? analysis.decisionPrice ?? 0;
  if (!analysis.decisionPrice || analysis.suggestedDirection === "AGUARDAR") {
    return { price, analysis, filters: [], signal: noSignal(input.symbol, analysis.blockedReasons[0] ?? "Radar sem entrada operacional.", closeTime) };
  }
  if (analysis.conservativeEntry === null || analysis.stop === null || analysis.target1 === null || analysis.target2 === null || analysis.rr === null) {
    return { price, analysis, filters: [], signal: noSignal(input.symbol, "Plano incompleto: entrada conservadora, stop ou alvo indisponivel.", closeTime) };
  }
  const side: TradeSide = analysis.suggestedDirection === "COMPRA" ? "BUY" : "SELL";
  const closed15m = closedCandles(input.candles15m, now);
  const trend15m = trendFor(closed15m, false);
  const filters = qualityFilters(side, analysis.conservativeEntry, candles5m, trend15m, analysis.volume);
  const failed = filters.filter((filter) => !filter.passed);
  if (failed.length > 0) {
    return {
      price,
      analysis,
      filters,
      signal: noSignal(input.symbol, failed.map((filter) => filter.reason).join(" | "), closeTime, filters.map((filter, index) => ({
        number: index + 1,
        name: filter.name,
        value: filter.passed ? "APROVADO" : "BLOQUEADO",
        reason: filter.reason,
      }))),
    };
  }
  const steps: DemoSignalInput["steps"] = [
    ...analysis.scoreItems.map((item, index) => ({ number: index + 1, name: item.label, value: `${item.points}`, reason: item.detail })),
    ...filters.map((filter, index) => ({
      number: analysis.scoreItems.length + index + 1,
      name: filter.name,
      value: filter.passed ? "APROVADO" : "BLOQUEADO",
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

export async function analyzeDemoSignal(symbol: string): Promise<{ price: number; signal: DemoSignalInput }> {
  const normalized = symbol.toUpperCase() as DemoSymbol;
  if (!ALLOWED_SYMBOLS.has(normalized)) throw new Error(`Unsupported demo symbol ${symbol}`);
  const [price, candles1h, candles15m, candles5m] = await Promise.all([
    fetchDisplayPrice(normalized),
    fetchKlines(normalized, "1h", 240),
    fetchKlines(normalized, "15m", 90),
    fetchKlines(normalized, "5m", 80),
  ]);
  const result = analyzeDemoCandles({ symbol: normalized, displayPrice: price, candles1h, candles15m, candles5m });
  return { price: result.price, signal: result.signal };
}
