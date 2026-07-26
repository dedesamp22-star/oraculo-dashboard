import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const storeSource = readFileSync(path.join(root, "src", "lib", "demo-store.ts"), "utf8");
const workerSource = readFileSync(path.join(root, "src", "lib", "demo-worker.ts"), "utf8");
const engineSource = readFileSync(path.resolve(root, "..", "shared", "marketDecisionEngine.ts"), "utf8");
const workerEngineSource = readFileSync(path.join(root, "src", "lib", "demo-worker-engine.ts"), "utf8");

test("daily operation limit is optional and defaults to unlimited", () => {
  assert.match(storeSource, /ORACULO_DEMO_MAX_DAILY_TRADES/);
  assert.match(storeSource, /envInt\("ORACULO_DEMO_MAX_DAILY_TRADES", 0, 0, 10_000\)/);
  assert.match(storeSource, /maxDailyTrades > 0 && stats\.totalTrades >= maxDailyTrades/);
  assert.doesNotMatch(storeSource, /stats\.totalTrades >= 8/);
  assert.doesNotMatch(storeSource, /Limite de 8/);
});

test("daily limit only blocks openings and keeps worker analysis and auditing active", () => {
  const openBody = storeSource.slice(storeSource.indexOf("openFromSignalWithResult"), storeSource.indexOf("updatePrices(userId"));
  assert.match(openBody, /isSafetyLimited\(account\.dailyStats\)/);
  assert.match(openBody, /return blocked\(safetyLimitReason\(account\.dailyStats\), "BLOQUEADO_RISCO"\)/);
  assert.match(workerSource, /for \(const symbol of DEMO_WORKER_SYMBOLS\)/);
  assert.match(workerSource, /await deps\.analyzeSignal\(symbol\)/);
  assert.match(workerSource, /deps\.store\.recordEngineAudit\(\{/);
});

test("approved signal notifications describe the final opening result", () => {
  assert.match(storeSource, /type: "demo_entry_opened"/);
  assert.match(storeSource, /title: "Entrada demo aberta"/);
  assert.match(storeSource, /type: "demo_entry_not_executed"/);
  assert.match(storeSource, /title: "Sinal aprovado, mas nao executado"/);
  assert.doesNotMatch(storeSource, /title: "Oportunidade aprovada"/);
});

test("market engine and worker engine are not changed by daily count logic", () => {
  assert.doesNotMatch(engineSource, /ORACULO_DEMO_MAX_DAILY_TRADES|demoMaxDailyTrades|totalTrades/);
  assert.doesNotMatch(workerEngineSource, /ORACULO_DEMO_MAX_DAILY_TRADES|demoMaxDailyTrades|totalTrades/);
});
