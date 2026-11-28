import { useEffect, useMemo, useRef, useState } from "react";
import { useHavenKernel, type ActiveTransfer } from "../../context/HavenKernelContext";
import { formatBytes } from "../../kernel/protocol";

function formatEta(loaded?: number, total?: number, rate?: number): string {
  if (typeof loaded !== "number" || typeof total !== "number" || total <= 0) return "";
  if (loaded >= total) return "Complete";
  if (!rate || rate <= 0) return "Calculating…";
  const remainingSec = Math.max(1, Math.ceil((total - loaded) / rate));
  if (remainingSec < 60) return `About ${remainingSec} second${remainingSec === 1 ? "" : "s"} remaining`;
  const mins = Math.ceil(remainingSec / 60);
  return `About ${mins} minute${mins === 1 ? "" : "s"} remaining`;
}

function FolderIcon({ x, network }: { x: number; network?: boolean }) {
  return (
    <g transform={`translate(${x}, 18)`}>
      {/* Back flap */}
      <path
        d="M2 8 L2 4 Q2 2 4 2 L17 2 L21 6 L44 6 Q46 6 46 8 L46 34 L2 34 Z"
        fill="#e6c34d"
        stroke="#7a5c00"
        strokeWidth="1.2"
      />
      {/* Paper peeking inside folder */}
      <rect x="6" y="8" width="34" height="10" fill="#ffffff" stroke="#888888" strokeWidth="0.8" />
      {/* Front open flap */}
      <path
        d="M2 13 L46 13 L43 34 L5 34 Z"
        fill="#ffd966"
        stroke="#7a5c00"
        strokeWidth="1.2"
      />
      <line x1="4" y1="15" x2="44" y2="15" stroke="#fff3b8" strokeWidth="1" />
      {network && (
        <g transform="translate(26, 20)">
          <circle cx="9" cy="9" r="8" fill="#1d6fa5" stroke="#0c3c5c" strokeWidth="1.1" />
          <ellipse cx="9" cy="9" rx="4" ry="8" fill="none" stroke="#9be0ff" strokeWidth="0.9" />
          <line x1="1.5" y1="9" x2="16.5" y2="9" stroke="#9be0ff" strokeWidth="0.9" />
          <line x1="3" y1="5" x2="15" y2="5" stroke="#9be0ff" strokeWidth="0.7" />
          <line x1="3" y1="13" x2="15" y2="13" stroke="#9be0ff" strokeWidth="0.7" />
        </g>
      )}
    </g>
  );
}

function FlyingPaperScene({
  direction,
  active,
}: {
  direction: "upload" | "download";
  active: boolean;
}) {
  const leftIsNetwork = direction === "download";
  const rightIsNetwork = direction === "upload";

  return (
    <div className="transfer-scene" aria-hidden="true">
      <svg viewBox="0 0 260 66" width="260" height="66" className="transfer-svg">
        {/* Subtle dashed flight arc */}
        <path
          d="M 52 34 Q 130 -6 208 34"
          fill="none"
          stroke="#9aa4b2"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity={active ? 0.65 : 0.25}
        />

        {/* Source folder (left) */}
        <FolderIcon x={14} network={leftIsNetwork} />

        {/* Destination folder (right) */}
        <FolderIcon x={198} network={rightIsNetwork} />

        {/* Flying papers */}
        {active &&
          [0, 1, 2].map((idx) => (
            <g
              key={idx}
              className={`transfer-paper transfer-paper-${idx}`}
            >
              <path
                d="M0 0 L13 0 L18 5 L18 22 L0 22 Z"
                fill="#ffffff"
                stroke="#4a5568"
                strokeWidth="1"
              />
              <path d="M13 0 L13 5 L18 5" fill="#d8dee9" stroke="#4a5568" strokeWidth="0.8" />
              <line x1="3" y1="8" x2="14" y2="8" stroke="#64748b" strokeWidth="1" />
              <line x1="3" y1="12" x2="14" y2="12" stroke="#64748b" strokeWidth="1" />
              <line x1="3" y1="16" x2="11" y2="16" stroke="#94a3b8" strokeWidth="1" />
            </g>
          ))}
      </svg>
    </div>
  );
}

function ProgressBar({ transfer }: { transfer: ActiveTransfer }) {
  const hasTotal = typeof transfer.total === "number" && transfer.total > 0;
  const pct =
    transfer.status === "done"
      ? 100
      : hasTotal && typeof transfer.loaded === "number"
        ? Math.max(0, Math.min(100, Math.round((transfer.loaded / transfer.total!) * 100)))
        : null;

  const isIndeterminate = transfer.status === "active" && pct === null;

  return (
    <div
      className="w98-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct ?? undefined}
    >
      {isIndeterminate ? (
        <div className="w98-progress-indeterminate" />
      ) : (
        <div
          className={`w98-progress-fill${transfer.status === "error" ? " w98-progress-fill-err" : ""}`}
          style={{ width: `${pct ?? 0}%` }}
        />
      )}
    </div>
  );
}

