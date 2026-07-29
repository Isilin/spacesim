import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/auth": { target: "http://127.0.0.1:3001" },
      "/health": { target: "http://127.0.0.1:3001" },
      "/api/admin": { target: "http://127.0.0.1:3001" },
    },
  },
});
