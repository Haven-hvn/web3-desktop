import { useEffect, useMemo, useState } from "react";
import { APP_CATALOG } from "../../../config/apps";
import { useDesktop } from "../../../context/DesktopContext";
import { useHavenKernel } from "../../../context/HavenKernelContext";
import type { WindowInstance } from "../../../hooks/useWindowManager";
import {
  CHAINS,
  classifyGateStanding,
  formatBytes,
  formatTokenAmount,
  getCompatibleApps,
  partitionGatesByStanding,
  shortAddress,
  shortKey,
  type GateDirectoryEntry,
  type HavenEntity,
} from "../../../kernel/protocol";

type FilterKind = "all" | "my-uploads" | "gate" | "group";
type AuthorScope = "all" | "verified" | "peers" | "mine";

export default function ExplorerApp({ window: win }: { window: WindowInstance }) {
  const { openWith, windowManager } = useDesktop();
  const {
    entities,
    gates,
    loadingUniverse,
    checkingGates,
    scanStatus,
    scanError,
    refreshUniverse,
    getGateMeta,
    recheckGateMemberships,
    wallet,
    findUnlockedKey,
    unlockGate,
  } = useHavenKernel();

  const [filterKind, setFilterKind] = useState<FilterKind>(
    win.launchParams?.gateKey ? "gate" : "all",
  );
  const [filterValue, setFilterValue] = useState<string>(win.launchParams?.gateKey ?? "");
  const [authorScope, setAuthorScope] = useState<AuthorScope>("all");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(
    win.launchParams?.entityKey ?? null,
  );
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  useEffect(() => {
    if (win.launchParams?.gateKey) {
      setFilterKind("gate");
      setFilterValue(win.launchParams.gateKey);
    }
    if (win.launchParams?.entityKey) {
      setSelectedKey(win.launchParams.entityKey);
    }
  }, [win.launchParams?.gateKey, win.launchParams?.entityKey]);

  const myAddrLower = wallet.address?.toLowerCase() ?? null;

  const myUploadsCount = useMemo(
    () => (myAddrLower ? entities.filter((e) => e.owner.toLowerCase() === myAddrLower).length : 0),
    [entities, myAddrLower],
  );

  const { myDaos, lockedDaos, publicDrives } = useMemo(
    () =>
      partitionGatesByStanding(
        gates,
        (g) => getGateMeta(g.gate),
        (g) => Boolean(g.gate && findUnlockedKey(g.gate)),
      ),
    [gates, getGateMeta, findUnlockedKey],
  );

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entities) counts.set(e.grp, (counts.get(e.grp) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entities]);

  const filtered = useMemo(() => {
    let list = entities;
    if (filterKind === "my-uploads") {
      list = myAddrLower ? list.filter((e) => e.owner.toLowerCase() === myAddrLower) : [];
    } else if (filterKind === "gate" && filterValue) {
      list = list.filter((e) => e.gateKey === filterValue);
    } else if (filterKind === "group" && filterValue) {
      list = list.filter((e) => e.grp === filterValue);
    }

    if (authorScope === "verified") {
      list = list.filter((e) => e.hasAttestation);
    } else if (authorScope === "peers" && myAddrLower) {
      list = list.filter((e) => e.owner.toLowerCase() !== myAddrLower);
    } else if (authorScope === "mine") {
      list = myAddrLower ? list.filter((e) => e.owner.toLowerCase() === myAddrLower) : [];
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.grp.toLowerCase().includes(q) ||
          e.key.toLowerCase().includes(q) ||
          e.owner.toLowerCase().includes(q) ||
          (e.board?.toLowerCase().includes(q) ?? false),
      );
    }
    return list;
  }, [entities, filterKind, filterValue, authorScope, myAddrLower, search]);

  const selectedEntity: HavenEntity | null =
    filtered.find((e) => e.key === selectedKey) ?? filtered[0] ?? null;

  const selectedGateEntry: GateDirectoryEntry | undefined =
    filterKind === "gate" ? gates.find((g) => g.gateKey === filterValue) : undefined;

  const activeGate = selectedGateEntry?.gate ?? selectedEntity?.gate;
  const activeGateMeta = getGateMeta(activeGate);
  const activeGateUnlocked = activeGate ? findUnlockedKey(activeGate, activeGate.epoch) : undefined;

  const handleUnlock = async () => {
    if (!activeGate) return;
    setActionMsg("Requesting EIP-712 signature & ICP VetKD 30-day epoch key…");
    try {
      await unlockGate(activeGate, activeGate.epoch);
      setActionMsg(
        "Epoch key unlocked in OS Keyring! You can now decrypt all peer uploads in this DataDAO across every Haven app.",
      );
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const renderDriveButton = (g: GateDirectoryEntry) => {
    const meta = getGateMeta(g.gate);
    const unlocked = Boolean(g.gate && findUnlockedKey(g.gate));
    const standing = classifyGateStanding(g, meta, unlocked);
    const chainTag = g.gate ? CHAINS[g.gate.chainId]?.shortName ?? g.gate.chainId : "PUB";
    const label = g.isPublic
      ? "Public Commons"
      : meta && meta.symbol !== "TOKEN"
        ? `$${meta.symbol} (≥${g.gate?.threshold})`
        : `${g.slug} (≥${g.gate?.threshold ?? 1})`;
    const icon =
      standing === "public"
        ? "📂"
        : standing === "member-unlocked"
          ? "🔓"
          : standing === "member-eligible"
            ? "🔑"
            : "🔒";

    return (
      <button
        key={g.gateKey}
        type="button"
        className="sidebar-item"
        data-active={filterKind === "gate" && filterValue === g.gateKey}
        onClick={() => {
          setFilterKind("gate");
          setFilterValue(g.gateKey);
        }}
        title={`${label} • ${g.uniqueUploaders.length} uploader(s) • ${g.entities.length} file(s)`}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {icon} {label}
        </span>
        <span className="badge mono">
          {chainTag}·{g.entities.length}
        </span>
      </button>
    );
  };

  const addressBar =
    filterKind === "all"
      ? "haven://rabdi/all-drives"
      : filterKind === "my-uploads"
        ? `haven://my-uploads/${wallet.address ? shortAddress(wallet.address) : "guest"}`
        : filterKind === "gate"
          ? `haven://shared-dao/${selectedGateEntry?.slug ?? filterValue}`
          : `haven://groups/${filterValue}`;

  return (
    <div className="app-shell">
      <div className="app-header-bar">
        <button
          type="button"
          className="w98-button w98-button-sm"
          disabled={loadingUniverse}
          onClick={() => void refreshUniverse()}
        >
          {loadingUniverse ? "Scanning…" : "🔄 Refresh"}
        </button>
        <button
          type="button"
          className="w98-button w98-button-sm"
          disabled={checkingGates}
          onClick={() => void recheckGateMemberships()}
          title="Re-check EVM balanceOf across all discovered DataDAOs"
        >
          {checkingGates ? "Checking DAOs…" : "🪪 Verify DAO Access"}
        </button>
        <div className="w98-field mono" style={{ flex: 1, minWidth: 160 }}>
          {addressBar}
        </div>
        <input
          type="search"
          className="w98-field"
          style={{ width: 165 }}
          placeholder="Filter title, owner, grp…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="app-split">
        {/* Left Navigation Tree: My Uploads + My Shared DataDAOs + Locked DataDAOs + Public Commons */}
        <aside className="app-sidebar">
          <div className="sidebar-section-title">My Computer</div>
          <button
            type="button"
            className="sidebar-item"
            data-active={filterKind === "all"}
            onClick={() => {
              setFilterKind("all");
              setFilterValue("");
            }}
          >
            <span>💻 All Network Drives</span>
            <span className="badge mono">{entities.length}</span>
          </button>
          <button
            type="button"
            className="sidebar-item"
            data-active={filterKind === "my-uploads"}
            onClick={() => {
              setFilterKind("my-uploads");
              setFilterValue("");
            }}
          >
            <span>👤 My Uploads</span>
            <span className="badge mono">{myUploadsCount}</span>
          </button>

          <div className="sidebar-section-title">
            🌐 My Shared DataDAOs ({myDaos.length})
          </div>
          {myDaos.length > 0 ? (
            myDaos.map(renderDriveButton)
          ) : (
            <div style={{ padding: "4px 8px 6px", fontSize: 10, opacity: 0.72, lineHeight: 1.35 }}>
              {wallet.address
                ? checkingGates
                  ? "Checking L1/L2 token balances…"
                  : "No held token gates matched yet."
                : "Connect wallet or Watch Address to mount your shared DataDAO drives."}
            </div>
          )}

          <div className="sidebar-section-title">
            🔒 Other DataDAOs ({lockedDaos.length})
          </div>
          {lockedDaos.map(renderDriveButton)}

          <div className="sidebar-section-title">
            📂 Public Commons ({publicDrives.length})
          </div>
          {publicDrives.map(renderDriveButton)}

          <div className="sidebar-section-title">Protocol Groups (grp)</div>
          {groups.map(([grp, count]) => (
            <button
              key={grp}
              type="button"
              className="sidebar-item"
              data-active={filterKind === "group" && filterValue === grp}
              onClick={() => {
                setFilterKind("group");
                setFilterValue(grp);
              }}
            >
              <span className="mono" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" }}>
                {grp}
              </span>
              <span className="badge mono">{count}</span>
            </button>
          ))}
        </aside>

        {/* Right pane: Shared Folder Header + Entity table + Open With Inspector */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {scanError && (
            <div style={{ padding: "6px 8px", background: "#fff3cd", color: "#5c3d00", fontSize: 11 }}>
              ⚠ {scanError}
            </div>
          )}

          {/* Shared DataDAO Folder Banner */}
          {selectedGateEntry && (
            <div
              style={{
                padding: "7px 10px",
                borderBottom: "1px solid var(--theme-border-dark)",
                background: "var(--theme-surface)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <div>
                  <strong>
                    {selectedGateEntry.isPublic
                      ? "📂 Public Commons (Open Shared Folder)"
                      : `🌐 Shared DataDAO: ${activeGateMeta?.name ?? selectedGateEntry.title} (${activeGateMeta?.symbol ?? "TOKEN"})`}
                  </strong>
                  <div className="mono" style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>
                    {selectedGateEntry.gate
                      ? `${CHAINS[selectedGateEntry.gate.chainId]?.name ?? selectedGateEntry.gate.chainId} • ${selectedGateEntry.gate.tokenAddress} • Threshold ≥ ${selectedGateEntry.gate.threshold}`
                      : "Ungated clear files readable by anyone"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="badge mono">
                    👥 {selectedGateEntry.uniqueUploaders.length} uploader(s)
                  </span>
                  <span className="badge mono">
                    ✓ {selectedGateEntry.attestedCount} attested
                  </span>
                  {selectedGateEntry.gate && activeGateMeta?.isHolder === true && (
                    <span className="badge badge-ok">
                      ✓ DAO Member ({formatTokenAmount(activeGateMeta.userBalance, activeGateMeta.decimals)}{" "}
                      {activeGateMeta.symbol})
                    </span>
                  )}
                  {selectedGateEntry.gate && activeGateMeta?.isHolder === false && (
                    <span className="badge badge-err">
                      🔒 Not a Holder (bal: {formatTokenAmount(activeGateMeta.userBalance, activeGateMeta.decimals)})
                    </span>
                  )}
                  {selectedGateEntry.gate && !activeGateUnlocked && (
                    <button
                      type="button"
                      className="w98-button w98-button-sm w98-button-primary"
                      onClick={() => void handleUnlock()}
                    >
                      🔑 Unlock Shared Folder Key
                    </button>
                  )}
                  {activeGateUnlocked && (
                    <span className="badge badge-ok">🔓 Epoch Key Unlocked</span>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", fontSize: 11 }}>
                <span style={{ opacity: 0.75 }}>Show:</span>
                {(
                  [
                    ["all", "All DAO Uploads (You + Peers)"],
                    ["verified", "✓ Verified Holder Receipts Only"],
                    ["peers", "👥 Peers Only"],
                    ["mine", "👤 My Uploads Only"],
                  ] as [AuthorScope, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`w98-button w98-button-sm ${authorScope === id ? "w98-button-primary" : ""}`}
                    onClick={() => setAuthorScope(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ flex: 1, minHeight: 0, overflow: "auto", background: "var(--theme-surface-variant)" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name / Subject</th>
                  <th>Author / DAO Trust</th>
                  <th>Group (`grp`)</th>
                  <th>MIME / Size</th>
                  <th>Access</th>
                  <th>Open With</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entity) => {
                  const compat = getCompatibleApps(entity).filter((a) => a !== "explorer");
                  const isMine = Boolean(myAddrLower && entity.owner.toLowerCase() === myAddrLower);
                  return (
                    <tr
                      key={entity.key}
                      data-selected={selectedEntity?.key === entity.key}
                      onClick={() => setSelectedKey(entity.key)}
                      onDoubleClick={() => {
                        const primary = compat[0];
                        if (primary) {
                          openWith(primary, { gateKey: entity.gateKey, entityKey: entity.key });
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <td style={{ maxWidth: 210, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <strong>{entity.title}</strong>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                          {isMine ? (
                            <span className="badge badge-info">👤 You</span>
                          ) : (
                            <span className="badge mono" title={entity.owner}>
                              👥 {shortAddress(entity.owner)}
                            </span>
                          )}
                          {entity.hasAttestation && (
                            <span
                              className="badge badge-ok"
                              title="Carries Haven-AOL Ed25519 holder attestation (payload.attn)"
                            >
                              ✓ Attested
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>
                        {entity.grp}
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>
                        {entity.mimeType} {entity.media?.size ? `(${formatBytes(entity.media.size)})` : ""}
                      </td>
                      <td>
                        {entity.sealedMask > 0 ? (
                          findUnlockedKey(entity.gate, entity.gate?.epoch) ? (
                            <span className="badge badge-ok">🔓 Unlocked</span>
                          ) : (
                            <span className="badge badge-warn">🔒 Sealed</span>
                          )
                        ) : (
                          <span className="badge badge-info">🌐 Clear</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 3 }}>
                          {compat.map((appId) => (
                            <button
                              key={appId}
                              type="button"
                              className="w98-button w98-button-sm"
                              title={`Open in ${APP_CATALOG[appId].name}`}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                openWith(appId, { gateKey: entity.gateKey, entityKey: entity.key });
                              }}
                            >
                              {APP_CATALOG[appId].glyph}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 18, textAlign: "center", opacity: 0.7 }}>
                      {loadingUniverse
                        ? "Scanning Arkiv Rabdi entities…"
                        : filterKind === "my-uploads" && !wallet.address
                          ? "Connect your EVM wallet or set a Watch Address in Wallet & Keys to filter your uploads."
                          : "No Arkiv entities match this view."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Bottom Inspector */}
          {selectedEntity && (
            <div
              style={{
                borderTop: "2px solid var(--theme-border-dark)",
                background: "var(--theme-surface)",
                padding: 8,
                flex: "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <div>
                  <strong>{selectedEntity.title}</strong>{" "}
                  <span className="mono" style={{ fontSize: 11, opacity: 0.75 }}>
                    ({shortKey(selectedEntity.key)} · uploaded by {shortAddress(selectedEntity.owner)})
                  </span>
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {getCompatibleApps(selectedEntity)
                    .filter((a) => a !== "explorer")
                    .map((appId) => (
                      <button
                        key={appId}
                        type="button"
                        className="w98-button w98-button-sm w98-button-primary"
                        onClick={() =>
                          openWith(appId, {
                            gateKey: selectedEntity.gateKey,
                            entityKey: selectedEntity.key,
                          })
                        }
                      >
                        {APP_CATALOG[appId].glyph} Open in {APP_CATALOG[appId].name}
                      </button>
                    ))}
                </div>
              </div>

              <div className="mono" style={{ fontSize: 11, marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap", opacity: 0.85 }}>
                <span>grp={selectedEntity.grp}</span>
                {selectedEntity.media?.piece && <span>piece={selectedEntity.media.piece.slice(0, 22)}…</span>}
                {selectedEntity.media?.fcid && <span>fcid={selectedEntity.media.fcid.slice(0, 22)}…</span>}
                {selectedEntity.hasAttestation && (
                  <span>
                    attn={selectedEntity.attestation?.isMerkle ? "Merkle-V2" : "HAVEN_ATTEST_V1"}
                    {selectedEntity.attestation?.balance ? ` (bal=${selectedEntity.attestation.balance})` : ""}
                  </span>
                )}
              </div>
              {actionMsg && (
                <div style={{ fontSize: 11, marginTop: 4, color: "var(--theme-info)" }}>{actionMsg}</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="app-statusbar">
        <span>
          {filtered.length} object(s) · {myDaos.length} My DataDAO(s) · {lockedDaos.length} Locked DAO(s) ·{" "}
          {scanStatus}
        </span>
        <div style={{ display: "flex", gap: 5 }}>
          <button
            type="button"
            className="w98-button w98-button-sm"
            onClick={() => windowManager.openApp("wallet")}
          >
            🔑 Wallet / Watch Address
          </button>
          <button
            type="button"
            className="w98-button w98-button-sm"
            onClick={() => windowManager.openApp("settings")}
          >
            ⚙️ Control Panel
          </button>
        </div>
      </div>
    </div>
  );
}
