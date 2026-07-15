/**
 * ORÁCULO Rule Engine – pure rule-based market analysis.
 * No AI predictions. No generic indicators. Each step is deterministic and auditable.
 *
 * Pipeline:
 *  1. Determine 1H trend via pivot structure (HH+HL or LH+LL)
 *  2. Identify S/R levels from 15M swing pivots
 *  3. Detect breakout or rejection on 15M
 *  4. Confirm directional entry on 5M candles
 *  5. Validate volume on breakout candle
 *  6. Calculate R/R from actual S/R levels
 *  7. Emit BUY | SELL | NO TRADE
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
  // Position levels (populated when BUY or SELL)
  entry: string | null;
  stopLoss: string | null;
  target1: string | null;
  target2: string | null;
  riskReward: string | null;
  // For UI display
  nearestSupport: string | null;
  nearestResistance: string | null;
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pct(n: number): string {
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}%`;
}

// ── Pivot detection ───────────────────────────────────────────────────────────

/**
 * Returns the index positions of swing highs.
 * A swing high: candle whose high is strictly greater than `lookback` candles on both sides.
 */
function swingHighIndices(candles: Candle[], lookback = 3): number[] {
  const result: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const h = candles[i].high;
    const leftOk  = candles.slice(i - lookback, i).every(c => c.high < h);
    const rightOk = candles.slice(i + 1, i + lookback + 1).every(c => c.high < h);
    if (leftOk && rightOk) result.push(i);
  }
  return result;
}

/**
 * Returns the index positions of swing lows.
 * A swing low: candle whose low is strictly lower than `lookback` candles on both sides.
 */
function swingLowIndices(candles: Candle[], lookback = 3): number[] {
  const result: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const l = candles[i].low;
    const leftOk  = candles.slice(i - lookback, i).every(c => c.low > l);
    const rightOk = candles.slice(i + 1, i + lookback + 1).every(c => c.low > l);
    if (leftOk && rightOk) result.push(i);
  }
  return result;
}

// ── ATR ───────────────────────────────────────────────────────────────────────

