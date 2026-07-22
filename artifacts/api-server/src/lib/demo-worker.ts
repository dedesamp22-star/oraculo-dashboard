import { logger } from "./logger";
import { demoStore } from "./demo-store-instance";
import { APP_VERSION } from "@shared/appVersion";
import { analyzeDemoSignal, fetchDisplayPrice, type QualityFilter, type RadarLikeAnalysis } from "./demo-worker-engine";
import type { DemoDecision, WorkerDiagnosticStatus } from "./demo-store";

const TICK_MS = 30_000;

let started = false;
let running = false;

function nextCycleIso(startedAtMs: number): string {
  return new Date(startedAtMs + TICK_MS).toISOString();
}

function signalQuality(score: number | null): string {
  if (score === null) return "indefinida";
  if (score >= 85) return "forte";
  if (score >= 70) return "valida";
  if (score >= 50) return "fraca";
  return "aguardar";
}

function diagnosticStatus(signalDecision: DemoDecision, analysis: RadarLikeAnalysis, filters: QualityFilter[]): WorkerDiagnosticStatus {
  if (signalDecision === "BUY" || signalDecision === "SELL") return "APPROVED";
  if (analysis.blockedReasons.length > 0 || filters.some((filter) => !filter.passed && filter.severity !== "penalty")) return "BLOCKED";
  return "WAIT";
}

function publicSummary(status: WorkerDiagnosticStatus, analysis: RadarLikeAnalysis, filters: QualityFilter[]): string {
  if (status === "APPROVED") return `Entrada ${analysis.suggestedDirection} aprovada pelo motor demo.`;
  const firstBlock = analysis.blockedReasons[0] ?? filters.find((filter) => !filter.passed)?.reason;
  if (status === "BLOCKED") return firstBlock ?? "Entrada bloqueada pelos filtros operacionais.";
  return "Aguardando uma oportunidade com confirmacao suficiente.";
}

