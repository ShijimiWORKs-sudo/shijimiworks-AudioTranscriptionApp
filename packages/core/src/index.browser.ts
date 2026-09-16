// レンダラー(ブラウザ環境)専用のエントリポイント。
// FasterWhisperEngine は node:child_process / node:readline に依存するため、
// レンダラーへバンドルされないよう意図的にここでは re-export しない
// （contextIsolation:true の下でレンダラーはNode APIへ触れない設計のため、本来不要でもある）。

export type {
  TranscriptionPurpose,
  AudioFormat,
  TranscriptionOptions,
  TranscriptSegment,
  Transcript,
  ASREngineInfo,
  ASREngine,
  ModelAwareASREngine,
  ModelDownloadProgress,
  TranscriptionProgress,
  AudioFile,
  TranscriptionJobStatus,
  TranscriptionJob,
  ExportFormat,
  FormattedDocument,
  SpeakerMapping,
  TemplateField,
  TemplateDefinition,
} from "./types.js";

export {
  TRANSCRIPTION_PURPOSES,
  PURPOSE_LABEL_JA,
  SUPPORTED_AUDIO_FORMATS,
  UNKNOWN_PLACEHOLDER,
  ESTIMATED_PLACEHOLDER,
  TranscriptionCanceledError,
} from "./types.js";

export {
  formatTimestamp,
  normalizeSegments,
  applySpeakerMapping,
  segmentsToPlainText,
  groupBySpeaker,
  totalDurationMs,
  updateSegmentText,
  updateSegmentSpeaker,
  deleteSegment,
  findSegmentAtTime,
} from "./normalize.js";

export {
  meetingMinutesTemplate,
  phoneCallTemplate,
  discussionTemplate,
  otherTemplate,
  defaultTemplates,
  getDefaultTemplateForPurpose,
} from "./templates/defaultTemplates.js";

export { TemplateEngine } from "./templates/TemplateEngine.js";
export { MockASREngine } from "./asr/MockASREngine.js";

export { MODEL_CATALOG, DEFAULT_MODEL_ID, findModelCatalogEntry } from "./models/modelCatalog.js";
export type { ModelCatalogEntry } from "./models/modelCatalog.js";
