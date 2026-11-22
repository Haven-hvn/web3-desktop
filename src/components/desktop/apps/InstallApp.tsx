import { APP_CATALOG } from "../../../config/apps";
import { useDesktop } from "../../../context/DesktopContext";
import type { WindowInstance } from "../../../hooks/useWindowManager";

export default function InstallApp({ window: win }: { window: WindowInstance }) {
  const { installApp, windowManager } = useDesktop();
  const target = win.installTarget ? APP_CATALOG[win.installTarget] : null;
  if (!target) return null;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 16,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 34 }}>{target.glyph}</div>
      <div>
        <strong>Install {target.name}?</strong>
        <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>{target.description}</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="w98-button w98-button-primary"
          onClick={() => {
            installApp(target.id);
            windowManager.closeWindow(win.id);
            windowManager.openApp(target.id, { force: true });
          }}
        >
          Install &amp; Open
        </button>
        <button
          type="button"
          className="w98-button"
          onClick={() => windowManager.closeWindow(win.id)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
