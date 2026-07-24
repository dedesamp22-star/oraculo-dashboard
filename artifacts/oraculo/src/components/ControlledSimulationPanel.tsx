import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FlaskConical, Play, Square, Target, XCircle } from 'lucide-react';

import {
  cancelControlledSimulation,
  getControlledSimulation,
  getControlledSimulationEvents,
  startControlledSimulation,
  stepControlledSimulation,
  type ControlledSimulationDto,
  type ControlledSimulationEventDto,
  type ControlledSimulationScenario,
  type ControlledSimulationStep,
} from '../lib/demoApi';

const DEFAULT_SCENARIO: ControlledSimulationScenario = {
  symbol: 'BTCUSDT',
  direction: 'BUY',
  entry: 100,
  stopLoss: 95,
  target1: 105,
  target2: 110,
  quantity: 1,
  riskAmount: 5,
  maxDurationMs: 90 * 60 * 1000,
  initialPrice: 100,
};

function fmt(value: number | null | undefined, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--';
}

function statusColor(status: ControlledSimulationDto['status'] | undefined): string {
  if (status === 'ACTIVE') return '#00ff66';
  if (status === 'COMPLETED') return '#00f0ff';
  if (status === 'ERROR') return '#ff4444';
  if (status === 'CANCELLED') return '#ffaa00';
  return '#aaaaaa';
}

function stepLabel(step: ControlledSimulationStep): string {
  return {
    OPEN: 'Abrir entrada',
    MOVE: 'Mover preco',
    TARGET1: 'Alvo 1',
    PARTIAL: 'Parcial',
    BREAKEVEN: 'Breakeven',
    TRAILING: 'Trailing',
    TARGET2: 'Alvo 2',
    STOP: 'Stop',
    LOSS_OF_STRENGTH: 'Perda de forca',
    TIMEOUT: 'Timeout',
    CANCEL: 'Cancelar',
  }[step];
}

function Field({ label, value, onChange, type = 'number' }: {
  label: string;
  value: string | number;
  type?: 'number' | 'select-symbol' | 'select-direction';
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] font-mono uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      {type === 'select-symbol' ? (
        <select value={String(value)} onChange={(event) => onChange(event.target.value)} className="min-h-10 bg-background border border-border px-2 text-xs font-mono">
          <option value="BTCUSDT">BTC</option>
          <option value="ETHUSDT">ETH</option>
          <option value="SOLUSDT">SOL</option>
        </select>
      ) : type === 'select-direction' ? (
        <select value={String(value)} onChange={(event) => onChange(event.target.value)} className="min-h-10 bg-background border border-border px-2 text-xs font-mono">
          <option value="BUY">COMPRA</option>
          <option value="SELL">VENDA</option>
        </select>
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" className="min-h-10 bg-background border border-border px-2 text-xs font-mono outline-none focus:border-primary" />
      )}
    </label>
  );
}

