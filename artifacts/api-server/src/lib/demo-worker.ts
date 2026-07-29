import { APP_VERSION } from "@shared/appVersion";
import { analyzeDemoSignal, fetchDisplayPrice, type QualityFilter, type RadarLikeAnalysis } from "./demo-worker-engine";
import { demoStore } from "./demo-store-instance";
import { logger } from "./logger";
import type { AuthUser, DemoDecision, WorkerDiagnosticStatus } from "./demo-store";

// engine_version = APP_VERSION + optional short commit hash from env
const ENGINE_COMMIT = (process.env["ORACULO_ENGINE_COMMIT"] ?? "").trim().slice(0, 12);
const ENGINE_VERSION_AUDIT = ENGINE_COMMIT ? `${APP_VERSION}+${ENGINE_COMMIT}` : APP_VERSION;

const TICK_MS = 30_000;
export const DEMO_WORKER_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;
type DemoWorkerSymbol = (typeof DEMO_WORKER_SYMBOLS)[number];

let started = false;
let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

type AutomationUser = { user: AuthUser; automation: { enabled: boolean; symbol: string } };
type DemoWorkerStore = Pick<
  typeof demoStore,
  "getAutomationUsers" | "updatePrices" | "openFromSignalWithResult" | "recordWorkerDiagnostic" | "recordEngineAudit" | "getLastTradeForSymbol"
>;

interface DemoWorkerDeps {
  store: DemoWorkerStore;
  fetchPrice: typeof fetchDisplayPrice;
  analyzeSignal: typeof analyzeDemoSignal;
}

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

function defaultDeps(): DemoWorkerDeps {
  return {
    store: demoStore,
    fetchPrice: fetchDisplayPrice,
    analyzeSignal: analyzeDemoSignal,
  };
}

