import { useMemo, useState, type PointerEvent } from 'react';
import type { Candle, Interval } from '../../lib/binance';
import type { DemoTrade } from '../../lib/demo';

interface OracleCandlestickChartProps {
  candles: Candle[];
  pair: string;
  interval: Interval;
  loading: boolean;
  error: string | null;
  currentPrice: number | null;
  trade: DemoTrade | null;
  onIntervalChange: (interval: Interval) => void;
}

interface ChartLevel {
  key: string;
  label: string;
  price: number;
  color: string;
  dash?: string;
}

const VIEW_WIDTH = 1180;
const VIEW_HEIGHT = 560;
const PLOT_LEFT = 24;
const PLOT_RIGHT = 96;
const PLOT_TOP = 34;
const PRICE_HEIGHT = 392;
const VOLUME_TOP = 456;
const VOLUME_HEIGHT = 70;
const PLOT_WIDTH = VIEW_WIDTH - PLOT_LEFT - PLOT_RIGHT;
const INTERVALS: Interval[] = ['5m', '15m', '1h'];

function validNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validPrice(value: number | null | undefined): value is number {
  return validNumber(value) && value > 0;
}

function pairDigits(pair: string): number {
  return pair.startsWith('SOL') ? 3 : 2;
}

function formatPrice(value: number | null | undefined, pair: string): string {
  if (!validNumber(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: pairDigits(pair),
    maximumFractionDigits: pairDigits(pair),
  });
}

function formatVolume(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2);
}

function directionColor(direction: DemoTrade['direction'] | undefined): string {
  return direction === 'SELL' ? '#ff5b68' : '#18d78b';
}

