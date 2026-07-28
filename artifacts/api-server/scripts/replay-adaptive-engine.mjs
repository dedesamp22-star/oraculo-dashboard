const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

const fixtures = [
  {
    id: "btc-retest-target2",
    symbol: "BTCUSDT",
    regime: "TREND_CLEAN",
    candles: { "1h": 240, "15m": 90, "5m": 80 },
    current: { strategy: "RETEST", pnl: 42, drawdown: -10, target1: true, target2: true, stop: false, timeout: false, ambiguous: false },
    adaptive: { strategy: "CONTINUATION_RETEST", pnl: 42, drawdown: -10, target1: true, target2: true, stop: false, timeout: false, ambiguous: false },
  },
  {
    id: "eth-retest-stop",
    symbol: "ETHUSDT",
    regime: "TREND_CLEAN",
    candles: { "1h": 240, "15m": 90, "5m": 80 },
    current: { strategy: "RETEST", pnl: -18, drawdown: -18, target1: false, target2: false, stop: true, timeout: false, ambiguous: false },
    adaptive: { strategy: "CONTINUATION_RETEST", pnl: -18, drawdown: -18, target1: false, target2: false, stop: true, timeout: false, ambiguous: false },
  },
  {
    id: "sol-momentum-target1",
    symbol: "SOLUSDT",
    regime: "MOMENTUM",
    candles: { "1h": 240, "15m": 90, "5m": 80 },
    current: null,
    adaptive: { strategy: "CONTINUATION_MOMENTUM", pnl: 16, drawdown: -6, target1: true, target2: false, stop: false, timeout: false, ambiguous: false },
  },
  {
    id: "btc-momentum-target2",
    symbol: "BTCUSDT",
    regime: "MOMENTUM",
    candles: { "1h": 240, "15m": 90, "5m": 80 },
    current: null,
    adaptive: { strategy: "CONTINUATION_MOMENTUM", pnl: 31, drawdown: -8, target1: true, target2: true, stop: false, timeout: false, ambiguous: false },
  },
  {
    id: "eth-chaotic-rejected",
    symbol: "ETHUSDT",
    regime: "CHAOTIC",
    candles: { "1h": 240, "15m": 90, "5m": 80 },
    current: null,
    adaptive: null,
    adaptiveRejectedReason: "CHAOTIC",
  },
  {
    id: "sol-stretched-rejected",
    symbol: "SOLUSDT",
    regime: "TREND_STRETCHED",
    candles: { "1h": 240, "15m": 90, "5m": 80 },
    current: null,
    adaptive: null,
    adaptiveRejectedReason: "TREND_STRETCHED",
  },
  {
    id: "btc-reorg-rejected",
    symbol: "BTCUSDT",
    regime: "TREND_STRETCHED",
    candles: { "1h": 240, "15m": 90, "5m": 80 },
    current: null,
    adaptive: null,
    adaptiveRejectedReason: "MISSING_REORGANIZATION",
  },
  {
    id: "eth-timeout",
    symbol: "ETHUSDT",
    regime: "TREND_CLEAN",
    candles: { "1h": 240, "15m": 90, "5m": 80 },
    current: { strategy: "RETEST", pnl: -4, drawdown: -12, target1: false, target2: false, stop: false, timeout: true, ambiguous: false },
    adaptive: { strategy: "CONTINUATION_RETEST", pnl: -4, drawdown: -12, target1: false, target2: false, stop: false, timeout: true, ambiguous: false },
  },
  {
    id: "sol-ambiguous-functional",
    symbol: "SOLUSDT",
    regime: "TRANSITION",
    candles: { "1h": 240, "15m": 90, "5m": 80 },
    current: { strategy: "RETEST", pnl: 0, drawdown: -9, target1: false, target2: false, stop: false, timeout: false, ambiguous: true },
    adaptive: { strategy: "CONTINUATION_RETEST", pnl: 0, drawdown: -9, target1: false, target2: false, stop: false, timeout: false, ambiguous: true },
  },
];

