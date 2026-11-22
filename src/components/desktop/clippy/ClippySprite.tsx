import React from "react";

export type ClippyMood = "idle" | "thinking" | "alert" | "sleeping";

interface ClippySpriteProps {
  mood: ClippyMood;
  unreadCount: number;
  onClick: () => void;
  onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
}

export function ClippySprite({
  mood,
  unreadCount,
  onClick,
  onPointerDown,
}: ClippySpriteProps) {
  return (
    <button
      type="button"
      className={`clippy-sprite clippy-mood-${mood}`}
      onClick={onClick}
      onPointerDown={onPointerDown}
      title="Clippy — Haven OS XMTP Assistant (drag to move, click to chat)"
      aria-label="Toggle Clippy Assistant"
    >
      <svg
        width="74"
        height="86"
        viewBox="0 0 74 86"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="clippy-svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="clippyWire" x1="16" y1="8" x2="58" y2="76" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="35%" stopColor="#cbd5e1" />
            <stop offset="70%" stopColor="#64748b" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>
          <filter id="clippyShadow" x="0" y="0" width="74" height="86" filterUnits="userSpaceOnUse">
            <feDropShadow dx="2" dy="3" stdDeviation="1.2" floodColor="#000000" floodOpacity="0.45" />
          </filter>
        </defs>

        {/* Ground shadow */}
        <ellipse cx="37" cy="80" rx="18" ry="4" fill="rgba(0,0,0,0.28)" />

        {/* Classic paperclip body (outer dark outline + metallic inner wire) */}
        <g filter="url(#clippyShadow)">
          <path
            d="M25 56V22C25 13 31 8 38.5 8C46 8 52 13 52 22V60C52 70 45 76 36 76C27 76 20 70 20 60V28C20 21 24.5 16 31 16C37.5 16 42 21 42 28V54C42 59 39 62 35 62C31 62 28.5 59 28.5 54V30"
            stroke="#111827"
            strokeWidth="8.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M25 56V22C25 13 31 8 38.5 8C46 8 52 13 52 22V60C52 70 45 76 36 76C27 76 20 70 20 60V28C20 21 24.5 16 31 16C37.5 16 42 21 42 28V54C42 59 39 62 35 62C31 62 28.5 59 28.5 54V30"
            stroke="url(#clippyWire)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M26.5 21C26.5 14 31.5 10.5 38.5 10.5C45 10.5 49.5 14.5 49.5 22V59"
            stroke="#ffffff"
            strokeOpacity="0.65"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </g>

        {/* Expressive eyebrows */}
        <path
          d={mood === "thinking" ? "M21 25Q28 20 34 24" : "M21 24Q28 19 34 23"}
          stroke="#111827"
          strokeWidth="2.6"
          strokeLinecap="round"
          className="clippy-brow-left"
        />
        <path
          d={mood === "thinking" ? "M40 22Q47 18 54 24" : "M40 23Q47 19 54 24"}
          stroke="#111827"
          strokeWidth="2.6"
          strokeLinecap="round"
          className="clippy-brow-right"
        />

        {/* Big Clippy eyes */}
        <g className="clippy-eyes">
          <ellipse cx="28" cy="34" rx="7.2" ry="8.5" fill="#ffffff" stroke="#111827" strokeWidth="2.2" />
          <ellipse cx="46" cy="34" rx="7.2" ry="8.5" fill="#ffffff" stroke="#111827" strokeWidth="2.2" />

          {mood === "sleeping" ? (
            <>
              <path d="M23 35Q28 38 33 35" stroke="#111827" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M41 35Q46 38 51 35" stroke="#111827" strokeWidth="2.2" strokeLinecap="round" />
            </>
          ) : (
            <>
              <circle
                cx={mood === "thinking" ? 26 : 29.5}
                cy={mood === "thinking" ? 31 : 34.5}
                r="3.2"
                fill="#111827"
              />
              <circle
                cx={mood === "thinking" ? 44 : 47.5}
                cy={mood === "thinking" ? 31 : 34.5}
                r="3.2"
                fill="#111827"
              />
              <circle
                cx={mood === "thinking" ? 25 : 28.5}
                cy={mood === "thinking" ? 29.8 : 33.2}
                r="1.1"
                fill="#ffffff"
              />
              <circle
                cx={mood === "thinking" ? 43 : 46.5}
                cy={mood === "thinking" ? 29.8 : 33.2}
                r="1.1"
                fill="#ffffff"
              />
            </>
          )}
        </g>

        {/* Thinking Zzz / Sparkles */}
        {mood === "sleeping" && (
          <text x="54" y="16" fill="#ffffe1" stroke="#000" strokeWidth="0.6" fontSize="11" fontWeight="bold">
            zZ
          </text>
        )}
        {mood === "thinking" && (
          <g className="clippy-dots">
            <circle cx="57" cy="14" r="2.2" fill="#ffffe1" stroke="#000" strokeWidth="1" />
            <circle cx="63" cy="9" r="2.8" fill="#ffffe1" stroke="#000" strokeWidth="1" />
          </g>
        )}
      </svg>

      {unreadCount > 0 && (
        <span className="clippy-unread-badge" title={`${unreadCount} unread message(s)`}>
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
}
