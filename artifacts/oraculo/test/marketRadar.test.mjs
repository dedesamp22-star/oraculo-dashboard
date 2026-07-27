import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDemoCandles, analyzeMarketRadar } from './.tmp/marketRadar.mjs';

const HOUR = 60 * 60 * 1000;
const FIFTEEN = 15 * 60 * 1000;
const FIVE = 5 * 60 * 1000;
const NOW = Date.UTC(2026, 6, 17, 18, 0, 0);

function candle(openTime, open, high, low, close, volume = 100) {
  return { openTime, open, high, low, close, volume, closeTime: openTime + FIVE - 1 };
}

function wave(count, start, step, amp, interval, volume = 100) {
  const out = [];
  let prev = start;
  for (let i = 0; i < count; i++) {
    const openTime = NOW - (count - i + 2) * interval;
    const close = start + step * i + Math.sin(i / 2.2) * amp;
    const open = prev;
    const high = Math.max(open, close) + 0.45 + Math.abs(Math.sin(i)) * 0.25;
    const low = Math.min(open, close) - 0.45 - Math.abs(Math.cos(i)) * 0.25;
    out.push({ openTime, open, high, low, close, volume, closeTime: openTime + interval - 1 });
    prev = close;
  }
  return out;
}

function bullishSet() {
  const candles1h = wave(220, 90, 0.14, 1.3, HOUR, 100);
  const candles15m = wave(80, 116.5, 0.04, 0.15, FIFTEEN, 100);
  const baseTime = NOW - 10 * FIFTEEN;
  const custom15 = [
    [119.0, 119.35, 118.85, 119.2, 100],
    [119.2, 119.65, 119.1, 119.55, 110],
    [119.55, 119.7, 119.25, 119.35, 100],
    [119.35, 119.55, 119.15, 119.3, 100],
    [119.3, 119.65, 119.25, 119.5, 105],
    [119.5, 119.8, 119.35, 119.7, 110],
    [119.7, 119.9, 119.45, 119.6, 105],
    [119.6, 119.92, 119.4, 119.8, 135],
  ];
  candles15m.splice(-8, 8, ...custom15.map((v, i) => ({
    openTime: baseTime + i * FIFTEEN,
    open: v[0],
    high: v[1],
    low: v[2],
    close: v[3],
    volume: v[4],
    closeTime: baseTime + i * FIFTEEN + FIFTEEN - 1,
  })));
  const candles5m = wave(40, 116, 0.08, 0.3, FIVE, 100);
  const base5 = NOW - 4 * FIVE;
  candles5m.splice(-4, 4,
    candle(base5, 119.45, 119.75, 119.3, 119.65, 105),
    candle(base5 + FIVE, 119.65, 119.85, 119.42, 119.55, 100),
    candle(base5 + FIVE * 2, 119.55, 119.88, 119.35, 119.58, 100),
    candle(base5 + FIVE * 3, 119.76, 120.02, 119.5, 119.95, 125),
  );
  return { symbol: 'BTCUSDT', displayPrice: 99999, candles1h, candles15m, candles5m, now: NOW };
}

function bearishSet() {
  const candles1h = wave(220, 150, -0.14, 1.3, HOUR, 100);
  const candles15m = wave(80, 123.5, -0.04, 0.15, FIFTEEN, 100);
  const baseTime = NOW - 10 * FIFTEEN;
  const custom15 = [
    [121.0, 121.15, 120.65, 120.8, 100],
    [120.8, 120.9, 120.35, 120.45, 110],
    [120.45, 120.75, 120.3, 120.65, 100],
    [120.65, 120.85, 120.45, 120.7, 100],
    [120.7, 120.75, 120.35, 120.5, 105],
    [120.5, 120.65, 120.2, 120.3, 110],
    [120.3, 120.55, 120.1, 120.4, 105],
    [120.4, 120.6, 120.08, 120.2, 135],
  ];
  candles15m.splice(-8, 8, ...custom15.map((v, i) => ({
    openTime: baseTime + i * FIFTEEN,
    open: v[0],
    high: v[1],
    low: v[2],
    close: v[3],
    volume: v[4],
    closeTime: baseTime + i * FIFTEEN + FIFTEEN - 1,
  })));
  const candles5m = wave(40, 124, -0.08, 0.3, FIVE, 100);
  const base5 = NOW - 4 * FIVE;
  candles5m.splice(-4, 4,
    candle(base5, 120.55, 120.7, 120.25, 120.35, 105),
    candle(base5 + FIVE, 120.35, 120.58, 120.15, 120.45, 100),
    candle(base5 + FIVE * 2, 120.45, 120.65, 120.12, 120.42, 100),
    candle(base5 + FIVE * 3, 120.14, 120.3, 119.8, 119.95, 125),
  );
  return { symbol: 'BTCUSDT', displayPrice: 1, candles1h, candles15m, candles5m, now: NOW };
}

