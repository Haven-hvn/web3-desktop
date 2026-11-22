import { useState } from "react";
import { useHavenKernel } from "../../../context/HavenKernelContext";
import { useTheme } from "../../../context/ThemeProvider";
import type { WindowInstance } from "../../../hooks/useWindowManager";
import { probeArkiv } from "../../../kernel/arkiv";
import { ARKIV_PRESETS, type AppRuntimeMode } from "../../../kernel/config";
import { shortAddress } from "../../../kernel/protocol";

type SettingsTab = "networks" | "keyring" | "mounts" | "clippy" | "appearance";

export default function ControlPanelApp({ window: win }: { window: WindowInstance }) {
  const {
    config,
    updateConfig,
    resetConfig,
    refreshUniverse,
    clearLocalArkivCache,
    unlockedKeys,
    forgetAllKeys,
    wallet,
    entities,
  } = useHavenKernel();
  const { themeId, setThemeId, themeList } = useTheme();

  const [tab, setTab] = useState<SettingsTab>(
    (win.launchParams?.tab as SettingsTab) || "networks",
  );
  const [draft, setDraft] = useState(config);
  const [probeMsg, setProbeMsg] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const handleSave = () => {
    updateConfig(draft);
    setSavedMsg("Settings saved! Live Haven OS kernel updated.");
    window.setTimeout(() => setSavedMsg(null), 3000);
  };

  const handleTestRpc = async () => {
    setProbeMsg("Testing Arkiv RPC…");
    const res = await probeArkiv(draft);
    if (res.online) {
      setProbeMsg(
        `🟢 Connected! Block #${res.blockNumber?.toLocaleString()} · ${res.entityCount?.toLocaleString()} entities (${res.rttMs}ms)`,
      );
    } else {
      setProbeMsg(`🔴 Failed: ${res.error}`);
    }
  };

  const setMount = (
    appKey: keyof typeof draft.appMounts,
    patch: { mode?: AppRuntimeMode; url?: string },
  ) => {
    setDraft((prev) => ({
      ...prev,
      appMounts: {
        ...prev.appMounts,
        [appKey]: { ...prev.appMounts[appKey], ...patch },
      },
    }));
  };

  return (
    <div className="app-shell">
      <div className="w98-tabs" role="tablist">
        {(
          [
            ["networks", "🌐 Networks & Rabdi"],
            ["keyring", "🔑 Keyring & Cache"],
            ["mounts", "🧩 App Mounts"],
            ["clippy", "📎 Clippy & XMTP"],
            ["appearance", "🎨 Appearance & Boot"],
          ] as [SettingsTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="w98-tab"
            data-active={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="app-main" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {tab === "networks" && (
          <>
            <fieldset className="w98-groupbox">
              <legend>Arkiv Metadata Network (OP L3 Precompile 0x44…0044)</legend>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {ARKIV_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w98-button w98-button-sm"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        arkivNetworkName: p.id === "rabdi" ? "Rabdi" : "Localhost",
                        arkivRpcUrl: p.rpcUrl,
                      }))
                    }
                  >
                    Preset: {p.name}
                  </button>
                ))}
                <button
                  type="button"
                  className="w98-button w98-button-sm w98-button-primary"
                  onClick={() => void handleTestRpc()}
                >
                  ⚡ Test RPC
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 6, alignItems: "center" }}>
                <label htmlFor="cfg-net-name">Network Label</label>
                <input
                  id="cfg-net-name"
                  className="w98-field"
                  value={draft.arkivNetworkName}
                  onChange={(e) => setDraft({ ...draft, arkivNetworkName: e.target.value })}
                />

                <label htmlFor="cfg-arkiv-rpc">Arkiv RPC URL</label>
                <input
                  id="cfg-arkiv-rpc"
                  className="w98-field mono"
                  value={draft.arkivRpcUrl}
                  onChange={(e) => setDraft({ ...draft, arkivRpcUrl: e.target.value })}
                />

                <label htmlFor="cfg-arkiv-key">Arkiv API Key (opt.)</label>
                <input
                  id="cfg-arkiv-key"
                  className="w98-field mono"
                  placeholder="Optional X-API-KEY for higher rate limits"
                  value={draft.arkivApiKey}
                  onChange={(e) => setDraft({ ...draft, arkivApiKey: e.target.value })}
                />
              </div>
              {probeMsg && <div style={{ fontSize: 11, marginTop: 6 }}>{probeMsg}</div>}
            </fieldset>

            <fieldset className="w98-groupbox">
              <legend>ICP Haven-AOL VetKD &amp; Filecoin / IPFS Gateways</legend>
              <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 6, alignItems: "center" }}>
                <label htmlFor="cfg-canister">Haven-AOL Canister</label>
                <input
                  id="cfg-canister"
                  className="w98-field mono"
                  value={draft.havenAolCanisterId}
                  onChange={(e) => setDraft({ ...draft, havenAolCanisterId: e.target.value })}
                />

                <label htmlFor="cfg-icp">ICP Host</label>
                <input
                  id="cfg-icp"
                  className="w98-field mono"
                  value={draft.icpHost}
                  onChange={(e) => setDraft({ ...draft, icpHost: e.target.value })}
                />

                <label htmlFor="cfg-synapse">Synapse Base URL</label>
                <input
                  id="cfg-synapse"
                  className="w98-field mono"
                  value={draft.synapseBaseUrl}
                  onChange={(e) => setDraft({ ...draft, synapseBaseUrl: e.target.value })}
                />

                <label htmlFor="cfg-ipfs">IPFS Gateway</label>
                <input
                  id="cfg-ipfs"
                  className="w98-field mono"
                  value={draft.ipfsGateway}
                  onChange={(e) => setDraft({ ...draft, ipfsGateway: e.target.value })}
                />
              </div>
            </fieldset>
          </>
        )}

        {tab === "keyring" && (
          <>
            <fieldset className="w98-groupbox">
              <legend>OS VetKD Epoch Keyring ({unlockedKeys.length} active)</legend>
              <p style={{ margin: "0 0 8px", fontSize: 11 }}>
                Unlocked 30-day epoch keys stay in memory only and are shared across Haven Media,
                Fairhaven, Redhaven, FeetOnFire, and Gate Explorer so you sign once per gate per
                month.
              </p>
              {unlockedKeys.length === 0 ? (
                <div style={{ fontSize: 11, opacity: 0.7 }}>
                  No gates unlocked in this session yet.
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Chain</th>
                      <th>Token</th>
                      <th>Threshold</th>
                      <th>Epoch</th>
                      <th>Holder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unlockedKeys.map((k) => (
                      <tr key={k.cacheKey}>
                        <td className="mono">{k.chainVariant}</td>
                        <td className="mono">{shortAddress(k.tokenAddress)}</td>
                        <td className="mono">≥ {k.threshold}</td>
                        <td className="mono">#{k.epoch}</td>
                        <td className="mono">{shortAddress(k.unlockedBy)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button type="button" className="w98-button" onClick={forgetAllKeys}>
                  🧹 Forget All VetKD Keys
                </button>
              </div>
            </fieldset>

            <fieldset className="w98-groupbox">
              <legend>Local Arkiv Entity Cache</legend>
              <div style={{ fontSize: 12, marginBottom: 8 }}>
                Currently indexed: <strong>{entities.length}</strong> Haven entities · Active
                wallet: <strong className="mono">{wallet.address ?? "Guest"}</strong>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="w98-button"
                  onClick={() => void refreshUniverse()}
                >
                  🔄 Re-scan Arkiv Now
                </button>
                <button
                  type="button"
                  className="w98-button"
                  onClick={clearLocalArkivCache}
                >
                  🗑️ Clear Cached Entities
                </button>
              </div>
            </fieldset>
          </>
        )}

        {tab === "mounts" && (
          <fieldset className="w98-groupbox">
            <legend>App Runtime Modes (Native OS Kernel vs. Embedded Iframe Bundle)</legend>
            <p style={{ margin: "0 0 10px", fontSize: 11 }}>
              Each Haven app runs in <strong>Native OS Mode</strong> by default (sharing the OS
              wallet, VetKD keyring, and Arkiv query bus). Switch any app to{" "}
              <strong>Embedded Iframe</strong> to host its standalone Next.js/Vite static build at
              a subpath or external URL.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(
                [
                  ["haven-media", "🎵 Haven Media (haven-dapp)"],
                  ["fairhaven", "🍀 Fairhaven (4chan)"],
                  ["redhaven", "👽 Redhaven (Reddit)"],
                  ["feetonfire", "🔥 FeetOnFire (StepMania DDR)"],
                ] as const
              ).map(([key, label]) => (
                <div
                  key={key}
                  className="w98-panel"
                  style={{ padding: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
                >
                  <strong style={{ minWidth: 185 }}>{label}</strong>
                  <select
                    className="w98-field"
                    value={draft.appMounts[key].mode}
                    onChange={(e) => setMount(key, { mode: e.target.value as AppRuntimeMode })}
                  >
                    <option value="native">Native OS Mode (Shared Kernel)</option>
                    <option value="iframe">Embedded Bundle (iframe)</option>
                  </select>
                  <input
                    className="w98-field mono"
                    style={{ flex: 1, minWidth: 180 }}
                    value={draft.appMounts[key].url}
                    onChange={(e) => setMount(key, { url: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        )}

        {tab === "appearance" && (
          <fieldset className="w98-groupbox">
            <legend>Desktop Theme &amp; Window Behavior</legend>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {themeList.map((t) => (
                <label
                  key={t.id}
                  style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                >
                  <input
                    type="radio"
                    name="theme"
                    checked={themeId === t.id}
                    onChange={() => setThemeId(t.id)}
                  />
                  <strong>{t.name}</strong>
                  <span style={{ fontSize: 11, opacity: 0.75 }}>— {t.description}</span>
                </label>
              ))}

              <hr style={{ width: "100%", borderColor: "var(--theme-border-dark)" }} />

              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={draft.showDebugOverlay}
                  onChange={(e) => setDraft({ ...draft, showDebugOverlay: e.target.checked })}
                />
                Show window geometry debug overlay (ID / z-index / x,y / size)
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={draft.skipBootScreen}
                  onChange={(e) => setDraft({ ...draft, skipBootScreen: e.target.checked })}
                />
                Skip boot menu &amp; login dialog on next reload
              </label>
            </div>
          </fieldset>
        )}

        {tab === "clippy" && (
          <fieldset className="w98-groupbox">
            <legend>📎 Clippy — Multi-User XMTP Assistant &amp; Agent Bridge</legend>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={draft.clippyEnabled}
                  onChange={(e) => setDraft({ ...draft, clippyEnabled: e.target.checked })}
                />
                Show Clippy on desktop startup
              </label>

              <div className="form-row">
                <label>XMTP Environment:</label>
                <select
                  className="w98-input"
                  value={draft.clippyXmtpEnv}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      clippyXmtpEnv: e.target.value === "dev" ? "dev" : "production",
                    })
                  }
                >
                  <option value="production">production (public XMTP network)</option>
                  <option value="dev">dev (XMTP dev network)</option>
                </select>
              </div>

              <div className="form-row">
                <label>Room URL (matches agent allowed_rooms):</label>
                <input
                  type="text"
                  className="w98-input mono"
                  value={draft.clippyRoomUrl}
                  onChange={(e) => setDraft({ ...draft, clippyRoomUrl: e.target.value })}
                />
              </div>

              <div className="form-row">
                <label>Standing Agent XMTP Address:</label>
                <input
                  type="text"
                  className="w98-input mono"
                  value={draft.clippyAgentAddress}
                  onChange={(e) => setDraft({ ...draft, clippyAgentAddress: e.target.value })}
                />
              </div>

              <div className="form-row">
                <label>GunDB Relay Peers (comma-separated, multi-user presence):</label>
                <input
                  type="text"
                  className="w98-input mono"
                  value={draft.clippyGunRelays}
                  onChange={(e) => setDraft({ ...draft, clippyGunRelays: e.target.value })}
                />
              </div>
            </div>
          </fieldset>
        )}
      </div>

      <div className="app-statusbar">
        <span>{savedMsg ?? `Active Arkiv: ${config.arkivRpcUrl}`}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className="w98-button w98-button-sm"
            onClick={() => {
              resetConfig();
              setDraft(config);
            }}
          >
            Reset Defaults
          </button>
          <button
            type="button"
            className="w98-button w98-button-sm w98-button-primary"
            onClick={handleSave}
          >
            💾 Apply &amp; Save
          </button>
        </div>
      </div>
    </div>
  );
}
