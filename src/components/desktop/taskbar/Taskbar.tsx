import { useEffect, useState } from "react";
import { APP_CATALOG, type AppId } from "../../../config/apps";
import { useDesktop } from "../../../context/DesktopContext";
import { useHavenKernel } from "../../../context/HavenKernelContext";
import { useTheme } from "../../../context/ThemeProvider";
import { shortAddress } from "../../../kernel/protocol";

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  return now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

interface TaskbarProps {
  startMenuOpen: boolean;
  onToggleStartMenu: () => void;
  onOpenApp: (id: AppId) => void;
  clippyVisible: boolean;
  onToggleClippy: () => void;
  onShutdown: () => void;
}

export function Taskbar({
  startMenuOpen,
  onToggleStartMenu,
  onOpenApp,
  clippyVisible,
  onToggleClippy,
  onShutdown,
}: TaskbarProps) {
  const { windowManager, isMobile } = useDesktop();
  const { arkivProbe, wallet, unlockedKeys, config } = useHavenKernel();
  const { cycleTheme, theme } = useTheme();
  const clock = useClock();

  const pinned = Object.values(APP_CATALOG).filter((app) => app.pinned);

  return (
    <div className="w98-toolbar taskbar">
      <button
        type="button"
        className="w98-toolbar-button start-button"
        aria-label="Start Menu"
        aria-pressed={startMenuOpen}
        onClick={onToggleStartMenu}
      >
        <span aria-hidden="true">🪐</span>
        <span>Start</span>
      </button>

      <div className="taskbar-divider" aria-hidden="true" />

      <div className="taskbar-quicklaunch">
        {pinned.map((app) => (
          <button
            key={app.id}
            type="button"
            className="w98-toolbar-icon"
            title={app.name}
            aria-label={app.name}
            onClick={() => onOpenApp(app.id)}
          >
            <span aria-hidden="true">{app.glyph}</span>
          </button>
        ))}
      </div>

      <div className="taskbar-divider" aria-hidden="true" />

      <div className="taskbar-tasks" role="tablist" aria-label="Open windows">
        {windowManager.windows.map((win) => (
          <button
            key={win.id}
            type="button"
            role="tab"
            className="w98-toolbar-button task-button"
            data-active={windowManager.activeWindowId === win.id && !win.minimized}
            title={win.title}
            onClick={() =>
              win.minimized || windowManager.activeWindowId !== win.id
                ? windowManager.restoreWindow(win.id)
                : windowManager.minimizeWindow(win.id)
            }
          >
            <span aria-hidden="true">{APP_CATALOG[win.appId].glyph}</span>
            {!isMobile && <span className="task-button-label">{win.title}</span>}
          </button>
        ))}
      </div>

      <div className="w98-tray tray">
        <button
          type="button"
          className="tray-button"
          title={`Arkiv (${config.arkivNetworkName}): ${arkivProbe?.online ? `Online (${arkivProbe.rttMs}ms)` : "Offline / Probing"} — Open Haven Atlas`}
          onClick={() => onOpenApp("atlas")}
        >
          <span>{arkivProbe?.online ? "🟢" : "🟡"}</span>
          {!isMobile && <span className="mono">{config.arkivNetworkName}</span>}
        </button>

        <button
          type="button"
          className="tray-button"
          title={`Wallet & VetKD Keyring (${unlockedKeys.length} unlocked gates)`}
          onClick={() => onOpenApp("wallet")}
        >
          <span>🔑</span>
          {!isMobile && (
            <span className="mono">
              {wallet.address ? shortAddress(wallet.address) : "Guest"}
              {unlockedKeys.length > 0 ? ` (${unlockedKeys.length})` : ""}
            </span>
          )}
        </button>

        <button
          type="button"
          className="tray-button"
          title={clippyVisible ? "Hide Clippy Assistant" : "Show Clippy Assistant"}
          aria-label="Toggle Clippy Assistant"
          aria-pressed={clippyVisible}
          onClick={onToggleClippy}
        >
          📎
        </button>

        <button
          type="button"
          className="tray-button"
          title="Control Panel / System Settings"
          onClick={() => onOpenApp("settings")}
        >
          ⚙️
        </button>

        <button
          type="button"
          className="tray-button"
          title={`Switch Theme (Current: ${theme.name})`}
          onClick={cycleTheme}
        >
          🎨
        </button>

        <button
          type="button"
          className="tray-button"
          title="Shut Down"
          aria-label="Shut Down"
          onClick={onShutdown}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
            style={{ display: "block" }}
          >
            <line x1="8" y1="2" x2="8" y2="8" />
            <path d="M4.2 4.6a5.2 5.2 0 1 0 7.6 0" />
          </svg>
        </button>

        <time className="mono">{clock}</time>
      </div>
    </div>
  );
}
