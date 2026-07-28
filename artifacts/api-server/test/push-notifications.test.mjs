import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(root, "src", "lib", "push-notifications.ts");
const outDir = path.join(import.meta.dirname, ".tmp");
const outFile = path.join(outDir, "push-notifications.mjs");

mkdirSync(outDir, { recursive: true });
const source = readFileSync(sourcePath, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    verbatimModuleSyntax: true,
  },
});
writeFileSync(outFile, output.outputText);

const {
  formatPushPayload,
  shouldQueuePushDelivery,
} = await import("./.tmp/push-notifications.mjs");

function notification(overrides = {}) {
  return {
    id: "ntf_1",
    type: "demo_entry_opened",
    title: "Entrada demo aberta",
    message: "BTCUSDT: BUY aberta em 100.",
    severity: "success",
    symbol: "BTCUSDT",
    source: "DEMO",
    relatedEventId: "trade_1",
    readAt: null,
    createdAt: new Date(0).toISOString(),
    deliveryStatus: "queued",
    failureReason: null,
    metadata: {
      trade: {
        id: "trade_1",
        pair: "BTCUSDT",
        direction: "BUY",
        entry: 100,
        stopLoss: 95,
        target1: 105,
        target2: 110,
        riskAmount: 10,
        partialPnlUSDC: 5,
        remainingPositionSize: 1,
        signalReasons: ["tendencia alinhada"],
      },
      score: 82,
    },
    ...overrides,
  };
}

test("push operational gate matches Telegram final event policy", () => {
  for (const type of ["demo_entry_opened", "target1_hit", "target2_hit", "stop_loss", "loss_of_strength", "timeout"]) {
    assert.equal(shouldQueuePushDelivery(type, "DEMO", false), false);
    assert.equal(shouldQueuePushDelivery(type, "DEMO", true), true);
  }

  for (const type of ["partial_executed", "breakeven_moved", "trailing_updated"]) {
    assert.equal(shouldQueuePushDelivery(type, "DEMO", false), false);
    assert.equal(shouldQueuePushDelivery(type, "DEMO", true), false);
  }

  assert.equal(shouldQueuePushDelivery("test", "SYSTEM", false), true);
  assert.equal(shouldQueuePushDelivery("simulation_event", "HOMOLOGATION", false), true);
});

test("push entry payload is sanitized and opens the operation report route", () => {
  const payload = formatPushPayload(notification());
  assert.match(payload.title, /BUY BTCUSDT/);
  assert.match(payload.body, /Entrada 100\.0000/);
  assert.match(payload.body, /Stop 95\.0000/);
  assert.match(payload.body, /A1 105\.0000/);
  assert.match(payload.body, /A2 110\.0000/);
  assert.match(payload.body, /Risco \+\$10\.00/);
  assert.match(payload.body, /ID trade_1/);
  assert.equal(payload.url, "/relatorio-operacoes?trade=trade_1");
  assert.equal(payload.tag, "oraculo-demo_entry_opened-trade_1");
  assert.doesNotMatch(JSON.stringify(payload), /123456:test-bot-token-not-real/);
});

test("push target1 payload is consolidated", () => {
  const payload = formatPushPayload(notification({
    type: "target1_hit",
    title: "Alvo 1 atingido",
    message: "BTCUSDT: alvo 1 atingido.",
    metadata: {
      trade: {
        id: "trade_1",
        pair: "BTCUSDT",
        stopLoss: 100.02,
        partialPnlUSDC: 10.5,
        remainingPositionSize: 0.25,
      },
    },
  }));

  assert.match(payload.title, /Alvo 1 atingido/);
  assert.match(payload.body, /Parcial 50% executada/);
  assert.match(payload.body, /PnL \+\$10\.50/);
  assert.match(payload.body, /Restante 0\.25000000/);
  assert.match(payload.body, /Stop BE 100\.0200/);
  assert.equal(payload.url, "/relatorio-operacoes?trade=trade_1");
});

test("push exit payload includes management observability fields", () => {
  const payload = formatPushPayload(notification({
    type: "stop_loss",
    title: "Stop acionado",
    message: "ETHUSDT: posicao encerrada.",
    symbol: "ETHUSDT",
    relatedEventId: "trade_2",
    metadata: {
      trade: { id: "trade_2", pair: "ETHUSDT", direction: "SELL", durationMs: 5_400_000 },
      exitReason: "STOP_LOSS",
      pnlUSDC: -6.25,
      mfeUSDC: 4,
      maeUSDC: 7,
      peakGivebackUSDC: 3,
    },
  }));

  assert.match(payload.title, /Encerramento ETHUSDT/);
  assert.match(payload.body, /SELL/);
  assert.match(payload.body, /STOP_LOSS/);
  assert.match(payload.body, /PnL -\$6\.25/);
  assert.match(payload.body, /MFE \+\$4\.00/);
  assert.match(payload.body, /MAE \+\$7\.00/);
  assert.match(payload.body, /Giveback \+\$3\.00/);
  assert.match(payload.body, /1h 30m/);
  assert.equal(payload.url, "/relatorio-operacoes?trade=trade_2");
});
