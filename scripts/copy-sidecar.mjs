#!/usr/bin/env node
/**
 * asr-sidecar/ の配布に必要なファイルのみを apps/<app>/resources/asr-sidecar へコピーする。
 * electron-builder の extraResources はビルド前に存在するファイルしか同梱できないため、
 * `npm run package` の直前に必ず実行する（各appのpackageスクリプトから呼び出される）。
 *
 * 除外対象: .venv（Windows側で別途セットアップする想定 §Windows EXE配布）、
 * __pycache__、.pytest_cache、tests、.git系ファイル。
 */
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(repoRoot, "asr-sidecar");

const appName = process.argv[2];
if (!appName) {
  console.error("使い方: node copy-sidecar.mjs <prototype|personal>");
  process.exit(1);
}

const destDir = path.join(repoRoot, "apps", appName, "resources", "asr-sidecar");

const EXCLUDE = new Set([".venv", "__pycache__", ".pytest_cache", "tests", ".git"]);

function shouldCopy(src) {
  const base = path.basename(src);
  if (EXCLUDE.has(base)) return false;
  if (base.endsWith(".pyc")) return false;
  return true;
}

rmSync(destDir, { recursive: true, force: true });
mkdirSync(destDir, { recursive: true });

if (!existsSync(sourceDir)) {
  console.error(`asr-sidecarソースが見つかりません: ${sourceDir}`);
  process.exit(1);
}

cpSync(sourceDir, destDir, {
  recursive: true,
  filter: (src) => shouldCopy(src),
});

console.log(`asr-sidecarを同梱用にコピーしました: ${destDir}`);