function diagnosticFingerprint(userId: string, symbol: string, analysis: RadarLikeAnalysis, decision: DemoDecision, startedAtMs: number): string {
  const bucket = Math.floor(startedAtMs / (5 * 60 * 1000));
  return [
    userId,
    symbol,
    bucket,
    decision,
    analysis.signalKey,
    analysis.score,
    analysis.blockedReasons.slice(0, 3).join("|"),
  ].join(":");
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  const tickStartedAt = Date.now();
  try {
    const users = demoStore.getAutomationUsers();
    if (users.length === 0) return;
    for (const { user, automation } of users) {
      const cycleStartedAt = Date.now();
      const symbol = automation.symbol || "BTCUSDT";
      try {
        const priceStartedAt = Date.now();
        const price = await fetchDisplayPrice(symbol);
        const latencyMs = Date.now() - priceStartedAt;
        demoStore.updatePrices(user.id, { pair: symbol, price });

        const { signal, analysis, filters } = await analyzeDemoSignal(symbol);
        if (signal.decision !== "SEM ENTRADA") {
          demoStore.openFromSignal(user.id, signal);
        }
        const finishedAt = Date.now();
        const status = diagnosticStatus(signal.decision, analysis, filters);
        const approved = filters.filter((filter) => filter.passed).map((filter) => filter.name);
        const rejected = filters.filter((filter) => !filter.passed).map((filter) => filter.name);
        demoStore.recordWorkerDiagnostic({
          userId: user.id,
          workerActive: true,
          automationActive: automation.enabled,
          symbol,
          cycleStartedAt: new Date(cycleStartedAt).toISOString(),
          cycleFinishedAt: new Date(finishedAt).toISOString(),
          cycleDurationMs: finishedAt - cycleStartedAt,
          latencyMs,
          decision: signal.decision,
          score: analysis.score,
          direction: analysis.suggestedDirection,
          nextCycleAt: nextCycleIso(tickStartedAt),
          lastError: null,
          engineVersion: APP_VERSION,
          status,
          fingerprint: diagnosticFingerprint(user.id, symbol, analysis, signal.decision, cycleStartedAt),
          userPayload: {
            symbol,
            status,
            direction: analysis.suggestedDirection,
            quality: signalQuality(analysis.score),
            summary: analysis.decisiveReason ?? publicSummary(status, analysis, filters),
            decisionState: analysis.decisionState,
            scoreContextual: analysis.scoreContextual,
            scoreOperacional: analysis.scoreOperacional,
          },
          adminPayload: {
            symbol,
            worker: { active: true, automationActive: automation.enabled, cycleDurationMs: finishedAt - cycleStartedAt, latencyMs, nextCycleAt: nextCycleIso(tickStartedAt), engineVersion: APP_VERSION },
            decision: {
              status,
              state: analysis.decisionState,
              rawDecision: signal.decision,
              direction: analysis.suggestedDirection,
              score: analysis.score,
              scoreContextual: analysis.scoreContextual,
              scoreOperacional: analysis.scoreOperacional,
              triggerStage: analysis.triggerStage,
              rrStatus: analysis.rrStatus,
              missingConditions: analysis.missingConditions,
              decisiveReason: analysis.decisiveReason,
              signalKey: analysis.signalKey,
            },
            trends: { trend1h: analysis.trend1h, trend15m: analysis.trend15m, trigger5m: analysis.trigger5m, details: analysis.diagnostics },
            indicators: {
              ema9: analysis.diagnostics.trend15m?.ema9 ?? null,
              ema21: analysis.diagnostics.trend15m?.ema21 ?? null,
              ema200: analysis.diagnostics.trend1h?.ema200 ?? null,
              volume: analysis.volume,
              support: analysis.support,
              resistance: analysis.resistance,
              rr: analysis.rr,
            },
            filters: {
              approved,
              rejected,
              all: filters.map((filter) => ({ name: filter.name, passed: filter.passed, reason: filter.reason, penalty: filter.penalty ?? null, severity: filter.severity ?? null, details: filter.details ?? {} })),
            },
            score: { raw: analysis.diagnostics.rawScore, contextual: analysis.scoreContextual, operacional: analysis.scoreOperacional, final: analysis.score, items: analysis.scoreItems },
            reasons: { confirmations: analysis.confirmations, blocked: analysis.blockedReasons, risks: analysis.risks, steps: signal.steps ?? [] },
            summary: publicSummary(status, analysis, filters),
          },
        });
      } catch (err) {
        const finishedAt = Date.now();
        const message = err instanceof Error ? err.message : String(err);
        demoStore.recordWorkerDiagnostic({
          userId: user.id,
          workerActive: true,
          automationActive: automation.enabled,
          symbol,
          cycleStartedAt: new Date(cycleStartedAt).toISOString(),
          cycleFinishedAt: new Date(finishedAt).toISOString(),
          cycleDurationMs: finishedAt - cycleStartedAt,
          latencyMs: null,
          decision: "ERROR",
          score: null,
          direction: "ERRO",
          nextCycleAt: nextCycleIso(tickStartedAt),
          lastError: message,
          engineVersion: APP_VERSION,
          status: "ERROR",
          fingerprint: `${user.id}:${symbol}:error:${Math.floor(cycleStartedAt / (5 * 60 * 1000))}:${message.slice(0, 80)}`,
          userPayload: { symbol, status: "ERROR", direction: "ERRO", quality: "erro", summary: "Erro ao executar o ciclo do robo demo." },
          adminPayload: { symbol, worker: { active: true, automationActive: automation.enabled, cycleDurationMs: finishedAt - cycleStartedAt, nextCycleAt: nextCycleIso(tickStartedAt), engineVersion: APP_VERSION }, error: message },
        });
        logger.warn({ err, userId: user.id, symbol }, "Demo worker user cycle failed");
      }
    }
  } catch (err) {
    logger.warn({ err }, "Demo worker tick failed");
  } finally {
    running = false;
  }
}

export function startDemoWorker(): void {
  if (started) return;
  started = true;
  setInterval(() => void tick(), TICK_MS);
  void tick();
  logger.info({ intervalMs: TICK_MS }, "Demo worker started");
}
