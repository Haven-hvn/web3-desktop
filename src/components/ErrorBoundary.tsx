import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  scope?: string;
  onReset?: () => void;
  fullScreen?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function isChunkLoadError(err: Error | null): boolean {
  if (!err) return false;
  const msg = `${err.name} ${err.message}`.toLowerCase();
  return (
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("chunkloaderror") ||
    msg.includes("loading chunk") ||
    msg.includes("error loading dynamically imported module")
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[haven-os] ErrorBoundary (${this.props.scope ?? "app"}):`, error, info);
  }

  private handleRetry = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunkError = isChunkLoadError(error);
    const title = this.props.scope ? `${this.props.scope} encountered an error` : "Haven OS 98 encountered an error";

    return (
      <div
        style={{
          padding: 16,
          height: this.props.fullScreen ? "100vh" : "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: this.props.fullScreen ? "var(--theme-background, #008080)" : "var(--theme-surface, #c0c0c0)",
          color: "var(--theme-on-surface, #000)",
        }}
      >
        <div
          className="w98-window"
          style={{
            position: "static",
            maxWidth: 440,
            width: "100%",
          }}
        >
          <div className="w98-title-bar w98-title-bar-active">
            <span className="w98-title-bar-text">⚠️ {title}</span>
          </div>
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
            <p style={{ margin: 0 }}>
              {chunkError
                ? "This app module failed to load — usually because Haven OS was just updated on PinMe or the gateway dropped the request."
                : "An unexpected error occurred inside this component. Your desktop session is still intact."}
            </p>
            <div
              className="w98-panel mono"
              style={{
                padding: 8,
                fontSize: 11,
                background: "var(--theme-surface-variant, #fff)",
                overflowWrap: "anywhere",
                maxHeight: 96,
                overflowY: "auto",
              }}
            >
              {error.message || String(error)}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="w98-button" onClick={this.handleRetry}>
                Retry
              </button>
              <button
                type="button"
                className="w98-button w98-button-primary"
                onClick={() => window.location.reload()}
              >
                Reload Haven OS
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
