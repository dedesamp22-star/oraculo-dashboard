import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEngineAuditInsight } from './.tmp/engineAuditInsight.mjs';

function entry(overrides = {}) {
  return {
    symbol: 'BTCUSDT',
    filtersPassed: [],
    filtersBlocked: [],
    blockedReasons: [],
    missingConditions: [],
    decisiveReason: '',
    decisionState: 'SEM_SETUP',
    triggerStage: 'none',
    rrStatus: 'pending',
    score: 0,
    scoreContextual: 0,
    scoreRaw: 0,
    trend1h: 'LATERAL',
    trend15m: 'LATERAL',
    volumeRelative: null,
    ...overrides,
  };
}

test('approved record without pending conditions reaches 100 percent', () => {
  const insight = buildEngineAuditInsight(entry({
    symbol: 'BTCUSDT',
    decisionState: 'ENTRADA_APROVADA',
    filtersPassed: ['Tendencia 1h', 'Gatilho 5m'],
  }));
  assert.deepEqual(insight.confirmed, ['Tendencia 1h', 'Gatilho 5m']);
  assert.deepEqual(insight.pending, []);
  assert.equal(insight.progressPct, 100);
  assert.equal(insight.stageLabel, 'Entrada aprovada');
});

test('context forming uses missingConditions as the only pending source', () => {
  const insight = buildEngineAuditInsight(entry({
    symbol: 'ETHUSDT',
    decisionState: 'CONTEXTO_FORMANDO',
    filtersPassed: ['Tendencia 1h'],
    missingConditions: ['Volume ideal', 'Gatilho 5m'],
    filtersBlocked: [{ name: 'Filtro ignorado', reason: 'Nao deve entrar como pendencia' }],
  }));
  assert.deepEqual(insight.pending, ['Volume ideal', 'Gatilho 5m']);
  assert.equal(insight.progressPct, 33);
  assert.equal(insight.stageLabel, 'Contexto formando');
});

test('setup almost ready falls back to filtersBlocked when missingConditions is empty', () => {
  const insight = buildEngineAuditInsight(entry({
    symbol: 'SOLUSDT',
    decisionState: 'SETUP_QUASE_PRONTO',
    filtersPassed: ['Contexto 1h', 'Contexto 15m'],
    missingConditions: [],
    filtersBlocked: [{ name: 'Volume', reason: 'Volume ideal' }],
  }));
  assert.deepEqual(insight.pending, ['Volume ideal']);
  assert.equal(insight.progressPct, 67);
  assert.equal(insight.stageLabel, 'Setup quase pronto');
});

test('blockedReasons explain but do not increase pending count', () => {
  const insight = buildEngineAuditInsight(entry({
    filtersPassed: ['Contexto'],
    missingConditions: ['R/R definido'],
    blockedReasons: ['Limite global de risco atingido.', 'R/R definido'],
  }));
  assert.deepEqual(insight.pending, ['R/R definido']);
  assert.equal(insight.progressPct, 50);
  assert.equal(insight.decisiveReason, 'Limite global de risco atingido.');
});

test('duplicates and blank values are normalized', () => {
  const insight = buildEngineAuditInsight(entry({
    filtersPassed: [' Contexto ', 'contexto', '', null],
    missingConditions: [' Volume ', 'volume', '  '],
    filtersBlocked: [{ name: 'Volume', reason: 'Volume' }],
  }));
  assert.deepEqual(insight.confirmed, ['Contexto']);
  assert.deepEqual(insight.pending, ['Volume']);
  assert.equal(insight.progressPct, 50);
});

test('approved record with inconsistent pending data does not hide inconsistency', () => {
  const insight = buildEngineAuditInsight(entry({
    decisionState: 'ENTRADA_APROVADA',
    filtersPassed: ['Contexto'],
    missingConditions: ['Gatilho pendente'],
  }));
  assert.equal(insight.progressPct, 50);
  assert.match(insight.summary, /pendencias registradas/);
});

test('risk blocks are classified into operational, global, position limit and generic', () => {
  const operational = buildEngineAuditInsight(entry({
    decisionState: 'BLOQUEADO_RISCO',
    decisiveReason: 'R/R abaixo do minimo',
  }));
  assert.equal(operational.blockCategory, 'operational-risk');
  assert.equal(operational.stageLabel, 'Bloqueado por risco operacional');

  const global = buildEngineAuditInsight(entry({
    decisionState: 'BLOQUEADO_RISCO',
    blockedReasons: ['Limite global de risco atingido.'],
  }));
  assert.equal(global.blockCategory, 'global-risk');
  assert.equal(global.stageLabel, 'Bloqueado pelo risco global');

  const positionLimit = buildEngineAuditInsight(entry({
    decisionState: 'BLOQUEADO_RISCO',
    blockedReasons: ['Limite de posicoes simultaneas atingido.'],
  }));
  assert.equal(positionLimit.blockCategory, 'position-limit');
  assert.equal(positionLimit.stageLabel, 'Limite de posicoes atingido');

  const generic = buildEngineAuditInsight(entry({ decisionState: 'BLOQUEADO_RISCO' }));
  assert.equal(generic.blockCategory, 'other');
  assert.equal(generic.stageLabel, 'Bloqueado por risco');
});

test('missing, null, empty arrays and unknown state are safe', () => {
  const insight = buildEngineAuditInsight({
    decisionState: 'ESTADO_NOVO',
    filtersPassed: null,
    filtersBlocked: null,
    missingConditions: null,
    blockedReasons: null,
  });
  assert.deepEqual(insight.confirmed, []);
  assert.deepEqual(insight.pending, []);
  assert.equal(insight.progressPct, 0);
  assert.equal(insight.stageLabel, 'Indefinido');
});

test('BTC, ETH and SOL records are accepted without symbol-specific inference', () => {
  for (const symbol of ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']) {
    const insight = buildEngineAuditInsight(entry({ symbol, filtersPassed: ['A'], missingConditions: ['B'] }));
    assert.equal(insight.progressPct, 50);
    assert.deepEqual(insight.confirmed, ['A']);
    assert.deepEqual(insight.pending, ['B']);
  }
});
