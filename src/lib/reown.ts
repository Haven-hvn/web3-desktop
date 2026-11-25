import { createAppKit } from "@reown/appkit/react";
import { QueryClient } from "@tanstack/react-query";
import { getProjectId, networks, wagmiAdapter } from "../config/wagmi";

export const queryClient = new QueryClient();

export const modal = getProjectId()
  ? createAppKit({
      adapters: [wagmiAdapter],
      projectId: getProjectId(),
      networks,
      metadata: {
        name: "Haven OS Web3 Desktop",
        description: "Web3 Desktop aggregating Haven media, gates, and VetKD unlocks.",
        url: typeof window !== "undefined" ? window.location.origin : "https://web3-desktop.pinme.dev/",
        icons: [`${typeof window !== "undefined" ? window.location.origin : "https://web3-desktop.pinme.dev"}/favicon.ico`],
      },
      themeMode: "dark",
      features: { analytics: false },
    })
  : null;
