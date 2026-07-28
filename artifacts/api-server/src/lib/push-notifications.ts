import type { NotificationDto } from "./demo-store";

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
}

const operationalEventTypes = new Set([
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

const pushDeliveryTypes = new Set([
  "demo_entry_opened",
  "target1_hit",
  "target2_hit",
  "stop_loss",
  "loss_of_strength",
  "timeout",
]);

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

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function tradeMetadata(notification: NotificationDto): Record<string, unknown> {
  const metadata = metadataObject(notification.metadata);
  return metadataObject(metadata.trade);
}

function sanitizePushText(value: unknown): string {
  return String(value ?? "")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]")
    .replace(/[<>]/g, "")
    .slice(0, 220);
}

function operationUrl(notification: NotificationDto): string {
  const id = notification.relatedEventId ?? tradeMetadata(notification).id;
  return id ? `/relatorio-operacoes?trade=${encodeURIComponent(String(id))}` : "/relatorio-operacoes";
}

export function shouldQueuePushDelivery(type: string, source: string, operationalEnabled: boolean): boolean {
  if (source !== "DEMO" || !operationalEventTypes.has(type)) return true;
  if (!operationalEnabled) return false;
  return pushDeliveryTypes.has(type);
}

export function formatPushPayload(notification: NotificationDto): PushPayload {
  const metadata = metadataObject(notification.metadata);
  const trade = tradeMetadata(notification);
  const pair = String(notification.symbol ?? trade.pair ?? "Operacao");
  const direction = String(trade.direction ?? "direcao nao registrada");
  const id = String(notification.relatedEventId ?? trade.id ?? "nao registrado");

  if (notification.type === "demo_entry_opened") {
    return {
      title: sanitizePushText(`${direction} ${pair}`),
      body: sanitizePushText(`Entrada ${fmtNumber(trade.entry)} | Stop ${fmtNumber(trade.stopLoss)} | A1 ${fmtNumber(trade.target1)} | A2 ${fmtNumber(trade.target2)} | Risco ${fmtMoney(trade.riskAmount ?? metadata.riskAmount)} | ID ${id}`),
      tag: `oraculo-${notification.type}-${id}`,
      url: operationUrl(notification),
    };
  }

  if (notification.type === "target1_hit") {
    return {
      title: sanitizePushText(`Alvo 1 atingido - ${pair}`),
      body: sanitizePushText(`Parcial 50% executada | PnL ${fmtMoney(trade.partialPnlUSDC ?? metadata.partialPnlUSDC)} | Restante ${fmtNumber(trade.remainingPositionSize ?? metadata.remainingPositionSize, 8)} | Stop BE ${fmtNumber(trade.stopLoss ?? metadata.stopLoss)} | ID ${id}`),
      tag: `oraculo-${notification.type}-${id}`,
      url: operationUrl(notification),
    };
  }

  if (["target2_hit", "stop_loss", "loss_of_strength", "timeout"].includes(notification.type)) {
    return {
      title: sanitizePushText(`Encerramento ${pair}`),
      body: sanitizePushText(`${direction} | ${metadata.exitReason ?? trade.exitReason ?? "motivo nao registrado"} | PnL ${fmtMoney(metadata.pnlUSDC ?? trade.pnlUSDC ?? trade.realizedPnlUSDC)} | MFE ${fmtMoney(metadata.mfeUSDC ?? trade.mfeUSDC)} | MAE ${fmtMoney(metadata.maeUSDC ?? trade.maeUSDC)} | Giveback ${fmtMoney(metadata.peakGivebackUSDC ?? trade.peakGivebackUSDC)} | ${fmtDurationMs(metadata.durationMs ?? trade.durationMs)} | ID ${id}`),
      tag: `oraculo-${notification.type}-${id}`,
      url: operationUrl(notification),
    };
  }

  return {
    title: sanitizePushText(notification.title || "Oraculo"),
    body: sanitizePushText(notification.message || "Novo alerta do Oraculo."),
    tag: `oraculo-${notification.type}-${notification.id}`,
    url: "/",
  };
}
