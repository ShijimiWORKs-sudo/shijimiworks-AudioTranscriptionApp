import type {
  AudioFile,
  ExportFormat,
  FormattedDocument,
  ModelDownloadProgress,
  Transcript,
  TranscriptionProgress,
  TranscriptionPurpose,
} from "@audiotranscriptionapp/core";

export const IPC_CHANNELS = {
  selectAudioFile: "audio:select",
  startTranscription: "transcription:start",
  transcriptionProgress: "transcription:progress",
  cancelTranscription: "transcription:cancel",
  saveFile: "file:save",
  checkModelAvailable: "model:check",
  downloadModel: "model:download",
  modelDownloadProgress: "model:download:progress",
} as const;

export interface SelectAudioFileResponse {
  canceled: boolean;
  audioFile?: AudioFile;
  error?: string;
}

export interface StartTranscriptionRequest {
  requestId: string;
  filePath: string;
  purpose: TranscriptionPurpose;
  modelId: string;
}

export interface StartTranscriptionResponse {
  ok: boolean;
  canceled?: boolean;
  transcript?: Transcript;
  formattedDocument?: FormattedDocument;
  error?: string;
}

export interface SaveFileRequest {
  content: string;
  suggestedFileName: string;
  format: Extract<ExportFormat, "txt" | "markdown">;
}

export interface SaveFileResponse {
  canceled: boolean;
  filePath?: string;
  error?: string;
}

export interface CheckModelAvailableRequest {
  modelId: string;
}

export interface CheckModelAvailableResponse {
  modelId: string;
  cached: boolean;
  error?: string;
}

export interface DownloadModelRequest {
  modelId: string;
}

export interface DownloadModelResponse {
  ok: boolean;
  canceled?: boolean;
  error?: string;
}

export type { ModelDownloadProgress, TranscriptionProgress };
