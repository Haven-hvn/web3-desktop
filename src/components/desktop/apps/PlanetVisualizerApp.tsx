import { useMemo, useState } from "react";
import { APP_CATALOG, type AppId } from "../../../config/apps";
import { useDesktop } from "../../../context/DesktopContext";
import { useHavenKernel } from "../../../context/HavenKernelContext";
import {
  CHAINS,
  currentEpochNow,
  getCompatibleApps,
  shortAddress,
  shortKey,
} from "../../../kernel/protocol";

const TARGET_APPS: { id: AppId; label: string; analogy: string; color: string }[] = [
  { id: "haven-media", label: "Haven Tunes", analogy: "Classic Media / Video & Audio", color: "#0ea5e9" },
  { id: "fairhaven", label: "Fairhaven", analogy: "4chan / Gated Boards", color: "#22c55e" },
  { id: "redhaven", label: "Redhaven", analogy: "Reddit / Ranked Feeds", color: "#f97316" },
  { id: "feetonfire", label: "FeetOnFire", analogy: "DDR / StepMania Packs", color: "#ef4444" },
  { id: "explorer", label: "Gate Explorer", analogy: "My Computer / Inspector", color: "#a855f7" },
];

export default function PlanetVisualizerApp() {
  const { openWith, windowManager } = useDesktop();
  const { entities, gates, arkivProbe, config, loadingUniverse, refreshUniverse, unlockedKeys } =
    useHavenKernel();
  const [selectedEntityKey, setSelectedEntityKey] = useState<string | null>(null);

  const sampleEntities = useMemo(() => {
    // Show a diverse mix of groups (video, board, dance/file, etc.)
    const picked: typeof entities = [];
    const seenGroups = new Set<string>();
    for (const e of entities) {
      if (!seenGroups.has(e.grp) && picked.length < 8) {
        picked.push(e);
        seenGroups.add(e.grp);
      }
    }
    for (const e of entities) {
      if (picked.length >= 10) break;
      if (!picked.includes(e)) picked.push(e);
    }
    return picked;
  }, [entities]);

  const activeEntity =
    sampleEntities.find((e) => e.key === selectedEntityKey) ?? sampleEntities[0] ?? null;
  const activeApps = activeEntity ? getCompatibleApps(activeEntity) : [];

  return (
    <div className="app-shell">
      <div className="app-header-bar">
        <strong>🪐 Haven L7 — Apps Over Data Visualizer</strong>
        <span className="badge badge-info mono">
          Arkiv: {config.arkivNetworkName}{" "}
          {arkivProbe?.online ? `#${arkivProbe.blockNumber?.toLocaleString()}` : "probing"}
        </span>
        <span className="badge mono">{entities.length} entities</span>
        <span className="badge mono">{gates.length} gates</span>
        <span className="badge mono">Epoch #{currentEpochNow()}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            className="w98-button w98-button-sm w98-button-primary"
            onClick={() =>
              windowManager.openSideBySide("fairhaven", "redhaven", {
                gateKey: activeEntity?.gateKey,
              })
            }
          >
            🪟 Tile Fairhaven + Redhaven
          </button>
          <button
            type="button"
            className="w98-button w98-button-sm"
            disabled={loadingUniverse}
            onClick={() => void refreshUniverse()}
          >
            {loadingUniverse ? "Scanning…" : "🔄 Refresh Rabdi"}
          </button>
        </div>
      </div>

      <div className="app-main" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          className="w98-panel"
          style={{
            padding: 12,
            background: "linear-gradient(135deg, #0b1220 0%, #111c2d 60%, #191321 100%)",
            color: "#e6edf3",
          }}
        >
          <div style={{ fontSize: 12, marginBottom: 10, opacity: 0.9 }}>
            <strong>One Protocol, Four Public Networks, Many Interchangeable UIs:</strong> Content
            bytes live encrypted on <strong>Filecoin/IPFS</strong>, access control is checked via{" "}
            <strong>EVM L2 ownership</strong> + <strong>ICP Haven-AOL VetKD</strong>, and metadata
            is indexed on <strong>Arkiv ({config.arkivNetworkName})</strong>. Click any live entity
            below to see every desktop app that can open the exact same record.
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(170px, 1fr) minmax(230px, 1.4fr) minmax(195px, 1.1fr)",
              gap: 12,
              alignItems: "stretch",
            }}
          >
            {/* Column 1: 4 Public Networks */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="mono" style={{ fontSize: 10, color: "#7dd3fc", letterSpacing: 1 }}>
                LAYER 1–6 · PUBLIC NETWORKS
              </div>
              <div
                style={{
                  border: "1px solid #334155",
                  background: "rgba(15,23,42,0.75)",
                  padding: 8,
                }}
              >
                <div style={{ fontWeight: "bold", color: "#5eead4" }}>🗂️ Arkiv OP L3 (0x44…0044)</div>
                <div className="mono" style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>
                  {config.arkivNetworkName} ·{" "}
                  {arkivProbe?.online
                    ? `${arkivProbe.entityCount?.toLocaleString()} total entities`
                    : "Connecting…"}
                </div>
              </div>
              <div
                style={{
                  border: "1px solid #334155",
                  background: "rgba(15,23,42,0.75)",
                  padding: 8,
                }}
              >
                <div style={{ fontWeight: "bold", color: "#93c5fd" }}>⛓️ EVM L1 / L2 Gates</div>
                <div className="mono" style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>
                  ETH · Base · Arbitrum · OP · Sepolia
                  <br />
                  {gates.length} active token/NFT gates
                </div>
              </div>
              <div
                style={{
                  border: "1px solid #334155",
                  background: "rgba(15,23,42,0.75)",
                  padding: 8,
                }}
              >
                <div style={{ fontWeight: "bold", color: "#fcd34d" }}>🔐 ICP Haven-AOL VetKD</div>
                <div className="mono" style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>
                  {config.havenAolCanisterId}
                  <br />
                  Epoch #{currentEpochNow()} · {unlockedKeys.length} unlocked
                </div>
              </div>
              <div
                style={{
                  border: "1px solid #334155",
                  background: "rgba(15,23,42,0.75)",
                  padding: 8,
                }}
              >
                <div style={{ fontWeight: "bold", color: "#fda4af" }}>📦 Filecoin / IPFS Bytes</div>
                <div className="mono" style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>
                  Sealed CommP (`piece`) &amp; clear `fcid`
                </div>
              </div>
            </div>

            {/* Column 2: Live Haven Entities */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="mono" style={{ fontSize: 10, color: "#5eead4", letterSpacing: 1 }}>
                LAYER 7 · LIVE HAVEN ENTITIES (SELECT ONE)
              </div>
              <div
                style={{
                  border: "1px solid #334155",
                  background: "rgba(2,6,23,0.7)",
                  padding: 6,
                  flex: 1,
                  maxHeight: 270,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {sampleEntities.length === 0 && (
                  <div style={{ padding: 12, fontSize: 11, opacity: 0.75 }}>
                    {loadingUniverse
                      ? "Scanning Rabdi Arkiv entities…"
                      : "No Haven entities found yet on this Arkiv endpoint. Check Control Panel or click Refresh."}
                  </div>
                )}
                {sampleEntities.map((e) => {
                  const selected = activeEntity?.key === e.key;
                  const chainName = e.gate ? CHAINS[e.gate.chainId]?.shortName ?? e.gate.chainId : "PUB";
                  return (
                    <button
                      key={e.key}
                      type="button"
                      onClick={() => setSelectedEntityKey(e.key)}
                      style={{
                        textAlign: "left",
                        padding: "6px 8px",
                        border: selected ? "1px solid #5eead4" : "1px solid #1e293b",
                        background: selected ? "rgba(94, 234, 212, 0.16)" : "rgba(15, 23, 42, 0.65)",
                        color: "#f1f5f9",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                        <strong
                          style={{
                            fontSize: 12,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {e.title}
                        </strong>
                        <span className="mono" style={{ fontSize: 10, color: "#5eead4" }}>
                          {chainName}
                        </span>
                      </div>
                      <div className="mono" style={{ fontSize: 10, opacity: 0.75, marginTop: 2 }}>
                        {e.grp} · {shortKey(e.key)}
                        {e.media?.piece ? " · 🔒 piece" : e.media?.fcid ? " · 🌐 fcid" : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Column 3: Compatible Desktop Apps */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="mono" style={{ fontSize: 10, color: "#fb923c", letterSpacing: 1 }}>
                INTERCHANGEABLE UIs (CLICK TO LAUNCH)
              </div>
              {TARGET_APPS.map((t) => {
                const compatible = activeEntity ? activeApps.includes(t.id as never) : true;
                const appDef = APP_CATALOG[t.id];
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      openWith(t.id, {
                        gateKey: activeEntity?.gateKey,
                        entityKey: activeEntity?.key,
                      })
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 9px",
                      textAlign: "left",
                      cursor: "pointer",
                      border: compatible ? `1px solid ${t.color}` : "1px solid #1e293b",
                      background: compatible ? `${t.color}22` : "rgba(15,23,42,0.4)",
                      color: "#f8fafc",
                      opacity: compatible ? 1 : 0.45,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{appDef.glyph}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: "bold", fontSize: 12 }}>{t.label}</div>
                      <div style={{ fontSize: 10, opacity: 0.8 }}>{t.analogy}</div>
                    </div>
                    <span className="mono" style={{ fontSize: 10 }}>
                      {compatible ? "OPEN →" : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Selected Entity Wire Proof */}
        {activeEntity && (
          <fieldset className="w98-groupbox">
            <legend>
              Selected Entity Wire Proof — Same Data Across {activeApps.length} Desktop Apps
            </legend>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <span className="badge mono">key: {shortKey(activeEntity.key)}</span>
              <span className="badge badge-info mono">grp: {activeEntity.grp}</span>
              <span className="badge mono">mime: {activeEntity.mimeType}</span>
              <span className="badge mono">owner: {shortAddress(activeEntity.owner)}</span>
              {activeEntity.gate ? (
                <span className="badge badge-warn mono">
                  gate: {CHAINS[activeEntity.gate.chainId]?.shortName ?? activeEntity.gate.chainId}:
                  {shortAddress(activeEntity.gate.tokenAddress)} ≥ {activeEntity.gate.threshold}
                </span>
              ) : (
                <span className="badge badge-ok">Public / Ungated</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {activeApps.map((appId) => (
                <button
                  key={appId}
                  type="button"
                  className="w98-button w98-button-sm"
                  onClick={() =>
                    openWith(appId, {
                      gateKey: activeEntity.gateKey,
                      entityKey: activeEntity.key,
                    })
                  }
                >
                  {APP_CATALOG[appId].glyph} Open in {APP_CATALOG[appId].name}
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      <div className="app-statusbar">
        <span>Zero private backends (Datastores: 0) · All state lives on Arkiv, Filecoin, ICP &amp; EVM</span>
        <button
          type="button"
          className="w98-button w98-button-sm"
          onClick={() => windowManager.openApp("microstore")}
        >
          🛒 Browse Awesome Haven Microstore
        </button>
      </div>
    </div>
  );
}
