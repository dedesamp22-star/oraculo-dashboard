/**
 * ORÁCULO Rule Engine — EMA-based, rule-driven market analysis.
 *
 * Indicators used:
 *   · EMA 9   — short-term momentum (15M and 5M)
 *   · EMA 21  — medium-term momentum (15M)
 *   · EMA 200 — macro trend filter (1H)
 *
 * No AI. No predictions. Every output is a direct consequence of a
 * deterministic rule applied to real OHLCV data from Binance.
 *
 * Pipeline:
 *   1. 1H  — Determine macro trend via EMA 200
 *   2. 15M — Check EMA 9 / EMA 21 alignment (momentum direction)
 *   3. 5M  — Confirm entry: price above/below EMA 9
 *   4. 15M — Identify nearest Support & Resistance levels
 *   5. 15M — Volume validation on current candle
 *   6.      — Risk/Reward calculation using S/R anchors
 *   7.      — Final decision: BUY | SELL | NO TRADE
 */

import type { Candle } from './binance';

// ── Types ─────────────────────────────────────────────────────────────────────

export type StepStatus = 'PASS' | 'FAIL' | 'INFO';

export interface RuleStep {
  number: number;
  name: string;
  status: StepStatus;
  value: string;
  reason: string;
}

export type Decision = 'BUY' | 'SELL' | 'NO TRADE';

