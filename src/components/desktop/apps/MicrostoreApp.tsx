import { useMemo, useState } from "react";
import { APP_CATALOG, START_MENU_CATEGORIES, type AppCategory } from "../../../config/apps";
import { useDesktop } from "../../../context/DesktopContext";

const CATEGORIES: (AppCategory | "All")[] = ["All", ...START_MENU_CATEGORIES];

export default function MicrostoreApp() {
  const [category, setCategory] = useState<AppCategory | "All">("All");
  const [query, setQuery] = useState("");
  const { installedIds, installApp, uninstallApp, windowManager } = useDesktop();

  const results = useMemo(() => {
    const all = Object.values(APP_CATALOG).filter((app) => app.category !== "System");
    return all.filter(
      (app) =>
        (category === "All" || app.category === category) &&
        (app.name.toLowerCase().includes(query.toLowerCase()) ||
          app.description.toLowerCase().includes(query.toLowerCase()) ||
          (app.handles?.some((h) => h.toLowerCase().includes(query.toLowerCase())) ?? false)),
    );
  }, [category, query]);

  return (
    <div className="app-shell">
      <div className="app-header-bar">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`w98-button w98-button-sm ${category === c ? "w98-button-primary" : ""}`}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
        <input
          type="search"
          className="w98-field"
          style={{ marginLeft: "auto", minWidth: 160 }}
          placeholder="Search apps or MIME…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="app-main" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="w98-panel" style={{ padding: 8, fontSize: 11 }}>
          <strong>Awesome Haven — Many UIs Around One CID:</strong> Install any Haven client onto
          your desktop. Built apps launch natively inside Haven OS; proposed ecosystem clients open
          their incubator spec.
        </div>

        {results.map((app) => {
          const installed = installedIds.has(app.id);
          return (
            <div
              key={app.id}
              className="w98-panel"
              style={{
                padding: 8,
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "var(--theme-surface)",
              }}
            >
              <span style={{ fontSize: 24, width: 32, textAlign: "center" }}>{app.glyph}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <strong>{app.name}</strong>
                  <span className="badge">{app.category}</span>
                  {app.status === "built" ? (
                    <span className="badge badge-ok">BUILT</span>
                  ) : (
                    <span className="badge badge-warn">PROPOSED</span>
                  )}
                </div>
                <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{app.description}</div>
                {app.handles && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                    {app.handles.map((h) => (
                      <span key={h} className="badge mono">
                        {h}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 4, flex: "none" }}>
                {installed && (
                  <button
                    type="button"
                    className="w98-button w98-button-sm w98-button-primary"
                    onClick={() => windowManager.openApp(app.id)}
                  >
                    Open
                  </button>
                )}
                <button
                  type="button"
                  className="w98-button w98-button-sm"
                  onClick={() => (installed ? uninstallApp(app.id) : installApp(app.id))}
                >
                  {installed ? "Uninstall" : "Install"}
                </button>
              </div>
            </div>
          );
        })}

        {results.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", opacity: 0.7 }}>
            No Haven apps match your filter.
          </div>
        )}
      </div>

      <div className="app-statusbar">
        <span>{results.length} catalog item(s) seeded from awesome-haven</span>
        <span>{installedIds.size} installed on Desktop</span>
      </div>
    </div>
  );
}
