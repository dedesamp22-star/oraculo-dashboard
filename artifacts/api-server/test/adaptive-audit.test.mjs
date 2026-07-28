import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const storeSource = readFileSync(path.join(root, "src", "lib", "demo-store.ts"), "utf8");
const workerSource = readFileSync(path.join(root, "src", "lib", "demo-worker.ts"), "utf8");
const engineSource = readFileSync(path.resolve(root, "..", "shared", "marketDecisionEngine.ts"), "utf8");
const workerEngineSource = readFileSync(path.join(root, "src", "lib", "demo-worker-engine.ts"), "utf8");

test("adaptive audit migration adds nullable fields idempotently", () => {
  assert.match(storeSource, /version = 12/);
  assert.match(storeSource, /adaptive_engine_audit_fields/);
  assert.match(storeSource, /PRAGMA table_info\(engine_audit_log\)/);
  for (const column of [
    "regime",
    "regime_confidence",
    "selected_strategy",
    "strategy_score",
    "ema200_distance_pct_signed",
    "ema200_distance_atr",
    "stretched_evidence_json",
    "chaotic_evidence_json",
    "last_trade_direction",
    "last_trade_exit_reason",
    "market_reorganized",
    "momentum_conditions_passed_json",
    "momentum_conditions_missing_json",
  ]) {
    assert.match(storeSource, new RegExp(`\\["${column}"`));
  }
});

test("recordEngineAudit persists adaptive strategy and regime fields", () => {
  const recordBody = storeSource.slice(storeSource.indexOf("recordEngineAudit(input"), storeSource.indexOf("private completeExpiredLossStreakCooldowns"));
  for (const field of [
    "regime",
    "regime_confidence",
    "selected_strategy",
    "strategy_score",
    "ema200_distance_pct_signed",
    "ema200_distance_atr",
    "stretched_evidence_json",
    "chaotic_evidence_json",
    "last_trade_direction",
    "last_trade_exit_reason",
    "last_trade_target1_hit",
    "last_trade_target2_hit",
    "market_reorganized",
    "reorganization_reasons_json",
    "momentum_conditions_passed_json",
    "momentum_conditions_missing_json",
  ]) {
    assert.match(recordBody, new RegExp(field));
  }
  assert.match(recordBody, /JSON\.stringify\(input\.stretchedEvidence \?\? null\)/);
  assert.match(recordBody, /JSON\.stringify\(input\.momentumConditionsMissing \?\? \[\]\)/);
});

test("worker records adaptive audit fields without changing trading gates", () => {
  assert.match(workerSource, /getLastTradeForSymbol/);
  assert.match(workerSource, /await deps\.analyzeSignal\(symbol, \{/);
  assert.match(workerSource, /regime: analysis\.marketRegime\.regime/);
  assert.match(workerSource, /selectedStrategy: analysis\.selectedStrategy/);
  assert.match(workerSource, /momentumConditionsMissing: analysis\.momentumConditionsMissing/);
  assert.match(workerSource, /deps\.store\.openFromSignalWithResult\(user\.id, signal\)/);
  assert.doesNotMatch(workerSource, /ORACULO_TELEGRAM|ORACULO_PUSH|BINANCE_API|FUTURES/);
});

test("adaptive sprint does not alter management constants or operational exits", () => {
  assert.match(engineSource, /export const DEMO_EXHAUSTION_CONFIG/);
  assert.doesNotMatch(engineSource, /ORACULO_TELEGRAM|ORACULO_PUSH|BINANCE_SECRET|FUTURES/);
  assert.doesNotMatch(workerEngineSource, /ORACULO_TELEGRAM|ORACULO_PUSH|BINANCE_SECRET|FUTURES/);
  assert.match(storeSource, /MAX_DEMO_OPEN_POSITIONS\s*=\s*3/);
  assert.match(storeSource, /MAX_DEMO_GLOBAL_RISK_PCT\s*=\s*0\.02/);
});
