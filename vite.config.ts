import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// One self-contained index.html: the same file runs in the Android/iOS
// webview, on HTML5 game portals (zip it) and as a plain web page.
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  build: {
    outDir: "dist",
    assetsInlineLimit: 100_000_000,
    target: "es2020"
  },
  test: {
    include: ["tests/**/*.test.ts"]
  }
} as never);
