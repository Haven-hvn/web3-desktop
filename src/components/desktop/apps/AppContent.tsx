import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import type { AppDefinition, AppId } from "../../../config/apps";
import { useHavenKernel } from "../../../context/HavenKernelContext";
import type { WindowInstance } from "../../../hooks/useWindowManager";
import { HAVEN_OS_BRIDGE_CHANNEL } from "../../../kernel/osBridgeHost";
import { ErrorBoundary } from "../../ErrorBoundary";

/**
 * Retries a dynamic chunk import once on transient IPFS/PinMe gateway glitches
 * before letting the window-level ErrorBoundary handle it cleanly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyWithRetry<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await loader();
    } catch (firstError) {
      await new Promise((r) => window.setTimeout(r, 400));
      try {
        return await loader();
      } catch {
        throw firstError;
      }
    }
  });
}

const ExplorerApp = lazyWithRetry(() => import("./ExplorerApp"));
const PlanetVisualizerApp = lazyWithRetry(() => import("./PlanetVisualizerApp"));
const AtlasApp = lazyWithRetry(() => import("./AtlasApp"));
const MicrostoreApp = lazyWithRetry(() => import("./MicrostoreApp"));
const ControlPanelApp = lazyWithRetry(() => import("./ControlPanelApp"));
const WalletApp = lazyWithRetry(() => import("./WalletApp"));
const AboutApp = lazyWithRetry(() => import("./AboutApp"));
const NotepadApp = lazyWithRetry(() => import("./NotepadApp"));
const ShutdownApp = lazyWithRetry(() => import("./ShutdownApp"));
const InstallApp = lazyWithRetry(() => import("./InstallApp"));

const OS_NATIVE_APPS: Partial<Record<AppId, ComponentType<{ window: WindowInstance }>>> = {
  explorer: ExplorerApp,
  planet: PlanetVisualizerApp,
  atlas: AtlasApp,
  microstore: MicrostoreApp,
  settings: ControlPanelApp,
  wallet: WalletApp,
  about: AboutApp,
  notepad: NotepadApp,
  shutdown: ShutdownApp,
  install: InstallApp,
};

interface AppContentProps {
  window: WindowInstance;
  app: AppDefinition;
}

function buildIframeUrl(baseUrl: string, gateKey?: string, entityKey?: string): string {
  if (!gateKey && !entityKey) return baseUrl;
  try {
    const resolved = new URL(baseUrl, window.location.href);
    if (gateKey) resolved.searchParams.set("gateKey", gateKey);
    if (entityKey) resolved.searchParams.set("entityKey", entityKey);
    return resolved.toString();
  } catch {
    return baseUrl;
  }
}

export function AppContent({ window: win, app }: AppContentProps) {
  const { config } = useHavenKernel();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const mountKey = app.id as keyof typeof config.appMounts;
  const mountCfg = mountKey in config.appMounts ? config.appMounts[mountKey] : undefined;
  const isIframe = app.render.kind === "iframe" || Boolean(mountCfg);
  const baseUrl = mountCfg?.url || (app.render.kind === "iframe" ? app.render.url : "");

  // Keep initial iframe src stable so updating launchParams on an already-open window
  // notifies the iframe via postMessage instead of reloading the entire app.
  const initialSrcRef = useRef<string | null>(null);
  const iframeSrc = useMemo(() => {
    if (!isIframe) return "";
    const next = buildIframeUrl(baseUrl, win.launchParams?.gateKey, win.launchParams?.entityKey);
    if (initialSrcRef.current === null || !initialSrcRef.current.startsWith(baseUrl)) {
      initialSrcRef.current = next;
    }
    return initialSrcRef.current;
  }, [isIframe, baseUrl, win.launchParams?.gateKey, win.launchParams?.entityKey]);

  // Forward deep-link changes (e.g. "Open in Fairhaven" from Gate Explorer) to an already-open iframe.
  useEffect(() => {
    if (!isIframe) return;
    const gateKey = win.launchParams?.gateKey;
    const entityKey = win.launchParams?.entityKey;
    if (!gateKey && !entityKey) return;
    const targetWin = iframeRef.current?.contentWindow;
    if (!targetWin) return;
    try {
      const targetOrigin = new URL(baseUrl, window.location.href).origin;
      targetWin.postMessage(
        {
          channel: HAVEN_OS_BRIDGE_CHANNEL,
          kind: "event",
          event: "openEntity",
          data: { gateKey, entityKey },
        },
        targetOrigin,
      );
    } catch {
      // Ignore invalid mount URL
    }
  }, [isIframe, baseUrl, win.launchParams?.gateKey, win.launchParams?.entityKey]);

  if (isIframe) {
    return (
      <div className="app-iframe-wrap">
        <div className="app-iframe-fallback">
          <span>
            {app.glyph} {app.name} — Embedded App (<code className="mono">{baseUrl}</code>)
          </span>
          <a href={baseUrl} target="_blank" rel="noopener noreferrer">
            Open in new tab ↗
          </a>
        </div>
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title={app.name}
          className="app-iframe"
          allow="autoplay; fullscreen; gamepad; clipboard-read; clipboard-write"
        />
      </div>
    );
  }

  const NativeComponent = OS_NATIVE_APPS[app.id];
  if (!NativeComponent) {
    return (
      <div style={{ padding: 20, textAlign: "center" }}>
        <p>App module not found for <code>{app.id}</code>.</p>
      </div>
    );
  }

  return (
    <ErrorBoundary
      key={`${win.id}:${app.id}:${retryKey}`}
      scope={app.name}
      onReset={() => setRetryKey((k) => k + 1)}
    >
      <Suspense fallback={<div style={{ padding: 16 }}>Loading {app.name}…</div>}>
        <NativeComponent window={win} />
      </Suspense>
    </ErrorBoundary>
  );
}
