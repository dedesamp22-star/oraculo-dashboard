import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const BASE_COMMIT = "5d376a8dd7cdf9830b11d1a2321d7eb16571c841";
const root = path.resolve(import.meta.dirname, "..", "..", "..");
const apiRoot = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);

function loadTypeScript() {
  try {
    return require("typescript");
  } catch {
    return require(path.resolve(root, "..", "oraculo-dashboard", "node_modules", "typescript"));
  }
}

const ts = loadTypeScript();

async function loadEngineFromSource(name, source) {
  const dir = mkdtempSync(path.join(tmpdir(), `oraculo-replay-${name}-`));
  const outfile = path.join(dir, "marketDecisionEngine.mjs");
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

function loadBaseSource() {
  return execFileSync("git", ["show", `${BASE_COMMIT}:artifacts/shared/marketDecisionEngine.ts`], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function candle(index, length, intervalMs, now, open, close, volume = 120, high = Math.max(open, close) + 0.08, low = Math.min(open, close) - 0.08) {
  const closeTime = now - (length - 1 - index) * intervalMs;
  return { openTime: closeTime - intervalMs + 1, closeTime, open, close, high, low, volume };
}

function trendCandles(length, start, step, intervalMs, now, volume = 120) {
  return Array.from({ length }, (_, index) => {
    const base = start + index * step + Math.sin(index / 8) * 0.08;
    const open = base;
    const close = base + step * 0.45;
    return candle(index, length, intervalMs, now, open, close, volume, Math.max(open, close) + 0.12, Math.min(open, close) - 0.12);
  });
}

function structural15m(now, { volumeExpansion = false, shift = 0 } = {}) {
  const length = 90;
  return Array.from({ length }, (_, index) => {
    let base = 106 + index * 0.035 + Math.sin(index / 2) * 0.16 + shift;
    if (index === 70) base = 108.05 + shift;
    if (index === 75) base = 107.7 + shift;
    if (index === 84) base = 108.25 + shift;
    const open = base - 0.03;
    const close = base + 0.04;
    const high = Math.max(open, close) + (index === 70 ? 0.35 : 0.07);
    const low = Math.min(open, close) - (index === 75 ? 0.45 : 0.07);
    const volume = volumeExpansion && index >= length - 5 ? 190 : volumeExpansion && index >= length - 10 ? 115 : index > 70 ? 145 : 120;
    return candle(index, length, 900_000, now, open, close, volume, high, low);
  });
}

function momentum5m(now, mode = "two-closes") {
  const length = 58;
  const candles = [];
  for (let index = 0; index < 34; index++) {
    const base = 108.15 + Math.sin(index / 2) * 0.1;
    candles.push(candle(index, length, 300_000, now, base - 0.08, base + 0.08, 120, base + 0.24, base - 0.24));
  }
  candles.push(candle(34, length, 300_000, now, 108.25, 108.15, 120, 108.48, 107.98));
  candles.push(candle(35, length, 300_000, now, 108.15, 108.35, 125, 108.55, 108));
  candles.push(candle(36, length, 300_000, now, 108.35, 108.18, 128, 108.6, 108.05));
  candles.push(candle(37, length, 300_000, now, 108.18, 108.62, 150, 108.72, 108.1));
  if (mode === "weak-single-close") {
    candles.push(candle(38, length, 300_000, now, 108.05, 107.95, 145, 108.72, 107.9));
    candles.push(candle(39, length, 300_000, now, 108.78, 108.9, 144, 109, 108.7));
  } else if (mode === "strong-single-close") {
    candles.push(candle(38, length, 300_000, now, 108.05, 107.95, 130, 108.72, 107.9));
    candles.push(candle(39, length, 300_000, now, 108.7, 109.08, 170, 109.14, 108.68));
  } else {
    candles.push(candle(38, length, 300_000, now, 108.62, 108.78, 145, 108.9, 108.5));
    candles.push(candle(39, length, 300_000, now, 108.78, 108.9, 144, 109, 108.7));
  }
  const entry = candles[39].close;
  const risk = 0.42;
  const continuation = [
    [entry, entry + 0.28, 150, entry + 0.38, entry - 0.12],
    [entry + 0.28, entry + 0.7, 145, entry + 0.9, entry + 0.18],
    [entry + 0.7, entry + 1.03, 140, entry + 1.28, entry + 0.55],
    [entry + 1.03, entry + 0.82, 130, entry + 1.12, entry + 0.65],
    [entry + 0.82, entry + 1.35, 150, entry + 1.46, entry + 0.72],
    [entry + 1.35, entry + 1.05, 130, entry + 1.4, entry + 0.92],
    [entry + 1.05, entry + 1.45, 140, entry + 1.5, entry + 0.95],
    [entry + 1.45, entry + 1.2, 120, entry + 1.48, entry + 1.08],
    [entry + 1.2, entry + 0.95, 110, entry + 1.25, entry + 0.84],
    [entry + 0.95, entry + 0.7, 110, entry + 1.02, entry + 0.6],
    [entry + 0.7, entry + 0.48, 100, entry + 0.82, entry + 0.38],
    [entry + 0.48, entry + 0.24, 100, entry + 0.55, entry + 0.12],
    [entry + 0.24, entry - risk, 100, entry + 0.3, entry - risk - 0.05],
    [entry - risk, entry - risk * 0.8, 100, entry - risk * 0.7, entry - risk - 0.08],
    [entry - risk * 0.8, entry - risk * 0.5, 100, entry - risk * 0.4, entry - risk],
    [entry - risk * 0.5, entry - risk * 0.2, 100, entry, entry - risk * 0.6],
    [entry - risk * 0.2, entry + 0.1, 100, entry + 0.18, entry - risk * 0.3],
    [entry + 0.1, entry + 0.2, 100, entry + 0.25, entry],
  ];
  for (const item of continuation) {
    const index = candles.length;
    candles.push(candle(index, length, 300_000, now, item[0], item[1], item[2], item[3], item[4]));
  }
  return candles;
}

function chaotic5m(now) {
  const length = 58;
  return Array.from({ length }, (_, index) => {
    const base = 108.3 + Math.sin(index) * 0.08;
    const up = index % 2 === 0;
    return candle(index, length, 300_000, now, up ? base - 0.02 : base + 0.02, up ? base + 0.02 : base - 0.02, 120, base + 0.55, base - 0.55);
  });
}

function fixtureSet() {
  const baseNow = 2_000_000_000_000;
  const common = (offset, mode, symbol, options = {}) => {
    const now = baseNow + offset * 86_400_000;
    return {
      id: `${symbol}-${mode}-${offset}`,
      symbol,
      signalIndex: 39,
      candles1h: trendCandles(220, 100, 0.035, 3_600_000, now),
      candles15m: structural15m(now, options),
      candles5m: mode === "chaotic" ? chaotic5m(now) : momentum5m(now, mode),
      lastTrade: options.lastTrade ?? null,
    };
  };
  return [
    common(0, "two-closes", "BTCUSDT"),
    common(1, "strong-single-close", "ETHUSDT", { volumeExpansion: true }),
    common(2, "weak-single-close", "SOLUSDT"),
    common(3, "chaotic", "BTCUSDT"),
    common(4, "two-closes", "ETHUSDT", { shift: -1.5 }),
    common(5, "two-closes", "SOLUSDT", { lastTrade: { direction: "BUY", exitReason: "TARGET_2", target1Hit: true, target2Hit: true, closeTime: baseNow, signalKey: "old" } }),
  ];
}

function callAnalyze(engine, fixture, endIndex) {
  const candles5m = fixture.candles5m.slice(0, endIndex + 1);
  const now = candles5m[candles5m.length - 1].closeTime;
  return engine.analyzeDemoCandles({
    symbol: fixture.symbol,
    displayPrice: candles5m[candles5m.length - 1].close,
    candles1h: fixture.candles1h,
    candles15m: fixture.candles15m,
    candles5m,
    now,
    lastTrade: fixture.lastTrade,
  });
}

function pnlFor(direction, entry, exit) {
  return direction === "BUY" ? exit - entry : entry - exit;
}

function simulateTrade(signal, fixture, signalIndex) {
  const direction = signal.decision;
  const entry = Number(signal.entryNum);
  const stop = Number(signal.stopLossNum);
  const target1 = Number(signal.target1Num);
  const target2 = Number(signal.target2Num);
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(target1) || !Number.isFinite(target2)) return null;
  let target1Hit = false;
  let target2Hit = false;
  let stopHit = false;
  let timeout = false;
  let ambiguous = false;
  let exit = entry;
  let exitReason = "TIMEOUT";
  let mfe = 0;
  let mae = 0;
  const following = fixture.candles5m.slice(signalIndex + 1, signalIndex + 19);
  for (let index = 0; index < following.length; index++) {
    const c = following[index];
    const best = direction === "BUY" ? c.high : c.low;
    const worst = direction === "BUY" ? c.low : c.high;
    mfe = Math.max(mfe, pnlFor(direction, entry, best));
    mae = Math.min(mae, pnlFor(direction, entry, worst));
    const touchedStop = direction === "BUY" ? c.low <= stop : c.high >= stop;
    const touchedTarget1 = direction === "BUY" ? c.high >= target1 : c.low <= target1;
    const touchedTarget2 = direction === "BUY" ? c.high >= target2 : c.low <= target2;
    if (touchedStop && (touchedTarget1 || touchedTarget2)) {
      ambiguous = true;
      exit = entry;
      exitReason = "AMBIGUOUS";
      break;
    }
    if (touchedTarget1) target1Hit = true;
    if (touchedTarget2) {
      target2Hit = true;
      exit = target2;
      exitReason = "TARGET_2";
      break;
    }
    if (touchedStop) {
      stopHit = true;
      exit = stop;
      exitReason = "STOP_LOSS";
      break;
    }
    if (index === 17) {
      timeout = true;
      exit = c.close;
      exitReason = "TIMEOUT";
    }
  }
  return {
    fixture: fixture.id,
    symbol: fixture.symbol,
    strategy: signal.strategy,
    direction,
    entry,
    stopLoss: stop,
    target1,
    target2,
    pnl: Number(pnlFor(direction, entry, exit).toFixed(4)),
    drawdown: Number(mae.toFixed(4)),
    mfe: Number(mfe.toFixed(4)),
    mae: Number(mae.toFixed(4)),
    target1Hit,
    target2Hit,
    stop: stopHit,
    timeout,
    ambiguous,
    exitReason,
  };
}

function strategyFromResult(result) {
  return result.analysis?.selectedStrategy === "CONTINUATION_MOMENTUM"
    ? "CONTINUATION_MOMENTUM"
    : result.analysis?.selectedStrategy === "CONTINUATION_RETEST"
      ? "CONTINUATION_RETEST"
      : "RETEST";
}

function replay(engine, fixtures, mode) {
  const trades = [];
  const rejected = [];
  let evaluations = 0;
  let none = 0;
  for (const fixture of fixtures) {
    const seenSignalKeys = new Set();
    for (let index = fixture.signalIndex; index <= fixture.signalIndex; index++) {
      evaluations++;
      const result = callAnalyze(engine, fixture, index);
      if (result.signal.decision === "SEM ENTRADA") {
        none++;
        const regime = result.analysis?.marketRegime?.regime;
        const selected = result.analysis?.selectedStrategy;
        if (mode === "MOTOR_ADAPTATIVO") {
          if (regime === "CHAOTIC") rejected.push("CHAOTIC");
          if (regime === "TREND_STRETCHED" && selected !== "CONTINUATION_MOMENTUM") rejected.push("TREND_STRETCHED");
          if (result.analysis?.marketReorganization?.reorganized === false) rejected.push("MISSING_REORGANIZATION");
        }
        continue;
      }
      const signalKey = result.analysis?.signalKey ?? result.signal.signalKey ?? `${fixture.id}-${index}`;
      if (seenSignalKeys.has(signalKey)) continue;
      seenSignalKeys.add(signalKey);
      const trade = simulateTrade({ ...result.signal, strategy: strategyFromResult(result) }, fixture, index);
      if (trade) trades.push(trade);
      break;
    }
  }
  if (evaluations === 0) throw new Error(`${mode}: nenhuma chamada real ao motor foi executada`);
  return { evaluations, trades, rejected, none };
}

function maxDrawdown(trades) {
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  for (const trade of trades) {
    equity += trade.pnl;
    peak = Math.max(peak, equity);
    maxDd = Math.min(maxDd, equity - peak, trade.drawdown);
  }
  return Number(maxDd.toFixed(4));
}

function metrics(mode, result) {
  const trades = result.trades;
  const entries = trades.length;
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  const grossWin = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
  const count = (predicate) => trades.filter(predicate).length;
  return {
    mode,
    avaliacoesReaisDoMotor: result.evaluations,
    sinaisProduzidos: entries,
    totalEntradas: entries,
    RETEST: count((trade) => trade.strategy === "RETEST"),
    CONTINUATION_RETEST: count((trade) => trade.strategy === "CONTINUATION_RETEST"),
    CONTINUATION_MOMENTUM: count((trade) => trade.strategy === "CONTINUATION_MOMENTUM"),
    NONE: result.none,
    rejeitadasPorCHAOTIC: result.rejected.filter((reason) => reason === "CHAOTIC").length,
    rejeitadasPorTREND_STRETCHED: result.rejected.filter((reason) => reason === "TREND_STRETCHED").length,
    rejeitadasPorFaltaDeReorganizacao: result.rejected.filter((reason) => reason === "MISSING_REORGANIZATION").length,
    pnl: Number(trades.reduce((sum, trade) => sum + trade.pnl, 0).toFixed(4)),
    drawdownMaximo: maxDrawdown(trades),
    profitFactor: grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(4)) : grossWin > 0 ? null : 0,
    expectativaPorOperacao: entries > 0 ? Number((trades.reduce((sum, trade) => sum + trade.pnl, 0) / entries).toFixed(4)) : 0,
    taxaTarget1: entries > 0 ? Number((count((trade) => trade.target1Hit) / entries).toFixed(4)) : 0,
    taxaTarget2: entries > 0 ? Number((count((trade) => trade.target2Hit) / entries).toFixed(4)) : 0,
    stops: count((trade) => trade.stop),
    timeouts: count((trade) => trade.timeout),
    casosAMBIGUOUS: count((trade) => trade.ambiguous),
    trades,
  };
}

function diff(a, b) {
  const absolute = Number((b - a).toFixed(4));
  const percent = a !== 0 ? Number(((absolute / Math.abs(a)) * 100).toFixed(2)) : null;
  return { absolute, percent };
}

const currentSource = readFileSync(path.resolve(apiRoot, "..", "shared", "marketDecisionEngine.ts"), "utf8");
const baseEngine = await loadEngineFromSource("base", loadBaseSource());
const adaptiveEngine = await loadEngineFromSource("adaptive", currentSource);

try {
  const fixtures = fixtureSet();
  const currentReplay = replay(baseEngine.mod, fixtures, "MOTOR_ATUAL");
  const adaptiveReplay = replay(adaptiveEngine.mod, fixtures, "MOTOR_ADAPTATIVO");
  const current = metrics("MOTOR_ATUAL", currentReplay);
  const adaptive = metrics("MOTOR_ADAPTATIVO", adaptiveReplay);
  if (current.avaliacoesReaisDoMotor === 0 || adaptive.avaliacoesReaisDoMotor === 0) {
    throw new Error("Replay invalido: motor nao foi chamado");
  }
  const comparison = {
    entradas: diff(current.totalEntradas, adaptive.totalEntradas),
    pnl: diff(current.pnl, adaptive.pnl),
    drawdownMaximo: diff(current.drawdownMaximo, adaptive.drawdownMaximo),
    profitFactor: diff(current.profitFactor ?? 0, adaptive.profitFactor ?? 0),
    expectativaPorOperacao: diff(current.expectativaPorOperacao, adaptive.expectativaPorOperacao),
    taxaTarget1: diff(current.taxaTarget1, adaptive.taxaTarget1),
    taxaTarget2: diff(current.taxaTarget2, adaptive.taxaTarget2),
  };

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    classification: "TESTE_FUNCIONAL_DETERMINISTICO_NAO_E_PROVA_ESTATISTICA",
    baseCommit: BASE_COMMIT,
    sample: {
      fixtureWindows: fixtures.length,
      symbols: [...new Set(fixtures.map((fixture) => fixture.symbol))],
      candlesPerFixture: { "1h": 220, "15m": 90, "5m": 58 },
      totalCandlesRepresented: fixtures.reduce((sum, fixture) => sum + fixture.candles1h.length + fixture.candles15m.length + fixture.candles5m.length, 0),
    },
    MOTOR_ATUAL: current,
    MOTOR_ADAPTATIVO: adaptive,
    COMPARACAO: comparison,
    fixtures: fixtures.map((fixture) => ({
      id: fixture.id,
      symbol: fixture.symbol,
      signalIndex: fixture.signalIndex,
      lastTradeContext: fixture.lastTrade ? "TARGET_2_SAME_DIRECTION" : "NONE",
    })),
  }, null, 2));
} finally {
  baseEngine.cleanup();
  adaptiveEngine.cleanup();
}
