import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        controller: resolve(__dirname, "controller.html"),
        left: resolve(__dirname, "left.html"),
        right: resolve(__dirname, "right.html"),
        known: resolve(__dirname, "known.html"),
        visit: resolve(__dirname, "visit.html"),
        rolePicker: resolve(__dirname, "role-picker.html")
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 4173
  }
});