export function TransferDialog() {
  const { transfers, dismissTransfer, clearAllTransfers } = useHavenKernel();
  const [hidden, setHidden] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Automatically unhide when a brand-new active transfer arrives
  const activeCount = useMemo(
    () => transfers.filter((t) => t.status === "active").length,
    [transfers],
  );
  const prevActiveCountRef = useRef(0);
  useEffect(() => {
    if (activeCount > prevActiveCountRef.current) {
      setHidden(false);
    }
    prevActiveCountRef.current = activeCount;
  }, [activeCount]);

  if (transfers.length === 0) return null;

  if (hidden) {
    return (
      <button
        type="button"
        className="w98-button transfer-minimized-pill"
        onClick={() => setHidden(false)}
        title="Show File Transfer Dialog"
      >
        📄 {activeCount > 0 ? `Transferring ${activeCount} file${activeCount === 1 ? "" : "s"}…` : "Transfers"}
      </button>
    );
  }

  const primary = transfers.find((t) => t.status === "active") ?? transfers[transfers.length - 1]!;
  const isAnyActive = activeCount > 0;
  const title =
    transfers.length > 1
      ? `${primary.direction === "upload" ? "Uploading" : "Downloading"} (${transfers.length} items)…`
      : primary.status === "done"
        ? `${primary.direction === "upload" ? "Upload" : "Download"} Complete`
        : primary.status === "error"
          ? "Transfer Error"
          : primary.direction === "upload"
            ? "Uploading to Haven…"
            : "Downloading from Haven…";

  const defaultFrom = primary.direction === "upload" ? "Local Disk" : "Filecoin / IPFS";
  const defaultTo = primary.direction === "upload" ? "Filecoin Synapse" : "Haven OS Shared Cache";
  const fromLabel = primary.from || defaultFrom;
  const toLabel = primary.to || defaultTo;
  const eta = formatEta(primary.loaded, primary.total, primary.rateBytesPerSec);

  const onTitlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const startPos = pos ?? { x: rect.left, y: rect.top };
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: startPos.x,
      origY: startPos.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onTitlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({
      x: Math.max(8, Math.min(window.innerWidth - 398, dragRef.current.origX + dx)),
      y: Math.max(8, Math.min(window.innerHeight - 160, dragRef.current.origY + dy)),
    });
  };

  const onTitlePointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      className="w98-window transfer-dialog"
      style={pos ? { left: pos.x, top: pos.y, right: "auto" } : undefined}
      role="dialog"
      aria-label={title}
    >
      <div
        className="w98-title-bar w98-title-bar-active"
        style={{ cursor: "move" }}
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={onTitlePointerUp}
      >
        <div className="w98-title-bar-text">
          <span>{primary.direction === "upload" ? "📤" : "📥"}</span>
          <span>{title}</span>
        </div>
        <div className="w98-title-bar-controls">
          <button
            type="button"
            className="w98-title-button"
            title="Minimize"
            aria-label="Minimize"
            onClick={() => setHidden(true)}
          >
            _
          </button>
          <button
            type="button"
            className="w98-title-button"
            title="Close"
            aria-label="Close"
            onClick={clearAllTransfers}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="transfer-body">
        <FlyingPaperScene direction={primary.direction} active={isAnyActive} />

        <div className="transfer-meta">
          <div className="transfer-filename" title={primary.label}>
            <strong>{primary.label}</strong>
            {primary.appId && <span className="badge mono">{primary.appId}</span>}
          </div>
          <div className="transfer-route">
            From &lsquo;{fromLabel}&rsquo; to &lsquo;{toLabel}&rsquo;
          </div>
        </div>

        <ProgressBar transfer={primary} />

        <div className="transfer-stats">
          <span>
            {primary.status === "error"
              ? `⚠ ${primary.detail || "Transfer failed"}`
              : primary.status === "done"
                ? `✓ ${primary.detail || (primary.total ? formatBytes(primary.total) : "Done")}`
                : typeof primary.loaded === "number" && typeof primary.total === "number" && primary.total > 0
                  ? `${formatBytes(primary.loaded)} of ${formatBytes(primary.total)}${
                      primary.rateBytesPerSec ? ` (${formatBytes(primary.rateBytesPerSec)}/s)` : ""
                    }`
                  : typeof primary.loaded === "number" && primary.loaded > 0
                    ? `${formatBytes(primary.loaded)} transferred…`
                    : primary.detail || (primary.direction === "upload" ? "Uploading…" : "Downloading…")}
          </span>
          {primary.status === "active" && eta && <span className="mono">{eta}</span>}
        </div>

        {transfers.length > 1 && (
          <div className="transfer-extra-list">
            {transfers
              .filter((t) => t.id !== primary.id)
              .map((t) => (
                <div key={t.id} className="transfer-extra-row">
                  <span className="transfer-extra-name" title={t.label}>
                    {t.direction === "upload" ? "📤" : "📥"} {t.label}
                  </span>
                  <span className="mono" style={{ fontSize: 10 }}>
                    {t.status === "done"
                      ? "Done"
                      : t.status === "error"
                        ? "Error"
                        : typeof t.loaded === "number" && typeof t.total === "number" && t.total > 0
                          ? `${Math.round((t.loaded / t.total) * 100)}%`
                          : "…"}
                  </span>
                  <button
                    type="button"
                    className="w98-button w98-button-sm"
                    style={{ padding: "0 4px", minWidth: 0 }}
                    onClick={() => dismissTransfer(t.id)}
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              ))}
          </div>
        )}

        <div className="transfer-actions">
          <button
            type="button"
            className="w98-button w98-button-sm"
            onClick={() => setHidden(true)}
          >
            Hide
          </button>
          <button
            type="button"
            className="w98-button w98-button-sm"
            onClick={clearAllTransfers}
          >
            {isAnyActive ? "Dismiss" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
