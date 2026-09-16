#!/usr/bin/env node
/**
 * 開発モード用の起動スクリプト。
 *
 * これまで各アプリの "dev" スクリプトは `vite` のみを起動しており、
 * レンダラー(React)のページはブラウザからも http://localhost:5173 等で
 * 開けてしまっていた。しかしそのページは通常のブラウザで開くと
 * `window.electronAPI` が存在せず(Electronのpreloadスクリプトが注入する
 * ものなので)、「ファイル選択でエラーが発生しました: Cannot read
 * properties of undefined (reading 'selectAudioFile')」のようなエラーになる。
 *
 * このスクリプトは、
 *   1. electron(main/preload)をビルド
 *   2. Vite dev serverを起動
 *   3. dev serverの起動を待つ
 *   4. Electron本体を起動し、Vite dev serverを読み込ませる
 * という一連の流れを1コマンドで行う。実際に動作確認する際は、
 * ブラウザでlocalhost:5173を開くのではなく、このスクリプトが開く
 * Electronのアプリウィンドウを使うこと。
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appName = process.argv[2];
const VALID_APPS = { prototype: 5173, personal: 5174 };

if (!appName || !(appName in VALID_APPS)) {
  console.error("使い方: node scripts/dev-electron.mjs <prototype|personal>");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const appDir = path.join(repoRoot, "apps", appName);
const port = VALID_APPS[appName];
const devServerUrl = `http://localhost:${port}`;

const isWin = process.platform === "win32";

function run(cmd, args, opts = {}) {
  return spawn(cmd, args, {
    stdio: "inherit",
    shell: isWin,
    ...opts,
  });
}

function runToCompletion(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = run(cmd, args, opts);
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} が失敗しました (code ${code})`));
    });
    proc.on("error", reject);
  });
}

async function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // まだ起動していない。リトライする。
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Vite dev serverが${timeoutMs}ms以内に起動しませんでした: ${url}`);
}

async function main() {
  console.log(`[dev:${appName}] electron(main/preload)をビルド中...`);
  await runToCompletion("npx", ["tsc", "-p", "electron/tsconfig.json"], { cwd: appDir });

  // preload.tsはElectronのサンドボックス化されたpreload環境では他ファイルへの
  // requireを解決できないため、tscの出力を単一ファイルへバンドルし直して上書きする。
  // 詳細はscripts/bundle-preload.mjs内のコメントを参照。
  console.log(`[dev:${appName}] preload.jsを単一ファイルへバンドル中...`);
  await runToCompletion("node", [path.join(repoRoot, "scripts", "bundle-preload.mjs"), appName]);

  console.log(`[dev:${appName}] Vite dev serverを起動中 (http://localhost:${port})...`);
  const vite = run("npx", ["vite", "--port", String(port), "--strictPort"], { cwd: appDir });
  let shuttingDown = false;

  vite.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[dev:${appName}] Vite dev serverが終了しました (code ${code})`);
      process.exit(code ?? 1);
    }
  });

  await waitForServer(devServerUrl);

  console.log(`[dev:${appName}] Electronを起動します...`);
  const electronProc = run("npx", ["electron", "."], {
    cwd: appDir,
    env: { ...process.env, VITE_DEV_SERVER_URL: devServerUrl },
  });

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    vite.kill();
    electronProc.kill();
    process.exit(0);
  };

  electronProc.on("exit", () => {
    console.log(`[dev:${appName}] Electronウィンドウが終了しました。Vite dev serverも停止します。`);
    shutdown();
  });

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(`[dev:${appName}] エラー:`, err);
  process.exit(1);
});
