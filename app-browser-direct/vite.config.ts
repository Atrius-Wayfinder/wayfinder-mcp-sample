import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { config } from "../config";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/mcp-proxy": {
        target: config.mcpBaseUrl,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mcp-proxy/, ""),
      },
      "/openai-proxy": {
        target: config.openAiEndpoint,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openai-proxy/, ""),
      },
    },
  },
});
