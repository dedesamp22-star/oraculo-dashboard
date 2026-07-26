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
  const openIndex = workerSource.indexOf("deps.store.openFromSignal");
  const auditIndex = workerSource.indexOf("deps.store.recordEngineAudit");
  assert.ok(openIndex >= 0, "worker must still route approved signals through openFromSignal");
  assert.ok(auditIndex > openIndex, "audit must be recorded after the entry attempt for the same analyzed symbol");
  assert.match(storeSource, /this\.getPositions\(userId\)\.some\(\(position\) => position\.pair === pair\)/);
  assert.match(storeSource, /duplicate_signal_blocked/);
});

test("worker does not modify the shared market decision engine", () => {
  assert.match(engineSource, /export type DemoSymbol = "BTCUSDT" \| "ETHUSDT" \| "SOLUSDT"/);
  assert.doesNotMatch(workerSource, /DEMO_EXHAUSTION_CONFIG\s*=/);
});
