import React from 'react';

interface DashboardErrorBoundaryProps {
  children: React.ReactNode;
}

interface DashboardErrorBoundaryState {
  error: Error | null;
}

export class DashboardErrorBoundary extends React.Component<
  DashboardErrorBoundaryProps,
  DashboardErrorBoundaryState
> {
  state: DashboardErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): DashboardErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[Oraculo] Falha isolada no dashboard autenticado.', error, info);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <main className="oracle-fallback" role="alert">
        <section className="oracle-fallback-card">
          <img src={`${import.meta.env.BASE_URL}brand/oraculo-mark.svg`} alt="Oráculo" />
          <p className="oracle-eyebrow">Proteção de interface ativa</p>
          <h1>O painel encontrou uma falha visual.</h1>
          <p>
            A API e o Motor continuam independentes. Tente recarregar apenas o Dashboard.
          </p>
          <div className="oracle-fallback-actions">
            <button type="button" onClick={this.handleRetry}>Tentar novamente</button>
            <button type="button" onClick={() => window.location.reload()}>Recarregar página</button>
          </div>
          <code>{this.state.error.message}</code>
        </section>
      </main>
    );
  }
}
