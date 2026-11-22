import { useEffect, useMemo, useState } from "react";
import { useDesktop } from "../../../context/DesktopContext";
import { useHavenKernel } from "../../../context/HavenKernelContext";
import type { WindowInstance } from "../../../hooks/useWindowManager";
import { CHAINS, formatBytes, shortAddress, shortKey } from "../../../kernel/protocol";

export default function FeetOnFireApp({ window: win }: { window: WindowInstance }) {
  const { openWith } = useDesktop();
  const { config, entities, loadingUniverse, refreshUniverse, findUnlockedKey, unlockGate } =
    useHavenKernel();

  const [tab, setTab] = useState<"packs" | "play">(
    win.launchParams?.tab === "play" ? "play" : "packs",
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(
    win.launchParams?.entityKey ?? null,
  );
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [bundleAvailable, setBundleAvailable] = useState<boolean | null>(null);

  const mountUrl = config.appMounts.feetonfire.url;

  useEffect(() => {
    // External cross-origin URLs (e.g. https://feetonfire.pinme.dev/) cannot be
    // pre-fetched due to CORS, so mount them directly in the iframe.
    try {
      const resolved = new URL(mountUrl, window.location.href);
      if (resolved.origin !== window.location.origin) {
        setBundleAvailable(true);
        return;
      }
    } catch {
      // fall through to same-origin probe
    }
    fetch(mountUrl)
      .then(async (res) => {
        if (!res.ok) return setBundleAvailable(false);
        const text = await res.text();
        // Guard against SPA history fallback returning Haven OS's own index.html (prevent Windows-in-Windows!)
        setBundleAvailable(!text.includes("<title>Haven OS 98"));
      })
      .catch(() => setBundleAvailable(false));
  }, [mountUrl]);

  const dancePacks = useMemo(
    () =>
      entities.filter(
        (e) =>
          Boolean(e.dance) ||
          e.grp === "haven.file.full",
      ),
    [entities],
  );

  const selected = dancePacks.find((p) => p.key === selectedKey) ?? dancePacks[0] ?? null;

  const handleUnlock = async () => {
    if (!selected?.gate) return;
    setStatusMsg("Unlocking FeetOnFire pack gate via Haven-AOL v3 VetKD…");
    try {
      await unlockGate(selected.gate, selected.gate.epoch);
      setStatusMsg("Pack gate unlocked in OS Keyring!");
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="app-shell">
      <div className="app-header-bar">
        <strong>🔥 FeetOnFire (StepMania / DDR)</strong>
        <button
          type="button"
          className={`w98-button w98-button-sm ${tab === "packs" ? "w98-button-primary" : ""}`}
          onClick={() => setTab("packs")}
        >
          📦 Arkiv Dance Packs ({dancePacks.length})
        </button>
        <button
          type="button"
          className={`w98-button w98-button-sm ${tab === "play" ? "w98-button-primary" : ""}`}
          onClick={() => setTab("play")}
        >
          🕹️ Launch Rhythm Game
        </button>
        <button
          type="button"
          className="w98-button w98-button-sm"
          style={{ marginLeft: "auto" }}
          disabled={loadingUniverse}
          onClick={() => void refreshUniverse()}
        >
          🔄 Refresh Packs
        </button>
      </div>

      {tab === "play" ? (
        <div className="app-iframe-wrap">
          <div className="app-iframe-fallback">
            <span>
              Running StepMania engine from <code className="mono">{mountUrl}</code> (arrows / DFJK
              keys)
            </span>
            <a href={mountUrl} target="_blank" rel="noopener noreferrer">
              Open Fullscreen Tab ↗
            </a>
          </div>
          {bundleAvailable === false ? (
            <div className="app-main" style={{ padding: 20 }}>
              <div className="w98-panel" style={{ padding: 14 }}>
                <strong>FeetOnFire game bundle not mounted at {mountUrl}</strong>
                <p style={{ fontSize: 12 }}>
                  Build <code>FeetOnFire-main</code> into{" "}
                  <code>haven-desktop/public/apps/feetonfire/</code> or set a custom URL in{" "}
                  <strong>Control Panel → App Mounts</strong>.
                </p>
              </div>
            </div>
          ) : (
            <iframe
              src={mountUrl}
              title="FeetOnFire Rhythm Game"
              className="app-iframe"
              allow="autoplay; fullscreen; gamepad"
            />
          )}
        </div>
      ) : (
        <div className="app-split">
          <aside className="app-sidebar">
            <div className="sidebar-section-title">`haven.file.full` Packs</div>
            {dancePacks.map((pack) => (
              <button
                key={pack.key}
                type="button"
                className="sidebar-item"
                data-active={selected?.key === pack.key}
                onClick={() => setSelectedKey(pack.key)}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pack.dance ? "🕺" : "📦"} {pack.dance?.packName ?? pack.title}
                </span>
                <span className="badge mono">
                  {pack.dance?.isSample || !pack.gate ? "FREE" : "GATE"}
                </span>
              </button>
            ))}
            {dancePacks.length === 0 && (
              <div style={{ padding: 10, fontSize: 11, opacity: 0.7 }}>
                No `haven.file.full` dance packs found on {config.arkivNetworkName}.
              </div>
            )}
          </aside>

          <div className="app-main">
            {statusMsg && (
              <div className="w98-panel" style={{ padding: 6, marginBottom: 8, fontSize: 11 }}>
                ℹ {statusMsg}
              </div>
            )}

            {selected ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="w98-panel" style={{ padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <h3 style={{ margin: 0 }}>{selected.dance?.packName ?? selected.title}</h3>
                      <div className="mono" style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
                        entity {shortKey(selected.key)} · {formatBytes(selected.media?.size)} ·{" "}
                        {selected.gate
                          ? `${CHAINS[selected.gate.chainId]?.name ?? selected.gate.chainId} ${shortAddress(selected.gate.tokenAddress)} ≥ ${selected.gate.threshold}`
                          : "Clear Sample Pack"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="w98-button w98-button-primary"
                        onClick={() => setTab("play")}
                      >
                        🕹️ Play in FeetOnFire
                      </button>
                      {selected.gate && !findUnlockedKey(selected.gate) && (
                        <button type="button" className="w98-button" onClick={() => void handleUnlock()}>
                          🔑 Unlock Pack Gate
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="w98-button w98-button-sm"
                      onClick={() =>
                        openWith("fairhaven", { gateKey: selected.gateKey, entityKey: selected.key })
                      }
                    >
                      🍀 Discuss Pack on Fairhaven
                    </button>
                    <button
                      type="button"
                      className="w98-button w98-button-sm"
                      onClick={() =>
                        openWith("redhaven", { gateKey: selected.gateKey, entityKey: selected.key })
                      }
                    >
                      👽 View Pack on Redhaven
                    </button>
                    <button
                      type="button"
                      className="w98-button w98-button-sm"
                      onClick={() =>
                        openWith("explorer", { gateKey: selected.gateKey, entityKey: selected.key })
                      }
                    >
                      💾 Inspect Arkiv Record
                    </button>
                  </div>
                </div>

                {selected.dance && selected.dance.songs.length > 0 && (
                  <fieldset className="w98-groupbox">
                    <legend>Advisory Song List ({selected.dance.songs.length} tracks)</legend>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Song Title</th>
                          <th>Artist</th>
                          <th>BPM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.dance.songs.map((s, i) => (
                          <tr key={`${s.title}-${i}`}>
                            <td className="mono">{i + 1}</td>
                            <td>
                              <strong>{s.title}</strong>
                            </td>
                            <td>{s.artist ?? "—"}</td>
                            <td className="mono">{s.bpm ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </fieldset>
                )}
              </div>
            ) : (
              <div className="w98-panel" style={{ padding: 18 }}>
                <strong>FeetOnFire Social Packs</strong>
                <p style={{ fontSize: 12 }}>
                  FeetOnFire reads <code>haven.file.full</code> records carrying{" "}
                  <code>payload.x.dance</code> StepMania manifests from Arkiv{" "}
                  <strong>{config.arkivNetworkName}</strong>. Click{" "}
                  <strong>Launch Rhythm Game</strong> above to jump straight into the StepMania
                  engine!
                </p>
                <button
                  type="button"
                  className="w98-button w98-button-primary"
                  onClick={() => setTab("play")}
                >
                  🕹️ Launch Rhythm Game Now
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="app-statusbar">
        <span>FeetOnFire · StepMania SM/SSC over Haven L7 (`haven.file.full`)</span>
        <span className="mono">
          {bundleAvailable ? "Embedded Engine Ready" : "Social Pack Browser"}
        </span>
      </div>
    </div>
  );
}
