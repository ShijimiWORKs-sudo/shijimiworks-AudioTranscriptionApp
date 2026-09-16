import type {
  AudioFile,
  ExportFormat,
  FormattedDocument,
  SpeakerMapping,
  TemplateDefinition,
  Transcript,
  TranscriptionJob,
  TranscriptionProgress,
  TranscriptionPurpose,
} from "@audiotranscriptionapp/core";

export const IPC_CHANNELS = {
  selectAudioFile: "library:selectAudioFile",
  startTranscription: "transcription:start",
  transcriptionProgress: "transcription:progress",
  cancelTranscription: "transcription:cancel",
  searchJobs: "library:searchJobs",
  getJobDetail: "library:getJobDetail",
  renameSpeaker: "library:renameSpeaker",
  updateSegmentText: "library:updateSegmentText",
  updateSegmentSpeaker: "library:updateSegmentSpeaker",
  deleteSegment: "library:deleteSegment",
  listTemplates: "template:list",
  selectTemplateFile: "template:selectFile",
  importTemplate: "template:import",
  getSetting: "settings:get",
  setSetting: "settings:set",
  exportFile: "file:export",
  runBackup: "backup:run",
} as const;

// ---- 音声ファイル選択・登録 ----

export interface SelectAudioFileResponse {
  canceled: boolean;
  audioFile?: AudioFile;
  error?: string;
}

// ---- 文字起こし実行 ----

export interface StartTranscriptionRequest {
  requestId: string;
  audioFileId: string;
  filePath: string;
  purpose: TranscriptionPurpose;
  modelId: string;
  templateId?: string;
}

export interface StartTranscriptionResponse {
  ok: boolean;
  canceled?: boolean;
  job?: TranscriptionJob;
  transcript?: Transcript;
  formattedDocument?: FormattedDocument;
  error?: string;
}

// ---- 履歴検索 ----

export interface JobSearchFilterDTO {
  purpose?: TranscriptionPurpose;
  fileNameContains?: string;
  templateId?: string;
  keyword?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface JobHistoryEntryDTO {
  job: TranscriptionJob;
  audioFile: AudioFile;
  formattedDocument: FormattedDocument | null;
}

export interface SearchJobsResponse {
  ok: boolean;
  results: JobHistoryEntryDTO[];
  error?: string;
}

// ---- ジョブ詳細・編集 ----

export interface JobDetailDTO {
  job: TranscriptionJob;
  audioFile: AudioFile;
  transcript: Transcript;
  formattedDocument: FormattedDocument | null;
  speakerMappings: SpeakerMapping[];
}

export interface GetJobDetailResponse {
  ok: boolean;
  detail?: JobDetailDTO;
  error?: string;
}

export interface RenameSpeakerRequest {
  transcriptId: string;
  jobId: string;
  rawLabel: string;
  displayName: string;
}

export interface UpdateSegmentTextRequest {
  jobId: string;
  segmentId: string;
  text: string;
}

export interface UpdateSegmentSpeakerRequest {
  jobId: string;
  segmentId: string;
  speaker: string | null;
}

export interface DeleteSegmentRequest {
  jobId: string;
  segmentId: string;
}

export interface EditResponse {
  ok: boolean;
  formattedDocument?: FormattedDocument;
  error?: string;
}

// ---- テンプレート ----

export interface ListTemplatesResponse {
  ok: boolean;
  templates: TemplateDefinition[];
  error?: string;
}

export interface SelectTemplateFileResponse {
  canceled: boolean;
  filePath?: string;
}

export interface ImportTemplateResponse {
  ok: boolean;
  template?: TemplateDefinition;
  error?: string;
}

// ---- 設定 ----

export interface GetSettingResponse {
  value: string | null;
}

// ---- 出力・バックアップ ----

export interface ExportFileRequest {
  content: string;
  suggestedFileName: string;
  format: Extract<ExportFormat, "txt" | "markdown" | "json">;
}

export interface ExportFileResponse {
  canceled: boolean;
  filePath?: string;
  error?: string;
}

export interface RunBackupResponse {
  canceled: boolean;
  filePath?: string;
  error?: string;
}

export type { TranscriptionProgress };
