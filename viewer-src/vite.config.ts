import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { fileURLToPath } from "node:url";

// Builds one self-contained file: skills/throughline/viewer/viewer.html.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [preact(), viteSingleFile({ removeViteModuleLoader: true })],
  server: { host: "127.0.0.1", open: "/viewer.html" },
  build: {
    outDir: fileURLToPath(new URL("../skills/throughline/viewer", import.meta.url)),
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL("viewer.html", import.meta.url)) },
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
  },
});