export interface EngineResult {
  decision: Decision;
  steps: RuleStep[];
  entry: string | null;
  stopLoss: string | null;
  target1: string | null;
  target2: string | null;
  riskReward: string | null;
  nearestSupport: string | null;
  nearestResistance: string | null;
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}%`;
}

/**
 * Exponential Moving Average.
 * Returns an array of the same length as `values`.
 * The first value is seeded with values[0]; subsequent values use the EMA formula.
 * With enough warm-up candles (≥ 3× period), the result is a good approximation.
 */
function calcEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

function lastEMA(candles: Candle[], period: number): number {
  const closes = candles.map(c => c.close);
  const series = calcEMA(closes, period);
  return series[series.length - 1];
}

function prevEMA(candles: Candle[], period: number): number {
  const closes = candles.map(c => c.close);
  const series = calcEMA(closes, period);
  return series[series.length - 2] ?? series[series.length - 1];
}

/** Average True Range */
function calcATR(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs = candles.slice(1).map((c, i) => {
    const prev = candles[i];
    return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  });
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/** Average volume over the last `period` closed candles (excludes the current incomplete candle) */
function avgVolume(candles: Candle[], period = 20): number {
  const slice = candles.slice(-period - 1, -1);
  if (slice.length === 0) return 0;
  return slice.reduce((a, c) => a + c.volume, 0) / slice.length;
}

// ── Pivot-based S/R scanner (unchanged — real structural levels) ──────────────

function swingHighIndices(candles: Candle[], lookback = 2): number[] {
  const out: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const h = candles[i].high;
    if (candles.slice(i - lookback, i).every(c => c.high < h) &&
        candles.slice(i + 1, i + lookback + 1).every(c => c.high < h)) {
      out.push(i);
    }
  }
  return out;
}

function swingLowIndices(candles: Candle[], lookback = 2): number[] {
  const out: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const l = candles[i].low;
    if (candles.slice(i - lookback, i).every(c => c.low > l) &&
        candles.slice(i + 1, i + lookback + 1).every(c => c.low > l)) {
      out.push(i);
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 1 — 1H Macro Trend via EMA 200
// ═══════════════════════════════════════════════════════════════════════════════

type TrendDir = 'UP' | 'DOWN' | 'UNDEFINED';

interface TrendResult { direction: TrendDir; step: RuleStep }

function step1_trend1h(candles1h: Candle[]): TrendResult {
  if (candles1h.length < 30) {
    return {
      direction: 'UNDEFINED',
      step: {
        number: 1, name: 'Tendência 1H — EMA 200',
        status: 'FAIL', value: 'DADOS INSUFICIENTES',
        reason: `Apenas ${candles1h.length} velas de 1H disponíveis. O cálculo da EMA 200 requer pelo menos 30 candles (mais candles = resultado mais preciso).`,
      },
    };
  }

  const ema200  = lastEMA(candles1h, 200);
  const lastBar = candles1h[candles1h.length - 1];
  const price   = lastBar.close;
  const dist    = (price - ema200) / ema200;

  // Slope: compare last EMA 200 to 5 bars ago
  const closes   = candles1h.map(c => c.close);
  const series   = calcEMA(closes, 200);
  const ema200_5 = series[series.length - 6] ?? series[0];
  const slope    = ema200 - ema200_5;
  const slopeDir = slope > 0 ? 'subindo' : slope < 0 ? 'caindo' : 'plana';

  if (price > ema200) {
    return {
      direction: 'UP',
      step: {
        number: 1, name: 'Tendência 1H — EMA 200',
        status: 'PASS', value: 'TENDÊNCIA DE ALTA',
        reason: `O preço ($${fmt(price)}) está ${fmtPct(dist)} acima da EMA 200 ($${fmt(ema200)}) no gráfico de 1H. A EMA 200 está ${slopeDir}, confirmando viés comprador. Operações de compra estão alinhadas com a tendência principal.`,
      },
    };
  }

  return {
    direction: 'DOWN',
    step: {
      number: 1, name: 'Tendência 1H — EMA 200',
      status: 'PASS', value: 'TENDÊNCIA DE BAIXA',
      reason: `O preço ($${fmt(price)}) está ${fmtPct(dist)} abaixo da EMA 200 ($${fmt(ema200)}) no gráfico de 1H. A EMA 200 está ${slopeDir}, confirmando viés vendedor. Operações de venda estão alinhadas com a tendência principal.`,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2 — 15M Momentum: EMA 9 vs EMA 21 Alignment
// ═══════════════════════════════════════════════════════════════════════════════

type MomentumDir = 'BULLISH' | 'BEARISH' | 'CONFLICTING';

interface MomentumResult { direction: MomentumDir; step: RuleStep }

function step2_ema15m(candles15m: Candle[], trend: TrendDir): MomentumResult {
  if (candles15m.length < 25) {
    return {
      direction: 'CONFLICTING',
      step: {
        number: 2, name: 'Momentum 15M — EMA 9 / EMA 21',
        status: 'FAIL', value: 'DADOS INSUFICIENTES',
        reason: `Apenas ${candles15m.length} velas de 15M. São necessárias pelo menos 25 para um cálculo confiável de EMA 9 e EMA 21.`,
      },
    };
  }

  const ema9  = lastEMA(candles15m, 9);
  const ema21 = lastEMA(candles15m, 21);
  const prev9  = prevEMA(candles15m, 9);
  const prev21 = prevEMA(candles15m, 21);
  const spread = ((ema9 - ema21) / ema21) * 100;
  const price  = candles15m[candles15m.length - 1].close;

  // Detect a fresh crossover (crossing happened on the last candle)
  const crossedUp   = ema9 > ema21 && prev9 <= prev21;
  const crossedDown = ema9 < ema21 && prev9 >= prev21;

  const bullish = ema9 > ema21;

  // Momentum must align with the 1H trend
  const aligned = (trend === 'UP' && bullish) || (trend === 'DOWN' && !bullish);

  if (bullish) {
    const crossNote = crossedUp ? ' Cruzamento de alta recém detectado.' : '';
    if (aligned) {
      return {
        direction: 'BULLISH',
        step: {
          number: 2, name: 'Momentum 15M — EMA 9 / EMA 21',
          status: 'PASS', value: `EMA9 > EMA21 (${spread >= 0 ? '+' : ''}${spread.toFixed(3)}%)`,
          reason: `No 15M, a EMA 9 ($${fmt(ema9)}) está acima da EMA 21 ($${fmt(ema21)}) — alinhamento bullish confirmado.${crossNote} O preço ($${fmt(price)}) opera acima de ambas. Momentum de curto prazo alinhado com a tendência de 1H.`,
        },
      };
    }
    return {
      direction: 'CONFLICTING',
      step: {
        number: 2, name: 'Momentum 15M — EMA 9 / EMA 21',
        status: 'FAIL', value: 'EMA9 > EMA21 — CONFLITO',
        reason: `No 15M, a EMA 9 está acima da EMA 21 (bullish), mas a tendência principal de 1H é de BAIXA. Operar contra a tendência major aumenta o risco. Sinal bloqueado por conflito de timeframes.`,
      },
    };
  }

  // Bearish
  const crossNote = crossedDown ? ' Cruzamento de baixa recém detectado.' : '';
  if (aligned) {
    return {
      direction: 'BEARISH',
      step: {
        number: 2, name: 'Momentum 15M — EMA 9 / EMA 21',
        status: 'PASS', value: `EMA9 < EMA21 (${spread.toFixed(3)}%)`,
        reason: `No 15M, a EMA 9 ($${fmt(ema9)}) está abaixo da EMA 21 ($${fmt(ema21)}) — alinhamento bearish confirmado.${crossNote} O preço ($${fmt(price)}) opera abaixo de ambas. Momentum de curto prazo alinhado com a tendência de 1H.`,
      },
    };
  }
  return {
    direction: 'CONFLICTING',
    step: {
      number: 2, name: 'Momentum 15M — EMA 9 / EMA 21',
      status: 'FAIL', value: 'EMA9 < EMA21 — CONFLITO',
      reason: `No 15M, a EMA 9 está abaixo da EMA 21 (bearish), mas a tendência principal de 1H é de ALTA. Operar contra a tendência major aumenta o risco. Sinal bloqueado por conflito de timeframes.`,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 3 — 5M Entry Confirmation: Price vs EMA 9
// ═══════════════════════════════════════════════════════════════════════════════

type EntryDir = 'BUY' | 'SELL' | 'NONE';

interface EntryResult { direction: EntryDir; step: RuleStep }

function step3_entry5m(candles5m: Candle[], momentum: MomentumDir): EntryResult {
  if (momentum === 'CONFLICTING') {
    return {
      direction: 'NONE',
      step: {
        number: 3, name: 'Confirmação 5M — Preço vs EMA 9',
        status: 'FAIL', value: 'N/A',
        reason: 'Confirmação 5M não avaliada porque o momentum de 15M conflita com a tendência de 1H. Resolva o conflito de timeframes antes de buscar entrada.',
      },
    };
  }

  if (candles5m.length < 12) {
    return {
      direction: 'NONE',
      step: {
        number: 3, name: 'Confirmação 5M — Preço vs EMA 9',
        status: 'FAIL', value: 'DADOS INSUFICIENTES',
        reason: `Apenas ${candles5m.length} velas de 5M disponíveis. Mínimo necessário: 12.`,
      },
    };
  }

  const ema9   = lastEMA(candles5m, 9);
  const last   = candles5m[candles5m.length - 1];
  const prev   = candles5m[candles5m.length - 2];
  const price  = last.close;
  const dist   = ((price - ema9) / ema9) * 100;

  // Check last TWO candles: both closing on the correct side adds confidence
  const lastAbove = last.close > ema9;
  const prevAbove = prev.close > ema9;
  const consistent = lastAbove === prevAbove;

  if (momentum === 'BULLISH') {
    if (lastAbove) {
      const confNote = consistent
        ? 'Os últimos 2 fechamentos estão acima da EMA 9 — confirmação consistente.'
        : 'Apenas o último fechamento está acima. Confirmar com o próximo candle.';
      return {
        direction: 'BUY',
        step: {
          number: 3, name: 'Confirmação 5M — Preço vs EMA 9',
          status: 'PASS', value: `ACIMA DA EMA 9 (${dist >= 0 ? '+' : ''}${dist.toFixed(3)}%)`,
          reason: `No 5M, o preço ($${fmt(price)}) fechou acima da EMA 9 ($${fmt(ema9)}). ${confNote} Entrada de compra está confirmada na estrutura de menor timeframe.`,
        },
      };
    }
    return {
      direction: 'NONE',
      step: {
        number: 3, name: 'Confirmação 5M — Preço vs EMA 9',
        status: 'FAIL', value: `ABAIXO DA EMA 9 (${dist.toFixed(3)}%)`,
        reason: `Setup de compra identificado nos timeframes maiores, mas no 5M o preço ($${fmt(price)}) está abaixo da EMA 9 ($${fmt(ema9)}). Aguardar o preço fechar acima da EMA 9 antes de entrar.`,
      },
    };
  }

  // BEARISH
  if (!lastAbove) {
    const confNote = consistent
      ? 'Os últimos 2 fechamentos estão abaixo da EMA 9 — confirmação consistente.'
      : 'Apenas o último fechamento está abaixo. Confirmar com o próximo candle.';
    return {
      direction: 'SELL',
      step: {
        number: 3, name: 'Confirmação 5M — Preço vs EMA 9',
        status: 'PASS', value: `ABAIXO DA EMA 9 (${dist.toFixed(3)}%)`,
        reason: `No 5M, o preço ($${fmt(price)}) fechou abaixo da EMA 9 ($${fmt(ema9)}). ${confNote} Entrada de venda está confirmada na estrutura de menor timeframe.`,
      },
    };
  }
  return {
    direction: 'NONE',
    step: {
      number: 3, name: 'Confirmação 5M — Preço vs EMA 9',
      status: 'FAIL', value: `ACIMA DA EMA 9 (+${dist.toFixed(3)}%)`,
      reason: `Setup de venda identificado nos timeframes maiores, mas no 5M o preço ($${fmt(price)}) ainda está acima da EMA 9 ($${fmt(ema9)}). Aguardar o preço fechar abaixo da EMA 9 antes de entrar.`,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 4 — 15M Support & Resistance (Pivot Scan)
// ═══════════════════════════════════════════════════════════════════════════════

interface SRResult {
  support: number | null;
  resistance: number | null;
  step: RuleStep;
}

function step4_supportResistance(candles15m: Candle[], currentPrice: number): SRResult {
  const hiIdx = swingHighIndices(candles15m, 2);
  const loIdx = swingLowIndices(candles15m, 2);

  const pivotHighs = hiIdx.map(i => candles15m[i].high);
  const pivotLows  = loIdx.map(i => candles15m[i].low);

  const resistance = pivotHighs.filter(h => h > currentPrice * 1.0003).sort((a, b) => a - b)[0] ?? null;
  const support    = pivotLows.filter(l => l < currentPrice * 0.9997).sort((a, b) => b - a)[0] ?? null;

  const parts: string[] = [];
  if (resistance) parts.push(`Resistência $${fmt(resistance)}`);
  if (support)    parts.push(`Suporte $${fmt(support)}`);

  if (!resistance && !support) {
    return {
      support: null, resistance: null,
      step: {
        number: 4, name: 'Suporte e Resistência 15M',
        status: 'FAIL', value: 'NÃO IDENTIFICADO',
        reason: `Nenhum nível de suporte ou resistência identificado nos pivôs do 15M. Sem níveis estruturais não é possível calcular Stop Loss e Target com precisão.`,
      },
    };
  }

  const slDesc = support ? `O suporte mais próximo em $${fmt(support)} será usado como âncora de Stop Loss.` : 'Nenhum suporte próximo — Stop Loss via ATR.';
  const tgDesc = resistance ? `A resistência mais próxima em $${fmt(resistance)} será usada como Alvo 1.` : 'Nenhuma resistência próxima — Alvo via múltiplo de risco.';

  return {
    support, resistance,
    step: {
      number: 4, name: 'Suporte e Resistência 15M',
      status: 'PASS', value: parts.join(' | '),
      reason: `${pivotHighs.length} topos e ${pivotLows.length} fundos pivô mapeados no 15M. ${slDesc} ${tgDesc}`,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 5 — Volume Validation
// ═══════════════════════════════════════════════════════════════════════════════

interface VolumeResult { strong: boolean; step: RuleStep }

function step5_volume(candles15m: Candle[]): VolumeResult {
  const avg    = avgVolume(candles15m, 20);
  const last   = candles15m[candles15m.length - 1];
  const ratio  = avg > 0 ? last.volume / avg : 0;
  const pctStr = `${(ratio * 100).toFixed(0)}%`;

  if (ratio >= 1.2) {
    return {
      strong: true,
      step: {
        number: 5, name: 'Volume 15M',
        status: 'PASS', value: `${pctStr} da média`,
        reason: `O volume da última vela (${fmt(last.volume, 0)}) representa ${pctStr} da média dos últimos 20 períodos (${fmt(avg, 0)}). Volume acima de 120% da média indica participação real no movimento — reduz a probabilidade de armadilha (fakeout).`,
      },
    };
  }

  if (ratio >= 0.7) {
    return {
      strong: false,
      step: {
        number: 5, name: 'Volume 15M',
        status: 'FAIL', value: `${pctStr} da média — FRACO`,
        reason: `Volume em ${pctStr} da média — abaixo do limiar mínimo de 120%. Movimento sem suporte de volume é não confiável e aumenta o risco de reversão rápida ou fakeout.`,
      },
    };
  }

  return {
    strong: false,
    step: {
      number: 5, name: 'Volume 15M',
      status: 'FAIL', value: `${pctStr} da média — CRÍTICO`,
      reason: `Volume criticamente baixo (${pctStr} da média). Alta probabilidade de movimento falso ou mercado sem interesse. Operação bloqueada.`,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 6 — Risk/Reward Calculation
// ═══════════════════════════════════════════════════════════════════════════════

interface RRResult {
  acceptable: boolean;
  entry: number;
  sl: number;
  t1: number;
  t2: number;
  rrRatio: number;
  step: RuleStep;
}

function step6_riskReward(
  currentPrice: number,
  support: number | null,
  resistance: number | null,
  direction: EntryDir,
  candles15m: Candle[],
): RRResult {
  const atr   = calcATR(candles15m, 14);
  const isBuy = direction === 'BUY';
  const entry = currentPrice;

  let sl: number;
  let t1: number;

  if (isBuy) {
    const slFromSupport = support ? support * 0.999 : null;
    const slFromATR     = entry - 1.5 * atr;
    sl = slFromSupport !== null ? Math.max(slFromSupport, entry - 2 * atr) : slFromATR;
    const risk = entry - sl;
    t1 = resistance ? resistance * 0.9995 : entry + 2 * risk;
  } else {
    const slFromResistance = resistance ? resistance * 1.001 : null;
    const slFromATR        = entry + 1.5 * atr;
    sl = slFromResistance !== null ? Math.min(slFromResistance, entry + 2 * atr) : slFromATR;
    const risk = sl - entry;
    t1 = support ? support * 1.0005 : entry - 2 * risk;
  }

  const risk   = Math.abs(entry - sl);
  const reward = Math.abs(t1 - entry);
  const t2     = isBuy ? entry + risk * 3 : entry - risk * 3;
  const ratio  = risk > 0 ? reward / risk : 0;
  const rrStr  = `1:${ratio.toFixed(2)}`;

  const slNote = isBuy
    ? (support ? `Stop posicionado abaixo do suporte $${fmt(support)}` : `Stop via ATR (1.5×)`)
    : (resistance ? `Stop posicionado acima da resistência $${fmt(resistance)}` : `Stop via ATR (1.5×)`);

  const t1Note = isBuy
    ? (resistance ? `Alvo 1 na resistência $${fmt(resistance)}` : `Alvo 1 em 2× o risco`)
    : (support ? `Alvo 1 no suporte $${fmt(support)}` : `Alvo 1 em 2× o risco`);

  if (ratio >= 1.5) {
    return {
      acceptable: true, entry, sl, t1, t2, rrRatio: ratio,
      step: {
        number: 6, name: 'Risco/Retorno',
        status: 'PASS', value: rrStr,
        reason: `${slNote}. ${t1Note}. Alvo 2 em 3× o risco ($${fmt(t2)}). R/R de ${rrStr} supera o mínimo operacional de 1:1.5 — a operação tem assimetria favorável.`,
      },
    };
  }

  return {
    acceptable: false, entry, sl, t1, t2, rrRatio: ratio,
    step: {
      number: 6, name: 'Risco/Retorno',
      status: 'FAIL', value: `${rrStr} — INSUFICIENTE`,
      reason: `${slNote}. ${t1Note}. R/R calculado em ${rrStr} — abaixo do mínimo de 1:1.5. O potencial de retorno não compensa o risco assumido. Aguardar melhor ponto de entrada ou próximo nível de suporte/resistência.`,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 7 — Final Decision
// ═══════════════════════════════════════════════════════════════════════════════

function step7_decision(direction: EntryDir, failedSteps: number[]): RuleStep {
  if (failedSteps.length === 0 && (direction === 'BUY' || direction === 'SELL')) {
    const label = direction === 'BUY' ? 'COMPRA' : 'VENDA';
    const action = direction === 'BUY'
      ? 'Tendência de alta no 1H, EMA 9 acima da EMA 21 no 15M, preço acima da EMA 9 no 5M, volume confirmado e R/R favorável. Todos os filtros aprovados.'
      : 'Tendência de baixa no 1H, EMA 9 abaixo da EMA 21 no 15M, preço abaixo da EMA 9 no 5M, volume confirmado e R/R favorável. Todos os filtros aprovados.';
    return {
      number: 7, name: 'Decisão Final',
      status: 'PASS', value: label,
      reason: `${action} Sinal emitido. Respeite o Stop Loss e gerencie o tamanho da posição de acordo com seu plano de risco.`,
    };
  }

  const failList = failedSteps.length > 0
    ? `Etapas reprovadas: ${failedSteps.join(', ')}.`
    : 'Direção de entrada indefinida.';

  return {
    number: 7, name: 'Decisão Final',
    status: 'FAIL', value: 'NO TRADE',
    reason: `${failList} O motor exige aprovação em todas as 6 etapas antes de emitir sinal. Cada regra existe para filtrar setups de baixa qualidade. Aguarde um setup onde todas as condições estejam alinhadas.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

