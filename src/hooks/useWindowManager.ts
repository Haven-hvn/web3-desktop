import { useCallback, useMemo, useReducer } from "react";
import { APP_CATALOG, type AppDefinition, type AppId } from "../config/apps";

export interface WindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowLaunchParams {
  gateKey?: string;
  entityKey?: string;
  tab?: string;
  forceMode?: "native" | "iframe";
}

export interface WindowInstance extends WindowGeometry {
  id: string;
  appId: AppId;
  title: string;
  minimized: boolean;
  maximized: boolean;
  zIndex: number;
  restore?: WindowGeometry;
  installTarget?: AppId;
  launchParams?: WindowLaunchParams;
}

interface WindowManagerState {
  windows: WindowInstance[];
  activeWindowId: string | null;
  zCounter: number;
}

type WindowManagerAction =
  | {
      type: "open";
      appId: AppId;
      id: string;
      geometry: WindowGeometry;
      installTarget?: AppId;
      launchParams?: WindowLaunchParams;
      titleOverride?: string;
    }
  | { type: "close"; id: string }
  | { type: "focus"; id: string }
  | { type: "minimize"; id: string }
  | { type: "restore"; id: string }
  | { type: "toggleMaximize"; id: string; viewport: { width: number; height: number } }
  | { type: "move"; id: string; x: number; y: number }
  | { type: "resize"; id: string; geometry: WindowGeometry }
  | { type: "setTitle"; id: string; title: string }
  | { type: "updateParams"; id: string; launchParams: WindowLaunchParams };

function isMinimized(state: WindowManagerState, id: string): boolean {
  return state.windows.some((w) => w.id === id && w.minimized);
}

function topmostVisible(windows: WindowInstance[]): string | null {
  const visible = windows.filter((w) => !w.minimized).sort((a, b) => b.zIndex - a.zIndex);
  return visible[0]?.id ?? null;
}

function reducer(state: WindowManagerState, action: WindowManagerAction): WindowManagerState {
  switch (action.type) {
    case "open": {
      const app = APP_CATALOG[action.appId];
      const zIndex = state.zCounter + 1;
      const win: WindowInstance = {
        id: action.id,
        appId: action.appId,
        title: action.titleOverride ?? app.windowTitle ?? app.name,
        ...action.geometry,
        minimized: false,
        maximized: false,
        zIndex,
        installTarget: action.installTarget,
        launchParams: action.launchParams,
      };
      return {
        ...state,
        windows: [...state.windows, win],
        activeWindowId: action.id,
        zCounter: zIndex,
      };
    }
    case "close": {
      const windows = state.windows.filter((w) => w.id !== action.id);
      const active =
        state.activeWindowId === action.id ? topmostVisible(windows) : state.activeWindowId;
      return { ...state, windows, activeWindowId: active };
    }
    case "focus": {
      if (state.activeWindowId === action.id && !isMinimized(state, action.id)) return state;
      const zIndex = state.zCounter + 1;
      return {
        ...state,
        windows: state.windows.map((w) =>
          w.id === action.id ? { ...w, zIndex, minimized: false } : w,
        ),
        activeWindowId: action.id,
        zCounter: zIndex,
      };
    }
    case "minimize": {
      const windows = state.windows.map((w) =>
        w.id === action.id ? { ...w, minimized: true } : w,
      );
      const active =
        state.activeWindowId === action.id ? topmostVisible(windows) : state.activeWindowId;
      return { ...state, windows, activeWindowId: active };
    }
    case "restore": {
      const zIndex = state.zCounter + 1;
      return {
        ...state,
        windows: state.windows.map((w) =>
          w.id === action.id ? { ...w, minimized: false, zIndex } : w,
        ),
        activeWindowId: action.id,
        zCounter: zIndex,
      };
    }
    case "toggleMaximize": {
      const zIndex = state.zCounter + 1;
      const windows = state.windows.map((w) => {
        if (w.id !== action.id) return w;
        if (w.maximized) {
          const r = w.restore ?? { x: 80, y: 50, width: 760, height: 500 };
          return { ...w, ...r, maximized: false, restore: undefined, zIndex };
        }
        return {
          ...w,
          restore: { x: w.x, y: w.y, width: w.width, height: w.height },
          x: 0,
          y: 0,
          width: action.viewport.width,
          height: action.viewport.height,
          maximized: true,
          zIndex,
        };
      });
      return { ...state, windows, activeWindowId: action.id, zCounter: zIndex };
    }
    case "move":
      return {
        ...state,
        windows: state.windows.map((w) =>
          w.id === action.id ? { ...w, x: action.x, y: action.y } : w,
        ),
      };
    case "resize":
      return {
        ...state,
        windows: state.windows.map((w) =>
          w.id === action.id ? { ...w, ...action.geometry } : w,
        ),
      };
    case "setTitle":
      return {
        ...state,
        windows: state.windows.map((w) =>
          w.id === action.id ? { ...w, title: action.title } : w,
        ),
      };
    case "updateParams": {
      const zIndex = state.zCounter + 1;
      return {
        ...state,
        windows: state.windows.map((w) =>
          w.id === action.id
            ? { ...w, launchParams: action.launchParams, minimized: false, zIndex }
            : w,
        ),
        activeWindowId: action.id,
        zCounter: zIndex,
      };
    }
  }
}

