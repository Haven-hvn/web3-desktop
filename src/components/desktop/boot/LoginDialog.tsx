import { useState } from "react";
import { useDesktop } from "../../../context/DesktopContext";
import { useHavenKernel } from "../../../context/HavenKernelContext";
import { shortAddress } from "../../../kernel/protocol";

export function LoginDialog() {
  const { setPhase } = useDesktop();
  const { discoveredWallets, connectWallet, setWatchAddress, wallet, config } = useHavenKernel();
  const [watchInput, setWatchInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setError(null);
    setConnecting(true);
    try {
      await connectWallet();
      setPhase("workspace");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  };

  const handleWatch = () => {
    setError(null);
    try {
      setWatchAddress(watchInput);
      setPhase("workspace");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="login-screen" role="dialog" aria-label="Haven OS Login">
      <div className="login-window w98-window">
        <div className="w98-title-bar w98-title-bar-active">
          <span className="w98-title-bar-text">🔑 Welcome to Haven OS 98</span>
          <span />
        </div>
        <div className="login-body">
          <div className="login-header-row">
            <span className="login-key-icon" aria-hidden="true">
              🏛️
            </span>
            <div>
              <strong>Sign in with an EVM Wallet (or browse as Guest)</strong>
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 3 }}>
                One OS session unlocks token gates across Haven Media, Fairhaven, Redhaven, and
                FeetOnFire using Haven-AOL VetKD ({config.arkivNetworkName} Arkiv).
              </div>
            </div>
          </div>

          {wallet.address && (
            <div className="w98-panel" style={{ padding: 8, fontSize: 11 }}>
              Active address: <strong className="mono">{shortAddress(wallet.address)}</strong> (
              {wallet.walletName})
            </div>
          )}

          <div className="login-actions">
            <button
              type="button"
              className="w98-button w98-button-primary"
              disabled={connecting}
              onClick={handleConnect}
            >
              {connecting
                ? "Connecting…"
                : discoveredWallets.length > 0
                  ? `🦊 Connect ${discoveredWallets[0].name}`
                  : "🦊 Connect EVM Wallet"}
            </button>
            <button
              type="button"
              className="w98-button"
              onClick={() => setPhase("workspace")}
            >
              👤 Continue as Guest
            </button>
          </div>

          <fieldset className="w98-groupbox">
            <legend>Or Inspect Token Gates with a Watch-Only Address</legend>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                className="w98-field mono"
                style={{ flex: 1 }}
                placeholder="0x… (check ERC-20/NFT gate balances read-only)"
                value={watchInput}
                onChange={(e) => setWatchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && watchInput.trim()) handleWatch();
                }}
              />
              <button
                type="button"
                className="w98-button"
                disabled={!watchInput.trim()}
                onClick={handleWatch}
              >
                Watch
              </button>
            </div>
          </fieldset>

          {error && (
            <div style={{ color: "var(--theme-error)", fontSize: 11 }}>⚠ {error}</div>
          )}
        </div>
      </div>
    </div>
  );
}
