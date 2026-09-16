import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      // レンダラーではNode依存(FasterWhisperEngine/better-sqlite3)を含まないブラウザ専用エントリを使う。
      // CommonJSビルドをRollupのCJS interopに頼ると named export の静的解析に失敗するため、
      // core パッケージのESMビルド(dist-esm)を直接指す（apps/prototypeと同じ対策）。
      "@audiotranscriptionapp/core": path.resolve(
        __dirname,
        "../../packages/core/dist-esm/index.browser.js"
      ),
    },
  },
  build: {
    outDir: "dist",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setupTests.ts"],
    globals: true,
    include: ["test/**/*.test.{ts,tsx}", "electron/**/*.test.ts"],
  },
});
