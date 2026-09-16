#!/usr/bin/env node
/**
 * preload.ts を単一ファイルにバンドルするスクリプト。
 *
 * BrowserWindowは contextIsolation:true / sandbox:true で作成しており、
 * これはセキュリティ上望ましい設定だが、その代わりElectronのサンドボックス化
 * されたpreloadスクリプトは、'electron'自体や一部のNode組み込みモジュール以外の
 * 「ローカルの別ファイルへのrequire」を解決できない（サンドボックス化された
 * preloadは簡易的なモジュールローダーで動作しており、通常のNode.jsのような
 * ファイルシステム経由でのrequire解決を行わないため）。
 *
 * tscでコンパイルしただけのpreload.jsは
 *   const ipc_js_1 = require("../shared/ipc.js");
 * のような他ファイルへのrequireを含んでおり、これがsandbox:true環境で
 * 静かに失敗し、結果としてcontextBridge.exposeInMainWorld("electronAPI", ...)
 * が実行されないまま終わってしまう(=レンダラー側でwindow.electronAPIが
 * undefinedになる)。
 *
 * これを避けるため、tsc実行後にesbuildでpreload.tsを他ファイルへの依存が
 * 一切ない単一のCommonJSファイルへバンドルし、同じ出力先(dist-electron/
 * electron/preload.js)を上書きする。'electron'モジュールのみexternalとして
 * 除外する(Electronが実行時に提供するため)。
 */
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appName = process.argv[2];
const VALID_APPS = ["prototype", "personal"];

if (!appName || !VALID_APPS.includes(appName)) {
  console.error("使い方: node scripts/bundle-preload.mjs <prototype|personal>");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const appDir = path.join(repoRoot, "apps", appName);

const entry = path.join(appDir, "electron", "preload.ts");
const outfile = path.join(appDir, "dist-electron", "electron", "preload.js");

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["electron"],
  sourcemap: false,
  logLevel: "info",
});

console.log(`[bundle-preload:${appName}] ${path.relative(repoRoot, outfile)} を単一ファイルとして生成しました。`);
