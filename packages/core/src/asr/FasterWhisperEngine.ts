import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { TranscriptionCanceledError } from "../types.js";
import type {
  ASREngine,
  ASREngineInfo,
  Transcript,
  TranscriptionOptions,
  TranscriptionProgress,
  TranscriptSegment,
} from "../types.js";

export interface FasterWhisperEngineConfig {
  /**
   * サイドカーの起動コマンド。
   * 開発時の例: command="python3", args=["-m", "asr_sidecar.main"], cwd="<repo>/asr-sidecar"
   * 配布時の例: command="<resources>/asr-sidecar/asr-sidecar.exe", args=[]
   */
  command: string;
  args?: string[];
  cwd?: string;
  /** モデル重みの保存先ディレクトリ */
  modelsDir: string;
}

type SidecarMessage =
  | { type: "progress"; stage: TranscriptionProgress["stage"]; percent: number; message?: string }
  | {
      type: "result";
      segments: TranscriptSegment[];
      language: string;
      duration_ms: number;
    }
  | { type: "error"; message: string };

/**
 * faster-whisper を使うローカルASRエンジン。
 * 音声データは一切ネットワークへ送信しない。Pythonサイドカープロセスと
 * stdin/stdout 経由のJSON行プロトコルで通信する
 * （docs/architecture/AudioTranscriptionApp_ARCHITECTURE_v1.0.md §5 プライバシー設計）。
 */
export class FasterWhisperEngine implements ASREngine {
  readonly info: ASREngineInfo = {
    id: "faster-whisper",
    name: "faster-whisper（既定エンジン）",
    description: "CTranslate2ベースのローカルWhisper推論エンジン。CPU/GPU双方に対応。",
    requiresGpu: false,
    approxModelSizeMb: 1500,
  };

  constructor(private readonly config: FasterWhisperEngineConfig) {}

  async transcribe(
    audioPath: string,
    options: TranscriptionOptions,
    onProgress?: (progress: TranscriptionProgress) => void,
    signal?: AbortSignal
  ): Promise<Transcript> {
    const jobId = `job-${Date.now()}`;

    if (signal?.aborted) throw new TranscriptionCanceledError();

    return new Promise<Transcript>((resolve, reject) => {
      const child = spawn(this.config.command, this.config.args ?? [], {
        cwd: this.config.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          ASR_MODELS_DIR: this.config.modelsDir,
          // 明示的操作なしに外部通信しない方針のため、常にオフライン優先。
          // モデル未ダウンロード時のみサイドカー側が個別に取得を試みる。
          HF_HUB_OFFLINE: process.env.ASR_ALLOW_MODEL_DOWNLOAD === "1" ? "0" : "1",
          // Windows(日本語ロケール)ではPythonのstdin/stdout既定エンコーディングが
          // cp932になり、JSON行プロトコルでやり取りする日本語テキストが文字化けする
          // ため、明示的にUTF-8を強制する。
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1",
        },
      });

      let settled = false;
      const stderrChunks: string[] = [];
      child.stderr.on("data", (chunk) => stderrChunks.push(chunk.toString()));

      const onAbort = () => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(new TranscriptionCanceledError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      const cleanupAbortListener = () => signal?.removeEventListener("abort", onAbort);

      const rl = createInterface({ input: child.stdout });
      rl.on("line", (line) => {
        if (!line.trim()) return;
        let msg: SidecarMessage;
        try {
          msg = JSON.parse(line) as SidecarMessage;
        } catch {
          return; // ログ行など、JSONでない出力は無視する
        }
        if (msg.type === "progress") {
          onProgress?.({ jobId, stage: msg.stage, percent: msg.percent, message: msg.message });
        } else if (msg.type === "result") {
          settled = true;
          cleanupAbortListener();
          resolve({
            id: `transcript-${jobId}`,
            jobId,
            segments: msg.segments,
            language: msg.language,
            modelId: options.modelId,
            durationMs: msg.duration_ms,
          });
          child.kill();
        } else if (msg.type === "error") {
          settled = true;
          cleanupAbortListener();
          reject(new Error(msg.message));
          child.kill();
        }
      });

      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        cleanupAbortListener();
        reject(new Error(`ASRサイドカーの起動に失敗しました: ${err.message}`));
      });

      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        cleanupAbortListener();
        reject(
          new Error(
            `ASRサイドカーが異常終了しました (code=${code}): ${stderrChunks.join("").slice(0, 2000)}`
          )
        );
      });

      const request = {
        audio_path: audioPath,
        model_id: options.modelId,
        language: options.language ?? "ja",
        enable_diarization: options.enableDiarization ?? false,
        enable_timestamps: options.enableTimestamps ?? true,
      };
      child.stdin.write(`${JSON.stringify(request)}\n`);
      child.stdin.end();
    });
  }
}