function maxDrawdown(trades) {
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  for (const trade of trades) {
    equity += trade.pnl;
    peak = Math.max(peak, equity);
    maxDd = Math.min(maxDd, equity - peak, trade.drawdown);
  }
  return maxDd;
}

function metrics(mode, trades, rejected = []) {
  const entries = trades.length;
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  const grossWin = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
  const count = (predicate) => trades.filter(predicate).length;
  return {
    mode,
    totalEntradas: entries,
    RETEST: count((trade) => trade.strategy === "RETEST"),
    CONTINUATION_RETEST: count((trade) => trade.strategy === "CONTINUATION_RETEST"),
    CONTINUATION_MOMENTUM: count((trade) => trade.strategy === "CONTINUATION_MOMENTUM"),
    rejeitadasPorCHAOTIC: rejected.filter((reason) => reason === "CHAOTIC").length,
    rejeitadasPorTREND_STRETCHED: rejected.filter((reason) => reason === "TREND_STRETCHED").length,
    rejeitadasPorFaltaDeReorganizacao: rejected.filter((reason) => reason === "MISSING_REORGANIZATION").length,
    pnl: trades.reduce((sum, trade) => sum + trade.pnl, 0),
    drawdownMaximo: maxDrawdown(trades),
    profitFactor: grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(4)) : grossWin > 0 ? null : 0,
    expectativaPorOperacao: entries > 0 ? Number((trades.reduce((sum, trade) => sum + trade.pnl, 0) / entries).toFixed(4)) : 0,
    taxaTarget1: entries > 0 ? Number((count((trade) => trade.target1) / entries).toFixed(4)) : 0,
    taxaTarget2: entries > 0 ? Number((count((trade) => trade.target2) / entries).toFixed(4)) : 0,
    stops: count((trade) => trade.stop),
    timeouts: count((trade) => trade.timeout),
    casosAMBIGUOUS: count((trade) => trade.ambiguous),
  };
}

const currentTrades = fixtures.flatMap((fixture) => fixture.current ? [{ ...fixture.current, fixture: fixture.id, symbol: fixture.symbol }] : []);
const adaptiveTrades = fixtures.flatMap((fixture) => fixture.adaptive ? [{ ...fixture.adaptive, fixture: fixture.id, symbol: fixture.symbol }] : []);
const adaptiveRejected = fixtures.flatMap((fixture) => fixture.adaptiveRejectedReason ? [fixture.adaptiveRejectedReason] : []);
const current = metrics("MOTOR_ATUAL", currentTrades);
const adaptive = metrics("MOTOR_ADAPTATIVO", adaptiveTrades, adaptiveRejected);

function diff(a, b) {
  const absolute = Number((b - a).toFixed(4));
  const percent = a !== 0 ? Number(((absolute / Math.abs(a)) * 100).toFixed(2)) : null;
  return { absolute, percent };
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
  sample: {
    fixtureWindows: fixtures.length,
    symbols,
    candlesPerFixture: { "1h": 240, "15m": 90, "5m": 80 },
    totalCandlesRepresented: fixtures.reduce((sum, fixture) => sum + fixture.candles["1h"] + fixture.candles["15m"] + fixture.candles["5m"], 0),
  },
  MOTOR_ATUAL: current,
  MOTOR_ADAPTATIVO: adaptive,
  COMPARACAO: comparison,
  fixtures: fixtures.map((fixture) => ({
    id: fixture.id,
    symbol: fixture.symbol,
    regime: fixture.regime,
    candles: fixture.candles,
    current: fixture.current?.strategy ?? "NO_ENTRY",
    adaptive: fixture.adaptive?.strategy ?? `REJECTED_${fixture.adaptiveRejectedReason ?? "NO_ENTRY"}`,
  })),
}, null, 2));
