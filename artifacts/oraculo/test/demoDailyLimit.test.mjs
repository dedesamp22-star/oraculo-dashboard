import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const demoSourcePath = fileURLToPath(new URL('../src/lib/demo.ts', import.meta.url));
const statsPanelSourcePath = fileURLToPath(new URL('../src/components/DemoStatsPanel.tsx', import.meta.url));
const homeSourcePath = fileURLToPath(new URL('../src/pages/Home.tsx', import.meta.url));
const outDir = fileURLToPath(new URL('./.tmp/', import.meta.url));
const outFile = path.join(outDir, 'demo.mjs');

mkdirSync(outDir, { recursive: true });

const demoSource = readFileSync(demoSourcePath, 'utf8');
const statsPanelSource = readFileSync(statsPanelSourcePath, 'utf8');
const homeSource = readFileSync(homeSourcePath, 'utf8');
const output = ts.transpileModule(demoSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    verbatimModuleSyntax: true,
  },
});
writeFileSync(outFile, output.outputText);

const { isSafetyLimited, safetyLimitReason } = await import('./.tmp/demo.mjs');

function stats(totalTrades) {
  return {
    date: '2026-07-26',
    startOfDayBalance: 1000,
    totalTrades,
    wins: 0,
    losses: 0,
    breakevens: 0,
    consecutiveLosses: 0,
    maxConsecutiveLosses: 0,
    dailyPnL: 0,
    peakBalance: 1000,
    maxDrawdown: 0,
    safetyLimited: false,
  };
}

test('frontend safety helper treats maxDailyTrades 0 as unlimited', () => {
  const stale = { ...stats(0), safetyLimited: true };
  assert.equal(isSafetyLimited(stale, 0), false);
  assert.equal(isSafetyLimited(stats(9), 0), false);
  assert.equal(isSafetyLimited(stats(20), 0), false);
  assert.equal(isSafetyLimited(stats(50), 0), false);
});

test('frontend safety helper applies positive optional daily limits', () => {
  assert.equal(isSafetyLimited(stats(8), 8), true);
  assert.equal(isSafetyLimited(stats(9), 20), false);
  assert.equal(isSafetyLimited(stats(20), 20), true);
  assert.match(safetyLimitReason(stats(20), 20), /Limite diario|Limite diário/);
});

test('stats panel renders unlimited or configured daily operation limit labels', () => {
  assert.match(statsPanelSource, /maxDailyTrades > 0 \? `Máx\. \$\{maxDailyTrades\} operações\/dia` : 'Ilimitado'/);
  assert.doesNotMatch(statsPanelSource, /máx 8|max 8/);
});

test('home uses the structured backend safety reason instead of local inference', () => {
  assert.match(homeSource, /demoSession\.safetyLimit\?\.limited \?\? false/);
  assert.match(homeSource, /safetyLimitDisplay\(demoSession\.safetyLimit\)/);
  assert.match(homeSource, /limit\.reason/);
  assert.doesNotMatch(homeSource, /safetyLimitReason\(demoSession\.dailyStats/);
  assert.doesNotMatch(homeSource, /isSafetyLimited\(demoSession\.dailyStats/);
});
