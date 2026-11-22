import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { APP_CATALOG } from "../../../config/apps";
import { useDesktop } from "../../../context/DesktopContext";
import { useHavenKernel } from "../../../context/HavenKernelContext";
import type { WindowInstance } from "../../../hooks/useWindowManager";
import { AppContent } from "../apps/AppContent";

interface WindowFrameProps {
  window: WindowInstance;
}

const MIN_WIDTH = 280;
const MIN_HEIGHT = 180;
type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export function WindowFrame({ window: win }: WindowFrameProps) {
  const { windowManager, viewport, isMobile } = useDesktop();
  const { config } = useHavenKernel();
  const { activeWindowId } = windowManager;

  const dragRef = useRef<{
    mode: "move" | ResizeDir;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const isActive = activeWindowId === win.id;

  const startDrag = useCallback(
    (e: ReactPointerEvent, mode: "move" | ResizeDir) => {
      if (win.maximized && mode === "move") return;
      e.preventDefault();
      windowManager.focusWindow(win.id);
      dragRef.current = {
        mode,
        startX: e.clientX,
        startY: e.clientY,
        origX: win.x,
        origY: win.y,
        origW: win.width,
        origH: win.height,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [win, windowManager],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const maxX = viewport.width - 80;
      const maxY = viewport.height - 60;

      if (drag.mode === "move") {
        windowManager.moveWindow(
          win.id,
          Math.min(Math.max(drag.origX + dx, -win.width + 80), maxX),
          Math.min(Math.max(drag.origY + dy, 0), maxY),
        );
        return;
      }

      let { origX: x, origY: y, origW: width, origH: height } = drag;
      if (drag.mode.includes("e")) width = Math.max(drag.origW + dx, MIN_WIDTH);
      if (drag.mode.includes("s")) height = Math.max(drag.origH + dy, MIN_HEIGHT);
      if (drag.mode.includes("w")) {
        width = Math.max(drag.origW - dx, MIN_WIDTH);
        x = drag.origX + (drag.origW - width);
      }
      if (drag.mode.includes("n")) {
        height = Math.max(drag.origH - dy, MIN_HEIGHT);
        y = drag.origY + (drag.origH - height);
      }
      windowManager.resizeWindow(win.id, { x, y, width, height });
    },
    [win, viewport, windowManager],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
    };
  }, [onPointerMove, endDrag]);

  const app = APP_CATALOG[win.appId];
  const fullscreen = isMobile || win.maximized;
  const geometry = fullscreen
    ? { left: 0, top: 0, width: "100%", height: "100%" }
    : { left: win.x, top: win.y, width: win.width, height: win.height };

  return (
    <div
      className="w98-window window-frame"
      style={{ ...geometry, zIndex: win.zIndex }}
      onPointerDown={() => windowManager.focusWindow(win.id)}
      role="article"
      aria-label={win.title}
    >
      <div
        className={`w98-title-bar ${
          isActive ? "w98-title-bar-active" : "w98-title-bar-inactive"
        }`}
        onPointerDown={(e) => startDrag(e, "move")}
        onDoubleClick={() => windowManager.toggleMaximize(win.id)}
      >
        <span className="w98-title-bar-text">
          <span aria-hidden="true">{app.glyph}</span>
          <span>{win.title}</span>
        </span>
        <span className="w98-title-bar-controls">
          <button
            type="button"
            className="w98-title-button"
            aria-label="Minimize"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => windowManager.minimizeWindow(win.id)}
          >
            <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="1" y="7" width="7" height="2" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className="w98-title-button"
            aria-label="Maximize"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => windowManager.toggleMaximize(win.id)}
          >
            <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" />
              <rect x="1" y="1" width="8" height="2" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className="w98-title-button"
            aria-label="Close"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => windowManager.closeWindow(win.id)}
          >
            <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </span>
      </div>

      <div className="w98-window-body window-body">
        <AppContent window={win} app={app} />
      </div>

      {config.showDebugOverlay && (
        <div className="window-debug-overlay" aria-hidden="true">
          <span>{win.appId}</span>
          <span>z:{win.zIndex}</span>
          {!fullscreen && (
            <span>
              {Math.round(win.x)},{Math.round(win.y)} {Math.round(win.width)}×
              {Math.round(win.height)}
            </span>
          )}
        </div>
      )}

      {!fullscreen &&
        (["n", "s", "e", "w", "ne", "nw", "se", "sw"] as ResizeDir[]).map((dir) => (
          <div
            key={dir}
            className={`resize-handle resize-${dir}`}
            onPointerDown={(e) => startDrag(e, dir)}
          />
        ))}
    </div>
  );
}
