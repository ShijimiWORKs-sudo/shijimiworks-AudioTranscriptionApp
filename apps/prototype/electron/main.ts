import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import {
  FasterWhisperEngine,
  MockASREngine,
  SUPPORTED_AUDIO_FORMATS,
  TranscriptionCanceledError,
  type ASREngine,
} from "@audiotranscriptionapp/core";
import { describeAudioFile, UnsupportedAudioFormatError } from "./audioFileService.js";
import { TranscriptionService } from "./transcriptionService.js";
import { IPC_CHANNELS } from "../shared/ipc.js";
import type {
  SaveFileRequest,
  SaveFileResponse,
  SelectAudioFileResponse,
  StartTranscriptionRequest,
  StartTranscriptionResponse,
} from "../shared/ipc.js";
import fs from "node:fs/promises";

// CommonJSとしてコンパイルされるため __dirname はNodeが自動的に提供する。

// Prototype版の既定モデル。Personal Editionではモデル管理画面から切り替え可能にする。
const DEFAULT_MODEL_ID = process.env.PROTOTYPE_ASR_MODEL_ID ?? "faster-whisper-base";

/**
 * ASRサイドカー(Python)の配置ディレクトリを解決する。
 * - 開発時: モノレポ内の asr-sidecar/ をそのまま使う。
 * - パッケージ後(EXE化後): electron-builder の extraResources で
 *   resources/asr-sidecar に同梱したものを使う（§Windows EXE配布）。
 */
function resolveSidecarDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "asr-sidecar");
  }
  // __dirname はビルド後 apps/prototype/dist-electron/electron。リポジトリルートまで4階層上る。
  const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
  return path.join(repoRoot, "asr-sidecar");
}

/** サイドカー用Pythonインタプリタのパスを解決する（venvの配置はOSごとに異なる） */
function resolveSidecarPython(sidecarDir: string): string {
  if (process.env.PROTOTYPE_ASR_PYTHON) return process.env.PROTOTYPE_ASR_PYTHON;
  return process.platform === "win32"
    ? path.join(sidecarDir, ".venv", "Scripts", "python.exe")
    : path.join(sidecarDir, ".venv", "bin", "python");
}

function createASREngine(): ASREngine {
  // 音声データを外部送信しない方針のため、既定はローカルfaster-whisper。
  // テスト・UI開発時のみ PROTOTYPE_ASR_ENGINE=mock でモック応答に切り替えられる。
  if (process.env.PROTOTYPE_ASR_ENGINE === "mock") {
    return new MockASREngine();
  }
  const sidecarDir = resolveSidecarDir();
  const pythonCommand = resolveSidecarPython(sidecarDir);
  return new FasterWhisperEngine({
    command: pythonCommand,
    args: ["-m", "asr_sidecar.main"],
    cwd: sidecarDir,
    modelsDir: process.env.ASR_MODELS_DIR ?? path.join(app.getPath("userData"), "models"),
  });
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    title: "AudioTranscriptionApp（試用版）",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    // __dirname は apps/prototype/dist-electron/electron。レンダラー成果物は apps/prototype/dist。
    mainWindow.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"));
  }
}

function registerIpcHandlers(): void {
  const engine = createASREngine();
  const transcriptionService = new TranscriptionService(engine);
  // requestId単位でAbortControllerを保持し、「キャンセルできる」完成条件を満たす。
  const activeControllers = new Map<string, AbortController>();

  ipcMain.handle(IPC_CHANNELS.selectAudioFile, async (): Promise<SelectAudioFileResponse> => {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "音声ファイルを選択",
      properties: ["openFile"],
      filters: [{ name: "音声ファイル", extensions: [...SUPPORTED_AUDIO_FORMATS] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }
    try {
      const audioFile = await describeAudioFile(result.filePaths[0]!);
      return { canceled: false, audioFile };
    } catch (err) {
      const message =
        err instanceof UnsupportedAudioFormatError
          ? err.message
          : `音声ファイルの読み込みに失敗しました: ${(err as Error).message}`;
      return { canceled: false, error: message };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.startTranscription,
    async (event, request: StartTranscriptionRequest): Promise<StartTranscriptionResponse> => {
      const controller = new AbortController();
      activeControllers.set(request.requestId, controller);
      try {
        const audioFile = await describeAudioFile(request.filePath);
        const { transcript, formattedDocument } = await transcriptionService.run(
          audioFile,
          request.purpose,
          request.modelId || DEFAULT_MODEL_ID,
          (progress) => {
            event.sender.send(IPC_CHANNELS.transcriptionProgress, progress);
          },
          controller.signal
        );
        return { ok: true, transcript, formattedDocument };
      } catch (err) {
        if (err instanceof TranscriptionCanceledError) {
          return { ok: false, canceled: true, error: err.message };
        }
        return { ok: false, error: `文字起こしに失敗しました: ${(err as Error).message}` };
      } finally {
        activeControllers.delete(request.requestId);
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.cancelTranscription, async (_event, requestId: string): Promise<{ ok: boolean }> => {
    const controller = activeControllers.get(requestId);
    if (!controller) return { ok: false };
    controller.abort();
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.saveFile, async (_event, request: SaveFileRequest): Promise<SaveFileResponse> => {
    if (!mainWindow) return { canceled: true };
    const extension = request.format === "markdown" ? "md" : "txt";
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "文字起こし結果を保存",
      defaultPath: `${request.suggestedFileName}.${extension}`,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    try {
      await fs.writeFile(result.filePath, request.content, "utf-8");
      return { canceled: false, filePath: result.filePath };
    } catch (err) {
      return { canceled: false, error: `保存に失敗しました: ${(err as Error).message}` };
    }
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
