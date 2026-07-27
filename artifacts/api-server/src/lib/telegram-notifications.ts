import type { NotificationDto, UserRole } from "./demo-store";

export interface TelegramRuntimeStatus {
  configured: boolean;
  mock: boolean;
  botUsername: string | null;
  chatIdConfigured: boolean;
}

export interface TelegramDailySummaryInput {
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePct: number | null;
  profitFactor: number | null;
  netPnlUSDC: number;
  biggestWinnerUSDC: number | null;
  biggestLoserUSDC: number | null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function fmtNumber(value: unknown, digits = 4): string {
  if (!finiteNumber(value)) return "nao registrado";
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtMoney(value: unknown): string {
  if (!finiteNumber(value)) return "nao registrado";
  return `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`;
}

function fmtDurationMs(value: unknown): string {
  if (!finiteNumber(value)) return "nao registrado";
  const minutes = Math.round(value / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function textList(value: unknown, limit = 5): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean).slice(0, limit);
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function tradeMetadata(notification: NotificationDto): Record<string, unknown> {
  const metadata = metadataObject(notification.metadata);
  return metadataObject(metadata.trade);
}

export function telegramRuntimeStatus(env: NodeJS.ProcessEnv = process.env): TelegramRuntimeStatus {
  const botUsername = env["ORACULO_TELEGRAM_BOT_USERNAME"]?.trim().replace(/^@/, "") ?? "";
  return {
    configured: !!env["ORACULO_TELEGRAM_BOT_TOKEN"],
    mock: env["ORACULO_TELEGRAM_MOCK"] === "true",
    botUsername: botUsername || null,
    chatIdConfigured: !!env["ORACULO_TELEGRAM_CHAT_ID"]?.trim(),
  };
}

export function sanitizeTelegramText(value: unknown): string {
  return String(value ?? "")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]")
    .replace(/[<>]/g, "")
    .slice(0, 3500);
}

function operationalEntryLines(notification: NotificationDto): string[] {
  const metadata = metadataObject(notification.metadata);
  const trade = tradeMetadata(notification);
  const reasons = textList(trade.signalReasons ?? metadata.signalReasons);
  return [
    "Tipo: entrada aberta",
    `Ativo: ${notification.symbol ?? trade.pair ?? "nao registrado"}`,
    `Direcao: ${trade.direction ?? "nao registrada"}`,
    `Entrada: ${fmtNumber(trade.entry)}`,
    `Stop: ${fmtNumber(trade.stopLoss)}`,
    `Alvo 1: ${fmtNumber(trade.target1)}`,
    `Alvo 2: ${fmtNumber(trade.target2)}`,
    `Score: ${fmtNumber(metadata.score ?? metadata.scoreOperacional ?? metadata.scoreContextual, 0)}`,
    `ID: ${notification.relatedEventId ?? trade.id ?? "nao registrado"}`,
    reasons.length > 0 ? `Motivos: ${reasons.join(" | ")}` : "Motivos: nao registrados",
  ];
}

function operationalManagementLines(notification: NotificationDto): string[] {
  const metadata = metadataObject(notification.metadata);
  return [
    "Tipo: gestao",
    `Evento: ${notification.title}`,
    notification.symbol ? `Ativo: ${notification.symbol}` : "Ativo: nao registrado",
    `Status: ${notification.message}`,
    metadata.stopLoss !== undefined ? `Stop: ${fmtNumber(metadata.stopLoss)}` : null,
    metadata.nextStop !== undefined ? `Novo stop: ${fmtNumber(metadata.nextStop)}` : null,
    metadata.partialPnlUSDC !== undefined ? `PnL parcial: ${fmtMoney(metadata.partialPnlUSDC)}` : null,
    metadata.remainingPositionSize !== undefined ? `Qtd restante: ${fmtNumber(metadata.remainingPositionSize, 8)}` : null,
  ].filter(Boolean) as string[];
}

function operationalExitLines(notification: NotificationDto): string[] {
  const metadata = metadataObject(notification.metadata);
  const trade = tradeMetadata(notification);
  return [
    "Tipo: saida",
    `Ativo: ${notification.symbol ?? trade.pair ?? "nao registrado"}`,
    `Direcao: ${trade.direction ?? "nao registrada"}`,
    `Motivo: ${metadata.exitReason ?? trade.exitReason ?? "nao registrado"}`,
    `PnL: ${fmtMoney(metadata.pnlUSDC ?? trade.pnlUSDC ?? trade.realizedPnlUSDC)}`,
    `MFE: ${fmtMoney(metadata.mfeUSDC ?? trade.mfeUSDC)}`,
    `MAE: ${fmtMoney(metadata.maeUSDC ?? trade.maeUSDC)}`,
    `Giveback: ${fmtMoney(metadata.peakGivebackUSDC ?? trade.peakGivebackUSDC)}`,
    `Tempo: ${fmtDurationMs(metadata.durationMs ?? trade.durationMs)}`,
    `ID: ${notification.relatedEventId ?? trade.id ?? "nao registrado"}`,
  ];
}

function defaultLines(notification: NotificationDto, role: UserRole): string[] {
  const lines = [
    notification.symbol ? `Ativo: ${notification.symbol}` : null,
    `Status: ${notification.message}`,
    `Ambiente: ${notification.source}`,
  ].filter(Boolean) as string[];
  const metadata = metadataObject(notification.metadata);
  if (role === "admin") {
    for (const key of ["scoreContextual", "scoreOperacional", "decisionState", "decisiveReason", "exitReason", "status"]) {
      const value = metadata[key];
      if (value !== undefined && value !== null) lines.push(`${key}: ${String(value).slice(0, 180)}`);
    }
  }
  return lines;
}

export function formatTelegramNotification(notification: NotificationDto, role: UserRole): string {
  const prefix = notification.source === "HOMOLOGATION" ? "[HOMOLOGACAO]\n" : "";
  const base = [
    `${prefix}ORACULO - ${notification.title.toUpperCase()}`,
    "",
  ];
  const operationalTypes = new Set([
    "demo_entry_opened",
    "target1_hit",
    "partial_executed",
    "breakeven_moved",
    "trailing_updated",
    "target2_hit",
    "stop_loss",
    "loss_of_strength",
    "timeout",
  ]);
  if (!operationalTypes.has(notification.type)) return sanitizeTelegramText([...base, ...defaultLines(notification, role)].join("\n"));
  if (notification.type === "demo_entry_opened") return sanitizeTelegramText([...base, ...operationalEntryLines(notification)].join("\n"));
  if (["target1_hit", "partial_executed", "breakeven_moved", "trailing_updated"].includes(notification.type)) {
    return sanitizeTelegramText([...base, ...operationalManagementLines(notification)].join("\n"));
  }
  return sanitizeTelegramText([...base, ...operationalExitLines(notification)].join("\n"));
}

export function formatTelegramDailySummary(input: TelegramDailySummaryInput): string {
  return sanitizeTelegramText([
    "ORACULO - RESUMO DIARIO",
    "",
    `Total de operacoes: ${input.totalTrades}`,
    `Wins: ${input.wins}`,
    `Losses: ${input.losses}`,
    `Win rate: ${input.winRatePct === null ? "nao registrado" : `${input.winRatePct.toFixed(1)}%`}`,
    `Profit factor: ${input.profitFactor === null ? "nao registrado" : input.profitFactor.toFixed(2)}`,
    `Lucro liquido: ${fmtMoney(input.netPnlUSDC)}`,
    `Maior winner: ${fmtMoney(input.biggestWinnerUSDC)}`,
    `Maior loser: ${fmtMoney(input.biggestLoserUSDC)}`,
  ].join("\n"));
}
