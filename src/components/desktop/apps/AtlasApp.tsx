import { useCallback, useEffect, useState } from "react";
import { useHavenKernel } from "../../../context/HavenKernelContext";
import { probeHavenAolCanister } from "../../../kernel/aol";
import { probeArkiv } from "../../../kernel/arkiv";
import { probeEvmAndFilecoinChains, type ChainProbeResult } from "../../../kernel/evm";
import { currentEpochNow, epochSecondsRemaining } from "../../../kernel/protocol";

export default function AtlasApp() {
  const { config, entities, gates, unlockedKeys } = useHavenKernel();
  const [chains, setChains] = useState<ChainProbeResult[]>([]);
  const [arkiv, setArkiv] = useState<{
    online: boolean;
    blockNumber: number | null;
    entityCount: number | null;
    rttMs: number;
    error?: string;
  } | null>(null);
  const [aol, setAol] = useState<{
    online: boolean;
    canisterEpoch: number | null;
    rttMs: number;
    error?: string;
  } | null>(null);
  const [probing, setProbing] = useState(false);

  const runProbes = useCallback(async () => {
    setProbing(true);
    try {
      const [arkivRes, chainRes, aolRes] = await Promise.all([
        probeArkiv(config),
        probeEvmAndFilecoinChains(),
        probeHavenAolCanister(config),
      ]);
      setArkiv(arkivRes);
      setChains(chainRes);
      setAol(aolRes);
    } finally {
      setProbing(false);
    }
  }, [config]);

  useEffect(() => {
    void runProbes();
  }, [runProbes]);

  const epoch = currentEpochNow();
  const daysLeft = (epochSecondsRemaining() / 86_400).toFixed(1);

  return (
    <div className="app-shell">
      <div className="app-header-bar">
        <strong>🌐 Haven Atlas — Live Public Network Observatory</strong>
        <button
          type="button"
          className="w98-button w98-button-sm w98-button-primary"
          style={{ marginLeft: "auto" }}
          disabled={probing}
          onClick={() => void runProbes()}
        >
          {probing ? "Probing Networks…" : "🔄 Probe Live RPCs"}
        </button>
      </div>

      <div className="app-main" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 8,
          }}
        >
          <div className="w98-panel" style={{ padding: 10 }}>
            <div style={{ fontSize: 11, opacity: 0.75 }}>Arkiv L3 ({config.arkivNetworkName})</div>
            <div style={{ fontSize: 16, fontWeight: "bold", marginTop: 3 }}>
              {arkiv?.online ? `🟢 #${arkiv.blockNumber?.toLocaleString()}` : arkiv ? "🔴 Offline" : "…"}
            </div>
            <div className="mono" style={{ fontSize: 10, marginTop: 3 }}>
              {arkiv?.online
                ? `${arkiv.entityCount?.toLocaleString()} total entities · ${arkiv.rttMs}ms`
                : arkiv?.error ?? "Probing…"}
            </div>
          </div>

          <div className="w98-panel" style={{ padding: 10 }}>
            <div style={{ fontSize: 11, opacity: 0.75 }}>ICP Haven-AOL VetKD</div>
            <div style={{ fontSize: 16, fontWeight: "bold", marginTop: 3 }}>
              {aol?.online ? `🟢 Epoch #${aol.canisterEpoch}` : aol ? "🟡 Unreachable" : "…"}
            </div>
            <div className="mono" style={{ fontSize: 10, marginTop: 3 }}>
              {config.havenAolCanisterId} · {aol ? `${aol.rttMs}ms` : ""}
            </div>
          </div>

          <div className="w98-panel" style={{ padding: 10 }}>
            <div style={{ fontSize: 11, opacity: 0.75 }}>VetKD 30-Day Epoch Clock</div>
            <div style={{ fontSize: 16, fontWeight: "bold", marginTop: 3 }} className="mono">
              Epoch #{epoch}
            </div>
            <div className="mono" style={{ fontSize: 10, marginTop: 3 }}>
              {daysLeft} days until key rotation · {unlockedKeys.length} unlocked
            </div>
          </div>

          <div className="w98-panel" style={{ padding: 10 }}>
            <div style={{ fontSize: 11, opacity: 0.75 }}>Indexed Haven Universe</div>
            <div style={{ fontSize: 16, fontWeight: "bold", marginTop: 3 }} className="mono">
              {entities.length} Entities
            </div>
            <div className="mono" style={{ fontSize: 10, marginTop: 3 }}>
              Across {gates.length} EVM Token Gates
            </div>
          </div>
        </div>

        <fieldset className="w98-groupbox">
          <legend>Live Browser Probes — EVM Gate Chains &amp; Filecoin FEVM</legend>
          <table className="data-table">
            <thead>
              <tr>
                <th>Network</th>
                <th>Status</th>
                <th>Block Height</th>
                <th>Round-Trip</th>
              </tr>
            </thead>
            <tbody>
              {chains.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong> <span className="badge mono">{c.shortName}</span>
                  </td>
                  <td>
                    {c.online ? (
                      <span className="badge badge-ok">ONLINE</span>
                    ) : (
                      <span className="badge badge-err" title={c.error}>
                        ERROR
                      </span>
                    )}
                  </td>
                  <td className="mono">
                    {c.blockNumber != null ? `#${c.blockNumber.toLocaleString()}` : "—"}
                  </td>
                  <td className="mono">{c.rttMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </fieldset>
      </div>

      <div className="app-statusbar">
        <span>All probes execute directly from your browser over public CORS-open RPCs</span>
        <span className="mono">Datastores: 0</span>
      </div>
    </div>
  );
}
