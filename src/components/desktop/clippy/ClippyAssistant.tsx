import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDesktop } from "../../../context/DesktopContext";
import { useHavenKernel } from "../../../context/HavenKernelContext";
import { shortAddress } from "../../../kernel/protocol";
import { parseAgentActions } from "../../../services/clippy/clippyActions";
import {
  ClippyEngine,
  type ClippyEngineState,
} from "../../../services/clippy/clippyEngine";
import { ClippySprite, type ClippyMood } from "./ClippySprite";

interface ClippyAssistantProps {
  visible: boolean;
  onHide: () => void;
}

const QUICK_PROMPTS = [
  "What apps are on Haven OS?",
  "How do VetKD token gates work?",
  "Where can I upload media?",
];

export function ClippyAssistant({ visible, onHide }: ClippyAssistantProps) {
  const { windowManager } = useDesktop();
  const { config } = useHavenKernel();

  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [showPeers, setShowPeers] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const engineRef = useRef<ClippyEngine | null>(null);
  const [engineState, setEngineState] = useState<ClippyEngineState>(() => ({
    status: "idle",
    statusDetail: "Click Clippy to join XMTP",
    error: null,
    myAddress: null,
    myInboxId: null,
    agentAddress: config.clippyAgentAddress.toLowerCase(),
    roomUrl: config.clippyRoomUrl,
    groupId: null,
    isLeader: false,
    relayConnected: false,
    onlineUsers: [],
    messages: [],
  }));

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(0);
  const dragStateRef = useRef<{
    dragging: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  // Create/recreate engine when XMTP/room/agent config changes
  useEffect(() => {
    const engine = new ClippyEngine({
      xmtpEnv: config.clippyXmtpEnv,
      roomUrl: config.clippyRoomUrl,
      agentAddress: config.clippyAgentAddress,
      gunRelays: config.clippyGunRelays,
    });
    engineRef.current = engine;
    const unsub = engine.subscribe((next) => {
      setEngineState(next);
    });
    return () => {
      unsub();
      engine.destroy();
      if (engineRef.current === engine) {
        engineRef.current = null;
      }
    };
  }, [
    config.clippyXmtpEnv,
    config.clippyRoomUrl,
    config.clippyAgentAddress,
    config.clippyGunRelays,
  ]);

  // Lazy-start XMTP when the user opens the speech bubble
  useEffect(() => {
    if (bubbleOpen && engineRef.current && engineState.status === "idle") {
      void engineRef.current.start();
    }
  }, [bubbleOpen, engineState.status]);

  // Track unread count when bubble is closed
  useEffect(() => {
    const count = engineState.messages.length;
    if (count > prevMsgCountRef.current) {
      if (!bubbleOpen) {
        const added = engineState.messages.slice(prevMsgCountRef.current);
        const incoming = added.filter((m) => m.role !== "self").length;
        if (incoming > 0) {
          setUnreadCount((u) => u + incoming);
        }
      }
    }
    prevMsgCountRef.current = count;
  }, [engineState.messages, bubbleOpen]);

  // Clear unread + auto-scroll when bubble opens or new messages arrive
  useEffect(() => {
    if (bubbleOpen) {
      setUnreadCount(0);
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [bubbleOpen, engineState.messages.length]);

  const handleSpritePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      dragStateRef.current = {
        dragging: true,
        moved: false,
        startX: e.clientX,
        startY: e.clientY,
        origX: offset.x,
        origY: offset.y,
      };
      const onMove = (ev: PointerEvent) => {
        const ds = dragStateRef.current;
        if (!ds.dragging) return;
        const dx = ev.clientX - ds.startX;
        const dy = ev.clientY - ds.startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          ds.moved = true;
        }
        if (ds.moved) {
          setOffset({
            x: Math.min(20, Math.max(-window.innerWidth + 110, ds.origX + dx)),
            y: Math.min(10, Math.max(-window.innerHeight + 140, ds.origY + dy)),
          });
        }
      };
      const onUp = () => {
        dragStateRef.current.dragging = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [offset.x, offset.y],
  );

  const handleSpriteClick = useCallback(() => {
    if (dragStateRef.current.moved) {
      dragStateRef.current.moved = false;
      return;
    }
    setBubbleOpen((open) => !open);
  }, []);

  const handleSend = useCallback(
    async (textOverride?: string) => {
      const text = (textOverride ?? draft).trim();
      if (!text || !engineRef.current || engineState.status !== "ready" || sending) return;
      setSending(true);
      if (!textOverride) setDraft("");
      try {
        await engineRef.current.sendMessage(text);
      } catch (err) {
        console.warn("[clippy] send failed:", err);
      } finally {
        setSending(false);
      }
    },
    [draft, engineState.status, sending],
  );

  const handleRetry = useCallback(() => {
    const old = engineRef.current;
    old?.destroy();
    const fresh = new ClippyEngine({
      xmtpEnv: config.clippyXmtpEnv,
      roomUrl: config.clippyRoomUrl,
      agentAddress: config.clippyAgentAddress,
      gunRelays: config.clippyGunRelays,
    });
    engineRef.current = fresh;
    fresh.subscribe((next) => setEngineState(next));
    void fresh.start();
  }, [
    config.clippyXmtpEnv,
    config.clippyRoomUrl,
    config.clippyAgentAddress,
    config.clippyGunRelays,
  ]);

  const mood: ClippyMood = useMemo(() => {
    if (engineState.status === "idle") return "sleeping";
    if (engineState.status === "initializing" || engineState.status === "connecting_room" || sending) {
      return "thinking";
    }
    if (unreadCount > 0) return "alert";
    return "idle";
  }, [engineState.status, sending, unreadCount]);

  if (!visible) return null;

  const onlineCount = engineState.onlineUsers.filter((u) => u.isOnline).length;
  const statusDot =
    engineState.status === "ready"
      ? "🟢"
      : engineState.status === "error"
        ? "🔴"
        : engineState.status === "idle"
          ? "⚪"
          : "🟡";

  return (
    <div
      className="clippy-root"
      style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
    >
      {bubbleOpen && (
        <section
          className="clippy-bubble"
          role="dialog"
          aria-label="Clippy Multi-User XMTP Assistant"
        >
          <header className="clippy-bubble-header">
            <div className="clippy-bubble-title">
              <span>{statusDot}</span>
              <strong>Clippy · Haven XMTP</strong>
            </div>
            <div className="clippy-bubble-controls">
              <button
                type="button"
                className="w98-button clippy-mini-btn"
                onClick={() => setShowPeers((v) => !v)}
                title="Show online room participants & agent XMTP address"
              >
                👥 {onlineCount}
              </button>
              <button
                type="button"
                className="w98-button clippy-mini-btn"
                onClick={() => windowManager.openApp("settings")}
                title="Configure XMTP Room / Agent / Gun Relay in Control Panel"
              >
                ⚙️
              </button>
              <button
                type="button"
                className="w98-button clippy-mini-btn"
                onClick={() => setBubbleOpen(false)}
                title="Minimize speech bubble"
                aria-label="Minimize Clippy bubble"
              >
                _
              </button>
              <button
                type="button"
                className="w98-button clippy-mini-btn"
                onClick={onHide}
                title="Hide Clippy (restore from taskbar tray)"
                aria-label="Hide Clippy"
              >
                ✕
              </button>
            </div>
          </header>

          <div className="clippy-status-strip mono">
            <span title={engineState.roomUrl}>
              {engineState.status === "ready"
                ? `XMTP (${config.clippyXmtpEnv}) · ${engineState.relayConnected ? "Multi-User Relay" : "Direct + Agent"}`
                : engineState.statusDetail}
            </span>
            <span title={`Standing Agent: ${engineState.agentAddress}`}>
              Agent: {shortAddress(engineState.agentAddress)}
            </span>
          </div>

          {showPeers && (
            <div className="clippy-peers-drawer mono">
              <div className="clippy-peers-heading">
                Room: {engineState.roomUrl}
              </div>
              {engineState.onlineUsers.map((peer) => (
                <div key={peer.inboxId} className="clippy-peer-row">
                  <span>
                    {peer.isAgent ? "🤖 Agent" : peer.isSelf ? "👤 You" : "🌐 User"}
                  </span>
                  <span>{shortAddress(peer.address)}</span>
                </div>
              ))}
              {engineState.groupId && (
                <div className="clippy-peers-meta">
                  Group: {engineState.groupId.slice(0, 14)}…{" "}
                  {engineState.isLeader ? "(Leader)" : ""}
                </div>
              )}
            </div>
          )}

          <div className="clippy-messages">
            {engineState.status === "error" ? (
              <div className="clippy-error-box">
                <p>
                  <strong>Hmm, I couldn't connect to XMTP.</strong>
                </p>
                <p className="mono">{engineState.error}</p>
                <button
                  type="button"
                  className="w98-button"
                  onClick={handleRetry}
                >
                  Retry Connection
                </button>
              </div>
            ) : engineState.messages.length === 0 ? (
              <div className="clippy-welcome">
                <p>
                  <strong>It looks like you're using Haven OS 98!</strong>
                </p>
                <p>
                  This is a live multi-user XMTP chat room with the public Haven
                  agent (<span className="mono">{shortAddress(engineState.agentAddress)}</span>).
                  Ask a question or chat with other desktop visitors!
                </p>
                <div className="clippy-prompts">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="w98-button clippy-prompt-btn"
                      disabled={engineState.status !== "ready" || sending}
                      onClick={() => void handleSend(prompt)}
                    >
                      💬 {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              engineState.messages.map((msg) => {
                const parsed =
                  msg.role === "agent"
                    ? parseAgentActions(msg.content)
                    : { cleanText: msg.content, actions: [] };

                return (
                  <div
                    key={msg.id}
                    className={`clippy-msg clippy-msg-${msg.role}`}
                  >
                    <div className="clippy-msg-meta">
                      <span className="clippy-msg-sender">
                        {msg.role === "agent"
                          ? "📎 Clippy Agent"
                          : msg.role === "self"
                            ? "👤 You"
                            : `🌐 ${msg.senderAddress ? shortAddress(msg.senderAddress) : msg.senderInboxId.slice(0, 8)}`}
                      </span>
                      <span className="clippy-msg-time mono">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="clippy-msg-body">{parsed.cleanText}</div>
                    {parsed.actions.length > 0 && (
                      <div className="clippy-action-row">
                        {parsed.actions.map((act) => (
                          <button
                            key={act.appId}
                            type="button"
                            className="w98-button clippy-action-btn"
                            onClick={() => windowManager.openApp(act.appId)}
                          >
                            <span>{act.glyph}</span>
                            <span>{act.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <form
            className="clippy-input-bar"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
          >
            <input
              type="text"
              className="w98-input clippy-input"
              placeholder={
                engineState.status === "ready"
                  ? "Ask Clippy or chat with the room…"
                  : engineState.statusDetail
              }
              value={draft}
              disabled={engineState.status !== "ready" || sending}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              type="submit"
              className="w98-button clippy-send-btn"
              disabled={engineState.status !== "ready" || sending || !draft.trim()}
            >
              {sending ? "…" : "Send"}
            </button>
          </form>

          <div className="clippy-bubble-tail" aria-hidden="true" />
        </section>
      )}

      <div className="clippy-sprite-row">
        {!bubbleOpen && (
          <button
            type="button"
            className="clippy-teaser"
            onClick={() => setBubbleOpen(true)}
          >
            {unreadCount > 0
              ? `${unreadCount} new XMTP message${unreadCount > 1 ? "s" : ""}!`
              : "Need help? Ask Clippy!"}
          </button>
        )}
        <ClippySprite
          mood={mood}
          unreadCount={unreadCount}
          onClick={handleSpriteClick}
          onPointerDown={handleSpritePointerDown}
        />
      </div>
    </div>
  );
}
