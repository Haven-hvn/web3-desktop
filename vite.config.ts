import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = resolve(__dirname);
const physicalRoot = (() => {
  try {
    return realpathSync(projectRoot);
  } catch {
    return projectRoot;
  }
})();

// Keep Vite's heavy dependency optimization cache on fast VM ext4 when HOME is set.
const cacheDir = process.env.HOME
  ? join(
      process.env.HOME,
      ".cache",
      "projects",
      `${basename(projectRoot)}-${createHash("sha1").update(physicalRoot).digest("hex").slice(0, 8)}`,
      "vite",
    )
  : "node_modules/.vite";

export default defineConfig({
  plugins: [react()],
  cacheDir,
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    exclude: ["@xmtp/wasm-bindings", "@xmtp/browser-sdk"],
    include: ["@xmtp/proto"],
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      "haven-aol": resolve(projectRoot, "../haven-aol/packages/typescript/src/types.ts"),
    },
  },
  server: {
    host: true,
    port: 5173,
    fs: {
      allow: [projectRoot, resolve(projectRoot, ".."), physicalRoot],
    },
  },
  build: {
    target: "es2022",
  },
});