function calcATR(candles: Candle[], period = 14): number {
  const trs = candles.slice(1).map((c, i) => {
    const prev = candles[i];
    return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  });
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// ── Average volume ────────────────────────────────────────────────────────────

function avgVolume(candles: Candle[], period = 20): number {
  const slice = candles.slice(-period - 1, -1); // exclude last candle
  return slice.reduce((a, c) => a + c.volume, 0) / slice.length;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 1 – 1H Trend via pivot structure
// ═══════════════════════════════════════════════════════════════════════════════

type TrendDirection = 'UP' | 'DOWN' | 'RANGING';

interface TrendResult {
  direction: TrendDirection;
  step: RuleStep;
}

function step1_trend(candles1h: Candle[]): TrendResult {
  const hiIdx = swingHighIndices(candles1h, 3);
  const loIdx = swingLowIndices(candles1h, 3);

  // Need at least 3 pivot highs and 3 pivot lows for a meaningful structure read
  if (hiIdx.length < 3 || loIdx.length < 3) {
    return {
      direction: 'RANGING',
      step: {
        number: 1,
        name: 'Tendência 1H',
        status: 'FAIL',
        value: 'INDEFINIDA',
        reason: `Apenas ${hiIdx.length} topos e ${loIdx.length} fundos pivô identificados no 1H. Mínimo necessário: 3 de cada para confirmar estrutura.`,
      },
    };
  }

  // Use last 3 pivot highs and 3 pivot lows (most recent structural swing points)
  const highs = hiIdx.slice(-3).map(i => candles1h[i].high);
  const lows  = loIdx.slice(-3).map(i => candles1h[i].low);

  const hhCount = highs.filter((h, i) => i > 0 && h > highs[i - 1]).length; // Higher Highs
  const hlCount = lows.filter((l, i)  => i > 0 && l > lows[i - 1]).length;  // Higher Lows
  const lhCount = highs.filter((h, i) => i > 0 && h < highs[i - 1]).length; // Lower Highs
  const llCount = lows.filter((l, i)  => i > 0 && l < lows[i - 1]).length;  // Lower Lows

  const totalPairs = 2; // 3 pivots → 2 transitions

  if (hhCount >= totalPairs && hlCount >= totalPairs) {
    return {
      direction: 'UP',
      step: {
        number: 1,
        name: 'Tendência 1H',
        status: 'PASS',
        value: 'ALTA',
        reason: `Estrutura de topos e fundos ascendentes confirmada: ${hhCount} Topos Mais Altos (HH) e ${hlCount} Fundos Mais Altos (HL) nos últimos pivôs do 1H.`,
      },
    };
  }

  if (lhCount >= totalPairs && llCount >= totalPairs) {
    return {
      direction: 'DOWN',
      step: {
        number: 1,
        name: 'Tendência 1H',
        status: 'PASS',
        value: 'BAIXA',
        reason: `Estrutura de topos e fundos descendentes confirmada: ${lhCount} Topos Mais Baixos (LH) e ${llCount} Fundos Mais Baixos (LL) nos últimos pivôs do 1H.`,
      },
    };
  }

  return {
    direction: 'RANGING',
    step: {
      number: 1,
      name: 'Tendência 1H',
      status: 'FAIL',
      value: 'INDEFINIDA',
      reason: `Estrutura mista no 1H — ${hhCount} HH, ${hlCount} HL, ${lhCount} LH, ${llCount} LL. Sem tendência dominante clara. Operação não permitida em ranging.`,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2 – 15M Support & Resistance
// ═══════════════════════════════════════════════════════════════════════════════

interface SRResult {
  support: number | null;
  resistance: number | null;
  step: RuleStep;
}

function step2_supportResistance(candles15m: Candle[], currentPrice: number): SRResult {
  const hiIdx = swingHighIndices(candles15m, 2);
  const loIdx = swingLowIndices(candles15m, 2);

  const pivotHighs = hiIdx.map(i => candles15m[i].high);
  const pivotLows  = loIdx.map(i => candles15m[i].low);

  // Nearest resistance above price (with at least 0.05% margin)
  const resistanceCandidates = pivotHighs
    .filter(h => h > currentPrice * 1.0005)
    .sort((a, b) => a - b);

  // Nearest support below price (with at least 0.05% margin)
  const supportCandidates = pivotLows
    .filter(l => l < currentPrice * 0.9995)
    .sort((a, b) => b - a);

  const resistance = resistanceCandidates[0] ?? null;
  const support    = supportCandidates[0] ?? null;

  if (!resistance && !support) {
    return {
      support: null,
      resistance: null,
      step: {
        number: 2,
        name: 'Suporte e Resistência 15M',
        status: 'FAIL',
        value: 'NÃO IDENTIFICADO',
        reason: `Nenhum nível de suporte ou resistência válido encontrado no 15M com os ${hiIdx.length} topos e ${loIdx.length} fundos pivô detectados.`,
      },
    };
  }

  const parts: string[] = [];
  if (support)    parts.push(`Suporte: $${fmt(support)}`);
  if (resistance) parts.push(`Resistência: $${fmt(resistance)}`);

  return {
    support,
    resistance,
    step: {
      number: 2,
      name: 'Suporte e Resistência 15M',
      status: 'PASS',
      value: parts.join(' | '),
      reason: `${pivotHighs.length} topos e ${pivotLows.length} fundos pivô mapeados. ${parts.join('. ')}.`,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 3 – 15M Breakout or Rejection
// ═══════════════════════════════════════════════════════════════════════════════

type SetupType =
  | 'BREAKOUT_BUY'
  | 'BREAKOUT_SELL'
  | 'REJECTION_BUY'
  | 'REJECTION_SELL'
  | 'NONE';

interface BreakoutResult {
  setup: SetupType;
  step: RuleStep;
}

function step3_breakoutRejection(
  candles15m: Candle[],
  support: number | null,
  resistance: number | null,
  trend: TrendDirection,
): BreakoutResult {
  const last = candles15m[candles15m.length - 1];
  const prev = candles15m[candles15m.length - 2];

  // ── Breakout above resistance (BUY setup aligned with UP trend)
  if (resistance && trend === 'UP') {
    const prevBelow  = prev.close < resistance;
    const nowAbove   = last.close > resistance;
    const bodyClears = last.close > resistance * 1.001; // close at least 0.1% above
    if (prevBelow && nowAbove && bodyClears) {
      const dist = pct((last.close - resistance) / resistance);
      return {
        setup: 'BREAKOUT_BUY',
        step: {
          number: 3,
          name: 'Rompimento / Rejeição 15M',
          status: 'PASS',
          value: 'ROMPIMENTO DE ALTA',
          reason: `Preço fechou acima da resistência $${fmt(resistance)} (fechamento: $${fmt(last.close)}, distância: ${dist}). Candle anterior fechou abaixo. Rompimento válido alinhado com tendência de alta.`,
        },
      };
    }
  }

  // ── Breakdown below support (SELL setup aligned with DOWN trend)
  if (support && trend === 'DOWN') {
    const prevAbove  = prev.close > support;
    const nowBelow   = last.close < support;
    const bodyClears = last.close < support * 0.999;
    if (prevAbove && nowBelow && bodyClears) {
      const dist = pct((support - last.close) / support);
      return {
        setup: 'BREAKOUT_SELL',
        step: {
          number: 3,
          name: 'Rompimento / Rejeição 15M',
          status: 'PASS',
          value: 'ROMPIMENTO DE BAIXA',
          reason: `Preço fechou abaixo do suporte $${fmt(support)} (fechamento: $${fmt(last.close)}, distância: ${dist}). Candle anterior fechou acima. Rompimento válido alinhado com tendência de baixa.`,
        },
      };
    }
  }

  // ── Rejection at support (bullish bounce, UP trend)
  if (support && trend === 'UP') {
    const wickedIntoSupport = last.low <= support * 1.002;
    const closedAbove       = last.close > support;
    const isBullish         = last.close > last.open;
    const wickRatio         = last.low < last.open
      ? (last.open - last.low) / Math.max(last.high - last.low, 0.0001)
      : 0;
    if (wickedIntoSupport && closedAbove && isBullish && wickRatio > 0.25) {
      return {
        setup: 'REJECTION_BUY',
        step: {
          number: 3,
          name: 'Rompimento / Rejeição 15M',
          status: 'PASS',
          value: 'REJEIÇÃO NO SUPORTE',
          reason: `Preço testou suporte $${fmt(support)} (mínima: $${fmt(last.low)}) e fechou acima ($${fmt(last.close)}) com pavio inferior de ${(wickRatio * 100).toFixed(0)}% do range. Rejeição bullish confirmada.`,
        },
      };
    }
  }

  // ── Rejection at resistance (bearish), DOWN trend
  if (resistance && trend === 'DOWN') {
    const wickedIntoResistance = last.high >= resistance * 0.998;
    const closedBelow          = last.close < resistance;
    const isBearish            = last.close < last.open;
    const wickRatio            = last.high > last.open
      ? (last.high - last.open) / Math.max(last.high - last.low, 0.0001)
      : 0;
    if (wickedIntoResistance && closedBelow && isBearish && wickRatio > 0.25) {
      return {
        setup: 'REJECTION_SELL',
        step: {
          number: 3,
          name: 'Rompimento / Rejeição 15M',
          status: 'PASS',
          value: 'REJEIÇÃO NA RESISTÊNCIA',
          reason: `Preço testou resistência $${fmt(resistance)} (máxima: $${fmt(last.high)}) e fechou abaixo ($${fmt(last.close)}) com pavio superior de ${(wickRatio * 100).toFixed(0)}% do range. Rejeição bearish confirmada.`,
        },
      };
    }
  }

  // ── No valid pattern
  const ctx: string[] = [];
  if (resistance) ctx.push(`resistência em $${fmt(resistance)}`);
  if (support)    ctx.push(`suporte em $${fmt(support)}`);
  const trendLabel = trend === 'UP' ? 'alta' : trend === 'DOWN' ? 'baixa' : 'ranging';

  return {
    setup: 'NONE',
    step: {
      number: 3,
      name: 'Rompimento / Rejeição 15M',
      status: 'FAIL',
      value: 'SEM PADRÃO',
      reason: `Nenhum rompimento ou rejeição válido detectado no 15M. Preço atual $${fmt(last.close)} — ${ctx.join(', ')}. Tendência ${trendLabel} exige padrão alinhado para prosseguir.`,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 4 – 5M Entry Confirmation
// ═══════════════════════════════════════════════════════════════════════════════

interface ConfirmResult {
  confirmed: boolean;
  direction: 'BUY' | 'SELL' | null;
  step: RuleStep;
}

function step4_confirm5m(candles5m: Candle[], setup: SetupType): ConfirmResult {
  const isBuySetup  = setup === 'BREAKOUT_BUY'  || setup === 'REJECTION_BUY';
  const isSellSetup = setup === 'BREAKOUT_SELL' || setup === 'REJECTION_SELL';

  if (!isBuySetup && !isSellSetup) {
    return {
      confirmed: false,
      direction: null,
      step: {
        number: 4,
        name: 'Confirmação de Entrada 5M',
        status: 'FAIL',
        value: 'N/A',
        reason: 'Nenhum setup válido no 15M — confirmação 5M não avaliada.',
      },
    };
  }

  const last3 = candles5m.slice(-3);
  const [c1, c2, c3] = last3;

  const bullish = (c: Candle) => c.close > c.open;
  const bearish = (c: Candle) => c.close < c.open;
  const bodySize = (c: Candle) => Math.abs(c.close - c.open);
  const range    = (c: Candle) => Math.max(c.high - c.low, 0.0001);
  const bodyRatio = (c: Candle) => bodySize(c) / range(c);

  if (isBuySetup) {
    const bullishCount = last3.filter(bullish).length;
    const lastIsBullish = bullish(c3);
    const lastBodyRatio = bodyRatio(c3);
    // Engulfing: last candle body > previous body
    const engulfing = bodySize(c3) > bodySize(c2) && bullish(c3);

    if (lastIsBullish && bullishCount >= 2 && lastBodyRatio >= 0.5) {
      const label = engulfing ? 'ENGOLFO DE ALTA' : 'MOMENTUM BULLISH';
      return {
        confirmed: true,
        direction: 'BUY',
        step: {
          number: 4,
          name: 'Confirmação de Entrada 5M',
          status: 'PASS',
          value: label,
          reason: `${bullishCount}/3 velas bullish no 5M. Último candle: body ratio ${(lastBodyRatio * 100).toFixed(0)}%${engulfing ? ', padrão engolfo detectado' : ''}. Momentum confirma a compra.`,
        },
      };
    }

    return {
      confirmed: false,
      direction: 'BUY',
      step: {
        number: 4,
        name: 'Confirmação de Entrada 5M',
        status: 'FAIL',
        value: 'SEM CONFIRMAÇÃO',
        reason: `Setup de compra sem confirmação no 5M: apenas ${bullishCount}/3 velas bullish. Último body ratio: ${(lastBodyRatio * 100).toFixed(0)}% (mínimo 50%). Aguardar formação de padrão direcional.`,
      },
    };
  }

  // SELL confirmation
  const bearishCount  = last3.filter(bearish).length;
  const lastIsBearish = bearish(c3);
  const lastBodyRatio = bodyRatio(c3);
  const engulfing     = bodySize(c3) > bodySize(c2) && bearish(c3);

  if (lastIsBearish && bearishCount >= 2 && lastBodyRatio >= 0.5) {
    const label = engulfing ? 'ENGOLFO DE BAIXA' : 'MOMENTUM BEARISH';
    return {
      confirmed: true,
      direction: 'SELL',
      step: {
        number: 4,
        name: 'Confirmação de Entrada 5M',
        status: 'PASS',
        value: label,
        reason: `${bearishCount}/3 velas bearish no 5M. Último candle: body ratio ${(lastBodyRatio * 100).toFixed(0)}%${engulfing ? ', padrão engolfo detectado' : ''}. Momentum confirma a venda.`,
      },
    };
  }

  return {
    confirmed: false,
    direction: 'SELL',
    step: {
      number: 4,
      name: 'Confirmação de Entrada 5M',
      status: 'FAIL',
      value: 'SEM CONFIRMAÇÃO',
      reason: `Setup de venda sem confirmação no 5M: apenas ${bearishCount}/3 velas bearish. Último body ratio: ${(lastBodyRatio * 100).toFixed(0)}% (mínimo 50%). Aguardar formação de padrão direcional.`,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 5 – Volume Analysis
// ═══════════════════════════════════════════════════════════════════════════════

interface VolumeResult {
  strong: boolean;
  step: RuleStep;
}

function step5_volume(candles15m: Candle[]): VolumeResult {
  const avg  = avgVolume(candles15m, 20);
  const last = candles15m[candles15m.length - 1];
  const ratio = last.volume / avg;
  const pctStr = `${(ratio * 100).toFixed(0)}%`;

  if (ratio >= 1.2) {
    return {
      strong: true,
      step: {
        number: 5,
        name: 'Análise de Volume',
        status: 'PASS',
        value: `${pctStr} da média`,
        reason: `Volume do candle de rompimento (${fmt(last.volume, 0)}) é ${pctStr} da média de 20 períodos (${fmt(avg, 0)}). Acima do limiar de 120% — move suportado por volume real.`,
      },
    };
  }

  if (ratio >= 0.8) {
    return {
      strong: false,
      step: {
        number: 5,
        name: 'Análise de Volume',
        status: 'FAIL',
        value: `${pctStr} da média`,
        reason: `Volume abaixo do limiar (${pctStr} vs mínimo 120%). Rompimento sem participação de volume é não confiável — possível armadilha (fakeout).`,
      },
    };
  }

  return {
    strong: false,
    step: {
      number: 5,
      name: 'Análise de Volume',
      status: 'FAIL',
      value: `${pctStr} da média — FRACO`,
      reason: `Volume criticamente baixo (${pctStr} da média). Alta probabilidade de movimento falso. Operação bloqueada por falta de participação.`,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 6 – Risk/Reward Calculation
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
  setup: SetupType,
  candles15m: Candle[],
): RRResult {
  const atr15 = calcATR(candles15m, 14);
  const isBuy = setup === 'BREAKOUT_BUY' || setup === 'REJECTION_BUY';

  const entry = currentPrice;
  let sl: number;
  let t1: number;
  let t2: number;

  if (isBuy) {
    // SL below support or 1.2×ATR, whichever is closer to price (tighter)
    const slFromSupport = support ? support * 0.998 : entry - 1.5 * atr15;
    const slFromATR     = entry - 1.2 * atr15;
    sl = Math.max(slFromSupport, slFromATR); // higher = tighter for buy

    // T1 at nearest resistance, T2 at 2× risk extension
    const risk = entry - sl;
    t1 = resistance ? resistance * 0.998 : entry + 2 * risk;
    t2 = entry + risk * 3;
  } else {
    // SL above resistance or 1.2×ATR
    const slFromResistance = resistance ? resistance * 1.002 : entry + 1.5 * atr15;
    const slFromATR        = entry + 1.2 * atr15;
    sl = Math.min(slFromResistance, slFromATR); // lower = tighter for sell

    const risk = sl - entry;
    t1 = support ? support * 1.002 : entry - 2 * risk;
    t2 = entry - risk * 3;
  }

  const risk   = Math.abs(entry - sl);
  const reward = Math.abs(t1 - entry);
  const ratio  = risk > 0 ? reward / risk : 0;
  const rrStr  = `1:${ratio.toFixed(2)}`;

  if (ratio >= 1.5) {
    return {
      acceptable: true, entry, sl, t1, t2, rrRatio: ratio,
      step: {
        number: 6,
        name: 'Risco/Retorno',
        status: 'PASS',
        value: rrStr,
        reason: `Entrada: $${fmt(entry)} | Stop: $${fmt(sl)} | Alvo 1: $${fmt(t1)} | Alvo 2: $${fmt(t2)}. R/R de ${rrStr} supera o mínimo operacional de 1:1.5.`,
      },
    };
  }

  return {
    acceptable: false, entry, sl, t1, t2, rrRatio: ratio,
    step: {
      number: 6,
      name: 'Risco/Retorno',
      status: 'FAIL',
      value: rrStr,
      reason: `R/R de ${rrStr} abaixo do mínimo de 1:1.5. Risco: $${fmt(risk)} | Retorno potencial: $${fmt(reward)}. Sem assimetria favorável — operação bloqueada.`,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 7 – Final Decision
// ═══════════════════════════════════════════════════════════════════════════════

function step7_decision(
  direction: 'BUY' | 'SELL' | null,
  allPassed: boolean,
  failedSteps: number[],
): RuleStep {
  if (allPassed && direction) {
    return {
      number: 7,
      name: 'Decisão Final',
      status: 'PASS',
      value: direction,
      reason:
        direction === 'BUY'
          ? 'Todas as 6 regras satisfeitas. Tendência de alta confirmada, nível de S/R respeitado, padrão de entrada formado, volume presente e R/R favorável. Sinal de COMPRA gerado.'
          : 'Todas as 6 regras satisfeitas. Tendência de baixa confirmada, nível de S/R respeitado, padrão de entrada formado, volume presente e R/R favorável. Sinal de VENDA gerado.',
    };
  }

  const stepsStr = failedSteps.length > 0
    ? `Etapas não satisfeitas: ${failedSteps.join(', ')}.`
    : 'Condições insuficientes.';

  return {
    number: 7,
    name: 'Decisão Final',
    status: 'FAIL',
    value: 'NO TRADE',
    reason: `${stepsStr} O sistema exige que TODAS as 6 etapas sejam aprovadas antes de emitir um sinal. Aguarde nova oportunidade com setup completo.`,
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

  // Step 1 – Trend
  const trendResult = step1_trend(candles1h);
  steps.push(trendResult.step);

  // Step 2 – S/R (always run so we can show levels even on failure)
  const srResult = step2_supportResistance(candles15m, currentPrice);
  steps.push(srResult.step);

  // Step 3 – Breakout/Rejection (only makes sense with a trend)
  const breakoutResult = step3_breakoutRejection(
    candles15m,
    srResult.support,
    srResult.resistance,
    trendResult.direction,
  );
  steps.push(breakoutResult.step);

  // Step 4 – 5M Confirmation
  const confirmResult = step4_confirm5m(candles5m, breakoutResult.setup);
  steps.push(confirmResult.step);

  // Step 5 – Volume
  const volumeResult = step5_volume(candles15m);
  steps.push(volumeResult.step);

  // Step 6 – R/R (always compute so we can show the levels)
  const rrResult = step6_riskReward(
    currentPrice,
    srResult.support,
    srResult.resistance,
    breakoutResult.setup,
    candles15m,
  );
  steps.push(rrResult.step);

  // Step 7 – Decision
  const failedSteps = steps.filter(s => s.status === 'FAIL').map(s => s.number);
  const allPassed   = failedSteps.length === 0;
  const direction   = confirmResult.direction;
  const decisionStep = step7_decision(direction, allPassed, failedSteps);
  steps.push(decisionStep);

  // Resolve final decision
  let decision: Decision = 'NO TRADE';
  if (allPassed && direction) decision = direction;

  return {
    decision,
    steps,
    entry:           decision !== 'NO TRADE' ? `$${fmt(rrResult.entry)}`  : null,
    stopLoss:        decision !== 'NO TRADE' ? `$${fmt(rrResult.sl)}`     : null,
    target1:         decision !== 'NO TRADE' ? `$${fmt(rrResult.t1)}`     : null,
    target2:         decision !== 'NO TRADE' ? `$${fmt(rrResult.t2)}`     : null,
    riskReward:      decision !== 'NO TRADE' ? `1:${rrResult.rrRatio.toFixed(2)}` : null,
    nearestSupport:  srResult.support    ? `$${fmt(srResult.support)}`    : null,
    nearestResistance: srResult.resistance ? `$${fmt(srResult.resistance)}` : null,
  };
}
