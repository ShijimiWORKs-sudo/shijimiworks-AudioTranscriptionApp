import { app, BrowserWindow, dialog, ipcMain, net, protocol } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  FasterWhisperEngine,
  MockASREngine,
  SUPPORTED_AUDIO_FORMATS,
  TranscriptionCanceledError,
  type ASREngine,
  type TranscriptionPurpose,
} from "@audiotranscriptionapp/core";
import { AppDatabase } from "./db/AppDatabase.js";
import { UnsupportedAudioFormatError } from "./services/audioFileService.js";
import { LibraryService } from "./services/libraryService.js";
import { importTemplateFromFile } from "./services/templateImportService.js";
import { IPC_CHANNELS } from "../shared/ipc.js";
import type {
  DeleteSegmentRequest,
  EditResponse,
  ExportFileRequest,
  ExportFileResponse,
  GetJobDetailResponse,
  GetSettingResponse,
  ImportTemplateResponse,
  JobSearchFilterDTO,
  ListTemplatesResponse,
  RenameSpeakerRequest,
  RunBackupResponse,
  SearchJobsResponse,
  SelectAudioFileResponse,
  SelectTemplateFileResponse,
  StartTranscriptionRequest,
  StartTranscriptionResponse,
  UpdateSegmentSpeakerRequest,
  UpdateSegmentTextRequest,
} from "../shared/ipc.js";

// CommonJSとしてコンパイルされるため __dirname はNodeが自動的に提供する。

const DEFAULT_MODEL_ID = "faster-whisper-base";

// 音声再生用のカスタムスキーム。contextIsolation:true / sandbox:true の下でも
// レンダラーの <audio src="app-audio:///<encoded-path>"> から直接ローカル音声を再生できるようにする
// （§6「音声と文字の同期」）。必ず app.whenReady() より前に登録する必要がある。
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app-audio",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true },
  },
]);

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
  // __dirname はビルド後 apps/personal/dist-electron/electron。リポジトリルートまで4階層上る。
  const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
  return path.join(repoRoot, "asr-sidecar");
}

/** サイドカー用Pythonインタプリタのパスを解決する（venvの配置はOSごとに異なる） */
function resolveSidecarPython(sidecarDir: string): string {
  if (process.env.PERSONAL_ASR_PYTHON) return process.env.PERSONAL_ASR_PYTHON;
  return process.platform === "win32"
    ? path.join(sidecarDir, ".venv", "Scripts", "python.exe")
    : path.join(sidecarDir, ".venv", "bin", "python");
}

