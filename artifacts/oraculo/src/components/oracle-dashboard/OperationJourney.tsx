import {
  Activity,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Crosshair,
  ShieldCheck,
  Target,
} from 'lucide-react';
import type { DemoTrade } from '../../lib/demo';

interface OperationJourneyProps {
  trade: DemoTrade | null;
  currentPrice: number | null;
  openCount: number;
}

function validNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatPrice(value: number | null | undefined, pair: string): string {
  if (!validNumber(value)) return '—';
  const digits = pair.startsWith('SOL') ? 3 : 2;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatUsd(value: number | null | undefined, signed = false): string {
  if (!validNumber(value)) return '—';
  const formatted = Math.abs(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (!signed) return formatted;
  return `${value >= 0 ? '+' : '-'}${formatted}`;
}

function openPnl(trade: DemoTrade, price: number | null): number | null {
  if (!validNumber(price) || !validNumber(trade.entry)) return trade.pnlUSDC ?? null;
  const size = trade.remainingPositionSize ?? trade.positionSize;
  if (!validNumber(size)) return trade.pnlUSDC ?? null;
  return trade.direction === 'BUY'
    ? (price - trade.entry) * size
    : (trade.entry - price) * size;
}

function statusMessage(trade: DemoTrade): string {
  if (trade.status !== 'OPEN') {
    if (trade.exitReason === 'STOP_LOSS') return 'Esta operação foi encerrada pelo stop de proteção.';
    if (trade.exitReason === 'TARGET_1') return 'Esta operação encerrou no primeiro alvo.';
    if (trade.exitReason === 'TARGET_2') return 'Esta operação chegou ao segundo alvo.';
    if (trade.exitReason === 'TRAILING_STOP') return 'O trailing stop protegeu o resultado e encerrou a operação.';
    if (trade.exitReason === 'BREAKEVEN') return 'A operação foi protegida no preço de entrada.';
    return 'Esta operação já foi encerrada e está disponível para auditoria.';
  }
  if (trade.target1Hit && trade.isBreakevenStop) {
    return 'O Alvo 1 já foi atingido e o stop está protegendo a entrada.';
  }
  if (trade.target1Hit) return 'O Alvo 1 já foi atingido. O robô continua administrando o restante.';
  return `O robô está em uma posição de ${trade.direction === 'BUY' ? 'compra' : 'venda'} e acompanha stop e alvos.`;
}

export function OperationJourney({ trade, currentPrice, openCount }: OperationJourneyProps) {
  if (!trade) {
    return (
      <section className="oracle-operation-journey empty">
        <div className="oracle-operation-journey-icon"><Bot size={25} /></div>
        <div>
          <span className="oracle-eyebrow">Situação agora</span>
          <h2>Nenhuma posição selecionada</h2>
          <p>
            {openCount > 0
              ? 'Escolha uma operação na tabela para ver entrada, proteção e objetivos no gráfico.'
              : 'O robô está analisando o mercado. Quando entrar, a operação aparecerá aqui automaticamente.'}
          </p>
        </div>
      </section>
    );
  }

  const pnl = trade.status === 'OPEN' ? openPnl(trade, currentPrice) : trade.pnlUSDC ?? null;
  const closed = trade.status !== 'OPEN';
  const firstTargetDone = trade.target1Hit || trade.exitReason === 'TARGET_1' || trade.exitReason === 'TARGET_2';
  const protectedStop = trade.isBreakevenStop || trade.exitReason === 'BREAKEVEN';
  const directionLabel = trade.direction === 'BUY' ? 'COMPRA' : 'VENDA';

  return (
    <section className={`oracle-operation-journey ${trade.direction === 'BUY' ? 'buy' : 'sell'}`}>
      <header>
        <div>
          <span className="oracle-eyebrow">Operação selecionada</span>
          <div className="oracle-operation-title">
            <strong>{trade.pair.replace('USDT', '')}<small>/USDT</small></strong>
            <em>{directionLabel}</em>
            <span className={closed ? 'closed' : 'open'}>{closed ? 'ENCERRADA' : 'ABERTA'}</span>
          </div>
          <p>{statusMessage(trade)}</p>
        </div>
        <div className={`oracle-operation-pnl ${(pnl ?? 0) >= 0 ? 'positive' : 'negative'}`}>
          <span>{closed ? 'Resultado final' : 'Resultado agora'}</span>
          <strong>{formatUsd(pnl, true)}</strong>
          <small>{closed ? trade.exitReason ?? trade.status : 'Varia com o preço atual'}</small>
        </div>
      </header>

      <div className="oracle-journey-steps">
        <div className="done">
          <Crosshair size={17} />
          <span>1. Entrada</span>
          <strong>{formatPrice(trade.entry, trade.pair)}</strong>
        </div>
        <div className={protectedStop || closed ? 'done' : 'current'}>
          <ShieldCheck size={17} />
          <span>2. Proteção</span>
          <strong>{formatPrice(trade.stopLoss, trade.pair)}</strong>
        </div>
        <div className={firstTargetDone ? 'done' : closed ? 'pending' : 'current'}>
          <Target size={17} />
          <span>3. Alvo 1</span>
          <strong>{formatPrice(trade.target1, trade.pair)}</strong>
        </div>
        <div className={trade.exitReason === 'TARGET_2' ? 'done' : closed ? 'done' : 'pending'}>
          <CheckCircle2 size={17} />
          <span>4. Alvo 2 / saída</span>
          <strong>{formatPrice(trade.target2, trade.pair)}</strong>
        </div>
      </div>

      <div className="oracle-operation-facts">
        <div><Activity size={15} /><span>Preço atual</span><strong>{formatPrice(currentPrice, trade.pair)}</strong></div>
        <div><CircleDollarSign size={15} /><span>Risco inicial</span><strong>{formatUsd(trade.riskAmount)}</strong></div>
        <div><ShieldCheck size={15} /><span>Risco/retorno</span><strong>{trade.riskReward || '—'}</strong></div>
      </div>
    </section>
  );
}
