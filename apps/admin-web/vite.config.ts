import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/adminweb/",
  plugins: [react()],
  server: { host: "0.0.0.0" },
  preview: { host: "0.0.0.0" },
  build: {
    sourcemap: false,
    outDir: "../public-website/adminweb",
    emptyOutDir: true,
  },
});
