import { useState } from "react";
import { useDesktop } from "../../../context/DesktopContext";
import type { WindowInstance } from "../../../hooks/useWindowManager";

type Choice = "shutdown" | "restart" | "dos";

export default function ShutdownApp({ window: win }: { window: WindowInstance }) {
  const { setPhase, windowManager } = useDesktop();
  const [choice, setChoice] = useState<Choice>("shutdown");

  const confirm = () => {
    windowManager.closeWindow(win.id);
    if (choice === "shutdown") setPhase("shutdown");
    else if (choice === "restart") setPhase("boot-menu");
    else setPhase("bsod");
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 14,
        padding: 16,
      }}
    >
      <div style={{ fontWeight: "bold" }}>What do you want Haven OS 98 to do?</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ display: "flex", gap: 6, cursor: "pointer" }}>
          <input
            type="radio"
            name="shutdown-choice"
            checked={choice === "shutdown"}
            onChange={() => setChoice("shutdown")}
          />
          Shut down Haven OS 98
        </label>
        <label style={{ display: "flex", gap: 6, cursor: "pointer" }}>
          <input
            type="radio"
            name="shutdown-choice"
            checked={choice === "restart"}
            onChange={() => setChoice("restart")}
          />
          Restart to Boot Menu
        </label>
        <label style={{ display: "flex", gap: 6, cursor: "pointer" }}>
          <input
            type="radio"
            name="shutdown-choice"
            checked={choice === "dos"}
            onChange={() => setChoice("dos")}
          />
          Restart in Arkiv-DOS 0x44…0044 Mode
        </label>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="w98-button w98-button-primary" onClick={confirm}>
          OK
        </button>
        <button
          type="button"
          className="w98-button"
          onClick={() => windowManager.closeWindow(win.id)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
