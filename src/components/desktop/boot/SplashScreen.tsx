import { useEffect } from "react";
import { useDesktop } from "../../../context/DesktopContext";
import { useHavenKernel } from "../../../context/HavenKernelContext";

export function SplashScreen() {
  const { setPhase } = useDesktop();
  const { config, scanStatus } = useHavenKernel();

  useEffect(() => {
    const t = window.setTimeout(() => setPhase("login"), 1200);
    return () => window.clearTimeout(t);
  }, [setPhase]);

  return (
    <div
      className="boot-splash"
      onClick={() => setPhase("login")}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setPhase("login");
      }}
    >
      <div className="splash-emblem" aria-hidden="true">
        🪐
      </div>
      <h1 className="splash-title">Haven OS 98</h1>
      <p className="splash-sub">
        Apps Over Data • Arkiv ({config.arkivNetworkName}) + EVM Gates + ICP VetKD + Filecoin
      </p>
      <div className="splash-bar" aria-hidden="true">
        <div className="splash-bar-fill" />
      </div>
      <p className="splash-sub mono" style={{ fontSize: 11 }}>
        {scanStatus} (click anywhere to continue)
      </p>
    </div>
  );
}
