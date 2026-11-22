import { lazy, Suspense, type ComponentType } from "react";
import type { AppDefinition, AppId } from "../../../config/apps";
import { useHavenKernel } from "../../../context/HavenKernelContext";
import type { WindowInstance } from "../../../hooks/useWindowManager";

const ExplorerApp = lazy(() => import("./ExplorerApp"));
const HavenMediaApp = lazy(() => import("./HavenMediaApp"));
const FairhavenApp = lazy(() => import("./FairhavenApp"));
const RedhavenApp = lazy(() => import("./RedhavenApp"));
const FeetOnFireApp = lazy(() => import("./FeetOnFireApp"));
const PlanetVisualizerApp = lazy(() => import("./PlanetVisualizerApp"));
const AtlasApp = lazy(() => import("./AtlasApp"));
const MicrostoreApp = lazy(() => import("./MicrostoreApp"));
const ControlPanelApp = lazy(() => import("./ControlPanelApp"));
const WalletApp = lazy(() => import("./WalletApp"));
const AboutApp = lazy(() => import("./AboutApp"));
const NotepadApp = lazy(() => import("./NotepadApp"));
const ShutdownApp = lazy(() => import("./ShutdownApp"));
const InstallApp = lazy(() => import("./InstallApp"));

const NATIVE_APPS: Partial<Record<AppId, ComponentType<{ window: WindowInstance }>>> = {
  explorer: ExplorerApp,
  "haven-media": HavenMediaApp,
  fairhaven: FairhavenApp,
  redhaven: RedhavenApp,
  feetonfire: FeetOnFireApp,
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

export function AppContent({ window: win, app }: AppContentProps) {
  const { config } = useHavenKernel();

  // Check if user configured this Haven app to run as an embedded static bundle (iframe)
  const mountKey = app.id as keyof typeof config.appMounts;
  const mountCfg = mountKey in config.appMounts ? config.appMounts[mountKey] : undefined;
  const useIframe =
    app.render.kind === "iframe" ||
    (mountCfg &&
      (win.launchParams?.forceMode === "iframe" ||
        (win.launchParams?.forceMode !== "native" && mountCfg.mode === "iframe")));

  if (useIframe) {
    const url = mountCfg?.url || (app.render.kind === "iframe" ? app.render.url : "");
    return (
      <div className="app-iframe-wrap">
        <div className="app-iframe-fallback">
          <span>
            {app.glyph} {app.name} — Embedded Bundle (<code className="mono">{url}</code>)
          </span>
          <a href={url} target="_blank" rel="noopener noreferrer">
            Open in new tab ↗
          </a>
        </div>
        <iframe
          src={url}
          title={app.name}
          className="app-iframe"
          allow="autoplay; fullscreen; gamepad; clipboard-read; clipboard-write"
        />
      </div>
    );
  }

  const NativeComponent = NATIVE_APPS[app.id];
  if (!NativeComponent) {
    return (
      <div style={{ padding: 20, textAlign: "center" }}>
        <p>App module not found for <code>{app.id}</code>.</p>
      </div>
    );
  }

  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading {app.name}…</div>}>
      <NativeComponent window={win} />
    </Suspense>
  );
}
