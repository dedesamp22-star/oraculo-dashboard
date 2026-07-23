import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOracleVisualState } from './.tmp/oracleVisualState.mjs';

test('no session resolves to waiting even when private-looking data is provided', () => {
  assert.equal(resolveOracleVisualState({
    authenticated: false,
    activeTrade: { direction: 'BUY' },
    worker: { lastStatus: 'ENTRADA_APROVADA', lastDirection: 'SELL' },
  }), 'waiting');
});

test('worker processing resolves to analyzing', () => {
  assert.equal(resolveOracleVisualState({
    authenticated: true,
    worker: { lastStatus: 'SETUP_QUASE_PRONTO' },
  }), 'analyzing');
});

test('approved BUY entry resolves to buy', () => {
  assert.equal(resolveOracleVisualState({
    authenticated: true,
    worker: { lastStatus: 'ENTRADA_APROVADA', lastDirection: 'BUY' },
  }), 'buy');
});

test('approved SELL entry resolves to sell', () => {
  assert.equal(resolveOracleVisualState({
    authenticated: true,
    worker: { lastStatus: 'ENTRADA_APROVADA', lastDirection: 'SELL' },
  }), 'sell');
});

test('open LONG position has priority over worker state', () => {
  assert.equal(resolveOracleVisualState({
    authenticated: true,
    activeTrade: { direction: 'LONG' },
    worker: { lastStatus: 'SETUP_QUASE_PRONTO' },
  }), 'buy');
});

test('open SHORT position has priority over worker state', () => {
  assert.equal(resolveOracleVisualState({
    authenticated: true,
    activeTrade: { direction: 'SHORT' },
    worker: { lastStatus: 'ENTRADA_APROVADA', lastDirection: 'BUY' },
  }), 'sell');
});

test('closed position returns to analyzing or waiting based on worker status', () => {
  assert.equal(resolveOracleVisualState({
    authenticated: true,
    activeTrade: null,
    worker: { lastStatus: 'CONTEXTO_FORMANDO' },
  }), 'analyzing');

  assert.equal(resolveOracleVisualState({
    authenticated: true,
    activeTrade: null,
    worker: { lastStatus: 'SEM_SETUP' },
  }), 'waiting');
});

test('api error does not preserve a stale approved signal', () => {
  assert.equal(resolveOracleVisualState({
    authenticated: true,
    apiError: 'network failure',
    worker: { lastStatus: 'ENTRADA_APROVADA', lastDirection: 'BUY' },
  }), 'waiting');
});

test('resolver is independent from local preview controls', () => {
  globalThis.window = { location: { search: '?oracleState=sell' } };
  try {
    assert.equal(resolveOracleVisualState({
      authenticated: true,
      worker: { lastStatus: 'ENTRADA_APROVADA', lastDirection: 'BUY' },
    }), 'buy');
  } finally {
    delete globalThis.window;
  }
});
