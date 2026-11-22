import { useDesktop } from "../../../context/DesktopContext";
import { WindowFrame } from "./WindowFrame";

export function WindowLayer() {
  const { windowManager } = useDesktop();
  return (
    <>
      {windowManager.windows
        .filter((w) => !w.minimized)
        .map((win) => (
          <WindowFrame key={win.id} window={win} />
        ))}
    </>
  );
}
