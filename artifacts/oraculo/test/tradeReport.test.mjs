import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const sourcePath = fileURLToPath(new URL('../src/lib/tradeReport.ts', import.meta.url));
const pageSourcePath = fileURLToPath(new URL('../src/pages/OperationReportPage.tsx', import.meta.url));
const appSourcePath = fileURLToPath(new URL('../src/App.tsx', import.meta.url));
const outDir = fileURLToPath(new URL('./.tmp/', import.meta.url));
const outFile = path.join(outDir, 'tradeReport.mjs');

mkdirSync(outDir, { recursive: true });
const source = readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    verbatimModuleSyntax: true,
  },
});
writeFileSync(outFile, output.outputText);

const { buildTradeReportDashboard, buildTradeReportDiagnosis, filterOperationTrades } = await import('./.tmp/tradeReport.mjs');

function trade(overrides = {}) {
  return {
    id: `t-${Math.random().toString(16).slice(2)}`,
    pair: 'BTCUSDT',
    direction: 'BUY',
    entryPrice: 100,
    exitPrice: 110,
    openTime: 1,
    closeTime: 2,
    durationMs: 60_000,
    stopLoss: 95,
    stopLossOriginal: 95,
    target1: 105,
    target2: 110,
    riskAmount: 10,
    positionSize: 2,
    remainingPositionSize: 0,
    exitReason: 'TARGET_2',
    status: 'WIN',
    pnlUSDC: 20,
    realizedPnlUSDC: 20,
    partialPnlUSDC: 5,
    mfeUSDC: 20,
    maeUSDC: 2,
    mfeR: 2,
    maeR: 0.2,
    peakGivebackUSDC: 1,
    peakGivebackPct: 10,
    target1Hit: true,
    breakeven: true,
    trailing: true,
    ...overrides,
  };
}

test('trade report dashboard calculates operational metrics without engine data', () => {
  const entries = [
    trade(),
    trade({ id: 'loss', pair: 'ETHUSDT', direction: 'SELL', status: 'LOSS', exitReason: 'STOP_LOSS', pnlUSDC: -10, riskAmount: 10, target1Hit: false, mfeUSDC: 3, maeUSDC: 10, peakGivebackUSDC: 3, peakGivebackPct: 100 }),
    trade({ id: 'be', pair: 'SOLUSDT', status: 'BREAKEVEN', exitReason: 'BREAKEVEN', pnlUSDC: 0, riskAmount: 10, mfeUSDC: 4, maeUSDC: 2, peakGivebackUSDC: 4 }),
  ];
  const dashboard = buildTradeReportDashboard(entries);
  assert.equal(dashboard.totalTrades, 3);
  assert.equal(Number(dashboard.winRatePct.toFixed(2)), 33.33);
  assert.equal(dashboard.profitFactor, 2);
  assert.equal(Number(dashboard.expectancyR.toFixed(4)), 0.3333);
  assert.equal(dashboard.netPnlUSDC, 10);
  assert.equal(dashboard.exitsByReason.TARGET_2, 1);
  assert.equal(dashboard.exitsByReason.STOP_LOSS, 1);
  assert.equal(dashboard.exitsByReason.BREAKEVEN, 1);
});

test('trade report filters and diagnosis use only trade observability fields', () => {
  const entries = [
    trade({ pair: 'BTCUSDT', status: 'WIN', pnlUSDC: 12 }),
    trade({ pair: 'ETHUSDT', direction: 'SELL', status: 'LOSS', exitReason: 'TIMEOUT', pnlUSDC: -5, target1Hit: false, mfeUSDC: 1, peakGivebackPct: 75 }),
    trade({ pair: 'SOLUSDT', direction: 'SELL', status: 'LOSS', exitReason: 'LOSS_OF_STRENGTH', pnlUSDC: -3, target1Hit: false, mfeUSDC: 0, peakGivebackPct: 0 }),
  ];
  const filtered = filterOperationTrades(entries, { symbol: 'ALL', direction: 'SELL', status: 'LOSS', exitReason: 'ALL' });
  assert.equal(filtered.length, 2);
  const diagnosis = buildTradeReportDiagnosis(entries);
  assert.match(diagnosis.summary, /3 operações analisadas/);
  assert.ok(diagnosis.patterns.some((item) => item.includes('perdas encerraram antes do Alvo 1')));
  assert.equal(diagnosis.bestSymbol.symbol, 'BTCUSDT');
});

test('operation report page is routed and separate from engine audit', () => {
  const pageSource = readFileSync(pageSourcePath, 'utf8');
  const appSource = readFileSync(appSourcePath, 'utf8');
  assert.match(appSource, /path="\/relatorio-operacoes"/);
  assert.match(pageSource, /Relatório de Operações/);
  assert.match(pageSource, /Exportar Trades JSON/);
  assert.match(pageSource, /Exportar Trades CSV/);
  assert.match(pageSource, /Gerar Diagnóstico/);
  assert.doesNotMatch(pageSource, /EngineAuditPanel|marketDecisionEngine|runEngine/);
});
