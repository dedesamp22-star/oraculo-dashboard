import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);

function loadTypeScript() {
  try {
    return require("typescript");
  } catch {
    return require(path.resolve(root, "..", "..", "..", "oraculo-dashboard", "node_modules", "typescript"));
  }
}

const ts = loadTypeScript();
const engineSource = readFileSync(path.join(root, "..", "shared", "marketDecisionEngine.ts"), "utf8");
const storeSource = readFileSync(path.join(root, "src", "lib", "demo-store.ts"), "utf8");
const workerSource = readFileSync(path.join(root, "src", "lib", "demo-worker.ts"), "utf8");

async function loadEngine() {
  const dir = mkdtempSync(path.join(tmpdir(), "oraculo-adaptive-engine-"));
  const outfile = path.join(dir, "marketDecisionEngine.mjs");
  const source = readFileSync(path.join(root, "..", "shared", "marketDecisionEngine.ts"), "utf8");
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

function candle(index, open, close, volume = 120, high = Math.max(open, close) + 0.2, low = Math.min(open, close) - 0.2) {
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

function trendingCandles(length, start, step, volume = 120) {
  return Array.from({ length }, (_, index) => {
    const open = start + index * step;
    const close = open + step * 0.75;
    return candle(index, open, close, volume, Math.max(open, close) + Math.abs(step) * 0.4, Math.min(open, close) - Math.abs(step) * 0.4);
  });
}

function alternatingChaoticCandles(length) {
  return Array.from({ length }, (_, index) => {
    const base = 100 + Math.sin(index) * 0.08;
    const up = index % 2 === 0;
    return candle(index, up ? base - 0.02 : base + 0.02, up ? base + 0.02 : base - 0.02, 120, base + 0.55, base - 0.55);
  });
}

function momentumCandles() {
  const base = trendingCandles(34, 106, 0.08);
  return [
    ...base,
    candle(34, 108.72, 108.62, 122, 109.15, 108.25),
    candle(35, 108.62, 108.95, 140, 109.35, 108.3),
    candle(36, 108.95, 108.82, 124, 109.25, 108.42),
    candle(37, 108.82, 109.28, 155, 109.7, 108.45),
    candle(38, 109.28, 109.18, 126, 109.58, 108.82),
    candle(39, 109.18, 109.68, 168, 110.05, 108.82),
  ];
}

function retestCandles() {
  return Array.from({ length: 40 }, (_, index) => {
    const base = 99.6 + index * 0.004;
    const open = index % 2 === 0 ? base - 0.05 : base + 0.05;
    const close = index % 2 === 0 ? base + 0.05 : base - 0.04;
    return candle(index, open, close, 110, Math.max(open, close) + 0.02, Math.min(open, close) - 0.02);
  });
}

const trend1hUp = {
  trend: "ALTA",
  ema9: 108,
  ema21: 106,
  ema200: 92,
  ema21Slope: 0.001,
  higherHighs: true,
  higherLows: true,
  lowerHighs: false,
  lowerLows: false,
  bullishVotes: 4,
  bearishVotes: 0,
};

const trend15mUp = {
  trend: "ALTA",
  ema9: 109.4,
  ema21: 109,
  ema200: null,
  ema21Slope: 0.001,
  higherHighs: true,
  higherLows: true,
  lowerHighs: false,
  lowerLows: false,
  bullishVotes: 4,
  bearishVotes: 0,
};

const trend1hDown = {
  trend: "BAIXA",
  ema9: 92,
  ema21: 94,
  ema200: 108,
  ema21Slope: -0.001,
  higherHighs: false,
  higherLows: false,
  lowerHighs: true,
  lowerLows: true,
  bullishVotes: 0,
  bearishVotes: 4,
};

const trend15mDown = {
  trend: "BAIXA",
  ema9: 90.6,
  ema21: 91,
  ema200: null,
  ema21Slope: -0.001,
  higherHighs: false,
  higherLows: false,
  lowerHighs: true,
  lowerLows: true,
  bullishVotes: 0,
  bearishVotes: 4,
};

test("classifies aligned impulse as MOMENTUM with measured context", async () => {
  const { mod, cleanup } = await loadEngine();
  try {
    const regime = mod.classifyMarketRegime({
      symbol: "BTCUSDT",
      decisionPrice: 109.68,
      candles1h: trendingCandles(220, 80, 0.12),
      candles15m: trendingCandles(80, 96, 0.16),
      candles5m: momentumCandles(),
      trend1h: trend1hUp,
      trend15m: trend15mUp,
      contextDirection: "COMPRA",
      volume: { current: 160, average20: 120, relative: 1.25, delta5: 0.15, expanding: true, veryWeak: false },
      insufficient: false,
    });
    assert.equal(regime.regime, "MOMENTUM");
    assert.equal(regime.direction, "BUY");
    assert.ok(regime.confidence >= 70);
    assert.equal(typeof regime.ema200DistancePctSigned, "number");
  } finally {
    cleanup();
  }
});

test("classifies clean trends, lateral market, insufficient data and EMA200 context", async () => {
  const { mod, cleanup } = await loadEngine();
  try {
    const cleanBuy = mod.classifyMarketRegime({
      symbol: "BTCUSDT",
      decisionPrice: 100,
      candles1h: trendingCandles(220, 90, 0.04),
      candles15m: trendingCandles(80, 96, 0.02),
      candles5m: retestCandles(),
      trend1h: { ...trend1hUp, ema200: 70 },
      trend15m: { ...trend15mUp, ema9: 99.9, ema21: 99.8 },
      contextDirection: "COMPRA",
      volume: { current: 120, average20: 120, relative: 1, delta5: 0, expanding: false, veryWeak: false },
      insufficient: false,
    });
    assert.equal(cleanBuy.regime, "TREND_CLEAN");
    assert.equal(cleanBuy.direction, "BUY");
    assert.ok(cleanBuy.ema200DistancePctSigned > 0);

    const cleanSell = mod.classifyMarketRegime({
      symbol: "ETHUSDT",
      decisionPrice: 100,
      candles1h: trendingCandles(220, 110, -0.04),
      candles15m: trendingCandles(80, 104, -0.02),
      candles5m: retestCandles(),
      trend1h: { ...trend1hDown, ema200: 130 },
      trend15m: { ...trend15mDown, ema9: 100.1, ema21: 100.2 },
      contextDirection: "VENDA",
      volume: { current: 120, average20: 120, relative: 1, delta5: 0, expanding: false, veryWeak: false },
      insufficient: false,
    });
    assert.equal(cleanSell.regime, "TREND_CLEAN");
    assert.equal(cleanSell.direction, "SELL");

    const lateral = mod.classifyMarketRegime({
      symbol: "SOLUSDT",
      decisionPrice: 100,
      candles1h: retestCandles(),
      candles15m: retestCandles(),
      candles5m: retestCandles(),
      trend1h: { ...trend1hUp, trend: "LATERAL", ema9: 100, ema21: 100, ema200: 100, bullishVotes: 1, bearishVotes: 1 },
      trend15m: { ...trend15mUp, trend: "LATERAL", ema9: 100, ema21: 100, bullishVotes: 1, bearishVotes: 1 },
      contextDirection: "AGUARDAR",
      volume: { current: 120, average20: 120, relative: 1, delta5: 0, expanding: false, veryWeak: false },
      insufficient: false,
    });
    assert.equal(lateral.regime, "LATERAL");

    const insufficient = mod.classifyMarketRegime({
      symbol: "BTCUSDT",
      decisionPrice: 100,
      candles1h: [],
      candles15m: [],
      candles5m: [],
      trend1h: null,
      trend15m: null,
      contextDirection: "AGUARDAR",
      volume: null,
      insufficient: true,
    });
    assert.equal(insufficient.regime, "INSUFFICIENT_DATA");

    const distantEma200Only = mod.analyzeDemoCandles({
      symbol: "BTCUSDT",
      displayPrice: 100,
      candles1h: trendingCandles(220, 50, 0.04),
      candles15m: trendingCandles(90, 96, 0.02),
      candles5m: retestCandles(),
      now: 1_700_000_299_999 + 219 * 300_000,
    });
    assert.doesNotMatch(distantEma200Only.analysis.blockedReasons.join(" | "), /EMA200/);
  } finally {
    cleanup();
  }
});

test("classifies stretched and chaotic regimes without changing score rules", async () => {
  const { mod, cleanup } = await loadEngine();
  try {
    const stretched = mod.classifyMarketRegime({
      symbol: "BTCUSDT",
      decisionPrice: 120,
      candles1h: trendingCandles(220, 80, 0.12),
      candles15m: trendingCandles(80, 96, 0.16),
      candles5m: trendingCandles(40, 98, 0.55),
      trend1h: trend1hUp,
      trend15m: { ...trend15mUp, ema9: 116, ema21: 114 },
      contextDirection: "COMPRA",
      volume: { current: 140, average20: 120, relative: 1.16, delta5: 0.1, expanding: true, veryWeak: false },
      insufficient: false,
    });
    assert.equal(stretched.regime, "TREND_STRETCHED");
    assert.equal(stretched.stretchedEvidence.extreme, true);

    const chaotic = mod.classifyMarketRegime({
      symbol: "ETHUSDT",
      decisionPrice: 100,
      candles1h: trendingCandles(220, 100, 0.01),
      candles15m: alternatingChaoticCandles(80),
      candles5m: alternatingChaoticCandles(40),
      trend1h: trend1hUp,
      trend15m: trend15mUp,
      contextDirection: "COMPRA",
      volume: { current: 120, average20: 120, relative: 1, delta5: 0, expanding: false, veryWeak: false },
      insufficient: false,
    });
    assert.equal(chaotic.regime, "CHAOTIC");
    assert.equal(chaotic.chaoticEvidence.high, true);
  } finally {
    cleanup();
  }
});

test("momentum selector requires structural confirmation and rejects weak risk contexts", () => {
  const momentumBlock = engineSource.slice(engineSource.indexOf("const momentumChecks"), engineSource.indexOf("momentumConditionsPassed ="));
  assert.match(engineSource, /"CONTINUATION_MOMENTUM"/);
  assert.match(momentumBlock, /\["confirmacao por dois fechamentos ou vela forte", twoClosesBeyond \|\| strongCloseBeyond\]/);
  assert.match(momentumBlock, /volume\.relative >= DEMO_ADAPTIVE_CONFIG\.momentumMinVolumeRelative/);
  assert.match(momentumBlock, /marketRegime\.regime !== "CHAOTIC"/);
  assert.match(momentumBlock, /!marketRegime\.stretchedEvidence\.extreme/);
  assert.match(momentumBlock, /candidatePlan\.valid && candidateRrStatus === "valid" && !candidatePlan\.stopTooFar/);
  assert.match(engineSource, /trigger\.conservative = candidateEntry/);
  assert.doesNotMatch(momentumBlock, /Reteste conservador|retestValid: false/);
});

test("simple EMA cross does not open and same candle setup is represented by one signalKey", async () => {
  const { mod, cleanup } = await loadEngine();
  try {
    const first = mod.analyzeDemoCandles({
      symbol: "BTCUSDT",
      displayPrice: 100,
      candles1h: trendingCandles(220, 90, 0.03),
      candles15m: trendingCandles(90, 96, 0.02),
      candles5m: retestCandles(),
      now: 1_700_000_299_999 + 219 * 300_000,
    });
    const second = mod.analyzeDemoCandles({
      symbol: "BTCUSDT",
      displayPrice: 100,
      candles1h: trendingCandles(220, 90, 0.03),
      candles15m: trendingCandles(90, 96, 0.02),
      candles5m: retestCandles(),
      now: 1_700_000_299_999 + 219 * 300_000,
    });
    assert.equal(first.signal.decision, "SEM ENTRADA");
    assert.equal(first.analysis.signalKey, second.analysis.signalKey);
  } finally {
    cleanup();
  }
});

test("market reorganization blocks blind repeat after target2 and allows organized continuation", async () => {
  const { mod, cleanup } = await loadEngine();
  try {
    const lastTrade = { direction: "BUY", exitReason: "TARGET_2", target1Hit: true, target2Hit: true, closeTime: 1_700_000_000_000, signalKey: "old" };
    const blocked = mod.evaluateMarketReorganization({
      lastTrade,
      currentDirection: "BUY",
      signalKey: "old",
      sameDirectionCandles: 5,
      ema9DistancePct: 0.02,
      ema21DistancePct: 0.03,
      volumeRelative: 1.9,
      triggerLevel: null,
      symbol: "BTCUSDT",
    });
    assert.equal(blocked.reorganized, false);
    assert.ok(blocked.missingConditions.includes("interrupcao da sequencia direcional"));

    const organized = mod.evaluateMarketReorganization({
      lastTrade,
      currentDirection: "BUY",
      signalKey: "new-structure",
      sameDirectionCandles: 1,
      ema9DistancePct: 0.002,
      ema21DistancePct: 0.004,
      volumeRelative: 1,
      triggerLevel: 101,
      symbol: "BTCUSDT",
    });
    assert.equal(organized.reorganized, true);

    const opposite = mod.evaluateMarketReorganization({
      lastTrade,
      currentDirection: "SELL",
      signalKey: "opposite",
      sameDirectionCandles: 1,
      ema9DistancePct: 0.002,
      ema21DistancePct: 0.004,
      volumeRelative: 1,
      triggerLevel: 99,
      symbol: "BTCUSDT",
    });
    assert.equal(opposite.reorganized, true);
  } finally {
    cleanup();
  }
});

test("reorganization has no fixed cooldown and memory is scoped by user and symbol", () => {
  assert.doesNotMatch(engineSource, /cooldown|setTimeout|minutes/i);
  assert.match(storeSource, /getLastTradeForSymbol\(userId: string, symbol: string\)/);
  assert.match(storeSource, /WHERE user_id = \? AND pair = \?/);
  assert.match(workerSource, /deps\.store\.getLastTradeForSymbol\(user\.id, symbol\)/);
});

test("adaptive fields are emitted on no-signal analysis and retest regressions remain possible", async () => {
  const { mod, cleanup } = await loadEngine();
  try {
    const result = mod.analyzeDemoCandles({
      symbol: "SOLUSDT",
      displayPrice: 100,
      candles1h: trendingCandles(220, 90, 0.03),
      candles15m: trendingCandles(80, 96, 0.02),
      candles5m: trendingCandles(40, 98, 0.01),
      now: 1_700_000_299_999 + 39 * 300_000,
    });
    assert.ok(result.analysis.marketRegime);
    assert.ok(result.analysis.strategySelection);
    assert.ok(["NONE", "CONTINUATION_RETEST", "CONTINUATION_MOMENTUM"].includes(result.analysis.selectedStrategy));
    assert.match(result.signal.signalKey, /SOLUSDT/);

    const filters = mod.qualityFilters(
      "BTCUSDT",
      "BUY",
      100,
      retestCandles(),
      { ...trend15mUp, ema9: 99.9, ema21: 99.8 },
      { current: 140, average20: 120, relative: 1.16, delta5: 0.12, expanding: true, veryWeak: false },
      { kind: "retest", level: 100, retestValid: true },
    );
    assert.equal(mod.blockingQualityFailures(filters).length, 0);
  } finally {
    cleanup();
  }
});
