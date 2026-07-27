export type TradeReportDirectionFilter = 'ALL' | 'BUY' | 'SELL';
export type TradeReportStatusFilter = 'ALL' | 'WIN' | 'LOSS';
export type TradeReportSymbolFilter = 'ALL' | 'BTCUSDT' | 'ETHUSDT' | 'SOLUSDT';

export interface OperationTrade {
  id: string;
  pair: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number | null;
  openTime: number;
  closeTime: number | null;
  durationMs: number | null;
  stopLoss: number;
  stopLossOriginal: number;
  target1: number;
  target2: number;
  riskAmount?: number | null;
  positionSize?: number | null;
  remainingPositionSize?: number | null;
  exitReason: string | null;
  status: 'OPEN' | 'WIN' | 'LOSS' | 'BREAKEVEN';
  pnlUSDC: number | null;
  realizedPnlUSDC: number | null;
  partialPnlUSDC: number | null;
  mfeUSDC: number | null;
  maeUSDC: number | null;
  mfeR: number | null;
  maeR: number | null;
  peakGivebackUSDC: number | null;
  peakGivebackPct: number | null;
  target1Hit: boolean;
  breakeven: boolean;
  trailing: boolean;
}

export interface TradeReportFilters {
  symbol: TradeReportSymbolFilter;
  direction: TradeReportDirectionFilter;
  status: TradeReportStatusFilter;
  exitReason: string;
}

export interface TradeReportDashboard {
  totalTrades: number;
  winRatePct: number | null;
  profitFactor: number | null;
  expectancyR: number | null;
  netPnlUSDC: number;
  avgMfeUSDC: number | null;
  avgMaeUSDC: number | null;
  avgGivebackUSDC: number | null;
  avgDurationMs: number | null;
  exitsByReason: Record<string, number>;
}

export interface TradeReportDiagnosis {
  generatedAt: string;
  summary: string;
  exitDistribution: Record<string, number>;
  bestSymbol: { symbol: string; pnlUSDC: number; trades: number } | null;
  worstSymbol: { symbol: string; pnlUSDC: number; trades: number } | null;
  patterns: string[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function avg(values: Array<number | null | undefined>): number | null {
  const nums = values.filter(isFiniteNumber);
  if (nums.length === 0) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

export function filterOperationTrades(trades: OperationTrade[], filters: TradeReportFilters): OperationTrade[] {
  return trades.filter((trade) => {
    if (filters.symbol !== 'ALL' && trade.pair !== filters.symbol) return false;
    if (filters.direction !== 'ALL' && trade.direction !== filters.direction) return false;
    if (filters.status !== 'ALL' && trade.status !== filters.status) return false;
    if (filters.exitReason !== 'ALL' && trade.exitReason !== filters.exitReason) return false;
    return true;
  });
}

function realizedR(trade: OperationTrade): number | null {
  if (!isFiniteNumber(trade.pnlUSDC) || !isFiniteNumber(trade.riskAmount) || trade.riskAmount <= 0) return null;
  return trade.pnlUSDC / trade.riskAmount;
}

export function buildTradeReportDashboard(trades: OperationTrade[]): TradeReportDashboard {
  const closed = trades.filter((trade) => trade.status !== 'OPEN');
  const wins = closed.filter((trade) => trade.status === 'WIN').length;
  const netPnlUSDC = closed.reduce((sum, trade) => sum + (isFiniteNumber(trade.pnlUSDC) ? trade.pnlUSDC : 0), 0);
  const grossProfit = closed.reduce((sum, trade) => sum + Math.max(0, isFiniteNumber(trade.pnlUSDC) ? trade.pnlUSDC : 0), 0);
  const grossLoss = Math.abs(closed.reduce((sum, trade) => sum + Math.min(0, isFiniteNumber(trade.pnlUSDC) ? trade.pnlUSDC : 0), 0));
  const exitsByReason: Record<string, number> = {};
  for (const trade of closed) {
    const reason = trade.exitReason ?? trade.status;
    exitsByReason[reason] = (exitsByReason[reason] ?? 0) + 1;
  }
  return {
    totalTrades: closed.length,
    winRatePct: closed.length > 0 ? (wins / closed.length) * 100 : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Number.POSITIVE_INFINITY : null,
    expectancyR: avg(closed.map(realizedR)),
    netPnlUSDC,
    avgMfeUSDC: avg(closed.map((trade) => trade.mfeUSDC)),
    avgMaeUSDC: avg(closed.map((trade) => trade.maeUSDC)),
    avgGivebackUSDC: avg(closed.map((trade) => trade.peakGivebackUSDC)),
    avgDurationMs: avg(closed.map((trade) => trade.durationMs)),
    exitsByReason,
  };
}

export function buildTradeReportDiagnosis(trades: OperationTrade[]): TradeReportDiagnosis {
  const dashboard = buildTradeReportDashboard(trades);
  const bySymbol: Record<string, { symbol: string; pnlUSDC: number; trades: number }> = {};
  for (const trade of trades.filter((item) => item.status !== 'OPEN')) {
    const row = bySymbol[trade.pair] ?? { symbol: trade.pair, pnlUSDC: 0, trades: 0 };
    row.pnlUSDC += isFiniteNumber(trade.pnlUSDC) ? trade.pnlUSDC : 0;
    row.trades += 1;
    bySymbol[trade.pair] = row;
  }
  const symbols = Object.values(bySymbol).sort((a, b) => b.pnlUSDC - a.pnlUSDC);
  const bestSymbol = symbols[0] ?? null;
  const worstSymbol = symbols.length > 0 ? symbols[symbols.length - 1] : null;
  const target1Misses = trades.filter((trade) => trade.status === 'LOSS' && !trade.target1Hit).length;
  const positiveBeforeLoss = trades.filter((trade) => trade.status === 'LOSS' && (trade.mfeUSDC ?? 0) > 0).length;
  const highGiveback = trades.filter((trade) => (trade.peakGivebackPct ?? 0) >= 70).length;
  const patterns = [
    `${target1Misses} perdas encerraram antes do Alvo 1.`,
    `${positiveBeforeLoss} perdas chegaram a ficar positivas antes do encerramento.`,
    `${highGiveback} operações tiveram giveback acima de 70%.`,
    dashboard.avgDurationMs !== null ? `Tempo médio em operação: ${Math.round(dashboard.avgDurationMs / 60_000)} min.` : 'Tempo médio indisponível.',
    dashboard.avgMfeUSDC !== null ? `MFE médio: ${dashboard.avgMfeUSDC.toFixed(2)} USDC.` : 'MFE médio indisponível.',
    dashboard.avgMaeUSDC !== null ? `MAE médio: ${dashboard.avgMaeUSDC.toFixed(2)} USDC.` : 'MAE médio indisponível.',
  ];
  return {
    generatedAt: new Date().toISOString(),
    summary: dashboard.totalTrades === 0
      ? 'Ainda não há operações suficientes para diagnóstico estatístico.'
      : `${dashboard.totalTrades} operações analisadas; Win Rate ${dashboard.winRatePct?.toFixed(1) ?? '—'}%; lucro líquido ${dashboard.netPnlUSDC.toFixed(2)} USDC.`,
    exitDistribution: dashboard.exitsByReason,
    bestSymbol,
    worstSymbol,
    patterns,
  };
}
