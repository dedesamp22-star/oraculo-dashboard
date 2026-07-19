import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");

async function loadEngine() {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-engine-"));
  const outfile = path.join(dir, "demo-worker-engine.mjs");
  await build({
    absWorkingDir: root,
    entryPoints: ["./src/lib/demo-worker-engine.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
  });
  const mod = await import(`${pathToFileURL(outfile).href}?cache=${Date.now()}${Math.random()}`);
  return { mod, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function candle(index, open, close, volume = 120) {
  return {
    openTime: 1_700_000_000_000 + index * 300_000,
    closeTime: 1_700_000_299_999 + index * 300_000,
    open,
    close,
    high: Math.max(open, close) + 0.08,
    low: Math.min(open, close) - 0.08,
    volume,
  };
}

function baseCandles() {
  return Array.from({ length: 24 }, (_, index) => {
    const base = 99.6 + index * 0.004;
    return candle(index, index % 2 === 0 ? base - 0.05 : base + 0.05, index % 2 === 0 ? base + 0.05 : base - 0.04, 110);
  });
}

const trend15m = {
  trend: "ALTA",
  ema9: 99.88,
  ema21: 99.82,
  ema200: null,
  ema21Slope: 0.001,
};

const goodVolume = {
  current: 140,
  average20: 120,
  relative: 1.16,
  delta5: 0.12,
  expanding: true,
  veryWeak: false,
};

test("demo worker quality filters allow only non-extended retest entries", async () => {
  const { mod, cleanup } = await loadEngine();
  try {
    const valid = mod.qualityFilters("BUY", 100, baseCandles(), trend15m, goodVolume);
    assert.equal(valid.every((filter) => filter.passed), true);

    const farFromEma = mod.qualityFilters("BUY", 100, baseCandles(), { ...trend15m, ema21: 98.5 }, goodVolume);
    assert.equal(farFromEma.find((filter) => filter.name === "Distancia da EMA21").passed, false);

    const weakVolume = mod.qualityFilters("BUY", 100, baseCandles(), trend15m, { ...goodVolume, relative: 0.4, veryWeak: true });
    assert.equal(weakVolume.find((filter) => filter.name === "Volume compativel").passed, false);
  } finally {
    cleanup();
  }
});

test("demo worker blocks candle sequence and climatic candles", async () => {
  const { mod, cleanup } = await loadEngine();
  try {
    const run = [
      ...baseCandles().slice(0, -4),
      candle(30, 99.6, 99.75),
      candle(31, 99.75, 99.9),
      candle(32, 99.9, 100.05),
      candle(33, 100.05, 100.2),
    ];
    const sequence = mod.qualityFilters("BUY", 100.2, run, { ...trend15m, ema9: 100, ema21: 99.8 }, goodVolume);
    assert.equal(sequence.find((filter) => filter.name === "Sequencia de candles").passed, false);

    const climax = [...baseCandles()];
    climax[climax.length - 1] = { ...candle(40, 99.7, 100.4, 240), high: 101.2, low: 99.4 };
    const filters = mod.qualityFilters("BUY", 100.4, climax, { ...trend15m, ema9: 100.1, ema21: 100 }, goodVolume);
    assert.equal(filters.find((filter) => filter.name === "Candle climatico").passed, false);
  } finally {
    cleanup();
  }
});
