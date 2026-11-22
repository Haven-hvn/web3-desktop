import { useState } from "react";
import { useHavenKernel } from "../../../context/HavenKernelContext";
import { CHAINS, currentEpochNow, shortAddress } from "../../../kernel/protocol";

export default function WalletApp() {
  const {
    wallet,
    discoveredWallets,
    connectWallet,
    setWatchAddress,
    disconnectWallet,
    gates,
    getGateMeta,
    recheckGateMemberships,
    unlockedKeys,
    unlockGate,
    forgetAllKeys,
  } = useHavenKernel();

  const [watchInput, setWatchInput] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleConnect = async (idx: number) => {
    setMsg(null);
    setBusy(true);
    try {
      await connectWallet(discoveredWallets[idx]);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCheckAllGates = async () => {
    setMsg("Checking EVM L1/L2 token balances across discovered Haven gates…");
    await recheckGateMemberships();
    setMsg("Gate balance check complete.");
  };

  return (
    <div className="app-shell">
      <div className="app-header-bar">
        <strong>🔑 OS Wallet &amp; Haven-AOL VetKD Keyring</strong>
        <span className="badge mono" style={{ marginLeft: "auto" }}>
          Epoch #{currentEpochNow()}
        </span>
      </div>

      <div className="app-main" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <fieldset className="w98-groupbox">
          <legend>Active EVM Identity</legend>
          {wallet.address ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div className="mono" style={{ fontWeight: "bold", fontSize: 13 }}>
                  {wallet.address}
                </div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>
                  Provider: {wallet.walletName}{" "}
                  {wallet.watchOnly ? "(Read-only balance checks; connect injected wallet to unlock VetKD)" : `• Chain #${wallet.chainId}`}
                </div>
              </div>
              <button type="button" className="w98-button" onClick={disconnectWallet}>
                Disconnect
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {discoveredWallets.length > 0 ? (
                  discoveredWallets.map((w, idx) => (
                    <button
                      key={w.id}
                      type="button"
                      className="w98-button w98-button-primary"
                      disabled={busy}
                      onClick={() => void handleConnect(idx)}
                    >
                      🦊 Connect {w.name}
                    </button>
                  ))
                ) : (
                  <div style={{ fontSize: 11, opacity: 0.8 }}>
                    No EIP-1193/EIP-6963 browser wallet extension detected. Open Haven OS in a
                    wallet-enabled browser (MetaMask, Rabby, Frame) or enter a watch address below.
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="text"
                  className="w98-field mono"
                  style={{ flex: 1 }}
                  placeholder="0x… watch-only address to check L2 token gates"
                  value={watchInput}
                  onChange={(e) => setWatchInput(e.target.value)}
                />
                <button
                  type="button"
                  className="w98-button"
                  disabled={!watchInput.trim()}
                  onClick={() => {
                    setMsg(null);
                    try {
                      setWatchAddress(watchInput);
                    } catch (err) {
                      setMsg(err instanceof Error ? err.message : String(err));
                    }
                  }}
                >
                  Set Watch Address
                </button>
              </div>
            </div>
          )}
          {msg && <div style={{ fontSize: 11, marginTop: 6, color: "var(--theme-info)" }}>{msg}</div>}
        </fieldset>

        <fieldset className="w98-groupbox">
          <legend>Discovered EVM Token Gates ({gates.filter((g) => g.gate).length})</legend>
          <div style={{ marginBottom: 8, display: "flex", gap: 6 }}>
            <button
              type="button"
              className="w98-button w98-button-sm"
              onClick={() => void handleCheckAllGates()}
            >
              🔍 Check My Gate Balances
            </button>
            <button
              type="button"
              className="w98-button w98-button-sm"
              disabled={unlockedKeys.length === 0}
              onClick={forgetAllKeys}
            >
              🧹 Forget {unlockedKeys.length} Epoch Key(s)
            </button>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Gate / Board</th>
                <th>Chain</th>
                <th>Threshold</th>
                <th>Standing</th>
                <th>VetKD Key</th>
              </tr>
            </thead>
            <tbody>
              {gates
                .filter((g) => g.gate)
                .map((g) => {
                  const gate = g.gate!;
                  const meta = getGateMeta(gate);
                  const unlocked = unlockedKeys.some((k) => k.gateKey === g.gateKey);
                  return (
                    <tr key={g.gateKey}>
                      <td>
                        <strong>{meta?.symbol ?? g.slug}</strong>{" "}
                        <span className="mono" style={{ fontSize: 10, opacity: 0.75 }}>
                          {shortAddress(gate.tokenAddress)}
                        </span>
                      </td>
                      <td className="mono">{CHAINS[gate.chainId]?.shortName ?? gate.chainId}</td>
                      <td className="mono">≥ {gate.threshold}</td>
                      <td>
                        {meta?.isHolder === true ? (
                          <span className="badge badge-ok">✓ Holder</span>
                        ) : meta?.isHolder === false ? (
                          <span className="badge badge-err">✗ Not Holder</span>
                        ) : (
                          <span className="badge">Unchecked</span>
                        )}
                      </td>
                      <td>
                        {unlocked ? (
                          <span className="badge badge-ok">🔓 Active</span>
                        ) : (
                          <button
                            type="button"
                            className="w98-button w98-button-sm"
                            onClick={async () => {
                              try {
                                setMsg(`Unlocking ${g.slug} via Haven-AOL…`);
                                await unlockGate(gate, gate.epoch);
                                setMsg(`Unlocked ${g.slug} across all desktop apps!`);
                              } catch (err) {
                                setMsg(err instanceof Error ? err.message : String(err));
                              }
                            }}
                          >
                            Unlock
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </fieldset>
      </div>

      <div className="app-statusbar">
        <span>Sign once per gate per 30-day epoch — shared across every open window</span>
        <span className="mono">{unlockedKeys.length} active key(s)</span>
      </div>
    </div>
  );
}
