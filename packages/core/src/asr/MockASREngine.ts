import { TranscriptionCanceledError } from "../types.js";
import type { ASREngine, ASREngineInfo, Transcript, TranscriptionOptions, TranscriptionProgress } from "../types.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * テスト・UI開発用のモックASRエンジン。
 * 実際の音声処理は行わず、固定のTranscriptを返す。
 * Prototype版のUI実装（Phase 1）はこのエンジンで先行して開発できる。
 */
export class MockASREngine implements ASREngine {
  readonly info: ASREngineInfo = {
    id: "mock",
    name: "Mock ASR Engine（開発用）",
    description: "テスト・UI開発用の固定応答エンジン。実際の音声認識は行わない。",
    requiresGpu: false,
    approxModelSizeMb: 0,
  };

  /** @param stepDelayMs 各ステージ間のウェイト（UIデモ用にプログレスバーを見せるため。テストでは0を指定） */
  constructor(
    private readonly fixedTranscript?: Transcript,
    private readonly stepDelayMs = 300
  ) {}

  async transcribe(
    audioPath: string,
    options: TranscriptionOptions,
    onProgress?: (progress: TranscriptionProgress) => void,
    signal?: AbortSignal
  ): Promise<Transcript> {
    const jobId = `mock-job-${Date.now()}`;
    const stages: TranscriptionProgress["stage"][] = [
      "loading_model",
      "decoding_audio",
      "transcribing",
      "finalizing",
    ];
    for (let i = 0; i < stages.length; i++) {
      if (signal?.aborted) throw new TranscriptionCanceledError();
      if (this.stepDelayMs > 0) await delay(this.stepDelayMs);
      if (signal?.aborted) throw new TranscriptionCanceledError();
      onProgress?.({
        jobId,
        stage: stages[i]!,
        percent: Math.round(((i + 1) / stages.length) * 100),
      });
    }

    if (this.fixedTranscript) return this.fixedTranscript;

    return {
      id: `mock-transcript-${Date.now()}`,
      jobId,
      language: options.language ?? "ja",
      modelId: options.modelId,
      durationMs: 5000,
      segments: [
        {
          id: "seg-1",
          startMs: 0,
          endMs: 2000,
          text: `（モック）${audioPath} の文字起こし結果1`,
          speaker: "話者A",
        },
        {
          id: "seg-2",
          startMs: 2000,
          endMs: 5000,
          text: "（モック）文字起こし結果2",
          speaker: "話者B",
        },
      ],
    };
  }
}