async function runSymbolCycle(item: AutomationUser, symbol: DemoWorkerSymbol, tickStartedAt: number, deps: DemoWorkerDeps): Promise<void> {
  const { user, automation } = item;
  const cycleStartedAt = Date.now();
  try {
    const priceStartedAt = Date.now();
    const price = await deps.fetchPrice(symbol);
    const latencyMs = Date.now() - priceStartedAt;
    deps.store.updatePrices(user.id, { pair: symbol, price });

    const lastTrade = deps.store.getLastTradeForSymbol(user.id, symbol);
    const { signal, analysis, filters } = await deps.analyzeSignal(symbol, {
      lastTrade: lastTrade
        ? {
            direction: lastTrade.direction,
            exitReason: lastTrade.exitReason ?? null,
            target1Hit: lastTrade.target1Hit,
            target2Hit: lastTrade.exitReason === "TARGET_2",
            closeTime: lastTrade.closeTime ?? null,
          }
        : null,
    });
    let auditDecisionState = analysis.decisionState;
    let auditDecisiveReason = analysis.decisiveReason;
    let auditBlockedReasons = analysis.blockedReasons;
    let auditMissingConditions = analysis.missingConditions;
    if (signal.decision !== "SEM ENTRADA") {
      const openResult = deps.store.openFromSignalWithResult(user.id, signal);
      if (!openResult.opened && openResult.decisionState === "BLOQUEADO_RISCO") {
        auditDecisionState = "BLOQUEADO_RISCO";
        auditDecisiveReason = openResult.blockedReason ?? "limite global de risco atingido.";
        auditBlockedReasons = [...analysis.blockedReasons, auditDecisiveReason];
        auditMissingConditions = [...analysis.missingConditions, auditDecisiveReason];
      }
    }
    const finishedAt = Date.now();
    const status = diagnosticStatus(signal.decision, analysis, filters);
    const approved = filters.filter((filter) => filter.passed).map((filter) => filter.name);
    const rejected = filters.filter((filter) => !filter.passed).map((filter) => filter.name);
    deps.store.recordWorkerDiagnostic({
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
        summary: auditDecisiveReason ?? publicSummary(status, analysis, filters),
        decisionState: auditDecisionState,
        scoreContextual: analysis.scoreContextual,
        scoreOperacional: analysis.scoreOperacional,
      },
      adminPayload: {
        symbol,
        worker: { active: true, automationActive: automation.enabled, cycleDurationMs: finishedAt - cycleStartedAt, latencyMs, nextCycleAt: nextCycleIso(tickStartedAt), engineVersion: APP_VERSION },
        decision: {
          status,
          state: auditDecisionState,
          rawDecision: signal.decision,
          direction: analysis.suggestedDirection,
          score: analysis.score,
          scoreContextual: analysis.scoreContextual,
          scoreOperacional: analysis.scoreOperacional,
          triggerStage: analysis.triggerStage,
          rrStatus: analysis.rrStatus,
          missingConditions: analysis.missingConditions,
          decisiveReason: auditDecisiveReason,
          signalKey: analysis.signalKey,
          regime: analysis.marketRegime.regime,
          selectedStrategy: analysis.selectedStrategy,
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
          ema200DistancePctSigned: analysis.ema200DistancePctSigned,
          ema200DistanceAtr: analysis.ema200DistanceAtr,
          regime: analysis.marketRegime,
          strategy: analysis.strategySelection,
        },
        filters: {
          approved,
          rejected,
          all: filters.map((filter) => ({ name: filter.name, passed: filter.passed, reason: filter.reason, penalty: filter.penalty ?? null, severity: filter.severity ?? null, details: filter.details ?? {} })),
        },
        score: { raw: analysis.diagnostics.rawScore, contextual: analysis.scoreContextual, operacional: analysis.scoreOperacional, final: analysis.score, items: analysis.scoreItems },
      reasons: { confirmations: analysis.confirmations, blocked: auditBlockedReasons, risks: analysis.risks, steps: signal.steps ?? [] },
        summary: publicSummary(status, analysis, filters),
      },
    });
    try {
      deps.store.recordEngineAudit({
        userId: user.id,
        symbol,
        analyzedAt: new Date(finishedAt).toISOString(),
        score: analysis.scoreOperacional,
        scoreContextual: analysis.scoreContextual,
        scoreRaw: analysis.diagnostics.rawScore,
        direction: analysis.suggestedDirection,
        decision: signal.decision,
        decisionState: auditDecisionState,
        triggerStage: analysis.triggerStage,
        rrStatus: analysis.rrStatus,
        trend1h: analysis.trend1h,
        trend15m: analysis.trend15m,
        filtersPassed: filters.filter((f) => f.passed).map((f) => f.name),
        filtersBlocked: filters
          .filter((f) => !f.passed && f.severity !== "penalty")
          .map((f) => ({ name: f.name, reason: f.reason, penalty: f.penalty ?? null })),
        filtersPenalty: filters
          .filter((f) => !f.passed && f.severity === "penalty")
          .map((f) => ({ name: f.name, reason: f.reason, penalty: f.penalty ?? null })),
        blockedReasons: auditBlockedReasons,
        qualityPenalties: analysis.qualityPenalties,
        decisiveReason: auditDecisiveReason ?? publicSummary(status, analysis, filters),
        missingConditions: auditMissingConditions,
        entryPrice: analysis.conservativeEntry,
        stopPrice: analysis.stop,
        target1: analysis.target1,
        target2: analysis.target2,
        rr: analysis.rr,
        volumeRelative: analysis.volume?.relative ?? null,
        engineVersion: ENGINE_VERSION_AUDIT,
        regime: analysis.marketRegime.regime,
        regimeConfidence: analysis.marketRegime.confidence,
        selectedStrategy: analysis.selectedStrategy,
        strategyScore: analysis.strategyScore,
        ema200DistancePctSigned: analysis.ema200DistancePctSigned,
        ema200DistanceAtr: analysis.ema200DistanceAtr,
        stretchedEvidence: analysis.stretchedEvidence,
        chaoticEvidence: analysis.chaoticEvidence,
        lastTradeDirection: analysis.lastTradeDirection,
        lastTradeExitReason: analysis.lastTradeExitReason,
        lastTradeTarget1Hit: analysis.lastTradeTarget1Hit,
        lastTradeTarget2Hit: analysis.lastTradeTarget2Hit,
        marketReorganized: analysis.marketReorganized,
        reorganizationReasons: analysis.reorganizationReasons,
        momentumConditionsPassed: analysis.momentumConditionsPassed,
        momentumConditionsMissing: analysis.momentumConditionsMissing,
      });
    } catch (auditErr) {
      logger.warn({ err: auditErr, userId: user.id, symbol }, "Engine audit record failed (non-critical)");
    }
  } catch (err) {
    const finishedAt = Date.now();
    const message = err instanceof Error ? err.message : String(err);
    deps.store.recordWorkerDiagnostic({
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
    logger.warn({ err, userId: user.id, symbol }, "Demo worker user symbol cycle failed");
  }
}

export async function runDemoWorkerUserCycle(item: AutomationUser, tickStartedAt = Date.now(), deps = defaultDeps()): Promise<void> {
  for (const symbol of DEMO_WORKER_SYMBOLS) {
    await runSymbolCycle(item, symbol, tickStartedAt, deps);
  }
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  const tickStartedAt = Date.now();
  try {
    const users = demoStore.getAutomationUsers();
    if (users.length === 0) return;
    for (const item of users) {
      await runDemoWorkerUserCycle(item, tickStartedAt);
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
  timer = setInterval(() => void tick(), TICK_MS);
  void tick();
  logger.info({ intervalMs: TICK_MS }, "Demo worker started");
}

export function stopDemoWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  started = false;
}
