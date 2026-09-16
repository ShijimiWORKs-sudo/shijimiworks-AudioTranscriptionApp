// 注意: ここでは `export * from` を使わず、名前を明示して再エクスポートする。
// Electron main process(CommonJS)からは問題なく利用できるが、Vite/Rollupがレンダラー用に
// このパッケージ(CommonJS)をESMへ変換する際、`export *` の動的再エクスポートは
// 静的解析できず名前付きエクスポートを見失うため（Rollupのcommonjs interopの既知の制約）、
// ここでは全て明示的な named export として列挙する。

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
export { FasterWhisperEngine } from "./asr/FasterWhisperEngine.js";
export type { FasterWhisperEngineConfig } from "./asr/FasterWhisperEngine.js";

export { MODEL_CATALOG, DEFAULT_MODEL_ID, findModelCatalogEntry } from "./models/modelCatalog.js";
export type { ModelCatalogEntry } from "./models/modelCatalog.js";
