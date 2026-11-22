import { DesktopPage } from "./components/desktop/DesktopPage";
import { DesktopProvider } from "./context/DesktopContext";
import { HavenKernelProvider } from "./context/HavenKernelContext";
import { ThemeProvider } from "./context/ThemeProvider";

export function App() {
  return (
    <ThemeProvider>
      <HavenKernelProvider>
        <DesktopProvider>
          <DesktopPage />
        </DesktopProvider>
      </HavenKernelProvider>
    </ThemeProvider>
  );
}
