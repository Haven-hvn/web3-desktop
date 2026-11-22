import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { APP_CATALOG, type AppDefinition, type AppId } from "../config/apps";
import {
  useWindowManager,
  type WindowLaunchParams,
  type WindowManager,
} from "../hooks/useWindowManager";
import { useHavenKernel } from "./HavenKernelContext";

export type BootPhase = "boot-menu" | "splash" | "login" | "workspace" | "shutdown" | "bsod";

interface DesktopContextValue {
  phase: BootPhase;
  setPhase: (phase: BootPhase) => void;
  apps: AppDefinition[];
  installedIds: Set<string>;
  isInstalled: (appId: string) => boolean;
  installApp: (appId: AppId) => void;
  uninstallApp: (appId: AppId) => void;
  windowManager: WindowManager;
  openWith: (appId: AppId, params: WindowLaunchParams) => void;
  viewport: { width: number; height: number };
  isMobile: boolean;
}

const INSTALLED_STORAGE_KEY = "haven-os:installed-apps:v1";
const DesktopContext = createContext<DesktopContextValue | null>(null);

function useViewport() {
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return viewport;
}

export function DesktopProvider({ children }: { children: ReactNode }) {
  const { config, wallet, entities } = useHavenKernel();
  const [phase, setPhase] = useState<BootPhase>(() =>
    config.skipBootScreen ? "workspace" : "boot-menu",
  );

  const [installedIds, setInstalledIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(INSTALLED_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) return new Set(parsed);
      }
    } catch {
      // ignore
    }
    return new Set(
      Object.values(APP_CATALOG)
        .filter((a) => a.installed)
        .map((a) => a.id),
    );
  });

  const viewport = useViewport();
  const windowManager = useWindowManager(viewport, installedIds);

  const persistInstalled = (next: Set<string>) => {
    try {
      localStorage.setItem(INSTALLED_STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // ignore
    }
  };

  const installApp = useCallback((appId: AppId) => {
    setInstalledIds((curr) => {
      const next = new Set(curr);
      next.add(appId);
      persistInstalled(next);
      return next;
    });
  }, []);

  const uninstallApp = useCallback((appId: AppId) => {
    setInstalledIds((curr) => {
      const next = new Set(curr);
      next.delete(appId);
      persistInstalled(next);
      return next;
    });
  }, []);

  const isInstalled = useCallback((appId: string) => installedIds.has(appId), [installedIds]);

  const openWith = useCallback(
    (appId: AppId, params: WindowLaunchParams) => {
      windowManager.openApp(appId, { force: true, launchParams: params });
    },
    [windowManager],
  );

  // Listen to same-origin / iframe OS bridge messages
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data as { type?: string; appId?: AppId; params?: WindowLaunchParams } | null;
      if (!data || typeof data !== "object") return;
      if (data.type === "HAVEN_OS_GET_CONTEXT" && ev.source && "postMessage" in ev.source) {
        (ev.source as Window).postMessage(
          {
            type: "HAVEN_OS_CONTEXT",
            payload: {
              arkivRpcUrl: config.arkivRpcUrl,
              havenAolCanisterId: config.havenAolCanisterId,
              walletAddress: wallet.address,
              entityCount: entities.length,
            },
          },
          "*",
        );
      } else if (data.type === "HAVEN_OS_OPEN_APP" && data.appId && data.appId in APP_CATALOG) {
        openWith(data.appId, data.params ?? {});
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [config.arkivRpcUrl, config.havenAolCanisterId, wallet.address, entities.length, openWith]);

  const apps = useMemo(
    () =>
      Object.values(APP_CATALOG).filter(
        (app) => app.category !== "System" || installedIds.has(app.id),
      ),
    [installedIds],
  );

  const value = useMemo<DesktopContextValue>(
    () => ({
      phase,
      setPhase,
      apps,
      installedIds,
      isInstalled,
      installApp,
      uninstallApp,
      windowManager,
      openWith,
      viewport,
      isMobile: viewport.width < 640,
    }),
    [
      phase,
      apps,
      installedIds,
      isInstalled,
      installApp,
      uninstallApp,
      windowManager,
      openWith,
      viewport,
    ],
  );

  return <DesktopContext.Provider value={value}>{children}</DesktopContext.Provider>;
}

export function useDesktop(): DesktopContextValue {
  const ctx = useContext(DesktopContext);
  if (!ctx) throw new Error("useDesktop must be used within DesktopProvider");
  return ctx;
}
