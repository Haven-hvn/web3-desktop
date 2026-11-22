import { useHavenKernel } from "../../../context/HavenKernelContext";
import { currentEpochNow } from "../../../kernel/protocol";

export default function AboutApp() {
  const { config, entities, gates, arkivProbe } = useHavenKernel();
  return (
    <div className="app-shell">
      <div className="app-main" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 40 }}>🏛️</span>
          <div>
            <h2 style={{ margin: 0 }}>Haven OS 98 — Web3 Apps Over Data Desktop</h2>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Sovereign L7 Desktop aggregating Haven Media, Fairhaven, Redhaven, and FeetOnFire
            </div>
          </div>
        </div>

        <fieldset className="w98-groupbox">
          <legend>The Apps Over Data Thesis</legend>
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            Haven is an application-layer (L7) protocol composing four public networks with{" "}
            <strong>zero private backends (Datastores: 0)</strong>:
          </p>
          <ul style={{ margin: "6px 0 0 18px", padding: 0, lineHeight: 1.55 }}>
            <li>
              <strong>Arkiv OP L3 (0x44…0044)</strong> — Ephemeral entity metadata &amp; discovery
              (<code>grp</code> hierarchy + BTL expiry). Currently pointed at{" "}
              <code className="mono">{config.arkivNetworkName}</code>.
            </li>
            <li>
              <strong>EVM L1 / L2 Token Gates</strong> — ERC-20 / ERC-721 asset ownership on
              Ethereum, Base, Arbitrum, Optimism, and Sepolia as permissionless access control.
            </li>
            <li>
              <strong>ICP Haven-AOL VetKD</strong> — Canister{" "}
              <code className="mono">{config.havenAolCanisterId}</code> verifies EIP-712{" "}
              <code>GateRequestV3</code> signatures and derives 30-day epoch decryption keys
              (current Epoch <strong className="mono">#{currentEpochNow()}</strong>).
            </li>
            <li>
              <strong>Filecoin Onchain Cloud / IPFS</strong> — Encrypted media bytes stored as
              durable CommP <code>piece</code> or clear <code>fcid</code> CIDs.
            </li>
          </ul>
        </fieldset>

        <fieldset className="w98-groupbox">
          <legend>Live Session Telemetry</legend>
          <div className="mono" style={{ fontSize: 11, lineHeight: 1.6 }}>
            <div>Arkiv RPC: {config.arkivRpcUrl}</div>
            <div>
              Arkiv Status:{" "}
              {arkivProbe?.online
                ? `ONLINE (Block #${arkivProbe.blockNumber?.toLocaleString()}, ${arkivProbe.entityCount?.toLocaleString()} chain entities)`
                : "Offline / Probing"}
            </div>
            <div>
              Haven Universe: {entities.length} entities indexed across {gates.length} token gates
            </div>
          </div>
        </fieldset>
      </div>
    </div>
  );
}
