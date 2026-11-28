import { WagmiProvider, type Config } from "wagmi";
import { QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DesktopPage } from "./components/desktop/DesktopPage";
import { DesktopProvider } from "./context/DesktopContext";
import { HavenKernelProvider } from "./context/HavenKernelContext";
import { ThemeProvider } from "./context/ThemeProvider";
import { wagmiAdapter } from "./config/wagmi";
import { queryClient } from "./lib/reown";

export function App() {
  return (
    <ErrorBoundary scope="Haven OS 98" fullScreen>
      <WagmiProvider config={wagmiAdapter.wagmiConfig as Config}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <HavenKernelProvider>
              <DesktopProvider>
                <DesktopPage />
              </DesktopProvider>
            </HavenKernelProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  );
}