function createASREngine(): ASREngine {
  // 音声データを外部送信しない方針のため、既定はローカルfaster-whisper。
  // テスト・UI開発時のみ PERSONAL_ASR_ENGINE=mock でモック応答に切り替えられる。
  if (process.env.PERSONAL_ASR_ENGINE === "mock") {
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

function getDbFilePath(): string {
  return process.env.PERSONAL_DB_PATH ?? path.join(app.getPath("userData"), "audiotranscriptionapp.sqlite");
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    title: "AudioTranscriptionApp（完成版）",
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
    // __dirname は apps/personal/dist-electron/electron。レンダラー成果物は apps/personal/dist。
    mainWindow.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"));
  }
}

function registerAudioProtocol(): void {
  protocol.handle("app-audio", async (request) => {
    try {
      const url = new URL(request.url);
      // "app-audio:///<encodeURIComponent(絶対パス)>" 形式。先頭の "/" を除去してデコードする。
      const filePath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      const ext = path.extname(filePath).replace(".", "").toLowerCase();
      if (!(SUPPORTED_AUDIO_FORMATS as readonly string[]).includes(ext)) {
        return new Response("対応していない音声形式です", { status: 403 });
      }
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch (err) {
      return new Response(`音声ファイルの読み込みに失敗しました: ${(err as Error).message}`, { status: 500 });
    }
  });
}

function registerIpcHandlers(db: AppDatabase, library: LibraryService): void {
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
      const audioFile = await library.registerAudioFile(result.filePaths[0]!);
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
        const audioFile = db.getAudioFileById(request.audioFileId);
        if (!audioFile) {
          return { ok: false, error: "音声ファイルが見つかりません。再度選択してください。" };
        }
        const result = await library.runTranscription(
          audioFile,
          {
            filePath: request.filePath,
            purpose: request.purpose,
            modelId: request.modelId || DEFAULT_MODEL_ID,
            templateId: request.templateId,
          },
          (progress) => {
            event.sender.send(IPC_CHANNELS.transcriptionProgress, progress);
          },
          controller.signal
        );
        return { ok: true, job: result.job, transcript: result.transcript, formattedDocument: result.formattedDocument };
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

  ipcMain.handle(
    IPC_CHANNELS.searchJobs,
    async (_event, filter: JobSearchFilterDTO): Promise<SearchJobsResponse> => {
      try {
        const results = db.searchJobs(filter as JobSearchFilterDTO & { purpose?: TranscriptionPurpose });
        return { ok: true, results };
      } catch (err) {
        return { ok: false, results: [], error: `履歴検索に失敗しました: ${(err as Error).message}` };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.getJobDetail, async (_event, jobId: string): Promise<GetJobDetailResponse> => {
    try {
      const detail = library.getJobDetail(jobId);
      if (!detail) return { ok: false, error: "ジョブが見つかりません" };
      return { ok: true, detail };
    } catch (err) {
      return { ok: false, error: `詳細取得に失敗しました: ${(err as Error).message}` };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.renameSpeaker,
    async (_event, request: RenameSpeakerRequest): Promise<EditResponse> => {
      try {
        const formattedDocument = library.renameSpeaker(
          request.transcriptId,
          request.jobId,
          request.rawLabel,
          request.displayName
        );
        return { ok: true, formattedDocument };
      } catch (err) {
        return { ok: false, error: `話者名の更新に失敗しました: ${(err as Error).message}` };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.updateSegmentText,
    async (_event, request: UpdateSegmentTextRequest): Promise<EditResponse> => {
      try {
        const formattedDocument = library.updateSegmentText(request.jobId, request.segmentId, request.text);
        return { ok: true, formattedDocument };
      } catch (err) {
        return { ok: false, error: `編集の保存に失敗しました: ${(err as Error).message}` };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.updateSegmentSpeaker,
    async (_event, request: UpdateSegmentSpeakerRequest): Promise<EditResponse> => {
      try {
        const formattedDocument = library.updateSegmentSpeaker(
          request.jobId,
          request.segmentId,
          request.speaker ?? undefined
        );
        return { ok: true, formattedDocument };
      } catch (err) {
        return { ok: false, error: `話者の変更に失敗しました: ${(err as Error).message}` };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.deleteSegment,
    async (_event, request: DeleteSegmentRequest): Promise<EditResponse> => {
      try {
        const formattedDocument = library.deleteSegment(request.jobId, request.segmentId);
        return { ok: true, formattedDocument };
      } catch (err) {
        return { ok: false, error: `セグメントの削除に失敗しました: ${(err as Error).message}` };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.listTemplates,
    async (_event, purpose?: TranscriptionPurpose): Promise<ListTemplatesResponse> => {
      try {
        return { ok: true, templates: db.listTemplates(purpose) };
      } catch (err) {
        return { ok: false, templates: [], error: `テンプレート一覧の取得に失敗しました: ${(err as Error).message}` };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.selectTemplateFile, async (): Promise<SelectTemplateFileResponse> => {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "テンプレートJSONファイルを選択",
      properties: ["openFile"],
      filters: [{ name: "テンプレート(JSON)", extensions: ["json"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { canceled: false, filePath: result.filePaths[0] };
  });

  ipcMain.handle(IPC_CHANNELS.importTemplate, async (_event, filePath: string): Promise<ImportTemplateResponse> => {
    try {
      // ネイティブダイアログでユーザーが明示的に選んだファイルのみを対象とするため、
      // 許可ディレクトリはそのファイル自身の親ディレクトリとする
      // （templateImportServiceのパストラバーサル対策は、固定の取込先ディレクトリを
      //  持つ別呼び出し元でも再利用できるよう汎用的に実装している）。
      const template = await importTemplateFromFile(filePath, path.dirname(filePath));
      db.upsertTemplate(template, "imported");
      return { ok: true, template };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.getSetting, async (_event, key: string): Promise<GetSettingResponse> => {
    return { value: db.getSetting(key) };
  });

  ipcMain.handle(IPC_CHANNELS.setSetting, async (_event, key: string, value: string): Promise<{ ok: boolean }> => {
    db.setSetting(key, value);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.exportFile, async (_event, request: ExportFileRequest): Promise<ExportFileResponse> => {
    if (!mainWindow) return { canceled: true };
    const extensionMap = { markdown: "md", txt: "txt", json: "json" } as const;
    const extension = extensionMap[request.format];
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

  ipcMain.handle(IPC_CHANNELS.runBackup, async (): Promise<RunBackupResponse> => {
    if (!mainWindow) return { canceled: true };
    // §14「バックアップ」: DB・テンプレート・設定・文字起こし履歴は全てSQLite内に
    // 保持しているため、DBファイルをコピーするだけでバックアップ対象を満たせる
    // （音声ファイル実体は容量が大きいため既定で対象外、との方針どおり）。
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "バックアップの保存先を選択",
      defaultPath: `audiotranscriptionapp-backup-${new Date().toISOString().slice(0, 10)}.sqlite`,
      filters: [{ name: "SQLiteデータベース", extensions: ["sqlite"] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    try {
      await fs.copyFile(getDbFilePath(), result.filePath);
      return { canceled: false, filePath: result.filePath };
    } catch (err) {
      return { canceled: false, error: `バックアップに失敗しました: ${(err as Error).message}` };
    }
  });
}

app.whenReady().then(async () => {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  const db = new AppDatabase(getDbFilePath());
  const engine = createASREngine();
  const library = new LibraryService(db, engine);

  registerAudioProtocol();
  registerIpcHandlers(db, library);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on("before-quit", () => {
    db.close();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
