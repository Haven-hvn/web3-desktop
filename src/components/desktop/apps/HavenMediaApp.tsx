import { useEffect, useMemo, useState } from "react";
import { useDesktop } from "../../../context/DesktopContext";
import { useHavenKernel } from "../../../context/HavenKernelContext";
import type { WindowInstance } from "../../../hooks/useWindowManager";
import { resolveClearMediaUrl } from "../../../kernel/aol";
import {
  CHAINS,
  formatBytes,
  partitionGatesByStanding,
  shortAddress,
  shortKey,
  type GateDirectoryEntry,
  type HavenEntity,
} from "../../../kernel/protocol";

type PlaylistFilter = "all" | "video" | "audio" | "image" | "drip" | string;

export default function HavenMediaApp({ window: win }: { window: WindowInstance }) {
  const { openWith, windowManager } = useDesktop();
  const {
    config,
    entities,
    gates,
    loadingUniverse,
    refreshUniverse,
    findUnlockedKey,
    unlockGate,
    decryptMediaForEntity,
    getGateMeta,
    wallet,
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

  const renderGatePlaylist = (g: GateDirectoryEntry) => {
    const meta = getGateMeta(g.gate);
    const label = g.isPublic
      ? "Public Commons"
      : meta && meta.symbol !== "TOKEN"
        ? `$${meta.symbol} (${g.uniqueUploaders.length} peers)`
        : g.slug;
    return (
      <button
        key={g.gateKey}
        type="button"
        className="sidebar-item"
        data-active={playlist === g.gateKey}
        onClick={() => setPlaylist(g.gateKey)}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {g.isPublic ? "🌐" : findUnlockedKey(g.gate) ? "🔓" : meta?.isHolder ? "🔑" : "🔒"} {label}
        </span>
        <span className="badge mono">{g.entities.length}</span>
      </button>
    );
  };

  const [playlist, setPlaylist] = useState<PlaylistFilter>(win.launchParams?.gateKey ?? "all");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(
    win.launchParams?.entityKey ?? null,
  );
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playbackMime, setPlaybackMime] = useState<string>("");
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (win.launchParams?.gateKey) setPlaylist(win.launchParams.gateKey);
    if (win.launchParams?.entityKey) setSelectedKey(win.launchParams.entityKey);
  }, [win.launchParams?.gateKey, win.launchParams?.entityKey]);

  const mediaEntities = useMemo(
    () =>
      entities.filter(
        (e) =>
          e.grp.startsWith("haven.video") ||
          e.grp === "haven.audio.full" ||
          e.grp === "haven.image.full" ||
          Boolean(e.media?.piece || e.media?.fcid),
      ),
    [entities],
  );

  const visibleTracks = useMemo(() => {
    let list = mediaEntities;
    if (playlist === "video") list = list.filter((e) => e.mimeType.startsWith("video/") || e.grp.startsWith("haven.video"));
    else if (playlist === "audio") list = list.filter((e) => e.mimeType.startsWith("audio/") || e.grp === "haven.audio.full");
    else if (playlist === "image") list = list.filter((e) => e.mimeType.startsWith("image/") || e.grp === "haven.image.full");
    else if (playlist === "drip") list = list.filter((e) => e.grp.includes("drip"));
    else if (playlist !== "all") list = list.filter((e) => e.gateKey === playlist);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.grp.toLowerCase().includes(q) ||
          e.mimeType.toLowerCase().includes(q),
      );
    }
    return list;
  }, [mediaEntities, playlist, search]);

  const activeTrack: HavenEntity | null =
    visibleTracks.find((e) => e.key === selectedKey) ?? visibleTracks[0] ?? null;

  useEffect(() => {
    // Cleanup previous blob URL on track change
    return () => {
      if (playbackUrl?.startsWith("blob:")) URL.revokeObjectURL(playbackUrl);
    };
  }, [playbackUrl]);

  const handlePlay = async (track: HavenEntity) => {
    setSelectedKey(track.key);
    setStatusMsg(null);
    setLoadingMedia(true);
    try {
      if (track.media?.fcid) {
        const directUrl = resolveClearMediaUrl(config, track);
        if (directUrl) {
          setPlaybackUrl(directUrl);
          setPlaybackMime(track.mimeType);
          setStatusMsg(`Streaming clear IPFS CID from ${config.ipfsGateway}`);
          return;
        }
      }
      setStatusMsg("Fetching encrypted Filecoin piece & unwrapping AES key via OS VetKD Keyring…");
      const res = await decryptMediaForEntity(track);
      setPlaybackUrl(res.blobUrl);
      setPlaybackMime(res.mimeType);
      setStatusMsg(`Decrypted ${formatBytes(res.bytes)} locally in browser memory.`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMedia(false);
    }
  };

  const handleUnlockGate = async (track: HavenEntity) => {
    if (!track.gate) return;
    setStatusMsg("Requesting Haven-AOL v3 epoch key…");
    try {
      await unlockGate(track.gate, track.gate.epoch);
      setStatusMsg("Gate unlocked in OS Keyring! Click Play to decrypt & stream.");
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="app-shell">
      {/* Classic Haven Tunes LCD & Transport Bar */}
      <div className="tunes-player-bar">
        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            className="w98-button w98-button-sm w98-button-primary"
            disabled={!activeTrack || loadingMedia}
            onClick={() => activeTrack && void handlePlay(activeTrack)}
          >
            {loadingMedia ? "⏳ Loading…" : "▶ Play / Decrypt"}
          </button>
          <button
            type="button"
            className="w98-button w98-button-sm"
            disabled={!playbackUrl}
            onClick={() => {
              setPlaybackUrl(null);
              setStatusMsg("Stopped");
            }}
          >
            ■ Stop
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

        <div className="tunes-lcd">
          <div style={{ fontWeight: "bold", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {activeTrack ? activeTrack.title : "Haven Media — Sovereign Library"}
          </div>
          <div style={{ fontSize: 10 }}>
            {activeTrack
              ? `${activeTrack.grp} · ${activeTrack.mimeType} · ${
                  activeTrack.gate
                    ? `${CHAINS[activeEntityChain(activeTrack)]?.shortName ?? activeTrack.gate.chainId} Gate`
                    : "Public"
                }`
              : `${mediaEntities.length} media records on Arkiv ${config.arkivNetworkName}`}
          </div>
        </div>

        <input
          type="search"
          className="w98-field"
          style={{ width: 150 }}
          placeholder="Search library…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="app-split">
        {/* Left Source / Playlists Sidebar */}
        <aside className="app-sidebar">
          <div className="sidebar-section-title">Library</div>
          <button
            type="button"
            className="sidebar-item"
            data-active={playlist === "all"}
            onClick={() => setPlaylist("all")}
          >
            <span>🎵 All Media</span>
            <span className="badge mono">{mediaEntities.length}</span>
          </button>
          <button
            type="button"
            className="sidebar-item"
            data-active={playlist === "video"}
            onClick={() => setPlaylist("video")}
          >
            <span>🎬 Video</span>
          </button>
          <button
            type="button"
            className="sidebar-item"
            data-active={playlist === "audio"}
            onClick={() => setPlaylist("audio")}
          >
            <span>🎧 Audio</span>
          </button>
          <button
            type="button"
            className="sidebar-item"
            data-active={playlist === "image"}
            onClick={() => setPlaylist("image")}
          >
            <span>🖼️ Images</span>
          </button>
          <button
            type="button"
            className="sidebar-item"
            data-active={playlist === "drip"}
            onClick={() => setPlaylist("drip")}
          >
            <span>💧 Market-Cap Drips</span>
          </button>

          <div className="sidebar-section-title">🌐 My DataDAO Playlists ({myDaos.length})</div>
          {myDaos.map(renderGatePlaylist)}

          <div className="sidebar-section-title">🔒 Other DataDAOs ({lockedDaos.length})</div>
          {lockedDaos.map(renderGatePlaylist)}

          {publicDrives.length > 0 && (
            <>
              <div className="sidebar-section-title">📂 Public Commons</div>
              {publicDrives.map(renderGatePlaylist)}
            </>
          )}
        </aside>

        {/* Right pane: Media Player Stage + Track Table */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {activeTrack && (
            <div
              style={{
                borderBottom: "1px solid var(--theme-border-dark)",
                padding: 8,
                background: "var(--theme-surface)",
              }}
            >
              {playbackUrl ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {playbackMime.startsWith("video/") ? (
                    <video
                      src={playbackUrl}
                      controls
                      autoPlay
                      style={{ maxHeight: 220, width: "100%", background: "#000" }}
                    />
                  ) : playbackMime.startsWith("audio/") ? (
                    <audio src={playbackUrl} controls autoPlay style={{ width: "100%" }} />
                  ) : playbackMime.startsWith("image/") ? (
                    <img
                      src={playbackUrl}
                      alt={activeTrack.title}
                      style={{ maxHeight: 220, objectFit: "contain", background: "#000" }}
                    />
                  ) : (
                    <a href={playbackUrl} download={activeTrack.media?.name ?? "haven-file"} className="w98-button">
                      ⬇ Download Decrypted File ({playbackMime})
                    </a>
                  )}
                </div>
              ) : activeTrack.sealedMask > 0 && !findUnlockedKey(activeTrack.gate, activeTrack.gate?.epoch) ? (
                <div className="frost-box">
                  <div>
                    <strong>🔒 Sealed Filecoin Media</strong>
                    <div style={{ fontSize: 11, opacity: 0.85 }}>
                      Gated by{" "}
                      {activeTrack.gate
                        ? `${CHAINS[activeTrack.gate.chainId]?.name ?? activeTrack.gate.chainId} ${shortAddress(activeTrack.gate.tokenAddress)} ≥ ${activeTrack.gate.threshold}`
                        : "Haven-AOL"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="w98-button w98-button-sm w98-button-primary"
                      onClick={() => void handleUnlockGate(activeTrack)}
                    >
                      🔑 Unlock Epoch Key
                    </button>
                  </div>
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span className="mono" style={{ fontSize: 11, opacity: 0.8 }}>
                  {shortKey(activeTrack.key)} · {activeTrack.media?.piece ? "Filecoin CommP" : activeTrack.media?.fcid ? "IPFS CID" : "Metadata"}
                </span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="w98-button w98-button-sm"
                    onClick={() =>
                      openWith("fairhaven", {
                        gateKey: activeTrack.gateKey,
                        entityKey: activeTrack.key,
                      })
                    }
                  >
                    🍀 Open Thread in Fairhaven
                  </button>
                  <button
                    type="button"
                    className="w98-button w98-button-sm"
                    onClick={() =>
                      openWith("redhaven", {
                        gateKey: activeTrack.gateKey,
                        entityKey: activeTrack.key,
                      })
                    }
                  >
                    👽 Open in Redhaven
                  </button>
                </div>
              </div>
              {statusMsg && (
                <div style={{ fontSize: 11, marginTop: 4, color: "var(--theme-info)" }}>{statusMsg}</div>
              )}
            </div>
          )}

          <div style={{ flex: 1, minHeight: 0, overflow: "auto", background: "var(--theme-surface-variant)" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Uploader</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {visibleTracks.map((t) => {
                  const isUnlocked = t.gate ? Boolean(findUnlockedKey(t.gate, t.gate.epoch)) : true;
                  const isMine = Boolean(
                    wallet.address && t.owner.toLowerCase() === wallet.address.toLowerCase(),
                  );
                  return (
                    <tr
                      key={t.key}
                      data-selected={activeTrack?.key === t.key}
                      onClick={() => setSelectedKey(t.key)}
                      onDoubleClick={() => void handlePlay(t)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>
                        <strong>{t.title}</strong>
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>
                        {isMine ? "👤 You" : `👥 ${shortAddress(t.owner)}`}
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>
                        {t.mimeType}
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>
                        {formatBytes(t.media?.size)}
                      </td>
                      <td>
                        {t.sealedMask === 0 ? (
                          <span className="badge badge-ok">Clear</span>
                        ) : isUnlocked ? (
                          <span className="badge badge-ok">🔓 Unlocked</span>
                        ) : (
                          <span className="badge badge-warn">🔒 Sealed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {visibleTracks.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 18, textAlign: "center", opacity: 0.7 }}>
                      No media entities in this playlist on {config.arkivNetworkName}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="app-statusbar">
        <span>{visibleTracks.length} item(s) · Haven Media (haven-dapp protocol view)</span>
        <button
          type="button"
          className="w98-button w98-button-sm"
          onClick={() => windowManager.openApp("settings", { launchParams: { tab: "mounts" } })}
        >
          Switch to Embedded Bundle
        </button>
      </div>
    </div>
  );
}

function activeEntityChain(e: HavenEntity): number {
  return e.gate?.chainId ?? 1;
}
