import { useMemo, useState, type PointerEvent } from 'react';
import { Eye, EyeOff, Info } from 'lucide-react';
import type { Candle, Interval } from '../../lib/binance';
import type { DemoTrade, ManagementTimelineEvent } from '../../lib/demo';

interface OracleCandlestickChartProps {
  candles: Candle[];
  pair: string;
  interval: Interval;
  loading: boolean;
  error: string | null;
  currentPrice: number | null;
  trade: DemoTrade | null;
  history?: DemoTrade[];
  onIntervalChange: (interval: Interval) => void;
}

interface ChartLevel {
  key: string;
  label: string;
  price: number;
  color: string;
  dash?: string;
}

type MarkerKind = 'buy' | 'sell' | 'stop' | 'target' | 'exit' | 'protect';

interface TradeMarker {
  key: string;
  time: number;
  price: number;
  label: string;
  kind: MarkerKind;
}

const VIEW_WIDTH = 1180;
const VIEW_HEIGHT = 610;
const PLOT_LEFT = 24;
const PLOT_RIGHT = 104;
const PLOT_TOP = 42;
const PRICE_HEIGHT = 420;
const VOLUME_TOP = 500;
const VOLUME_HEIGHT = 66;
const PLOT_WIDTH = VIEW_WIDTH - PLOT_LEFT - PLOT_RIGHT;
const INTERVALS: Interval[] = ['5m', '15m', '1h'];
const UP = '#089981';
const DOWN = '#f23645';
const BLUE = '#2962ff';
const GOLD = '#d8a832';

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

function markerColor(kind: MarkerKind): string {
  if (kind === 'buy' || kind === 'target') return UP;
  if (kind === 'sell' || kind === 'stop') return DOWN;
  if (kind === 'protect') return GOLD;
  return '#d1d4dc';
}

function exitMarkerLabel(trade: DemoTrade): { label: string; kind: MarkerKind } {
  if (trade.exitReason === 'STOP_LOSS') return { label: 'STOP', kind: 'stop' };
  if (trade.exitReason === 'TARGET_1') return { label: 'ALVO 1', kind: 'target' };
  if (trade.exitReason === 'TARGET_2') return { label: 'ALVO 2', kind: 'target' };
  if (trade.exitReason === 'TRAILING_STOP') return { label: 'TRAILING', kind: 'protect' };
  if (trade.exitReason === 'BREAKEVEN') return { label: 'ZERO', kind: 'protect' };
  if (trade.exitReason === 'TIMEOUT' || trade.exitReason === 'TIME_EXIT') return { label: 'TEMPO', kind: 'exit' };
  return { label: 'SAÍDA', kind: 'exit' };
}

function timelineMarker(
  trade: DemoTrade,
  event: ManagementTimelineEvent,
  index: number,
): TradeMarker | null {
  const time = new Date(event.at).getTime();
  if (!Number.isFinite(time)) return null;

  if (event.type === 'TARGET_1' || event.type === 'PARTIAL_EXECUTED') {
    const price = validPrice(event.price) ? event.price : trade.target1;
    if (!validPrice(price)) return null;
    return { key: `${trade.id}:timeline:${index}`, time, price, label: 'ALVO 1', kind: 'target' };
  }
  if (event.type === 'TARGET_2') {
    const price = validPrice(event.price) ? event.price : trade.target2;
    if (!validPrice(price)) return null;
    return { key: `${trade.id}:timeline:${index}`, time, price, label: 'ALVO 2', kind: 'target' };
  }
  if (event.type === 'STOP') {
    const price = validPrice(event.price) ? event.price : trade.stopLoss;
    if (!validPrice(price)) return null;
    return { key: `${trade.id}:timeline:${index}`, time, price, label: 'STOP', kind: 'stop' };
  }
  if (event.type === 'BREAKEVEN_ACTIVATED') {
    const price = validPrice(event.price) ? event.price : trade.entry;
    if (!validPrice(price)) return null;
    return { key: `${trade.id}:timeline:${index}`, time, price, label: 'PROTEGIDA', kind: 'protect' };
  }
  return null;
}

