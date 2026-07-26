/**
 * TradingViewChart — embeds the official TradingView Advanced Chart widget.
 *
 * Design choices:
 *  · Script loaded once globally (module-level singleton) so the 280 KB TV
 *    bundle is fetched only on first render and reused for all subsequent mounts.
 *  · The parent controls symbol + interval via React `key` — when either
 *    changes the component unmounts/remounts cleanly, which is simpler and more
 *    reliable than calling widget.chart().setSymbol() on a live widget.
 *  · EMA 9, EMA 21, EMA 200 are pre-loaded via the studies API.
 *  · Colors are tuned to match the Oráculo dark terminal palette.
 */

import { useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';

// ── TradingView type stubs ────────────────────────────────────────────────────

interface TVWidget {
  remove?: () => void;
}

interface TVStudy {
  id: string;
  inputs?: Record<string, unknown>;
}

interface TVConfig {
  container_id: string;
  autosize: boolean;
  symbol: string;
  interval: string;
  timezone: string;
  theme: string;
  style: string;
  locale: string;
  allow_symbol_change: boolean;
  hide_side_toolbar: boolean;
  hide_top_toolbar: boolean;
  hide_legend: boolean;
  withdateranges: boolean;
  save_image: boolean;
  enable_publishing: boolean;
  backgroundColor: string;
  gridColor: string;
  studies: TVStudy[];
  overrides?: Record<string, unknown>;
  studies_overrides?: Record<string, unknown>;
}

function isKnownTradingViewRemoveError(error: unknown): boolean {
  return error instanceof TypeError
    && error.message.includes("Cannot read properties of null")
    && error.message.includes("parentNode");
}

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: TVConfig) => TVWidget;
    };
  }
}

// ── Script loader singleton ───────────────────────────────────────────────────

const TV_SCRIPT_URL = 'https://s3.tradingview.com/tv.js';
let tvScriptState: 'idle' | 'loading' | 'ready' = 'idle';
const tvScriptQueue: Array<() => void> = [];

function loadTVScript(onReady: () => void): void {
  if (tvScriptState === 'ready') { onReady(); return; }

  tvScriptQueue.push(onReady);
  if (tvScriptState === 'loading') return;

  tvScriptState = 'loading';
  const script = document.createElement('script');
  script.src  = TV_SCRIPT_URL;
  script.async = true;
  script.onload = () => {
    tvScriptState = 'ready';
    tvScriptQueue.forEach(fn => fn());
    tvScriptQueue.length = 0;
  };
  script.onerror = () => {
    tvScriptState = 'idle';           // allow retry
    tvScriptQueue.length = 0;
  };
  document.head.appendChild(script);
}

// ── EMA studies ───────────────────────────────────────────────────────────────
// Each EMA is a separate study instance.
// TradingView assigns default colours per-instance automatically.
// studies_overrides only accepts single-instance keys, so we rely on
// TradingView's built-in colouring (blue → orange → teal by default).
// The legend in the UI header reflects whatever TV renders.

const EMA_STUDIES: TVStudy[] = [
  { id: 'MAExp@tv-basicstudies', inputs: { length: 9   } },
  { id: 'MAExp@tv-basicstudies', inputs: { length: 21  } },
  { id: 'MAExp@tv-basicstudies', inputs: { length: 200 } },
];

const CANDLE_OVERRIDES: Record<string, unknown> = {
  'mainSeriesProperties.candleStyle.upColor':       '#00ff66',
  'mainSeriesProperties.candleStyle.downColor':     '#ff4444',
  'mainSeriesProperties.candleStyle.borderUpColor': '#00ff66',
  'mainSeriesProperties.candleStyle.borderDownColor': '#ff4444',
  'mainSeriesProperties.candleStyle.wickUpColor':   '#00ff6688',
  'mainSeriesProperties.candleStyle.wickDownColor': '#ff444488',
};

// ── Component ─────────────────────────────────────────────────────────────────

export type TVInterval = '5' | '15' | '60';

interface Props {
  /** Full TradingView symbol, e.g. "BINANCE:BTCUSDT" */
  symbol: string;
  interval: TVInterval;
  /** Container height — pixels (number) or any CSS value like "45vh" */
  height?: number | string;
  compact?: boolean;
}

export function TradingViewChart({ symbol, interval, height = 540, compact = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Stable, unique container ID — never changes for the lifetime of this mount
  const containerId  = useRef(`tv_${Math.random().toString(36).slice(2, 10)}`);
  const widgetRef    = useRef<TVWidget | null>(null);
  const generationRef = useRef(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    let disposed = false;

    const isCurrent = () => !disposed && generationRef.current === generation;
    const safeSetLoading = (value: boolean) => {
      if (isCurrent()) setLoading(value);
    };

    const disposeWidget = () => {
      const widget = widgetRef.current;
      widgetRef.current = null;
      if (!widget?.remove) return;

      try {
        widget.remove();
      } catch (error) {
        if (isKnownTradingViewRemoveError(error)) return;
        throw error;
      }
    };

    safeSetLoading(true);

    // Give the container a frame to render before we attach the widget
    const raf = requestAnimationFrame(() => {
      loadTVScript(() => {
        if (!isCurrent() || !window.TradingView || !containerRef.current) return;

        // StrictMode and rapid remounts can leave a stale instance behind.
        // Always detach the ref before calling TradingView's imperative cleanup.
        disposeWidget();
        containerRef.current.textContent = '';
        if (!isCurrent() || !containerRef.current) return;

        widgetRef.current = new window.TradingView.widget({
          container_id:        containerId.current,
          autosize:            true,
          symbol,
          interval,
          timezone:            'America/Sao_Paulo',
          theme:               'dark',
          style:               '1',           // candles
          locale:              'br',
          allow_symbol_change: false,         // symbol controlled from our UI
          hide_side_toolbar:   compact ? true : false,
          hide_top_toolbar:    compact ? true : false,
          hide_legend:         compact ? true : false,
          withdateranges:      compact ? false : true,
          save_image:          compact ? false : true,
          enable_publishing:   false,
          backgroundColor:     'rgba(5, 8, 16, 1)',
          gridColor:           'rgba(255, 255, 255, 0.04)',
          studies:             EMA_STUDIES,
          overrides:           CANDLE_OVERRIDES,
        });

        safeSetLoading(false);
      });
    });

    return () => {
      disposed = true;
      generationRef.current += 1;
      cancelAnimationFrame(raf);
      disposeWidget();
    };
  }, []); // empty — parent changes `key` when symbol/interval changes

  return (
    <div className="relative w-full" style={{ height }}>
      {/* Loading shimmer */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#050810] border border-border/50 z-10">
          <RefreshCw className="w-5 h-5 text-primary animate-spin" />
          <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60">
            Carregando gráfico TradingView...
          </span>
        </div>
      )}

      {/* TradingView container */}
      <div
        ref={containerRef}
        id={containerId.current}
        className="w-full h-full"
        style={{ minHeight: height }}
      />
    </div>
  );
}
