import { useEffect, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, ChevronDown, ChevronUp, Clock, ShieldAlert, XCircle } from 'lucide-react';

import { getWorkerDiagnostics, type AuthUser, type WorkerDiagnosticAdminDto, type WorkerDiagnosticUserDto } from '../lib/demoApi';

function statusConfig(status: WorkerDiagnosticUserDto['status']) {
  if (status === 'APPROVED') return { label: 'Entrada aprovada', color: '#00ff66', icon: CheckCircle2 };
  if (status === 'BLOCKED') return { label: 'Entrada bloqueada', color: '#ff4444', icon: XCircle };
  if (status === 'ERROR') return { label: 'Erro', color: '#808080', icon: AlertTriangle };
  return { label: 'Aguardando', color: '#ffaa00', icon: Clock };
}

function isAdminDiagnostic(item: WorkerDiagnosticUserDto | WorkerDiagnosticAdminDto | null): item is WorkerDiagnosticAdminDto {
  return !!item && 'full' in item;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return '--';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '--';
  return date.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function smallValue(value: unknown): string {
  if (typeof value === 'number') return Number.isFinite(value) ? value.toFixed(Math.abs(value) < 10 ? 4 : 2) : '--';
  if (typeof value === 'boolean') return value ? 'sim' : 'nao';
  if (value === null || value === undefined) return '--';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function AdminDetails({ diagnostic }: { diagnostic: WorkerDiagnosticAdminDto }) {
  const [open, setOpen] = useState(false);
  const full = diagnostic.full;
  const indicators = (full.indicators ?? {}) as Record<string, unknown>;
  const score = (full.score ?? {}) as Record<string, unknown>;
  const decision = (full.decision ?? {}) as Record<string, unknown>;
  const filters = (full.filters ?? {}) as { approved?: string[]; rejected?: string[]; all?: Array<Record<string, unknown>> };
  const reasons = (full.reasons ?? {}) as { confirmations?: string[]; blocked?: string[]; risks?: string[] };
  const missingConditions = Array.isArray(decision.missingConditions) ? decision.missingConditions.map(String) : [];
  return (
    <div className="border-t border-border/50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <ShieldAlert className="w-3.5 h-3.5 text-primary" />
          Ver diagnostico completo
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-4 pb-4">
          <div className="border border-border/50 bg-background/20 p-3">
            <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-muted-foreground">Indicadores</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-mono">
              {['ema9', 'ema21', 'ema200', 'volume', 'support', 'resistance', 'rr'].map((key) => (
                <div key={key} className="min-w-0">
                  <span className="block uppercase text-muted-foreground">{key}</span>
                  <span className="block truncate text-foreground">{smallValue(indicators[key])}</span>
                </div>
              ))}
              <div><span className="block uppercase text-muted-foreground">score bruto</span><span>{smallValue(score.raw)}</span></div>
              <div><span className="block uppercase text-muted-foreground">contextual</span><span>{smallValue(score.contextual)}</span></div>
              <div><span className="block uppercase text-muted-foreground">operacional</span><span>{smallValue(score.operacional)}</span></div>
              <div><span className="block uppercase text-muted-foreground">score final</span><span>{smallValue(score.final)}</span></div>
              <div><span className="block uppercase text-muted-foreground">estado</span><span>{smallValue(decision.state)}</span></div>
              <div><span className="block uppercase text-muted-foreground">gatilho</span><span>{smallValue(decision.triggerStage)}</span></div>
              <div><span className="block uppercase text-muted-foreground">R/R</span><span>{smallValue(decision.rrStatus)}</span></div>
            </div>
          </div>
          <div className="border border-border/50 bg-background/20 p-3">
            <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-muted-foreground">Filtros</p>
            <div className="mt-2 grid grid-cols-1 gap-2 text-[10px] font-mono">
              <p className="text-[#00ff66]">Aprovados: {(filters.approved ?? []).join(', ') || '--'}</p>
              <p className="text-[#ff4444]">Reprovados: {(filters.rejected ?? []).join(', ') || '--'}</p>
              {(filters.all ?? []).slice(0, 8).map((filter) => (
                <p key={String(filter.name)} className="text-muted-foreground">
                  {String(filter.name)}: {String(filter.passed)} - {String(filter.reason)}
                </p>
              ))}
            </div>
          </div>
          <div className="md:col-span-2 border border-border/50 bg-background/20 p-3">
            <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-muted-foreground">Motivo completo</p>
            <div className="mt-2 grid grid-cols-1 gap-1 text-[10px] font-mono text-muted-foreground">
              {typeof decision.decisiveReason === 'string' && <span>Decisivo: {decision.decisiveReason}</span>}
              {missingConditions.length > 0 && <span>Falta: {missingConditions.slice(0, 5).join(', ')}</span>}
              {[...(reasons.confirmations ?? []), ...(reasons.blocked ?? []), ...(reasons.risks ?? [])].slice(0, 12).map((reason, index) => (
                <span key={`${reason}-${index}`}>{reason}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function RobotDiagnosticsPanel({ user }: { user: AuthUser }) {
  const [current, setCurrent] = useState<WorkerDiagnosticUserDto | WorkerDiagnosticAdminDto | null>(null);
  const [history, setHistory] = useState<Array<WorkerDiagnosticUserDto | WorkerDiagnosticAdminDto>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getWorkerDiagnostics(user.role === 'admin' ? 20 : 5);
        if (cancelled) return;
        setCurrent(data.current);
        setHistory(data.history);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Falha ao carregar diagnostico.');
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user.id, user.role]);

  const cfg = statusConfig(current?.status ?? 'WAIT');
  const Icon = cfg.icon;
  return (
    <section className="bg-card/50 backdrop-blur-md border border-border relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Bot className="w-4 h-4 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="text-xs font-mono font-bold uppercase tracking-[0.2em]">Diagnostico do Robo</h2>
              <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-[0.12em]">Seu Analista de Mercado 24h</p>
            </div>
          </div>
          <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-muted-foreground">{current?.symbol ?? '--'}</span>
        </div>

        <div className="border bg-background/20 p-3" style={{ borderColor: cfg.color }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Icon className="w-4 h-4 flex-shrink-0" style={{ color: cfg.color }} />
              <span className="text-sm font-mono font-bold uppercase tracking-[0.14em]" style={{ color: cfg.color }}>{cfg.label}</span>
            </div>
            <span className="text-2xl font-mono font-bold tabular-nums">{current?.score ?? '--'}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono">
            <div><span className="block uppercase text-muted-foreground">Estado</span><span>{current?.decisionState ?? '--'}</span></div>
            <div><span className="block uppercase text-muted-foreground">Direcao</span><span>{current?.direction ?? '--'}</span></div>
            <div><span className="block uppercase text-muted-foreground">Qualidade</span><span>{current?.quality ?? '--'}</span></div>
            <div><span className="block uppercase text-muted-foreground">Contexto</span><span>{current?.scoreContextual ?? '--'}</span></div>
            <div><span className="block uppercase text-muted-foreground">Operacional</span><span>{current?.scoreOperacional ?? current?.score ?? '--'}</span></div>
            <div><span className="block uppercase text-muted-foreground">Horario</span><span>{fmtDate(current?.generatedAt)}</span></div>
            <div><span className="block uppercase text-muted-foreground">Proximo ciclo</span><span>{fmtDate(current?.nextCycleAt)}</span></div>
          </div>
          <p className="mt-3 text-xs font-mono text-muted-foreground leading-relaxed">{error ?? current?.summary ?? 'Aguardando o primeiro ciclo do worker.'}</p>
        </div>
      </div>

      {isAdminDiagnostic(current) && <AdminDetails diagnostic={current} />}

      {history.length > 1 && (
        <div className="border-t border-border/50 px-4 pb-4">
          <p className="pt-3 text-[9px] font-mono uppercase tracking-[0.16em] text-muted-foreground">Ultimos diagnosticos</p>
          <div className="mt-2 grid grid-cols-1 gap-1">
            {history.slice(1, 5).map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 text-[10px] font-mono text-muted-foreground">
                <span>{item.symbol} - {statusConfig(item.status).label}</span>
                <span>{fmtDate(item.generatedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