export function ControlledSimulationPanel() {
  const [simulation, setSimulation] = useState<ControlledSimulationDto | null>(null);
  const [events, setEvents] = useState<ControlledSimulationEventDto[]>([]);
  const [scenario, setScenario] = useState<ControlledSimulationScenario>(DEFAULT_SCENARIO);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeTrade = simulation?.session.activeTrade ?? null;
  const closedTrade = simulation?.session.history[0] ?? null;
  const pnl = activeTrade?.realizedPnlUSDC ?? closedTrade?.realizedPnlUSDC ?? 0;

  const load = async () => {
    try {
      const current = await getControlledSimulation();
      setSimulation(current);
      if (current) setEvents(await getControlledSimulationEvents(current.id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar simulacao.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await load();
    };
    void run();
    const timer = window.setInterval(() => void run(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const stepButtons = useMemo(() => (
    ['OPEN', 'MOVE', 'TARGET1', 'PARTIAL', 'BREAKEVEN', 'TRAILING', 'TARGET2', 'STOP', 'LOSS_OF_STRENGTH', 'TIMEOUT'] as ControlledSimulationStep[]
  ), []);

  const mutate = async (fn: () => Promise<ControlledSimulationDto>) => {
    setLoading(true);
    try {
      const next = await fn();
      setSimulation(next);
      setEvents(await getControlledSimulationEvents(next.id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na simulacao.');
    } finally {
      setLoading(false);
    }
  };

  const updateScenario = (key: keyof ControlledSimulationScenario, value: string) => {
    setScenario((current) => ({
      ...current,
      [key]: key === 'symbol' || key === 'direction' ? value : Number(value),
    }));
  };

  const canStep = (step: ControlledSimulationStep) => !!simulation?.allowedSteps.includes(step);

  return (
    <section className="bg-card/50 backdrop-blur-md border border-border relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00f0ff]/40 to-transparent" />
      <div className="p-4 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <FlaskConical className="w-4 h-4 text-[#00f0ff] flex-shrink-0" />
            <div>
              <h2 className="text-xs font-mono font-bold uppercase tracking-[0.2em]">Simulacao Controlada</h2>
              <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-[0.12em]">Homologacao admin sem Binance real</p>
            </div>
          </div>
          <span className="text-[10px] font-mono font-bold uppercase" style={{ color: statusColor(simulation?.status) }}>
            {simulation?.status ?? 'INATIVA'}
          </span>
        </div>

        {!simulation || simulation.status !== 'ACTIVE' ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Field label="Par" type="select-symbol" value={scenario.symbol} onChange={(value) => updateScenario('symbol', value)} />
            <Field label="Direcao" type="select-direction" value={scenario.direction} onChange={(value) => updateScenario('direction', value)} />
            <Field label="Entrada" value={scenario.entry} onChange={(value) => updateScenario('entry', value)} />
            <Field label="Inicial" value={scenario.initialPrice} onChange={(value) => updateScenario('initialPrice', value)} />
            <Field label="Stop" value={scenario.stopLoss} onChange={(value) => updateScenario('stopLoss', value)} />
            <Field label="Alvo 1" value={scenario.target1} onChange={(value) => updateScenario('target1', value)} />
            <Field label="Alvo 2" value={scenario.target2} onChange={(value) => updateScenario('target2', value)} />
            <Field label="Quantidade" value={scenario.quantity} onChange={(value) => updateScenario('quantity', value)} />
            <button
              type="button"
              disabled={loading}
              onClick={() => mutate(() => startControlledSimulation(scenario))}
              className="col-span-2 md:col-span-4 min-h-11 bg-[#00f0ff] text-background px-4 py-3 text-[10px] font-mono font-bold uppercase tracking-[0.16em] disabled:opacity-40"
            >
              <Play className="inline w-3.5 h-3.5 mr-2" />
              Iniciar simulacao
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[10px] font-mono">
              <div className="border border-border/50 bg-background/20 p-2"><span className="block uppercase text-muted-foreground">Par</span><b>{simulation.scenario.symbol}</b></div>
              <div className="border border-border/50 bg-background/20 p-2"><span className="block uppercase text-muted-foreground">Direcao</span><b>{simulation.scenario.direction}</b></div>
              <div className="border border-border/50 bg-background/20 p-2"><span className="block uppercase text-muted-foreground">Entrada</span><b>{fmt(simulation.scenario.entry)}</b></div>
              <div className="border border-border/50 bg-background/20 p-2"><span className="block uppercase text-muted-foreground">Stop</span><b>{fmt(activeTrade?.stopLoss ?? simulation.scenario.stopLoss)}</b></div>
              <div className="border border-border/50 bg-background/20 p-2"><span className="block uppercase text-muted-foreground">PnL</span><b>{fmt(pnl, 4)}</b></div>
              <div className="border border-border/50 bg-background/20 p-2"><span className="block uppercase text-muted-foreground">Alvo 1</span><b>{fmt(simulation.scenario.target1)}</b></div>
              <div className="border border-border/50 bg-background/20 p-2"><span className="block uppercase text-muted-foreground">Alvo 2</span><b>{fmt(simulation.scenario.target2)}</b></div>
              <div className="border border-border/50 bg-background/20 p-2"><span className="block uppercase text-muted-foreground">Qtd restante</span><b>{fmt(activeTrade?.remainingPositionSize ?? 0, 6)}</b></div>
              <div className="border border-border/50 bg-background/20 p-2"><span className="block uppercase text-muted-foreground">Parcial</span><b>{activeTrade?.target1Hit ? 'SIM' : 'NAO'}</b></div>
              <div className="border border-border/50 bg-background/20 p-2"><span className="block uppercase text-muted-foreground">Etapa</span><b>{simulation.currentStep}</b></div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {stepButtons.map((step) => (
                <button
                  key={step}
                  type="button"
                  disabled={loading || !canStep(step)}
                  onClick={() => {
                    if (['STOP', 'TARGET2', 'LOSS_OF_STRENGTH', 'TIMEOUT'].includes(step) && !window.confirm(`Executar ${stepLabel(step)}?`)) return;
                    void mutate(() => stepControlledSimulation(simulation.id, step));
                  }}
                  className="min-h-11 border border-border px-2 py-2 text-[10px] font-mono font-bold uppercase tracking-[0.12em] disabled:opacity-35 disabled:cursor-not-allowed hover:border-primary"
                >
                  {stepLabel(step)}
                </button>
              ))}
              <button
                type="button"
                disabled={loading || !canStep('CANCEL')}
                onClick={() => {
                  if (window.confirm('Cancelar a simulacao controlada?')) void mutate(() => cancelControlledSimulation(simulation.id));
                }}
                className="min-h-11 border border-[#ffaa00]/50 px-2 py-2 text-[10px] font-mono font-bold uppercase tracking-[0.12em] text-[#ffaa00] disabled:opacity-35"
              >
                <Square className="inline w-3.5 h-3.5 mr-1" />
                Cancelar
              </button>
            </div>
          </>
        )}

        {error && (
          <p className="flex items-center gap-2 text-[11px] font-mono text-[#ff4444]">
            <AlertTriangle className="w-3.5 h-3.5" />
            {error}
          </p>
        )}

        {events.length > 0 && (
          <div className="border-t border-border/50 pt-3">
            <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-muted-foreground">Eventos</p>
            <div className="mt-2 grid grid-cols-1 gap-1">
              {events.slice(-5).reverse().map((event) => (
                <div key={event.id} className="flex items-center justify-between gap-2 text-[10px] font-mono text-muted-foreground">
                  <span className="flex items-center gap-1 min-w-0">
                    {event.status === 'APPLIED' ? <CheckCircle2 className="w-3 h-3 text-[#00ff66]" /> : <XCircle className="w-3 h-3 text-[#ff4444]" />}
                    <span className="truncate">{stepLabel(event.step)} - {event.message}</span>
                  </span>
                  <Target className="w-3 h-3 flex-shrink-0 text-primary/60" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