function buildMarkers(
  selectedTrade: DemoTrade | null,
  history: DemoTrade[],
  pair: string,
  minTime: number,
  maxTime: number,
): TradeMarker[] {
  const trades = new Map<string, DemoTrade>();
  for (const item of history) trades.set(item.id, item);
  if (selectedTrade) trades.set(selectedTrade.id, selectedTrade);

  const markers: TradeMarker[] = [];
  for (const item of trades.values()) {
    if (item.pair !== pair) continue;

    if (item.openTime >= minTime && item.openTime <= maxTime && validPrice(item.entry)) {
      markers.push({
        key: `${item.id}:entry`,
        time: item.openTime,
        price: item.entry,
        label: item.direction === 'BUY' ? 'COMPRA' : 'VENDA',
        kind: item.direction === 'BUY' ? 'buy' : 'sell',
      });
    }

    const timeline = item.managementTimeline ?? [];
    timeline.forEach((event, index) => {
      const marker = timelineMarker(item, event, index);
      if (marker && marker.time >= minTime && marker.time <= maxTime) markers.push(marker);
    });

    if (item.closeTime && item.closeTime >= minTime && item.closeTime <= maxTime && validPrice(item.closePrice)) {
      const exit = exitMarkerLabel(item);
      markers.push({
        key: `${item.id}:close`,
        time: item.closeTime,
        price: item.closePrice,
        label: exit.label,
        kind: exit.kind,
      });
    }
  }

  const deduped = new Map<string, TradeMarker>();
  for (const marker of markers) {
    const key = `${Math.round(marker.time / 30_000)}:${marker.label}:${Math.round(marker.price * 1000)}`;
    if (!deduped.has(key)) deduped.set(key, marker);
  }
  return Array.from(deduped.values()).sort((a, b) => a.time - b.time).slice(-28);
}

