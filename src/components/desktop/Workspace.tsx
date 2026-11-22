import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppDefinition, AppId } from "../../config/apps";
import { useDesktop } from "../../context/DesktopContext";
import { useHavenKernel } from "../../context/HavenKernelContext";
import { currentEpochNow } from "../../kernel/protocol";
import { DesktopIcons } from "./DesktopIcons";
import { ClippyAssistant } from "./clippy/ClippyAssistant";
import { StartMenu } from "./startmenu/StartMenu";
import { Taskbar } from "./taskbar/Taskbar";
import { WindowLayer } from "./windowmanager/WindowLayer";

export function Workspace() {
  const { apps, windowManager, setPhase, isInstalled, viewport } = useDesktop();
  const { config, arkivProbe, entities, gates, unlockedKeys } = useHavenKernel();
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const [clippyVisible, setClippyVisible] = useState(() => config.clippyEnabled);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null,
  );
  const workspaceRef = useRef<HTMLDivElement>(null);
  const didAutoOpen = useRef(false);

  // Auto-open the "Apps Over Data" visualizer once on initial workspace load
  useEffect(() => {
    if (!didAutoOpen.current) {
      didAutoOpen.current = true;
      windowManager.openApp("planet", { centered: true });
    }
  }, [windowManager]);

  const rowsPerColumn = Math.max(4, Math.floor((viewport.height - 64) / 86));

  const desktopApps = useMemo(
    () => apps.filter((app) => isInstalled(app.id) && app.category !== "System"),
    [apps, isInstalled],
  );

  const closeStartMenu = useCallback(() => setStartMenuOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeStartMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeStartMenu]);

  const onDesktopPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (
      e.target === workspaceRef.current ||
      (e.target as HTMLElement).dataset.desktop === "true"
    ) {
      setSelection(new Set());
      closeStartMenu();
      const rect = workspaceRef.current?.getBoundingClientRect();
      if (rect) {
        setMarquee({
          x1: e.clientX - rect.left,
          y1: e.clientY - rect.top,
          x2: e.clientX - rect.left,
          y2: e.clientY - rect.top,
        });
      }
    }
  };

  const onDesktopPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!marquee) return;
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (rect) {
      setMarquee((m) =>
        m ? { ...m, x2: e.clientX - rect.left, y2: e.clientY - rect.top } : m,
      );
    }
  };

  const onDesktopPointerUp = () => {
    if (!marquee) return;
    const box = {
      left: Math.min(marquee.x1, marquee.x2),
      right: Math.max(marquee.x1, marquee.x2),
      top: Math.min(marquee.y1, marquee.y2),
      bottom: Math.max(marquee.y1, marquee.y2),
    };
    const hits = new Set<string>();
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (rect) {
      document.querySelectorAll<HTMLElement>("[data-icon-id]").forEach((el) => {
        const r = el.getBoundingClientRect();
        const x = r.left - rect.left;
        const y = r.top - rect.top;
        if (x < box.right && x + r.width > box.left && y < box.bottom && y + r.height > box.top) {
          hits.add(el.dataset.iconId as string);
        }
      });
    }
    setSelection(hits);
    setMarquee(null);
  };

  const toggleSelected = (id: string, additive: boolean) => {
    setSelection((current) => {
      if (additive) {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }
      return new Set([id]);
    });
  };

  return (
    <div className="workspace-layout">
      <div className="workspace-desktop-area">
        <div
          ref={workspaceRef}
          className="workspace-desktop"
          data-desktop="true"
          onPointerDown={onDesktopPointerDown}
          onPointerMove={onDesktopPointerMove}
          onPointerUp={onDesktopPointerUp}
        >
          <DesktopIcons
            apps={desktopApps}
            columns={rowsPerColumn}
            selection={selection}
            onToggleSelect={toggleSelected}
            onOpen={(app: AppDefinition) => {
              closeStartMenu();
              windowManager.openApp(app.id);
            }}
          />

          <div className="desktop-watermark mono" aria-hidden="true">
            <strong>HAVEN OS 98 · L7 APPS OVER DATA</strong>
            <div>
              Arkiv ({config.arkivNetworkName}):{" "}
              {arkivProbe?.online ? `ONLINE #${arkivProbe.blockNumber?.toLocaleString()}` : "PROBING…"}
            </div>
            <div>
              {entities.length} Haven Entities · {gates.length} Token Gates · VetKD Epoch #
              {currentEpochNow()} ({unlockedKeys.length} keys unlocked)
            </div>
          </div>

          {marquee && (
            <div
              className="marquee-rectangle"
              style={{
                left: Math.min(marquee.x1, marquee.x2),
                top: Math.min(marquee.y1, marquee.y2),
                width: Math.abs(marquee.x2 - marquee.x1),
                height: Math.abs(marquee.y2 - marquee.y1),
              }}
            />
          )}

          <WindowLayer />
        </div>
      </div>

      <ClippyAssistant
        visible={clippyVisible}
        onHide={() => setClippyVisible(false)}
      />

      <Taskbar
        startMenuOpen={startMenuOpen}
        onToggleStartMenu={() => setStartMenuOpen((v) => !v)}
        onOpenApp={(id: AppId) => {
          closeStartMenu();
          windowManager.openApp(id);
        }}
        clippyVisible={clippyVisible}
        onToggleClippy={() => setClippyVisible((v) => !v)}
        onShutdown={() => setPhase("shutdown")}
      />

      {startMenuOpen && <StartMenu onClose={closeStartMenu} />}
    </div>
  );
}