function nearestIndex(candles: Candle[], timestamp: number): number {
  if (candles.length === 0) return -1;
  let bestIndex = 0;
  let bestDistance = Math.abs(candles[0].openTime - timestamp);
  for (let index = 1; index < candles.length; index += 1) {
    const distance = Math.abs(candles[index].openTime - timestamp);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

export function OracleCandlestickChart({
  candles,
  pair,
  interval,
  loading,
  error,
  currentPrice,
  trade,
  onIntervalChange,
}: OracleCandlestickChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const data = useMemo(
    () => candles
      .filter((candle) => [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite))
      .slice(-96),
    [candles],
  );

  const levels = useMemo<ChartLevel[]>(() => {
    const next: ChartLevel[] = [];
    if (trade) {
      if (validPrice(trade.entry)) next.push({ key: 'entry', label: 'ENTRADA', price: trade.entry, color: '#f4f4f5', dash: '8 6' });
      if (validPrice(trade.stopLoss)) next.push({ key: 'stop', label: 'STOP', price: trade.stopLoss, color: '#ff5b68', dash: '6 5' });
      if (validPrice(trade.target1)) next.push({ key: 'target1', label: 'ALVO 1', price: trade.target1, color: '#18d78b', dash: '5 5' });
      if (validPrice(trade.target2)) next.push({ key: 'target2', label: 'ALVO 2', price: trade.target2, color: '#73e8ac', dash: '10 5' });
    }
    if (validPrice(currentPrice)) next.push({ key: 'current', label: 'ATUAL', price: currentPrice, color: '#4bc4ff', dash: '2 4' });
    return next;
  }, [currentPrice, trade]);

  const chart = useMemo(() => {
    if (data.length === 0) return null;
    const values = data.flatMap((candle) => [candle.low, candle.high]);
    for (const level of levels) values.push(level.price);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const spread = Math.max(rawMax - rawMin, rawMax * 0.001, 0.001);
    const min = rawMin - spread * 0.08;
    const max = rawMax + spread * 0.08;
    const range = Math.max(max - min, 0.001);
    const step = PLOT_WIDTH / data.length;
    const candleWidth = Math.max(2.2, Math.min(9, step * 0.58));
    const maxVolume = Math.max(...data.map((candle) => candle.volume), 1);
    const y = (price: number) => PLOT_TOP + ((max - price) / range) * PRICE_HEIGHT;
    const x = (index: number) => PLOT_LEFT + step * (index + 0.5);
    return { min, max, range, step, candleWidth, maxVolume, x, y };
  }, [data, levels]);

  const activeIndex = hoverIndex !== null && hoverIndex >= 0 && hoverIndex < data.length
    ? hoverIndex
    : data.length - 1;
  const activeCandle = data[activeIndex] ?? null;
  const entryIndex = trade ? nearestIndex(data, trade.openTime) : -1;

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>): void => {
    if (!chart || data.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH;
    const index = Math.max(0, Math.min(data.length - 1, Math.floor((svgX - PLOT_LEFT) / chart.step)));
    setHoverIndex(index);
  };

  return (
    <section className="oracle-chart-card">
      <header className="oracle-chart-toolbar">
        <div>
          <span className="oracle-eyebrow">Mercado ao vivo</span>
          <div className="oracle-chart-title-row">
            <strong>{pair.replace('USDT', '/USDT')}</strong>
            <span className="oracle-live-dot">LIVE</span>
          </div>
        </div>
        <div className="oracle-intervals" aria-label="Intervalos do gráfico">
          {INTERVALS.map((item) => (
            <button
              key={item}
              type="button"
              className={item === interval ? 'active' : ''}
              onClick={() => onIntervalChange(item)}
            >
              {item.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      {activeCandle && (
        <div className="oracle-ohlc-strip">
          <span>{new Date(activeCandle.closeTime).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>
          <span>O <b>{formatPrice(activeCandle.open, pair)}</b></span>
          <span>H <b>{formatPrice(activeCandle.high, pair)}</b></span>
          <span>L <b>{formatPrice(activeCandle.low, pair)}</b></span>
          <span>C <b className={activeCandle.close >= activeCandle.open ? 'positive' : 'negative'}>{formatPrice(activeCandle.close, pair)}</b></span>
          <span>Vol <b>{formatVolume(activeCandle.volume)}</b></span>
        </div>
      )}

      <div className="oracle-chart-stage">
        {loading && <div className="oracle-chart-state">Carregando candles reais de {pair}...</div>}
        {!loading && error && <div className="oracle-chart-state error">{error}</div>}
        {!loading && !error && data.length === 0 && <div className="oracle-chart-state">Histórico indisponível para este ativo.</div>}

        {!loading && !error && chart && data.length > 0 && (
          <svg
            className="oracle-candles-svg"
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Gráfico de candles de ${pair}`}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id="oracleChartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#d8a832" stopOpacity="0.08" />
                <stop offset="1" stopColor="#d8a832" stopOpacity="0" />
              </linearGradient>
            </defs>

            <rect x={PLOT_LEFT} y={PLOT_TOP} width={PLOT_WIDTH} height={PRICE_HEIGHT} fill="url(#oracleChartFill)" />

            {Array.from({ length: 6 }).map((_, index) => {
              const ratio = index / 5;
              const y = PLOT_TOP + PRICE_HEIGHT * ratio;
              const price = chart.max - chart.range * ratio;
              return (
                <g key={`price-grid-${ratio}`}>
                  <line x1={PLOT_LEFT} x2={PLOT_LEFT + PLOT_WIDTH} y1={y} y2={y} stroke="#23262d" strokeWidth="1" />
                  <text x={VIEW_WIDTH - 8} y={y + 4} textAnchor="end" fill="#777d89" fontSize="12" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
                    {formatPrice(price, pair)}
                  </text>
                </g>
              );
            })}

            {Array.from({ length: 7 }).map((_, index) => {
              const x = PLOT_LEFT + (PLOT_WIDTH / 6) * index;
              return <line key={`time-grid-${index}`} x1={x} x2={x} y1={PLOT_TOP} y2={VOLUME_TOP + VOLUME_HEIGHT} stroke="#15171c" strokeWidth="1" />;
            })}

            {data.map((candle, index) => {
              const x = chart.x(index);
              const openY = chart.y(candle.open);
              const closeY = chart.y(candle.close);
              const highY = chart.y(candle.high);
              const lowY = chart.y(candle.low);
              const rising = candle.close >= candle.open;
              const color = rising ? '#18d78b' : '#ff5b68';
              const bodyTop = Math.min(openY, closeY);
              const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));
              const volumeHeight = Math.max(1, (candle.volume / chart.maxVolume) * VOLUME_HEIGHT);
              return (
                <g key={candle.openTime}>
                  <line x1={x} x2={x} y1={highY} y2={lowY} stroke={color} strokeWidth="1.2" />
                  <rect
                    x={x - chart.candleWidth / 2}
                    y={bodyTop}
                    width={chart.candleWidth}
                    height={bodyHeight}
                    rx="0.8"
                    fill={rising ? '#18d78b' : '#ff5b68'}
                    opacity="0.94"
                  />
                  <rect
                    x={x - chart.candleWidth / 2}
                    y={VOLUME_TOP + VOLUME_HEIGHT - volumeHeight}
                    width={chart.candleWidth}
                    height={volumeHeight}
                    fill={color}
                    opacity="0.26"
                  />
                </g>
              );
            })}

            {levels.map((level, index) => {
              const y = chart.y(level.price);
              const labelWidth = 72;
              const labelX = VIEW_WIDTH - labelWidth - 4;
              return (
                <g key={level.key}>
                  <line
                    x1={PLOT_LEFT}
                    x2={PLOT_LEFT + PLOT_WIDTH}
                    y1={y}
                    y2={y}
                    stroke={level.color}
                    strokeWidth={level.key === 'current' ? 1.2 : 1.4}
                    strokeDasharray={level.dash}
                    opacity={level.key === 'current' ? 0.82 : 0.92}
                  />
                  <rect x={labelX} y={y - 10} width={labelWidth} height={20} rx="3" fill="#090a0d" stroke={level.color} strokeWidth="1" />
                  <text x={labelX + 6} y={y + 4} fill={level.color} fontSize="10" fontWeight="700" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
                    {level.label}
                  </text>
                  {index === 0 && level.key === 'entry' && (
                    <text x={PLOT_LEFT + 8} y={y - 7} fill={level.color} fontSize="11" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
                      {formatPrice(level.price, pair)}
                    </text>
                  )}
                </g>
              );
            })}

            {trade && entryIndex >= 0 && (
              <g transform={`translate(${chart.x(entryIndex)} ${chart.y(trade.entry)})`}>
                <path
                  d={trade.direction === 'BUY' ? 'M 0 -24 L -9 -10 L 9 -10 Z' : 'M 0 24 L -9 10 L 9 10 Z'}
                  fill={directionColor(trade.direction)}
                  stroke="#050607"
                  strokeWidth="2"
                />
                <rect
                  x="-30"
                  y={trade.direction === 'BUY' ? -47 : 27}
                  width="60"
                  height="20"
                  rx="4"
                  fill="#090a0d"
                  stroke={directionColor(trade.direction)}
                />
                <text
                  x="0"
                  y={trade.direction === 'BUY' ? -33 : 41}
                  textAnchor="middle"
                  fill={directionColor(trade.direction)}
                  fontSize="11"
                  fontWeight="800"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {trade.direction}
                </text>
              </g>
            )}

            {hoverIndex !== null && activeCandle && (
              <g pointerEvents="none">
                <line x1={chart.x(activeIndex)} x2={chart.x(activeIndex)} y1={PLOT_TOP} y2={VOLUME_TOP + VOLUME_HEIGHT} stroke="#8c929d" strokeDasharray="3 4" opacity="0.6" />
                <line x1={PLOT_LEFT} x2={PLOT_LEFT + PLOT_WIDTH} y1={chart.y(activeCandle.close)} y2={chart.y(activeCandle.close)} stroke="#8c929d" strokeDasharray="3 4" opacity="0.4" />
              </g>
            )}

            {data.map((candle, index) => {
              const every = Math.max(1, Math.ceil(data.length / 6));
              if (index % every !== 0 && index !== data.length - 1) return null;
              return (
                <text
                  key={`time-${candle.openTime}`}
                  x={chart.x(index)}
                  y={VIEW_HEIGHT - 8}
                  textAnchor="middle"
                  fill="#666c76"
                  fontSize="11"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {new Date(candle.closeTime).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}
                </text>
              );
            })}
          </svg>
        )}
      </div>

      <footer className="oracle-chart-footer">
        <span>Dados de mercado somente leitura</span>
        <span>{data.length} candles · {interval.toUpperCase()}</span>
        {trade && <span className={trade.direction === 'BUY' ? 'positive' : 'negative'}>Operação {trade.direction} selecionada</span>}
      </footer>
    </section>
  );
}
