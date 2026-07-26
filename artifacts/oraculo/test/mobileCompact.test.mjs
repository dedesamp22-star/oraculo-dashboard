import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../src/pages/Home.tsx', import.meta.url), 'utf8');
const chartSource = readFileSync(new URL('../src/components/TradingViewChart.tsx', import.meta.url), 'utf8');

test('mobile dashboard exposes exactly the five approved tabs', () => {
  assert.match(source, /type MobileTab = 'summary' \| 'operations' \| 'radar' \| 'audit' \| 'more'/);
  assert.match(source, /function MobileBottomNav/);

  for (const tab of ['summary', 'operations', 'radar', 'audit', 'more']) {
    assert.match(source, new RegExp(`key: '${tab}'`));
    assert.match(source, new RegExp(`mobileTab === '${tab}'`));
  }

  assert.doesNotMatch(source, /mobileTab === 'operation'/);
  assert.doesNotMatch(source, /mobileTab === 'panel'/);
});

test('mobile navigation is bottom fixed and safe-area aware', () => {
  const navMatch = source.match(/<nav className="([^"]+)"/);
  assert.ok(navMatch, 'Mobile bottom nav element was not found.');
  const navClasses = navMatch[1].split(/\s+/);

  for (const className of ['lg:hidden', 'fixed', 'inset-x-0', 'bottom-0', 'z-50']) {
    assert.ok(navClasses.includes(className), `Missing mobile nav class: ${className}`);
  }

  assert.match(source, /env\(safe-area-inset-bottom\)/);
  assert.match(source, /pb-24/);
});

test('mobile tabs use compact purpose-built surfaces before long desktop panels', () => {
  for (const component of [
    'MobileSummaryTab',
    'MobileOperationsTab',
    'MobileRadarTab',
    'MobileAuditTab',
    'MobileCompactHistory',
  ]) {
    assert.match(source, new RegExp(`function ${component}`));
  }

  assert.doesNotMatch(source, /Fonte atual do frontend/i);
  assert.match(source, /<DemoStatsPanel[\s\S]*maxDailyTrades=\{maxDailyTrades\}/);
  assert.match(source, /<EngineAuditPanel \/>/);
});

test('mobile operations tab uses active trade chart and compact complete data', () => {
  assert.match(source, /symbol=\{`BINANCE:\$\{trade\.pair\}`\}/);
  assert.match(source, /interval="5"/);
  assert.match(source, /height=\{230\}/);
  assert.match(source, /\bcompact\b/);
  assert.match(source, /Nenhuma operacao aberta/);
  assert.doesNotMatch(source, /MobileEmptyOperation safeLimited/);

  for (const label of [
    'Entrada',
    'Atual',
    'P&L aberto',
    'Stop Loss',
    'Alvo 1',
    'Alvo 2',
    'Qtd restante',
    'Risco',
    'P&L realizado',
    'Parcial',
    'Breakeven',
    'Trailing',
    'Motivo atual',
  ]) {
    assert.match(source, new RegExp(label.replace('&', '\\&')));
  }

  assert.match(source, /history\.slice\(0, 3\)/);
  assert.match(source, /Ver mais/);
});

test('compact chart mode preserves desktop default while hiding mobile chrome', () => {
  assert.match(chartSource, /compact = false/);
  assert.match(chartSource, /hide_side_toolbar:\s+compact \? true : false/);
  assert.match(chartSource, /hide_top_toolbar:\s+compact \? true : false/);
  assert.match(chartSource, /hide_legend:\s+compact \? true : false/);
});

test('desktop keeps its large-layout breakpoints separate from mobile navigation', () => {
  assert.match(source, /className="hidden lg:flex/);
  assert.match(source, /className="hidden lg:block"/);
  assert.match(source, /className="hidden lg:grid grid-cols-1 lg:grid-cols-2 gap-5"/);
  assert.match(source, /<MobileBottomNav tab=\{mobileTab\} onChange=\{setMobileTab\} \/>/);
});
