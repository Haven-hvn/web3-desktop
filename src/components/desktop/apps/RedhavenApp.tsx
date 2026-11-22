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

type SortMode = "hot" | "new" | "top" | "discussed";

export default function RedhavenApp({ window: win }: { window: WindowInstance }) {
  const { openWith, windowManager } = useDesktop();
  const {
    entities,
    gates,
    votes,
    castVote,
    loadingUniverse,
    refreshUniverse,
    getGateMeta,
    inspectGate,
    findUnlockedKey,
    unlockGate,
    decryptedTexts,
    decryptTextForEntity,
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

  const renderSubItem = (g: GateDirectoryEntry) => {
    const meta = getGateMeta(g.gate);
    const label = g.isPublic ? "r/public" : meta && meta.symbol !== "TOKEN" ? `r/${meta.symbol}` : `r/${g.slug}`;
    return (
      <button
        key={g.gateKey}
        type="button"
        className="sidebar-item"
        data-active={selectedGateKey === g.gateKey}
        onClick={() => {
          setSelectedGateKey(g.gateKey);
          setSelectedPostKey(null);
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
  const [sortMode, setSortMode] = useState<SortMode>("hot");
  const [selectedPostKey, setSelectedPostKey] = useState<string | null>(
    win.launchParams?.entityKey ?? null,
  );
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (win.launchParams?.gateKey) setSelectedGateKey(win.launchParams.gateKey);
    if (win.launchParams?.entityKey) setSelectedPostKey(win.launchParams.entityKey);
  }, [win.launchParams?.gateKey, win.launchParams?.entityKey]);

  const activeSub = gates.find((g) => g.gateKey === selectedGateKey);

  useEffect(() => {
    if (activeSub?.gate) void inspectGate(activeSub.gate);
  }, [activeSub?.gate, inspectGate]);

  const commentsByRoot = useMemo(() => {
    const map = new Map<string, HavenEntity[]>();
    for (const e of entities) {
      if (e.grp !== "haven.board.post" || !e.rootRef) continue;
      const list = map.get(e.rootRef) ?? [];
      list.push(e);
      map.set(e.rootRef, list);
    }
    return map;
  }, [entities]);

  const submissions = useMemo(() => {
    const base = entities.filter(
      (e) =>
        (e.grp === "haven.board.thread" || HAVEN_FULL_GROUPS.has(e.grp)) &&
        (selectedGateKey === "all" || e.gateKey === selectedGateKey),
    );
    const scoreOf = (e: HavenEntity) => 1 + (votes[e.key] ?? 0) + (commentsByRoot.get(e.key)?.length ?? 0);
    return [...base].sort((a, b) => {
      if (sortMode === "new") return b.createdAt - a.createdAt;
      if (sortMode === "top") return scoreOf(b) - scoreOf(a) || b.createdAt - a.createdAt;
      if (sortMode === "discussed") {
        return (commentsByRoot.get(b.key)?.length ?? 0) - (commentsByRoot.get(a.key)?.length ?? 0);
      }
      // hot: log-weighted score + recency tie-break
      const hotA = Math.log10(Math.max(1, Math.abs(scoreOf(a)))) + a.createdAt / 45_000;
      const hotB = Math.log10(Math.max(1, Math.abs(scoreOf(b)))) + b.createdAt / 45_000;
      return hotB - hotA;
    });
  }, [entities, selectedGateKey, sortMode, votes, commentsByRoot]);

  const focusedSubmission = selectedPostKey
    ? submissions.find((s) => s.key === selectedPostKey) ?? null
    : null;

  const tokenMeta = getGateMeta(activeSub?.gate);

  const handleDecrypt = async (e: HavenEntity) => {
    setStatusMsg(`Decrypting ${shortKey(e.key)} via Haven-AOL VetKD…`);
    try {
      await decryptTextForEntity(e);
      setStatusMsg(null);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="app-shell">
      <div className="app-header-bar">
        <strong>👽 redhaven</strong>
        <span className="badge mono">
          {activeSub ? `r/${activeSub.slug}` : "r/all"}
        </span>

        {(["hot", "new", "top", "discussed"] as SortMode[]).map((m) => (
          <button
            key={m}
            type="button"
            className="w98-button w98-button-sm"
            style={{ fontWeight: sortMode === m ? "bold" : undefined }}
            onClick={() => setSortMode(m)}
          >
            {m}
          </button>
        ))}

        {focusedSubmission && (
          <button
            type="button"
            className="w98-button w98-button-sm"
            onClick={() => setSelectedPostKey(null)}
          >
            ⬅ Front Page
          </button>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 5, flexWrap: "wrap" }}>
          <button
            type="button"
            className="w98-button w98-button-sm"
            onClick={() =>
              openWith("fairhaven", {
                gateKey: selectedGateKey === "all" ? undefined : selectedGateKey,
                entityKey: focusedSubmission?.key,
              })
            }
          >
            🍀 View Same Data in Fairhaven
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
          <div className="sidebar-section-title">Subreddits (= Gates)</div>
          <button
            type="button"
            className="sidebar-item"
            data-active={selectedGateKey === "all"}
            onClick={() => {
              setSelectedGateKey("all");
              setSelectedPostKey(null);
            }}
          >
            <span>r/all</span>
            <span className="badge mono">{submissions.length}</span>
          </button>
          <div className="sidebar-section-title">🌐 My DataDAO Subs ({myDaos.length})</div>
          {myDaos.map(renderSubItem)}

          <div className="sidebar-section-title">🔒 Other Subreddits ({lockedDaos.length})</div>
          {lockedDaos.map(renderSubItem)}

          {publicDrives.length > 0 && (
            <>
              <div className="sidebar-section-title">📂 Public</div>
              {publicDrives.map(renderSubItem)}
            </>
          )}

          {activeSub?.gate && (
            <div style={{ padding: 8, borderTop: "1px solid var(--theme-border-dark)", marginTop: "auto" }}>
              <div style={{ fontWeight: "bold", fontSize: 11, marginBottom: 4 }}>
                Gate Asset Info
              </div>
              <div className="mono" style={{ fontSize: 10, lineHeight: 1.45 }}>
                <div>
                  {tokenMeta ? `${tokenMeta.symbol} (${tokenMeta.name})` : shortAddress(activeSub.gate.tokenAddress)}
                </div>
                <div>
                  Chain: {CHAINS[activeSub.gate.chainId]?.name ?? activeSub.gate.chainId}
                </div>
                <div>Threshold: ≥ {activeSub.gate.threshold}</div>
                {tokenMeta?.isHolder !== undefined && (
                  <div style={{ color: tokenMeta.isHolder ? "var(--theme-success)" : "var(--theme-error)" }}>
                    {tokenMeta.isHolder ? "✓ You hold this gate" : "✗ Below threshold"}
                  </div>
                )}
              </div>
              {!findUnlockedKey(activeSub.gate) && (
                <button
                  type="button"
                  className="w98-button w98-button-sm w98-button-primary"
                  style={{ marginTop: 6, width: "100%" }}
                  onClick={async () => {
                    try {
                      setStatusMsg("Unlocking subreddit epoch key…");
                      await unlockGate(activeSub.gate!, activeSub.gate!.epoch);
                      setStatusMsg("Unlocked in OS Keyring!");
                    } catch (err) {
                      setStatusMsg(err instanceof Error ? err.message : String(err));
                    }
                  }}
                >
                  🔑 Unlock r/{activeSub.slug}
                </button>
              )}
            </div>
          )}
        </aside>

        <div className="app-main">
          {statusMsg && (
            <div className="w98-panel" style={{ padding: 6, marginBottom: 8, fontSize: 11 }}>
              ℹ {statusMsg}
            </div>
          )}

          {(focusedSubmission ? [focusedSubmission] : submissions).map((sub) => {
            const myVote = votes[sub.key] ?? 0;
            const comments = commentsByRoot.get(sub.key) ?? [];
            const score = 1 + myVote;
            const unlockedBody = sub.clearText ?? decryptedTexts[sub.key];
            return (
              <div key={sub.key} className="rh-row">
                <div className="rh-vote-col">
                  <button
                    type="button"
                    className="rh-vote-btn"
                    data-active={myVote === 1 ? "up" : undefined}
                    onClick={() => castVote(sub.key, 1)}
                    aria-label="Upvote"
                  >
                    ▲
                  </button>
                  <span className="rh-score">{score}</span>
                  <button
                    type="button"
                    className="rh-vote-btn"
                    data-active={myVote === -1 ? "down" : undefined}
                    onClick={() => castVote(sub.key, -1)}
                    aria-label="Downvote"
                  >
                    ▼
                  </button>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <button
                    type="button"
                    className="rh-title"
                    onClick={() => setSelectedPostKey(sub.key)}
                  >
                    {sub.title}
                  </button>{" "}
                  <span className="badge mono">{sub.grp}</span>
                  <div className="rh-tagline">
                    submitted by <span className="mono">{shortAddress(sub.owner)}</span> to{" "}
                    <strong>r/{sub.board ?? "gate"}</strong> · block #{sub.createdAt} ·{" "}
                    <span className="mono">{shortKey(sub.key)}</span>
                  </div>

                  {focusedSubmission && (
                    <div style={{ marginTop: 8 }}>
                      {unlockedBody ? (
                        <div className="w98-panel" style={{ padding: 8, whiteSpace: "pre-wrap" }}>
                          {unlockedBody}
                        </div>
                      ) : sub.sealedTextB64 ? (
                        <div className="frost-box">
                          <span>🔒 Sealed submission body</span>
                          <button
                            type="button"
                            className="w98-button w98-button-sm"
                            onClick={() => void handleDecrypt(sub)}
                          >
                            🔑 Unlock &amp; Read
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}

                  <div className="rh-actions">
                    <button
                      type="button"
                      className="w98-button w98-button-sm"
                      onClick={() => setSelectedPostKey(sub.key)}
                    >
                      💬 {comments.length} comment(s)
                    </button>
                    {sub.media && (
                      <button
                        type="button"
                        className="w98-button w98-button-sm"
                        onClick={() =>
                          openWith(sub.dance ? "feetonfire" : "haven-media", {
                            gateKey: sub.gateKey,
                            entityKey: sub.key,
                          })
                        }
                      >
                        {sub.dance ? "🔥 Play Pack in FeetOnFire" : "🎵 Open Media in Haven Media"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="w98-button w98-button-sm"
                      onClick={() =>
                        openWith("explorer", { gateKey: sub.gateKey, entityKey: sub.key })
                      }
                    >
                      💾 Inspect Entity
                    </button>
                  </div>

                  {focusedSubmission && comments.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      {comments.map((c) => {
                        const cText = c.clearText ?? decryptedTexts[c.key];
                        return (
                          <div key={c.key} className="fh-reply-card">
                            <div className="fh-meta">
                              <strong className="mono">{shortAddress(c.owner)}</strong>
                              <span className="mono" style={{ opacity: 0.7 }}>
                                #{shortKey(c.key)}
                              </span>
                            </div>
                            {cText ? (
                              <div style={{ whiteSpace: "pre-wrap" }}>{cText}</div>
                            ) : c.sealedTextB64 ? (
                              <button
                                type="button"
                                className="w98-button w98-button-sm"
                                onClick={() => void handleDecrypt(c)}
                              >
                                🔒 Unlock sealed comment
                              </button>
                            ) : (
                              <span style={{ opacity: 0.6 }}>(empty)</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {submissions.length === 0 && (
            <div className="w98-panel" style={{ padding: 20, textAlign: "center", opacity: 0.75 }}>
              No submissions found for this gate on Arkiv yet.
            </div>
          )}
        </div>
      </div>

      <div className="app-statusbar">
        <span>Redhaven reads the exact same Arkiv entities as Fairhaven (`haven.board.*` + `haven.*.full`)</span>
        <span>{submissions.length} submission(s)</span>
      </div>
    </div>
  );
}