export interface OpenAppOptions {
  centered?: boolean;
  force?: boolean;
  launchParams?: WindowLaunchParams;
  /** If true, always spawn a new window instance (great for side-by-side Fairhaven vs Redhaven!). */
  newInstance?: boolean;
  /** Optional explicit geometry (e.g. for tiling side-by-side demos). */
  geometry?: Partial<WindowGeometry>;
}

export function useWindowManager(
  viewport: { width: number; height: number },
  installedIds?: Set<string>,
) {
  const [state, dispatch] = useReducer(reducer, {
    windows: [],
    activeWindowId: null,
    zCounter: 10,
  });

  const openApp = useCallback(
    (appId: AppId, options: OpenAppOptions = {}) => {
      const app = APP_CATALOG[appId];
      if (!app) return;

      if (
        !options.force &&
        installedIds &&
        app.category !== "System" &&
        !installedIds.has(appId)
      ) {
        const dialogId = `install-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        dispatch({
          type: "open",
          appId: "install",
          id: dialogId,
          installTarget: appId,
          geometry: {
            x: Math.max(0, (viewport.width - 420) / 2),
            y: Math.max(0, (viewport.height - 230) / 2 - 20),
            width: Math.min(420, viewport.width - 16),
            height: Math.min(230, viewport.height - 16),
          },
        });
        return;
      }

      if (app.render.kind === "link") {
        window.open(app.render.url, "_blank", "noopener,noreferrer");
        return;
      }

      // If an instance of this app already exists and caller didn't request a new one,
      // focus it and update launchParams (e.g. clicking "Open in Fairhaven" from Gate Explorer).
      if (!options.newInstance) {
        const existing = state.windows.find((w) => w.appId === appId);
        if (existing) {
          if (options.launchParams) {
            dispatch({ type: "updateParams", id: existing.id, launchParams: options.launchParams });
          } else {
            dispatch({ type: "focus", id: existing.id });
          }
          return;
        }
      }

      const id = `${appId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const count = state.windows.length;
      const w = Math.min(options.geometry?.width ?? app.width, Math.max(280, viewport.width - 24));
      const h = Math.min(options.geometry?.height ?? app.height, Math.max(220, viewport.height - 64));

      const geometry: WindowGeometry = {
        x:
          options.geometry?.x ??
          (options.centered
            ? Math.max(8, (viewport.width - w) / 2)
            : Math.min(Math.max(96, 110 + (count % 6) * 28), Math.max(8, viewport.width - w - 12))),
        y:
          options.geometry?.y ??
          (options.centered
            ? Math.max(8, (viewport.height - h) / 2 - 20)
            : Math.min(20 + (count % 6) * 26, Math.max(8, viewport.height - h - 48))),
        width: w,
        height: h,
      };

      dispatch({
        type: "open",
        appId,
        id,
        geometry,
        launchParams: options.launchParams,
      });
    },
    [state.windows, viewport.width, viewport.height, installedIds],
  );

  const openSideBySide = useCallback(
    (leftAppId: AppId, rightAppId: AppId, launchParams?: WindowLaunchParams) => {
      const availW = Math.max(600, viewport.width - 24);
      const availH = Math.max(360, viewport.height - 64);
      const halfW = Math.floor((availW - 12) / 2);

      openApp(leftAppId, {
        force: true,
        newInstance: true,
        launchParams,
        geometry: { x: 10, y: 12, width: halfW, height: availH },
      });
      openApp(rightAppId, {
        force: true,
        newInstance: true,
        launchParams,
        geometry: { x: halfW + 18, y: 12, width: halfW, height: availH },
      });
    },
    [openApp, viewport.width, viewport.height],
  );

  return useMemo(
    () => ({
      windows: state.windows,
      activeWindowId: state.activeWindowId,
      openApp,
      openSideBySide,
      closeWindow: (id: string) => dispatch({ type: "close", id }),
      focusWindow: (id: string) => dispatch({ type: "focus", id }),
      minimizeWindow: (id: string) => dispatch({ type: "minimize", id }),
      restoreWindow: (id: string) => dispatch({ type: "restore", id }),
      toggleMaximize: (id: string) => dispatch({ type: "toggleMaximize", id, viewport }),
      moveWindow: (id: string, x: number, y: number) => dispatch({ type: "move", id, x, y }),
      resizeWindow: (id: string, geometry: WindowGeometry) =>
        dispatch({ type: "resize", id, geometry }),
      setWindowTitle: (id: string, title: string) => dispatch({ type: "setTitle", id, title }),
    }),
    [state, openApp, openSideBySide, viewport],
  );
}

export type WindowManager = ReturnType<typeof useWindowManager>;
export type { AppDefinition };
