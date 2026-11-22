import { useDesktop } from "../../context/DesktopContext";
import { BootMenu } from "./boot/BootMenu";
import { Bsod } from "./boot/Bsod";
import { LoginDialog } from "./boot/LoginDialog";
import { ShutdownScreen } from "./boot/ShutdownScreen";
import { SplashScreen } from "./boot/SplashScreen";
import { Workspace } from "./Workspace";

export function DesktopPage() {
  const { phase } = useDesktop();

  const content = (() => {
    switch (phase) {
      case "boot-menu":
        return <BootMenu />;
      case "splash":
        return <SplashScreen />;
      case "login":
        return <LoginDialog />;
      case "workspace":
        return <Workspace />;
      case "shutdown":
        return <ShutdownScreen />;
      case "bsod":
        return <Bsod />;
    }
  })();

  return <div className="os-root">{content}</div>;
}
