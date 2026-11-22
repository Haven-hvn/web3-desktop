import { useEffect, useMemo, useState } from "react";
import { useDesktop } from "../../../context/DesktopContext";
import { useHavenKernel } from "../../../context/HavenKernelContext";
import type { WindowInstance } from "../../../hooks/useWindowManager";
import {
  CHAINS,
  HAVEN_FULL_GROUPS,
  partitionGatesByStanding,
  shortAddress,
  shortKey,
  type GateDirectoryEntry,
  type HavenEntity,
} from "../../../kernel/protocol";

export default function FairhavenApp({ window: win }: { window: WindowInstance }) {
  const { openWith, windowManager } = useDesktop();
  const {
    entities,
    gates,
    loadingUniverse,
    refreshUniverse,
    findUnlockedKey,
    unlockGate,
    decryptedTexts,
    decryptTextForEntity,
    getGateMeta,
  } = useHavenKernel();

  const { myDaos, lockedDaos, publicDrives } = useMemo(
    () =>
      partitionGatesByStanding(
        gates,
        (g) => getGateMeta(g.gate),
        (g) => Boolean(g.gate && findUnlockedKey(g.gate)),
      ),
    [gates, getGateMeta, findUnlockedKey],
  );

  const renderBoardItem = (g: GateDirectoryEntry) => {
    const meta = getGateMeta(g.gate);
    const label = g.isPublic ? "/public/" : meta && meta.symbol !== "TOKEN" ? `/${meta.symbol.toLowerCase()}/` : `/${g.slug}/`;
    return (
      <button
        key={g.gateKey}
        type="button"
        className="sidebar-item"
        data-active={selectedGateKey === g.gateKey}
        onClick={() => {
          setSelectedGateKey(g.gateKey);
          setOpenThreadKey(null);
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {g.isPublic ? "📂" : findUnlockedKey(g.gate) ? "🔓" : meta?.isHolder ? "🔑" : "🔒"} {label}
        </span>
        <span className="badge mono">{g.entities.length}</span>
      </button>
    );
  };

  const [selectedGateKey, setSelectedGateKey] = useState<string>(
    win.launchParams?.gateKey ?? "all",
  );
  const [openThreadKey, setOpenThreadKey] = useState<string | null>(
    win.launchParams?.entityKey ?? null,
  );
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (win.launchParams?.gateKey) setSelectedGateKey(win.launchParams.gateKey);
    if (win.launchParams?.entityKey) setOpenThreadKey(win.launchParams.entityKey);
  }, [win.launchParams?.gateKey, win.launchParams?.entityKey]);

  // Per Fairhaven ENTITY_SPEC.md: thread roots = haven.board.thread + ALL haven.*.full media records!
  const threadRoots = useMemo(() => {
    return entities.filter(
      (e) =>
        (e.grp === "haven.board.thread" || HAVEN_FULL_GROUPS.has(e.grp)) &&
        (selectedGateKey === "all" || e.gateKey === selectedGateKey),
    );
  }, [entities, selectedGateKey]);

  const repliesByRoot = useMemo(() => {
    const map = new Map<string, HavenEntity[]>();
    for (const e of entities) {
      if (e.grp !== "haven.board.post" || !e.rootRef) continue;
      const list = map.get(e.rootRef) ?? [];
      list.push(e);
      map.set(e.rootRef, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.createdAt - b.createdAt);
    }
    return map;
  }, [entities]);

  const activeBoard = gates.find((g) => g.gateKey === selectedGateKey);
  const focusedThread = openThreadKey
    ? threadRoots.find((t) => t.key === openThreadKey) ?? null
    : null;

  const handleDecrypt = async (entity: HavenEntity) => {
    setStatusMsg(`Unlocking ${shortKey(entity.key)} via Haven-AOL VetKD…`);
    try {
      await decryptTextForEntity(entity);
      setStatusMsg(null);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUnlockBoard = async () => {
    if (!activeBoard?.gate) return;
    setStatusMsg("Signing EIP-712 GateRequestV3 for 30-day epoch key…");
    try {
      await unlockGate(activeBoard.gate, activeBoard.gate.epoch);
      setStatusMsg("Board epoch key unlocked in OS Keyring!");
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const renderPostBody = (post: HavenEntity) => {
    const unlockedText = post.clearText ?? decryptedTexts[post.key];
    if (unlockedText) {
      return <div style={{ whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.45 }}>{unlockedText}</div>;
    }
    if (post.sealedTextB64) {
      return (
        <div className="frost-box">
          <span style={{ fontSize: 11 }}>
            🔒 Sealed post text — requires gate holder epoch key
          </span>
          <button
            type="button"
            className="w98-button w98-button-sm"
            onClick={() => void handleDecrypt(post)}
          >
            🔑 Unlock &amp; Read
          </button>
        </div>
      );
    }
    if (HAVEN_FULL_GROUPS.has(post.grp)) {
      return (
        <div style={{ fontSize: 11, opacity: 0.85 }}>
          Auto-surfaced Haven media drop (<code>{post.grp}</code> · {post.mimeType}).{" "}
          <button
            type="button"
            className="w98-button w98-button-sm"
            onClick={() =>
              openWith(post.dance ? "feetonfire" : "haven-media", {
                gateKey: post.gateKey,
                entityKey: post.key,
              })
            }
          >
            {post.dance ? "🔥 Open in FeetOnFire" : "🎵 Play in Haven Media"}
          </button>
        </div>
      );
    }
    return <div style={{ fontSize: 11, opacity: 0.65 }}>(no text body)</div>;
  };

  return (
    <div className="app-shell">
      <div className="app-header-bar">
        <strong>🍀 Fairhaven</strong>
        <span className="badge mono">
          /{activeBoard ? activeBoard.slug : "all"}/
        </span>
        {focusedThread && (
          <button
            type="button"
            className="w98-button w98-button-sm"
            onClick={() => setOpenThreadKey(null)}
          >
            ⬅ Back to Catalog
          </button>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 5, flexWrap: "wrap" }}>
          <button
            type="button"
            className="w98-button w98-button-sm"
            onClick={() =>
              openWith("redhaven", {
                gateKey: selectedGateKey === "all" ? undefined : selectedGateKey,
                entityKey: focusedThread?.key,
              })
            }
          >
            👽 View Same Data in Redhaven
          </button>
          <button
            type="button"
            className="w98-button w98-button-sm"
            onClick={() =>
              windowManager.openSideBySide("fairhaven", "redhaven", {
                gateKey: selectedGateKey === "all" ? undefined : selectedGateKey,
              })
            }
          >
            🪟 Side-by-Side
          </button>
          <button
            type="button"
            className="w98-button w98-button-sm"
            disabled={loadingUniverse}
            onClick={() => void refreshUniverse()}
          >
            🔄
          </button>
        </div>
      </div>

      <div className="app-split">
        <aside className="app-sidebar">
          <div className="sidebar-section-title">Boards (= Token Gates)</div>
          <button
            type="button"
            className="sidebar-item"
            data-active={selectedGateKey === "all"}
            onClick={() => {
              setSelectedGateKey("all");
              setOpenThreadKey(null);
            }}
          >
            <span>/all/ Global Feed</span>
            <span className="badge mono">{threadRoots.length}</span>
          </button>
          <div className="sidebar-section-title">🌐 My DataDAO Boards ({myDaos.length})</div>
          {myDaos.map(renderBoardItem)}

          <div className="sidebar-section-title">🔒 Other Boards ({lockedDaos.length})</div>
          {lockedDaos.map(renderBoardItem)}

          {publicDrives.length > 0 && (
            <>
              <div className="sidebar-section-title">📂 Public Boards</div>
              {publicDrives.map(renderBoardItem)}
            </>
          )}
        </aside>

        <div className="app-main fh-board-bg">
          {statusMsg && (
            <div className="w98-panel" style={{ padding: 6, marginBottom: 8, fontSize: 11 }}>
              ℹ {statusMsg}
            </div>
          )}

          {activeBoard?.gate && (
            <div
              className="w98-panel"
              style={{
                padding: 8,
                marginBottom: 10,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div>
                <strong>/{activeBoard.slug}/</strong> —{" "}
                <span className="mono" style={{ fontSize: 11 }}>
                  {CHAINS[activeBoard.gate.chainId]?.name ?? activeBoard.gate.chainId} ·{" "}
                  {shortAddress(activeBoard.gate.tokenAddress)} ≥ {activeBoard.gate.threshold}
                </span>
                {activeBoard.about && (
                  <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>{activeBoard.about}</div>
                )}
              </div>
              {findUnlockedKey(activeBoard.gate) ? (
                <span className="badge badge-ok">🔓 Epoch Key Active</span>
              ) : (
                <button
                  type="button"
                  className="w98-button w98-button-sm w98-button-primary"
                  onClick={() => void handleUnlockBoard()}
                >
                  🔑 Unlock Board Epoch
                </button>
              )}
            </div>
          )}

          {(focusedThread ? [focusedThread] : threadRoots).map((thread) => {
            const replies = repliesByRoot.get(thread.key) ?? [];
            const shownReplies = focusedThread ? replies : replies.slice(-3);
            return (
              <article key={thread.key} className="fh-thread-card">
                <div className="fh-meta">
                  <span className="fh-subject">{thread.title}</span>
                  <span className="mono" style={{ opacity: 0.75 }}>
                    Anonymous ({shortAddress(thread.owner)})
                  </span>
                  <span className="badge mono">No.{shortKey(thread.key)}</span>
                  <span className="badge mono">{thread.grp}</span>
                  <span className="badge">{replies.length} replies</span>
                  {!focusedThread && (
                    <button
                      type="button"
                      className="w98-button w98-button-sm"
                      style={{ marginLeft: "auto" }}
                      onClick={() => setOpenThreadKey(thread.key)}
                    >
                      Open Thread
                    </button>
                  )}
                </div>

                {renderPostBody(thread)}

                {!focusedThread && replies.length > 3 && (
                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
                    … {replies.length - 3} earlier reply(s) omitted.
                  </div>
                )}

                {shownReplies.map((reply) => (
                  <div key={reply.key} className="fh-reply-card">
                    <div className="fh-meta">
                      <span className="mono">{shortAddress(reply.owner)}</span>
                      <span className="badge mono">No.{shortKey(reply.key)}</span>
                      {reply.parentRef && (
                        <span className="mono" style={{ color: "var(--theme-info)" }}>
                          &gt;&gt;{shortKey(reply.parentRef)}
                        </span>
                      )}
                    </div>
                    {renderPostBody(reply)}
                  </div>
                ))}
              </article>
            );
          })}

          {threadRoots.length === 0 && (
            <div className="w98-panel" style={{ padding: 20, textAlign: "center", opacity: 0.75 }}>
              No threads or media drops found in this board yet.
            </div>
          )}
        </div>
      </div>

      <div className="app-statusbar">
        <span>Fairhaven lens over Arkiv `haven.board.*` + `haven.*.full`</span>
        <span>{threadRoots.length} live thread(s)</span>
      </div>
    </div>
  );
}