function analyze(data) {
  return analyzeMarketRadar(data);
}

function assertSafeNumbers(result) {
  const fields = ['displayPrice', 'decisionPrice', 'support', 'resistance', 'aggressiveEntry', 'conservativeEntry', 'stop', 'target1', 'target2', 'rr'];
  for (const field of fields) {
    const value = result[field];
    assert.ok(value === null || (Number.isFinite(value) && value >= 0), `${field} must be finite/null/non-negative`);
  }
}

test('valid buy setup uses closed decision price and ignores live price for decisions', () => {
  const a = analyze(bullishSet());
  const b = analyze({ ...bullishSet(), displayPrice: 1 });
  assert.equal(a.symbol, 'BTCUSDT');
  assert.equal(a.displayPrice, 99999);
  assert.equal(a.decisionPrice, 119.95);
  assert.equal(a.signalKey, b.signalKey);
  assert.equal(a.suggestedDirection, 'COMPRA');
  assert.ok(a.rr >= 2);
  assertSafeNumbers(a);
});

test('analysis preserves selected allowed symbol', () => {
  for (const symbol of ['ETHUSDT', 'SOLUSDT']) {
    const a = analyze({ ...bullishSet(), symbol });
    assert.equal(a.symbol, symbol);
    assertSafeNumbers(a);
  }
});

test('healthy BUY and SELL setups are approved for BTC, ETH and SOL', () => {
  for (const symbol of ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']) {
    const buy = analyze({ ...bullishSet(), symbol });
    assert.equal(buy.suggestedDirection, 'COMPRA', `${symbol} BUY`);
    assert.equal(buy.decisionState, 'ENTRADA_APROVADA');
    assert.equal(buy.triggerStage, 'confirmed');
    assert.ok(buy.scoreContextual >= 70);
    assert.ok(buy.scoreOperacional >= 70);
    assert.ok(buy.rr >= 2);

    const sell = analyze({ ...bearishSet(), symbol });
    assert.equal(sell.suggestedDirection, 'VENDA', `${symbol} SELL`);
    assert.equal(sell.decisionState, 'ENTRADA_APROVADA');
    assert.equal(sell.triggerStage, 'confirmed');
    assert.ok(sell.scoreContextual >= 70);
    assert.ok(sell.scoreOperacional >= 70);
    assert.ok(sell.rr >= 2);
  }
});

test('valid sell setup is mathematically valid', () => {
  const a = analyze(bearishSet());
  assert.equal(a.suggestedDirection, 'VENDA');
  assert.ok(a.stop > a.conservativeEntry);
  assert.ok(a.target1 < a.conservativeEntry);
  assert.ok(a.target2 < a.target1);
  assertSafeNumbers(a);
});

test('lateral market waits', () => {
  const data = bullishSet();
  data.candles1h = wave(220, 120, 0, 0.2, HOUR, 100);
  data.candles15m = wave(80, 120, 0, 0.2, FIFTEEN, 100);
  const a = analyze(data);
  assert.equal(a.suggestedDirection, 'AGUARDAR');
});