export function runEngine(
  candles1h: Candle[],
  candles15m: Candle[],
  candles5m: Candle[],
  currentPrice: number,
): EngineResult {
  const steps: RuleStep[] = [];

  // 1 — 1H trend via EMA 200
  const trendResult = step1_trend1h(candles1h);
  steps.push(trendResult.step);

  // 2 — 15M EMA 9 / EMA 21 alignment (must match 1H trend)
  const momentumResult = step2_ema15m(candles15m, trendResult.direction);
  steps.push(momentumResult.step);

  // 3 — 5M price vs EMA 9 entry confirmation
  const entryResult = step3_entry5m(candles5m, momentumResult.direction);
  steps.push(entryResult.step);

  // 4 — S/R levels from 15M pivots
  const srResult = step4_supportResistance(candles15m, currentPrice);
  steps.push(srResult.step);

  // 5 — Volume check
  const volumeResult = step5_volume(candles15m);
  steps.push(volumeResult.step);

  // 6 — R/R (always compute so we can show levels even on partial fails)
  const rrResult = step6_riskReward(
    currentPrice,
    srResult.support,
    srResult.resistance,
    entryResult.direction,
    candles15m,
  );
  steps.push(rrResult.step);

  // 7 — Decision
  const failedSteps = steps.filter(s => s.status === 'FAIL').map(s => s.number);
  const decisionStep = step7_decision(entryResult.direction, failedSteps);
  steps.push(decisionStep);

  const allPassed = failedSteps.length === 0;
  const dir       = entryResult.direction;
  const decision: Decision = (allPassed && dir !== 'NONE') ? dir : 'NO TRADE';

  return {
    decision,
    steps,
    entry:     decision !== 'NO TRADE' ? `$${fmt(rrResult.entry)}`  : null,
    stopLoss:  decision !== 'NO TRADE' ? `$${fmt(rrResult.sl)}`     : null,
    target1:   decision !== 'NO TRADE' ? `$${fmt(rrResult.t1)}`     : null,
    target2:   decision !== 'NO TRADE' ? `$${fmt(rrResult.t2)}`     : null,
    riskReward: decision !== 'NO TRADE' ? `1:${rrResult.rrRatio.toFixed(2)}` : null,
    nearestSupport:    srResult.support    ? `$${fmt(srResult.support)}`    : null,
    nearestResistance: srResult.resistance ? `$${fmt(srResult.resistance)}` : null,
  };
}
