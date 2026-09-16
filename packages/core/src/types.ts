/**
 * AudioTranscriptionApp 共通型定義
 * docs/specs/DATA_MODEL_SPEC_v1.0.md / TEMPLATE_SPEC_v1.0.md に準拠。
 */

export type TranscriptionPurpose =
  | "meeting_minutes"
  | "phone_call"
  | "discussion"
  | "other";

export const TRANSCRIPTION_PURPOSES: readonly TranscriptionPurpose[] = [
  "meeting_minutes",
  "phone_call",
  "discussion",
  "other",
];

export const PURPOSE_LABEL_JA: Record<TranscriptionPurpose, string> = {
  meeting_minutes: "議事録",
  phone_call: "電話内容",
  discussion: "打ち合わせ",
  other: "その他",
};

export type AudioFormat = "mp3" | "wav" | "m4a" | "aac" | "flac";

export const SUPPORTED_AUDIO_FORMATS: readonly AudioFormat[] = [
  "mp3",
  "wav",
  "m4a",
  "aac",
  "flac",
];

/** 不明・推定情報を明示するためのプレースホルダー（勝手に事実を生成しない方針） */
export const UNKNOWN_PLACEHOLDER = "[不明]";
export const ESTIMATED_PLACEHOLDER = "[推定]";

export interface TranscriptionOptions {
  language?: "ja" | "en" | "auto";
  modelId: string;
  enableDiarization?: boolean;
  enableTimestamps?: boolean;
}

export interface TranscriptSegment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  /** 話者A/話者B等の仮ラベル。断定できない場合は未設定 */
  speaker?: string;
  confidence?: number;
}

export interface Transcript {
  id: string;
  jobId: string;
  segments: TranscriptSegment[];
  language: string;
  modelId: string;
  durationMs: number;
}

export interface ASREngineInfo {
  id: string;
  name: string;
  description: string;
  requiresGpu: boolean;
  approxModelSizeMb: number;
}

/**
 * ASR Engine 抽象化インターフェース。
 * 特定モデルへアプリ全体を依存させないため、Application層はこのインターフェースにのみ依存する。
 * (docs/architecture/AudioTranscriptionApp_ARCHITECTURE_v1.0.md §3)
 */
export interface ASREngine {
  readonly info: ASREngineInfo;
  transcribe(
    audioPath: string,
    options: TranscriptionOptions,
    onProgress?: (progress: TranscriptionProgress) => void,
    signal?: AbortSignal
  ): Promise<Transcript>;
}

export interface ModelDownloadProgress {
  modelId: string;
  percent: number;
  message?: string;
}

/**
 * モデルの事前確認・ダウンロードに対応するASR Engine向けの追加インターフェース。
 * 「明示的な同意なしに外部通信を行わない」方針(docs/architecture §5)のもと、
 * 文字起こし開始前にUI側から isModelCached() でローカルキャッシュの有無を確認し、
 * 無ければユーザーへ同意を求めた上で downloadModel() を呼び出すフローで使う。
 */
export interface ModelAwareASREngine {
  isModelCached(modelId: string): Promise<boolean>;
  downloadModel(
    modelId: string,
    onProgress?: (progress: ModelDownloadProgress) => void,
    signal?: AbortSignal
  ): Promise<void>;
}

/** ユーザーが処理をキャンセルしたときにASREngineが送出するエラー */
export class TranscriptionCanceledError extends Error {
  constructor(message = "文字起こしがキャンセルされました") {
    super(message);
    this.name = "TranscriptionCanceledError";
  }
}

export interface TranscriptionProgress {
  jobId: string;
  stage: "loading_model" | "decoding_audio" | "transcribing" | "finalizing";
  percent: number; // 0-100
  message?: string;
}

export interface AudioFile {
  id: string;
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  durationMs: number;
  recordedAt?: string;
  importedAt: string;
  format: AudioFormat;
}

export type TranscriptionJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "canceled";

export interface TranscriptionJob {
  id: string;
  audioFileId: string;
  purpose: TranscriptionPurpose;
  templateId: string;
  modelId: string;
  languageSetting: string;
  diarizationEnabled: boolean;
  status: TranscriptionJobStatus;
  createdAt: string;
  completedAt?: string;
  errorDetail?: string;
}

export type ExportFormat = "txt" | "markdown" | "json" | "docx" | "pdf" | "csv";

export interface FormattedDocument {
  id: string;
  jobId: string;
  templateId: string;
  content: string;
  fields: Record<string, string>;
  exportedFormats: ExportFormat[];
}

export interface SpeakerMapping {
  id: string;
  transcriptId: string;
  rawLabel: string;
  displayName?: string;
}

export interface TemplateField {
  key: string;
  label: string;
  required: boolean;
  fallback: typeof UNKNOWN_PLACEHOLDER | typeof ESTIMATED_PLACEHOLDER;
}

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  purpose: TranscriptionPurpose;
  version: string;
  fields: TemplateField[];
  output_format: "markdown" | "txt" | "json";
}