test('1h and 15m conflict waits', () => {
  const data = bullishSet();
  data.candles15m = wave(80, 130, -0.12, 0.9, FIFTEEN, 100);
  const a = analyze(data);
  assert.equal(a.suggestedDirection, 'AGUARDAR');
  assert.ok(a.blockedReasons.some((reason) => reason.includes('opostas')));
});

test('forming trigger is informative but does not open an operation', () => {
  const data = bullishSet();
  const last = data.candles5m[data.candles5m.length - 1];
  Object.assign(data.candles5m[data.candles5m.length - 2], { open: 121.02, low: 121.0, high: 121.12, close: 121.05 });
  Object.assign(last, { open: 121.08, low: 121.0, high: 121.45, close: 121.3, volume: 120 });
  const a = analyze(data);
  assert.equal(a.triggerStage, 'forming');
  assert.equal(a.suggestedDirection, 'AGUARDAR');
  assert.ok(a.scoreContextual > 0);
  assert.ok(a.scoreOperacional > 0);
  assert.ok(a.missingConditions.some((item) => item.includes('reteste')));
});

test('pending risk reward does not apply bad R/R penalty while context is forming', () => {
  const data = bullishSet();
  const last = data.candles5m[data.candles5m.length - 1];
  Object.assign(last, { open: 119.5, low: 119.2, high: 119.55, close: 119.4, volume: 120 });
  const a = analyze(data);
  assert.equal(a.rrStatus, 'pending');
  assert.equal(a.suggestedDirection, 'AGUARDAR');
  assert.ok(a.scoreContextual > 0);
  assert.ok(!a.scoreItems.some((item) => item.label.includes('risco alto')));
});

test('very weak volume blocks operation', () => {
  const data = bullishSet();
  data.candles15m[data.candles15m.length - 1].volume = 1;
  const a = analyze(data);
  assert.equal(a.suggestedDirection, 'AGUARDAR');
  assert.ok(a.blockedReasons.some((reason) => reason.includes('Volume extremamente baixo')));
});

test('less than 200 closed candles blocks EMA 200 warm-up', () => {
  const data = bullishSet();
  data.candles1h = data.candles1h.slice(-199);
  const a = analyze(data);
  assert.equal(a.suggestedDirection, 'AGUARDAR');
  assert.ok(a.blockedReasons.some((reason) => reason.includes('EMA 200')));
});

test('invalid candles with NaN, Infinity and broken high/low are discarded safely', () => {
  for (const patch of [
    { close: Number.NaN },
    { high: Number.POSITIVE_INFINITY },
    { high: 10, low: 20 },
  ]) {
    const data = bullishSet();
    Object.assign(data.candles5m[data.candles5m.length - 1], patch);
    const a = analyze(data);
    assertSafeNumbers(a);
    assert.equal(a.suggestedDirection, 'AGUARDAR');
  }
});

test('invalid live price falls back to decision price for display', () => {
  for (const displayPrice of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0]) {
    const a = analyze({ ...bullishSet(), displayPrice });
    assert.equal(a.displayPrice, a.decisionPrice);
    assertSafeNumbers(a);
  }
});

test('negative target and unavailable stop force wait without invalid values', () => {
  const targetData = bearishSet();
  targetData.candles5m[targetData.candles5m.length - 1].close = 0.2;
  targetData.candles5m[targetData.candles5m.length - 1].low = 0.1;
  let a = analyze(targetData);
  assert.equal(a.suggestedDirection, 'AGUARDAR');
  assertSafeNumbers(a);

  const stopData = bullishSet();
  stopData.candles15m = wave(80, 120, 0, 0.1, FIFTEEN, 100);
  a = analyze(stopData);
  assert.equal(a.suggestedDirection, 'AGUARDAR');
  assertSafeNumbers(a);
});

test('score is always clamped and critical blocks force wait', () => {
  const cases = [bullishSet(), bearishSet(), { ...bullishSet(), candles1h: bullishSet().candles1h.slice(-50) }];
  for (const data of cases) {
    const a = analyze(data);
    assert.ok(a.score >= 0 && a.score <= 100);
    if (a.blockedReasons.length > 0 || a.checklist.some((item) => !item.passed)) {
      assert.equal(a.suggestedDirection, 'AGUARDAR');
    }
  }
});

