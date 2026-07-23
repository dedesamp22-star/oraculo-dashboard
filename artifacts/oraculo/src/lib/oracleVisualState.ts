export type OracleVisualState = 'waiting' | 'analyzing' | 'buy' | 'sell';

interface TradeLike {
  direction?: unknown;
}

interface WorkerLike {
  active?: unknown;
  status?: unknown;
  lastStatus?: unknown;
  decisionState?: unknown;
  triggerStage?: unknown;
  direction?: unknown;
  lastDirection?: unknown;
  decision?: unknown;
  lastDecision?: unknown;
}

export interface OracleVisualStateInput {
  authenticated: boolean;
  apiError?: unknown;
  activeTrade?: TradeLike | null;
  worker?: WorkerLike | null;
}

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export function directionToOracleVisualState(direction: unknown): OracleVisualState | null {
  const normalized = normalize(direction);
  if (normalized === 'BUY' || normalized === 'LONG' || normalized === 'COMPRA') return 'buy';
  if (normalized === 'SELL' || normalized === 'SHORT' || normalized === 'VENDA') return 'sell';
  return null;
}

function workerDirection(worker: WorkerLike): OracleVisualState | null {
  return (
    directionToOracleVisualState(worker.direction) ??
    directionToOracleVisualState(worker.lastDirection) ??
    directionToOracleVisualState(worker.decision) ??
    directionToOracleVisualState(worker.lastDecision)
  );
}

function isApprovedWorkerEntry(worker: WorkerLike): boolean {
  const status = normalize(worker.lastStatus || worker.status || worker.decisionState || worker.triggerStage);
  return status === 'ENTRADA_APROVADA' ||
    status === 'ENTRY_APPROVED' ||
    status === 'APPROVED' ||
    status === 'BUY' ||
    status === 'SELL';
}

function isWorkerAnalyzing(worker: WorkerLike): boolean {
  const status = normalize(worker.lastStatus || worker.status || worker.decisionState || worker.triggerStage);
  return status === 'ANALYZING' ||
    status === 'PROCESSING' ||
    status === 'RUNNING' ||
    status === 'CONTEXTO_FORMANDO' ||
    status === 'SETUP_QUASE_PRONTO';
}

export function resolveOracleVisualState(input: OracleVisualStateInput): OracleVisualState {
  if (!input.authenticated || input.apiError) return 'waiting';

  const openPositionState = directionToOracleVisualState(input.activeTrade?.direction);
  if (openPositionState) return openPositionState;

  if (input.worker) {
    const approvedDirection = workerDirection(input.worker);
    if (approvedDirection && isApprovedWorkerEntry(input.worker)) return approvedDirection;
    if (isWorkerAnalyzing(input.worker)) return 'analyzing';
  }

  return 'waiting';
}
