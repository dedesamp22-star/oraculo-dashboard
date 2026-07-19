import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMarketRadar } from './.tmp/marketRadar.mjs';

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
  const candles15m = wave(80, 110, 0.12, 0.9, FIFTEEN, 100);
  const baseTime = NOW - 10 * FIFTEEN;
  const custom15 = [
    [118.2, 118.9, 118.0, 118.6, 100],
    [118.6, 119.85, 119.35, 119.45, 100],
    [119.45, 119.55, 119.25, 119.35, 100],
    [119.35, 119.6, 119.0, 119.25, 100],
    [119.25, 119.5, 119.2, 119.35, 100],
    [119.35, 119.75, 119.25, 119.55, 100],
    [119.55, 119.9, 119.3, 119.7, 100],
    [119.7, 120.05, 119.4, 119.85, 135],
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
    candle(base5, 119.2, 119.5, 119.0, 119.35, 100),
    candle(base5 + FIVE, 119.35, 119.65, 119.1, 119.45, 100),
    candle(base5 + FIVE * 2, 119.45, 119.75, 119.2, 119.55, 100),
    candle(base5 + FIVE * 3, 119.55, 120.35, 119.5, 120.25, 120),
  );
  return { symbol: 'BTCUSDT', displayPrice: 99999, candles1h, candles15m, candles5m, now: NOW };
}

function bearishSet() {
  const candles1h = wave(220, 150, -0.14, 1.3, HOUR, 100);
  const candles15m = wave(80, 130, -0.12, 0.9, FIFTEEN, 100);
  const baseTime = NOW - 10 * FIFTEEN;
  const custom15 = [
    [121.8, 122.1, 121.2, 121.5, 100],
    [121.5, 121.7, 120.15, 120.55, 100],
    [120.55, 121.1, 120.4, 120.9, 100],
    [120.9, 121.3, 120.65, 120.8, 100],
    [120.8, 121.05, 120.5, 120.7, 100],
    [120.7, 120.95, 120.25, 120.5, 100],
    [120.5, 120.75, 120.1, 120.3, 100],
    [120.3, 120.55, 119.95, 120.15, 135],
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
    candle(base5, 120.8, 121.0, 120.5, 120.65, 100),
    candle(base5 + FIVE, 120.65, 120.9, 120.35, 120.45, 100),
    candle(base5 + FIVE * 2, 120.45, 120.7, 120.2, 120.35, 100),
    candle(base5 + FIVE * 3, 120.35, 120.4, 119.65, 119.75, 120),
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
  assert.equal(a.decisionPrice, 120.25);
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
  data.candles15m = bearishSet().candles15m;
  const a = analyze(data);
  assert.equal(a.suggestedDirection, 'AGUARDAR');
  assert.ok(a.blockedReasons.some((reason) => reason.includes('opostas')));
});

test('very weak volume blocks operation', () => {
  const data = bullishSet();
  data.candles15m[data.candles15m.length - 1].volume = 1;
  const a = analyze(data);
  assert.equal(a.suggestedDirection, 'AGUARDAR');
  assert.ok(a.blockedReasons.some((reason) => reason.includes('Volume muito baixo')));
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
  assert.ok(a.blockedReasons.includes('Plano matematicamente inválido') || a.checklist.some((item) => !item.passed));
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
