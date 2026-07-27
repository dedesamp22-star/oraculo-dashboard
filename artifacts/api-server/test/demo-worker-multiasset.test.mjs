import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const workerSource = readFileSync(path.join(root, "src", "lib", "demo-worker.ts"), "utf8");
const storeSource = readFileSync(path.join(root, "src", "lib", "demo-store.ts"), "utf8");
const engineSource = readFileSync(path.resolve(root, "..", "shared", "marketDecisionEngine.ts"), "utf8");

test("demo worker has a fixed backend allowlist for BTC, ETH and SOL", () => {
  assert.match(workerSource, /DEMO_WORKER_SYMBOLS\s*=\s*\["BTCUSDT",\s*"ETHUSDT",\s*"SOLUSDT"\]/);
});

test("demo worker analyzes and audits every allowed symbol in each user cycle", () => {
  assert.match(workerSource, /for \(const symbol of DEMO_WORKER_SYMBOLS\)/);
  assert.match(workerSource, /await deps\.fetchPrice\(symbol\)/);
  assert.match(workerSource, /await deps\.analyzeSignal\(symbol\)/);
  assert.match(workerSource, /deps\.store\.recordEngineAudit\(\{/);
  assert.match(workerSource, /symbol,/);
});

test("demo worker isolates symbol failures inside the symbol loop", () => {
  assert.match(workerSource, /async function runSymbolCycle\(/);
  assert.match(workerSource, /catch \(err\) \{[\s\S]*recordWorkerDiagnostic\(\{[\s\S]*Demo worker user symbol cycle failed/);
  assert.match(workerSource, /for \(const symbol of DEMO_WORKER_SYMBOLS\) \{\s*await runSymbolCycle\(item, symbol, tickStartedAt, deps\);/);
});

test("auditing is independent from duplicate position blocking", () => {
  const openIndex = workerSource.indexOf("deps.store.openFromSignalWithResult");
  const auditIndex = workerSource.indexOf("deps.store.recordEngineAudit");
  assert.ok(openIndex >= 0, "worker must still route approved signals through openFromSignal");
  assert.ok(auditIndex > openIndex, "audit must be recorded after the entry attempt for the same analyzed symbol");
  assert.match(storeSource, /const positions = this\.getPositions\(userId\)/);
  assert.match(storeSource, /positions\.some\(\(position\) => position\.pair === pair\)/);
  assert.match(storeSource, /duplicate_signal_blocked/);
});

test("global risk gate allows three pairs and blocks only when capacity is exhausted", () => {
  assert.match(storeSource, /MAX_DEMO_OPEN_POSITIONS\s*=\s*3/);
  assert.match(storeSource, /MAX_DEMO_GLOBAL_RISK_PCT\s*=\s*0\.02/);
  assert.match(storeSource, /MAX_DEMO_ENTRY_RISK_PCT\s*=\s*0\.01/);
  assert.match(storeSource, /positions\.length >= MAX_DEMO_OPEN_POSITIONS/);
  assert.match(storeSource, /global_position_limit_signal_blocked/);
  assert.match(storeSource, /Limite de posicoes simultaneas atingido\./);
  assert.match(storeSource, /const allowedRiskAmount = Math\.min\(requestedRiskAmount, globalRiskRemainingUSDC\)/);
  assert.match(storeSource, /global_risk_signal_blocked/);
  assert.match(storeSource, /Limite global de risco atingido\./);
});

test("global risk uses current remaining risk after partials, breakeven and trailing", () => {
  const functionMatch = storeSource.match(/function remainingOpenRisk\(trade: DemoTrade\): number \{([\s\S]*?)\n\}/);
  assert.ok(functionMatch, "remainingOpenRisk function must exist");
  const body = functionMatch[1];
  assert.match(body, /trade\.remainingPositionSize \?\? trade\.positionSize/);
  assert.match(body, /trade\.entry - trade\.stopLoss/);
  assert.match(body, /trade\.stopLoss - trade\.entry/);
  assert.match(body, /Math\.max\(0,/);
  assert.doesNotMatch(body, /stopLossOriginal/);
});

test("worker audits global risk blocks without changing engine filters or scores", () => {
  assert.match(workerSource, /openFromSignalWithResult/);
  assert.match(workerSource, /auditDecisionState = "BLOQUEADO_RISCO"/);
  assert.match(workerSource, /auditDecisiveReason = openResult\.blockedReason/);
  assert.match(workerSource, /decisionState: auditDecisionState/);
  assert.match(workerSource, /blockedReasons: auditBlockedReasons/);
});

test("worker does not modify the shared market decision engine", () => {
  assert.match(engineSource, /export type DemoSymbol = "BTCUSDT" \| "ETHUSDT" \| "SOLUSDT"/);
  assert.doesNotMatch(workerSource, /DEMO_EXHAUSTION_CONFIG\s*=/);
});
