import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const buildId = String(process.env.APP_BUILD || Date.now().toString(36)).replace(/[^A-Za-z0-9._-]/gu, "").slice(0, 64) || "local";

// Writes the id compiled into the bundle next to it, so the server can echo
// it (X-App-Build) and an open page can notice a newer deploy.
function buildIdPlugin() {
  return {
    name: "terrap-build-id",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "build.json", source: JSON.stringify({ build: buildId }) });
    },
  };
}

export default defineConfig({
  define: {
    __APP_BUILD__: JSON.stringify(buildId),
  },
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), buildIdPlugin()],
});
