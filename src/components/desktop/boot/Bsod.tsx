import { useEffect } from "react";
import { useDesktop } from "../../../context/DesktopContext";

export function Bsod() {
  const { setPhase } = useDesktop();

  useEffect(() => {
    const onKey = () => setPhase("workspace");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPhase]);

  return (
    <div className="bsod" onClick={() => setPhase("workspace")}>
      <div className="bsod-header">Haven OS 98</div>
      <p>A fatal exception 0x44…0044 has occurred at ARKIV_PRECOMPILE:ENTITY_REGISTRY.</p>
      <p>
        The current Arkiv-DOS mode has zero private databases (Datastores: 0) and refused to boot
        a Web2 backend.
      </p>
      <p style={{ marginTop: 20 }}>
        * Press any key or click anywhere to return to Haven OS 98 Desktop.
      </p>
      <p>* All Filecoin CIDs and EVM token gates remain unaffected.</p>
    </div>
  );
}