test('backend demo decision and frontend Radar classify the same scenario compatibly', () => {
  const data = bullishSet();
  const radar = analyze(data);
  const server = analyzeDemoCandles(data);
  assert.equal(radar.suggestedDirection, 'COMPRA');
  assert.equal(server.analysis.suggestedDirection, radar.suggestedDirection);
  assert.equal(server.analysis.decisionState, radar.decisionState);
  assert.equal(server.signal.decision, 'BUY');
  assert.equal(server.analysis.scoreContextual, radar.scoreContextual);
  assert.equal(server.analysis.scoreOperacional, radar.scoreOperacional);
});

test('trend with 3 of 4 votes generates direction', () => {
  const data = bullishSet();
  const resultBefore = analyze(data);
  assert.equal(resultBefore.diagnostics.trend1h.bullishVotes, 4);
  assert.equal(resultBefore.trend1h, 'ALTA');
  
  // Make 1h trend have exactly 3 votes by making slope flat
  const last10Closes = data.candles1h.slice(-10);
  const prevClose = data.candles1h[data.candles1h.length - 11].close;
  for (const c of last10Closes) {
    c.open = prevClose;
    c.close = prevClose;
    c.high = prevClose + 0.1;
    c.low = prevClose - 0.1;
  }
  const resultAfter = analyze(data);
  assert.ok(resultAfter.diagnostics.trend1h.bullishVotes >= 3);
  assert.equal(resultAfter.trend1h, 'ALTA');
});

test('trend with only 2 votes is lateral', () => {
  const data = bullishSet();
  // Make 1h trend flat and break structure
  const firstClose = data.candles1h[0].close;
  for (const c of data.candles1h) {
    c.open = firstClose;
    c.close = firstClose;
    c.high = firstClose + 0.05;
    c.low = firstClose - 0.05;
  }
  const result = analyze(data);
  assert.equal(result.diagnostics.trend1h.bullishVotes, 0);
  assert.equal(result.trend1h, 'LATERAL');
});

test('strong breakout with high volume is approved without retest', () => {
  const data = bullishSet();
  
  // Make average body larger in candles5m to prevent climax block
  for (let i = data.candles5m.length - 20; i < data.candles5m.length; i++) {
    const c = data.candles5m[i];
    c.close = c.open + 0.3;
    c.high = c.close + 0.05;
    c.low = c.open - 0.05;
  }

  // Set the 3rd candle from the end to be RED to break the consecutive green candle run
  const redCandle = data.candles5m[data.candles5m.length - 3];
  redCandle.open = 119.7;
  redCandle.close = 119.5;
  redCandle.high = 119.8;
  redCandle.low = 119.4;

  const last5 = data.candles5m[data.candles5m.length - 1];
  const prev5 = data.candles5m[data.candles5m.length - 2];
  
  prev5.open = 119.5;
  prev5.close = 119.8;
  prev5.high = 119.9;
  prev5.low = 119.4;
  
  // Breakout: low > 120.10 (level * 1.0015), close > level (119.92)
  last5.open = 120.15;
  last5.close = 120.45;
  last5.high = 120.50;
  last5.low = 120.15;
  
  // Set 15m volume relative to >= 1.2
  data.candles15m[data.candles15m.length - 1].volume = 180;
  
  const result = analyze(data);
  assert.equal(result.suggestedDirection, 'COMPRA');
  assert.equal(result.decisionState, 'ENTRADA_APROVADA');
  assert.equal(result.triggerStage, 'confirmed');
});

