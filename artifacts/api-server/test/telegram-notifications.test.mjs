import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(root, "src", "lib", "telegram-notifications.ts");
const outDir = path.join(import.meta.dirname, ".tmp");
const outFile = path.join(outDir, "telegram-notifications.mjs");

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
  formatTelegramDailySummary,
  formatTelegramNotification,
  telegramRuntimeStatus,
} = await import("./.tmp/telegram-notifications.mjs");

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
        signalReasons: ["tendencia alinhada", "reteste confirmado"],
      },
      score: 82,
    },
    ...overrides,
  };
}

test("formats operational entry messages without exposing secrets", () => {
  const text = formatTelegramNotification(notification(), "admin");
  assert.match(text, /Entrada demo aberta/i);
  assert.match(text, /Ativo: BTCUSDT/);
  assert.match(text, /Direcao: BUY/);
  assert.match(text, /Entrada: 100\.0000/);
  assert.match(text, /Stop: 95\.0000/);
  assert.match(text, /Alvo 1: 105\.0000/);
  assert.match(text, /Alvo 2: 110\.0000/);
  assert.match(text, /Score: 82/);
  assert.match(text, /ID: trade_1/);
  assert.match(text, /tendencia alinhada/);
  assert.doesNotMatch(text, /123456:test-bot-token-not-real/);
});

test("formats management and exit messages from existing trade metadata", () => {
  const management = formatTelegramNotification(notification({
    type: "partial_executed",
    title: "Parcial executada",
    message: "BTCUSDT: parcial de 50% realizada.",
    metadata: { partialPnlUSDC: 10.5, remainingPositionSize: 0.25 },
  }), "admin");
  assert.match(management, /Tipo: gestao/);
  assert.match(management, /PnL parcial: \+\$10\.50/);
  assert.match(management, /Qtd restante: 0\.25000000/);

  const exit = formatTelegramNotification(notification({
    type: "stop_loss",
    title: "Stop acionado",
    message: "ETHUSDT: posicao encerrada por STOP_LOSS.",
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
  }), "admin");
  assert.match(exit, /Tipo: saida/);
  assert.match(exit, /Direcao: SELL/);
  assert.match(exit, /Motivo: STOP_LOSS/);
  assert.match(exit, /PnL: -\$6\.25/);
  assert.match(exit, /MFE: \+\$4\.00/);
  assert.match(exit, /MAE: \+\$7\.00/);
  assert.match(exit, /Giveback: \+\$3\.00/);
  assert.match(exit, /Tempo: 1h 30m/);
});

test("reports disabled Telegram runtime and prepares daily summary without scheduling", () => {
  assert.deepEqual(telegramRuntimeStatus({}), { configured: false, mock: false, botUsername: null, chatIdConfigured: false });
  assert.deepEqual(telegramRuntimeStatus({
    ORACULO_TELEGRAM_BOT_TOKEN: "secret-token",
    ORACULO_TELEGRAM_CHAT_ID: "12345",
    ORACULO_TELEGRAM_MOCK: "true",
    ORACULO_TELEGRAM_BOT_USERNAME: "@OraculoBot",
  }), { configured: true, mock: true, botUsername: "OraculoBot", chatIdConfigured: true });

  const summary = formatTelegramDailySummary({
    totalTrades: 8,
    wins: 5,
    losses: 3,
    winRatePct: 62.5,
    profitFactor: 1.8,
    netPnlUSDC: 42,
    biggestWinnerUSDC: 18,
    biggestLoserUSDC: -9,
  });
  assert.match(summary, /RESUMO DIARIO/);
  assert.match(summary, /Total de operacoes: 8/);
  assert.match(summary, /Profit factor: 1\.80/);
  assert.match(summary, /Lucro liquido: \+\$42\.00/);
});