export function OracleCandlestickChart({
  candles,
  pair,
  interval,
  loading,
  error,
  currentPrice,
  trade,
  history = [],
  onIntervalChange,
}: OracleCandlestickChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showRobotEvents, setShowRobotEvents] = useState(true);

  const data = useMemo(
    () => candles
      .filter((candle) => [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite))
      .slice(-110),
    [candles],
  );

  const levels = useMemo<ChartLevel[]>(() => {
    const next: ChartLevel[] = [];
    if (trade && trade.pair === pair) {
      if (validPrice(trade.entry)) next.push({ key: 'entry', label: 'ENTRADA', price: trade.entry, color: '#d1d4dc', dash: '8 6' });
      if (validPrice(trade.stopLoss)) next.push({ key: 'stop', label: 'STOP', price: trade.stopLoss, color: DOWN, dash: '6 5' });
      if (validPrice(trade.target1)) next.push({ key: 'target1', label: 'ALVO 1', price: trade.target1, color: UP, dash: '5 5' });
      if (validPrice(trade.target2)) next.push({ key: 'target2', label: 'ALVO 2', price: trade.target2, color: '#4dbb9a', dash: '10 5' });
    }
    if (validPrice(currentPrice)) next.push({ key: 'current', label: 'ATUAL', price: currentPrice, color: BLUE, dash: '2 4' });
    return next;
  }, [currentPrice, pair, trade]);

  const markers = useMemo(() => {
    if (!showRobotEvents || data.length === 0) return [];
    const minTime = data[0].openTime;
    const maxTime = data[data.length - 1].closeTime;
    return buildMarkers(trade, history, pair, minTime, maxTime);
  }, [data, history, pair, showRobotEvents, trade]);

  const chart = useMemo(() => {
    if (data.length === 0) return null;
    const values = data.flatMap((candle) => [candle.low, candle.high]);
    for (const level of levels) values.push(level.price);
    for (const marker of markers) values.push(marker.price);

    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const spread = Math.max(rawMax - rawMin, rawMax * 0.001, 0.001);
    const min = rawMin - spread * 0.10;
    const max = rawMax + spread * 0.10;
    const range = Math.max(max - min, 0.001);
    const step = PLOT_WIDTH / data.length;
    const candleWidth = Math.max(2.4, Math.min(8.2, step * 0.66));
    const maxVolume = Math.max(...data.map((candle) => candle.volume), 1);
    const y = (price: number) => PLOT_TOP + ((max - price) / range) * PRICE_HEIGHT;
    const x = (index: number) => PLOT_LEFT + step * (index + 0.5);
    return { min, max, range, step, candleWidth, maxVolume, x, y };
  }, [data, levels, markers]);

  const activeIndex = hoverIndex !== null && hoverIndex >= 0 && hoverIndex < data.length
    ? hoverIndex
    : data.length - 1;
  const activeCandle = data[activeIndex] ?? null;

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>): void => {
    if (!chart || data.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH;
    const index = Math.max(0, Math.min(data.length - 1, Math.floor((svgX - PLOT_LEFT) / chart.step)));
    setHoverIndex(index);
  };

  const markerGroups = useMemo(() => {
    if (!chart) return [];
    const occupied = new Map<number, number>();
    return markers.map((marker) => {
      const index = nearestIndex(data, marker.time);
      const lane = occupied.get(index) ?? 0;
      occupied.set(index, lane + 1);
      return { marker, index, lane };
    }).filter((item) => item.index >= 0);
  }, [chart, data, markers]);

  return (
    <section className="oracle-chart-card oracle-chart-v5">
      <header className="oracle-chart-toolbar">
        <div>
          <span className="oracle-eyebrow">Gráfico operacional</span>
          <div className="oracle-chart-title-row">
            <strong>{pair.replace('USDT', '/USDT')}</strong>
            <span className="oracle-live-dot">BINANCE AO VIVO</span>
          </div>
          <small className="oracle-chart-subtitle">Visual limpo inspirado no TradingView, com eventos internos do robô.</small>
        </div>
        <div className="oracle-chart-controls">
          <button
            type="button"
            className={`oracle-events-toggle ${showRobotEvents ? 'active' : ''}`}
            onClick={() => setShowRobotEvents((current) => !current)}
            title="Mostrar ou esconder entradas e saídas do robô"
          >
            {showRobotEvents ? <Eye size={14} /> : <EyeOff size={14} />}
            Eventos do robô
          </button>
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
        </div>
      </header>

      <div className="oracle-chart-legend">
        <span><i className="buy" /> Compra</span>
        <span><i className="sell" /> Venda / stop</span>
        <span><i className="target" /> Alvo</span>
        <span><i className="current" /> Preço atual</span>
        <em><Info size={13} /> Clique em uma operação para exibir os níveis dela.</em>
      </div>

      {trade && trade.pair === pair && (
        <div className={`oracle-selected-trade-strip ${trade.direction === 'BUY' ? 'buy' : 'sell'}`}>
          <strong>{trade.direction === 'BUY' ? 'COMPRA' : 'VENDA'} SELECIONADA</strong>
          <span>Entrada {formatPrice(trade.entry, pair)}</span>
          <span>Stop {formatPrice(trade.stopLoss, pair)}</span>
          <span>Alvo 1 {formatPrice(trade.target1, pair)}</span>
          <span>Alvo 2 {formatPrice(trade.target2, pair)}</span>
          <em>{trade.status === 'OPEN' ? 'EM ANDAMENTO' : 'ENCERRADA'}</em>
        </div>
      )}

      {activeCandle && (
        <div className="oracle-ohlc-strip">
          <span>{new Date(activeCandle.closeTime).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>
          <span>Abertura <b>{formatPrice(activeCandle.open, pair)}</b></span>
          <span>Máxima <b>{formatPrice(activeCandle.high, pair)}</b></span>
          <span>Mínima <b>{formatPrice(activeCandle.low, pair)}</b></span>
          <span>Fechamento <b className={activeCandle.close >= activeCandle.open ? 'positive' : 'negative'}>{formatPrice(activeCandle.close, pair)}</b></span>
          <span>Volume <b>{formatVolume(activeCandle.volume)}</b></span>
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
              <linearGradient id="oracleChartBackground" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#10141c" />
                <stop offset="1" stopColor="#080b10" />
              </linearGradient>
              <filter id="markerShadow" x="-60%" y="-60%" width="220%" height="220%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.75" />
              </filter>
            </defs>

            <rect x="0" y="0" width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="url(#oracleChartBackground)" />
            <rect x={PLOT_LEFT} y={PLOT_TOP} width={PLOT_WIDTH} height={PRICE_HEIGHT} fill="rgba(255,255,255,0.004)" />

            {Array.from({ length: 7 }).map((_, index) => {
              const ratio = index / 6;
              const y = PLOT_TOP + PRICE_HEIGHT * ratio;
              const price = chart.max - chart.range * ratio;
              return (
                <g key={`price-grid-${ratio}`}>
                  <line x1={PLOT_LEFT} x2={PLOT_LEFT + PLOT_WIDTH} y1={y} y2={y} stroke="#20242d" strokeWidth="1" />
                  <text x={VIEW_WIDTH - 8} y={y + 4} textAnchor="end" fill="#787f8c" fontSize="12" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
                    {formatPrice(price, pair)}
                  </text>
                </g>
              );
            })}

            {Array.from({ length: 8 }).map((_, index) => {
              const x = PLOT_LEFT + (PLOT_WIDTH / 7) * index;
              return <line key={`time-grid-${index}`} x1={x} x2={x} y1={PLOT_TOP} y2={VOLUME_TOP + VOLUME_HEIGHT} stroke="#181c23" strokeWidth="1" />;
            })}

            {data.map((candle, index) => {
              const x = chart.x(index);
              const openY = chart.y(candle.open);
              const closeY = chart.y(candle.close);
              const highY = chart.y(candle.high);
              const lowY = chart.y(candle.low);
              const rising = candle.close >= candle.open;
              const color = rising ? UP : DOWN;
              const bodyTop = Math.min(openY, closeY);
              const bodyHeight = Math.max(1.7, Math.abs(closeY - openY));
              const volumeHeight = Math.max(1, (candle.volume / chart.maxVolume) * VOLUME_HEIGHT);
              return (
                <g key={candle.openTime}>
                  <line x1={x} x2={x} y1={highY} y2={lowY} stroke={color} strokeWidth="1.35" />
                  <rect
                    x={x - chart.candleWidth / 2}
                    y={bodyTop}
                    width={chart.candleWidth}
                    height={bodyHeight}
                    rx="0.45"
                    fill={color}
                    opacity="0.98"
                  />
                  <rect
                    x={x - chart.candleWidth / 2}
                    y={VOLUME_TOP + VOLUME_HEIGHT - volumeHeight}
                    width={chart.candleWidth}
                    height={volumeHeight}
                    fill={color}
                    opacity="0.28"
                  />
                </g>
              );
            })}

            {levels.map((level) => {
              const y = chart.y(level.price);
              const labelWidth = 92;
              const labelX = VIEW_WIDTH - labelWidth - 4;
              return (
                <g key={level.key}>
                  <line
                    x1={PLOT_LEFT}
                    x2={PLOT_LEFT + PLOT_WIDTH}
                    y1={y}
                    y2={y}
                    stroke={level.color}
                    strokeWidth={level.key === 'current' ? 1.4 : 1.55}
                    strokeDasharray={level.dash}
                    opacity={level.key === 'current' ? 0.86 : 0.94}
                  />
                  <rect x={labelX} y={y - 11} width={labelWidth} height={22} rx="3" fill={level.color} />
                  <text x={labelX + 7} y={y + 4} fill="#ffffff" fontSize="9.5" fontWeight="800" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
                    {level.label} {formatPrice(level.price, pair)}
                  </text>
                </g>
              );
            })}

            {markerGroups.map(({ marker, index, lane }) => {
              const x = chart.x(index);
              const y = chart.y(marker.price);
              const color = markerColor(marker.kind);
              const below = marker.kind === 'sell' || marker.kind === 'stop' || marker.kind === 'exit';
              const offset = 34 + lane * 24;
              const bubbleY = below ? y + offset : y - offset - 20;
              const arrowTipY = below ? y + 7 : y - 7;
              const arrowBaseY = below ? y + 19 : y - 19;
              const width = Math.max(58, marker.label.length * 7 + 18);
              return (
                <g key={marker.key} filter="url(#markerShadow)">
                  <path
                    d={`M ${x} ${arrowTipY} L ${x - 7} ${arrowBaseY} L ${x + 7} ${arrowBaseY} Z`}
                    fill={color}
                    stroke="#080a0f"
                    strokeWidth="2"
                  />
                  <rect
                    x={x - width / 2}
                    y={bubbleY}
                    width={width}
                    height="20"
                    rx="4"
                    fill={color}
                  />
                  <text
                    x={x}
                    y={bubbleY + 14}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="10"
                    fontWeight="850"
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  >
                    {marker.label}
                  </text>
                </g>
              );
            })}

            {hoverIndex !== null && activeCandle && (
              <g pointerEvents="none">
                <line x1={chart.x(activeIndex)} x2={chart.x(activeIndex)} y1={PLOT_TOP} y2={VOLUME_TOP + VOLUME_HEIGHT} stroke="#959da9" strokeDasharray="3 4" opacity="0.72" />
                <line x1={PLOT_LEFT} x2={PLOT_LEFT + PLOT_WIDTH} y1={chart.y(activeCandle.close)} y2={chart.y(activeCandle.close)} stroke="#959da9" strokeDasharray="3 4" opacity="0.52" />
                <rect x={VIEW_WIDTH - 100} y={chart.y(activeCandle.close) - 10} width="94" height="20" rx="3" fill="#363c49" />
                <text x={VIEW_WIDTH - 10} y={chart.y(activeCandle.close) + 4} textAnchor="end" fill="#ffffff" fontSize="10" fontWeight="700" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
                  {formatPrice(activeCandle.close, pair)}
                </text>
              </g>
            )}

            {data.map((candle, index) => {
              const every = Math.max(1, Math.ceil(data.length / 7));
              if (index % every !== 0 && index !== data.length - 1) return null;
              return (
                <text
                  key={`time-${candle.openTime}`}
                  x={chart.x(index)}
                  y={VIEW_HEIGHT - 10}
                  textAnchor="middle"
                  fill="#707784"
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
        <span>Dados Binance · somente leitura</span>
        <span>{data.length} candles · {interval.toUpperCase()}</span>
        <span>{markers.length} evento{markers.length === 1 ? '' : 's'} do robô visível{markers.length === 1 ? '' : 'is'}</span>
      </footer>
    </section>
  );
}