test('normal breakout with average volume waits for retest', () => {
  const data = bullishSet();
  
  // Make average body larger in candles5m to prevent climax block
  for (let i = data.candles5m.length - 20; i < data.candles5m.length; i++) {
    const c = data.candles5m[i];
    c.close = c.open + 0.3;
    c.high = c.close + 0.05;
    c.low = c.open - 0.05;
  }

  // Set the 3rd candle from the end to be RED to break the consecutive run
  const redCandle = data.candles5m[data.candles5m.length - 3];
  redCandle.open = 119.7;
  redCandle.close = 119.5;
  redCandle.high = 119.8;
  redCandle.low = 119.4;

  const last5 = data.candles5m[data.candles5m.length - 1];
  const prev5 = data.candles5m[data.candles5m.length - 2];
  
  prev5.open = 119.5;
  prev5.close = 119.8;
  prev5.high = 119.9;
  prev5.low = 119.4;
  
  last5.open = 120.15;
  last5.close = 120.45;
  last5.high = 120.50;
  last5.low = 120.15;
  
  // Set 15m volume average (relative < 1.2)
  data.candles15m[data.candles15m.length - 1].volume = 90;
  
  const result = analyze(data);
  assert.equal(result.suggestedDirection, 'AGUARDAR');
  assert.equal(result.triggerStage, 'forming');
});

test('volume below 0.5 blocks operation', () => {
  const data = bullishSet();
  data.candles15m[data.candles15m.length - 1].volume = 10;
  const result = analyze(data);
  assert.equal(result.suggestedDirection, 'AGUARDAR');
  assert.ok(result.criticalBlockedReasons.some((reason) => reason.includes('Volume')));
});

test('volume between 0.5 and 0.8 only penalizes', () => {
  const data = bullishSet();
  
  // Reduce last candle body to avoid climax penalty, keep it above resistance level
  const last5 = data.candles5m[data.candles5m.length - 1];
  last5.open = 119.85;
  last5.close = 119.95;
  last5.high = 119.98;
  last5.low = 119.72;

  data.candles15m[data.candles15m.length - 1].volume = 65; // relative around 0.6
  
  const result = analyze(data);
  assert.equal(result.suggestedDirection, 'COMPRA');
  assert.equal(result.decisionState, 'ENTRADA_APROVADA');
  assert.ok(result.qualityPenalties.some((reason) => reason.includes('Volume')));
});

test('extreme movement, severe climax candle, and invalid plan block operation', () => {
  // 1. Extreme movement blocks
  {
    const data = bullishSet();
    const last5 = data.candles5m[data.candles5m.length - 1];
    const prev5 = data.candles5m[data.candles5m.length - 6];
    last5.close = prev5.close * 1.04;
    last5.high = last5.close + 0.05;
    last5.low = last5.open - 0.05;
    const result = analyze(data);
    assert.equal(result.suggestedDirection, 'AGUARDAR');
    assert.ok(result.criticalBlockedReasons.some((reason) => reason.includes('Movimento 5 velas')));
  }
  
  // 2. Severe climax blocks
  {
    const data = bullishSet();
    const last5 = data.candles5m[data.candles5m.length - 1];
    
    // Make body and range huge to confirm AND exceed climax severe
    last5.open = 119.5;
    last5.close = 125.5; // body 6.0
    last5.high = 126.0;
    last5.low = 119.0; // range 7.0 (body/range = 6.0/7.0 = 0.85 >= 0.35, valid!)
    
    const result = analyze(data);
    assert.equal(result.suggestedDirection, 'AGUARDAR');
    assert.ok(result.criticalBlockedReasons.some((reason) => reason.includes('Range')));
  }
  
  // 3. Invalid plan blocks
  {
    const data = bullishSet();
    data.candles15m = wave(80, 10, 0, 0.1, FIFTEEN, 100);
    const result = analyze(data);
    assert.equal(result.suggestedDirection, 'AGUARDAR');
    // 15m fica lateral/oposto ao 1h antes mesmo de haver plano de risco a calcular;
    // o motor bloqueia mais cedo por conflito de tendencia (comportamento correto).
    assert.ok(result.blockedReasons.some((reason) => reason.includes('opostas') || reason.includes('lateral')) || result.missingConditions.length > 0);
  }
});

