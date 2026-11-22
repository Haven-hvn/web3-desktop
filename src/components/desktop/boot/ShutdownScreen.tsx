import { useDesktop } from "../../../context/DesktopContext";

export function ShutdownScreen() {
  const { setPhase } = useDesktop();
  return (
    <div className="shutdown-screen">
      <div className="shutdown-box">
        <div className="shutdown-message">
          It is now safe to close your browser tab.
          <br />
          All Haven state remains sovereign on Arkiv, Filecoin &amp; ICP.
        </div>
        <div style={{ marginTop: 28 }}>
          <button type="button" className="w98-button" onClick={() => setPhase("boot-menu")}>
            Restart Haven OS 98
          </button>
        </div>
      </div>
    </div>
  );
}
