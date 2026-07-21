import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");

async function loadEngine() {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-engine-"));
  const outfile = path.join(dir, "demo-worker-engine.mjs");
  const source = readFileSync(path.join(root, "src", "lib", "demo-worker-engine.ts"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
  });
  writeFileSync(outfile, output.outputText);
  const mod = await import(`${pathToFileURL(outfile).href}?cache=${Date.now()}${Math.random()}`);
  return { mod, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function candle(index, open, close, volume = 120, high = Math.max(open, close) + 0.08, low = Math.min(open, close) - 0.08) {
  return {
    openTime: 1_700_000_000_000 + index * 300_000,
    closeTime: 1_700_000_299_999 + index * 300_000,
    open,
    close,
    high,
    low,
    volume,
  };
}

function baseCandles() {
  return Array.from({ length: 30 }, (_, index) => {
    const base = 99.6 + index * 0.004;
    return candle(index, index % 2 === 0 ? base - 0.05 : base + 0.05, index % 2 === 0 ? base + 0.05 : base - 0.04, 110);
  });
}

function stretchedBuyCandles() {
  const candles = baseCandles().slice(0, -6);
  return [
    ...candles,
    candle(40, 99.0, 99.15),
    candle(41, 99.15, 99.45),
    candle(42, 99.45, 99.8),
    candle(43, 99.8, 100.15),
    candle(44, 100.15, 100.45),
    candle(45, 100.45, 100.7, 180, 100.82, 100.3),
  ];
}

function stretchedSellCandles() {
  const candles = baseCandles().slice(0, -6);
  return [
    ...candles,
    candle(40, 101.0, 100.85),
    candle(41, 100.85, 100.55),
    candle(42, 100.55, 100.2),
    candle(43, 100.2, 99.85),
    candle(44, 99.85, 99.55),
    candle(45, 99.55, 99.3, 180, 99.7, 99.18),
  ];
}

const bullishTrend15m = {
  trend: "ALTA",
  ema9: 99.82,
  ema21: 99.72,
  ema200: null,
  ema21Slope: 0.001,
};

const bearishTrend15m = {
  trend: "BAIXA",
  ema9: 100.18,
  ema21: 100.28,
  ema200: null,
  ema21Slope: -0.001,
};

const goodVolume = {
  current: 140,
  average20: 120,
  relative: 1.16,
  delta5: 0.12,
  expanding: true,
  veryWeak: false,
};

const retest = { kind: "retest", level: 100, retestValid: true };

function find(filters, name) {
  const filter = filters.find((item) => item.name === name);
  assert.ok(filter, `missing filter ${name}`);
  return filter;
}

function hasBlockingFailure(mod, filters) {
  return mod.blockingQualityFailures(filters).length > 0;
}

test("anti-exhaustion blocks buys after stretched move with exhaustion", async () => {
  const { mod, cleanup } = await loadEngine();
  try {
    const filters = mod.qualityFilters("BTCUSDT", "BUY", 100.7, stretchedBuyCandles(), { ...bullishTrend15m, ema9: 100.45, ema21: 100.25 }, goodVolume, retest);
    assert.equal(find(filters, "Movimento esticado").severity, "block");
    assert.equal(hasBlockingFailure(mod, filters), true);
  } finally {
    cleanup();
  }
});

test("anti-exhaustion blocks sells after stretched fall with exhaustion", async () => {
  const { mod, cleanup } = await loadEngine();
  try {
    const filters = mod.qualityFilters("BTCUSDT", "SELL", 99.3, stretchedSellCandles(), { ...bearishTrend15m, ema9: 99.55, ema21: 99.75 }, goodVolume, retest);
    assert.equal(find(filters, "Movimento esticado").severity, "block");
    assert.equal(hasBlockingFailure(mod, filters), true);
  } finally {
    cleanup();
  }
});

test("valid buy and sell retests pass the hard filters", async () => {
  const { mod, cleanup } = await loadEngine();
  try {
    const buy = mod.qualityFilters("BTCUSDT", "BUY", 100, baseCandles(), bullishTrend15m, goodVolume, retest);
    assert.equal(hasBlockingFailure(mod, buy), false);

    const sell = mod.qualityFilters("BTCUSDT", "SELL", 100, baseCandles(), bearishTrend15m, goodVolume, retest);
    assert.equal(hasBlockingFailure(mod, sell), false);
  } finally {
    cleanup();
  }
});

test("fourth candle is allowed only with approved retest context", async () => {
  const { mod, cleanup } = await loadEngine();
  try {
    const run = [
      ...baseCandles().slice(0, -4),
      candle(30, 99.4, 99.5),
      candle(31, 99.5, 99.6),
      candle(32, 99.6, 99.7),
      candle(33, 99.7, 99.8),
    ];
    const allowed = mod.qualityFilters("BTCUSDT", "BUY", 99.8, run, { ...bullishTrend15m, ema9: 99.7, ema21: 99.55 }, goodVolume, retest);
    assert.equal(find(allowed, "Sequencia de candles").passed, true);

    const blocked = mod.qualityFilters("BTCUSDT", "BUY", 99.8, run, { ...bullishTrend15m, ema9: 99.7, ema21: 99.55 }, goodVolume, { kind: "breakout", level: 100, retestValid: false });
    assert.equal(find(blocked, "Sequencia de candles").passed, false);
    assert.equal(hasBlockingFailure(mod, blocked), true);
  } finally {
    cleanup();
  }
});

test("climactic candle and excessive contrary wick block entries", async () => {
  const { mod, cleanup } = await loadEngine();
  try {
    const climax = [...baseCandles()];
    climax[climax.length - 1] = candle(40, 99.7, 100.4, 240, 101.2, 99.4);
    const climaticFilters = mod.qualityFilters("BTCUSDT", "BUY", 100.4, climax, { ...bullishTrend15m, ema9: 100.1, ema21: 100 }, goodVolume, retest);
    assert.equal(find(climaticFilters, "Candle climatico").passed, false);
    assert.equal(hasBlockingFailure(mod, climaticFilters), true);

    const wick = [...baseCandles()];
    wick[wick.length - 1] = candle(41, 99.8, 100, 130, 100.45, 99.75);
    const wickFilters = mod.qualityFilters("BTCUSDT", "BUY", 100, wick, bullishTrend15m, goodVolume, retest);
    assert.equal(find(wickFilters, "Pavio contra entrada").passed, false);
    assert.equal(hasBlockingFailure(mod, wickFilters), true);
  } finally {
    cleanup();
  }
});

test("SOL uses wider EMA distance tolerances than BTC and ETH", async () => {
  const { mod, cleanup } = await loadEngine();
  try {
    const sol = mod.qualityFilters("SOLUSDT", "BUY", 100, baseCandles(), { ...bullishTrend15m, ema9: 99.45, ema21: 99.25 }, goodVolume, retest);
    assert.equal(find(sol, "Distancia da EMA9").passed, true);
    assert.equal(find(sol, "Distancia da EMA21").passed, true);

    const btc = mod.qualityFilters("BTCUSDT", "BUY", 100, baseCandles(), { ...bullishTrend15m, ema9: 99.45, ema21: 99.25 }, goodVolume, retest);
    assert.equal(find(btc, "Distancia da EMA9").passed, false);
    assert.equal(find(btc, "Distancia da EMA21").passed, false);
  } finally {
    cleanup();
  }
});

test("volume 0.8 with strong context can pass, while weak isolated context only penalizes", async () => {
  const { mod, cleanup } = await loadEngine();
  try {
    const minimumVolume = mod.qualityFilters("BTCUSDT", "BUY", 100, baseCandles(), bullishTrend15m, { ...goodVolume, relative: 0.8, delta5: 0.08 }, retest);
    assert.equal(find(minimumVolume, "Volume compativel").passed, true);
    assert.equal(hasBlockingFailure(mod, minimumVolume), false);

    const isolatedExtensionCandles = [
      ...baseCandles().slice(0, -6),
      candle(50, 99.1, 99.35, 120, 99.72, 98.9),
      candle(51, 99.65, 99.4, 120, 99.86, 99.18),
      candle(52, 99.4, 99.85, 120, 100.08, 99.18),
      candle(53, 100.05, 99.8, 120, 100.24, 99.56),
      candle(54, 99.8, 100.35, 120, 100.58, 99.62),
      candle(55, 100.42, 100.65, 130, 100.73, 100.34),
    ];
    const isolatedExtension = mod.qualityFilters("BTCUSDT", "BUY", 100.65, isolatedExtensionCandles, { ...bullishTrend15m, ema9: 100.35, ema21: 100.15 }, goodVolume, retest);
    const movement = find(isolatedExtension, "Movimento esticado");
    assert.equal(movement.passed, false);
    assert.equal(movement.severity, "penalty");
    assert.equal(hasBlockingFailure(mod, isolatedExtension), false);
  } finally {
    cleanup();
  }
});

test("risk reward below 1:2 is rejected", async () => {
  const { mod, cleanup } = await loadEngine();
  try {
    assert.equal(mod.riskRewardMeetsMinimum(1.99), false);
    assert.equal(mod.riskRewardMeetsMinimum(2), true);
  } finally {
    cleanup();
  }
});

test("engine still emits valid demo signals in normal retest scenarios", async () => {
  const { mod, cleanup } = await loadEngine();
  try {
    const filters = mod.qualityFilters("ETHUSDT", "BUY", 100, baseCandles(), bullishTrend15m, goodVolume, retest);
    assert.equal(filters.every((filter) => filter.passed || filter.severity === "penalty"), true);
    assert.equal(hasBlockingFailure(mod, filters), false);
  } finally {
    cleanup();
  }
});
