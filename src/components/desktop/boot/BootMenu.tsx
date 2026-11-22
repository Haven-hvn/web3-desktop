import { useEffect } from "react";
import { useDesktop } from "../../../context/DesktopContext";
import { useHavenKernel } from "../../../context/HavenKernelContext";

const HAVEN_ASCII = `
 ██╗  ██╗ █████╗ ██╗   ██╗███████╗███╗   ██╗     ██████╗ ███████╗
 ██║  ██║██╔══██╗██║   ██║██╔════╝████╗  ██║    ██╔═══██╗██╔════╝
 ███████║███████║██║   ██║█████╗  ██╔██╗ ██║    ██║   ██║███████╗
 ██╔══██║██╔══██║╚██╗ ██╔╝██╔══╝  ██║╚██╗██║    ██║   ██║╚════██║
 ██║  ██║██║  ██║ ╚████╔╝ ███████╗██║ ╚████║    ╚██████╔╝███████║
 ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═══╝     ╚═════╝ ╚══════╝
`;

export function BootMenu() {
  const { setPhase } = useDesktop();
  const { config, arkivProbe } = useHavenKernel();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "1" || e.key === "Enter") setPhase("splash");
      if (e.key === "2") setPhase("workspace");
      if (e.key === "3") setPhase("bsod");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPhase]);

  return (
    <div className="boot-menu">
      <pre className="boot-ascii" aria-hidden="true">
        {HAVEN_ASCII}
      </pre>
      <h1 className="boot-title">Haven OS 98 — Web3 Application Protocol Startup Menu</h1>
      <div className="boot-meta">
        Arkiv L3: {config.arkivNetworkName}{" "}
        {arkivProbe
          ? arkivProbe.online
            ? `• Block #${arkivProbe.blockNumber?.toLocaleString() ?? "?"} • ${arkivProbe.entityCount?.toLocaleString() ?? "?"} entities (${arkivProbe.rttMs}ms)`
            : `• Offline (${arkivProbe.error})`
          : "• Probing…"}
        <br />
        Haven-AOL Canister: {config.havenAolCanisterId} • Storage: Filecoin / IPFS
      </div>
      <div className="boot-divider" />
      <button type="button" className="boot-option" onClick={() => setPhase("splash")}>
        1. Boot Haven OS 98 Desktop (Normal + Wallet Login)
      </button>
      <button type="button" className="boot-option" onClick={() => setPhase("workspace")}>
        2. Fast Boot Directly to Workspace (Guest Mode)
      </button>
      <button type="button" className="boot-option" onClick={() => setPhase("bsod")}>
        3. Boot into Arkiv-DOS 0x44…0044 Safe Mode
      </button>
      <div className="boot-divider" />
      <div className="boot-meta">Press 1, 2, 3 or click an option above.</div>
    </div>
  );
}
