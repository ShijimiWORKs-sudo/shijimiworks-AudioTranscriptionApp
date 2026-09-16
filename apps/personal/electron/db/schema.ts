/**
 * Personal Edition ローカルDBスキーマ（SQLite）。
 * docs/specs/DATA_MODEL_SPEC_v1.0.md に準拠。
 *
 * 音声ファイル実体とDBを分離する方針のため、audio_files.file_path はユーザー指定の
 * ローカル保存場所への参照のみを保持し、音声データそのものはDBに格納しない。
 *
 * segments はセグメント数が可変かつ常にtranscriptとまとめて読み書きするため、
 * 正規化した別テーブルにはせずJSON列として保持する（実務上の割り切り）。
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS audio_files (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  recorded_at TEXT,
  imported_at TEXT NOT NULL,
  format TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transcription_jobs (
  id TEXT PRIMARY KEY,
  audio_file_id TEXT NOT NULL REFERENCES audio_files(id),
  purpose TEXT NOT NULL,
  template_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  language_setting TEXT NOT NULL,
  diarization_enabled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  error_detail TEXT
);

CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES transcription_jobs(id),
  language TEXT NOT NULL,
  model_id TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  segments_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS formatted_documents (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES transcription_jobs(id),
  template_id TEXT NOT NULL,
  content TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  exported_formats_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS speaker_mappings (
  id TEXT PRIMARY KEY,
  transcript_id TEXT NOT NULL REFERENCES transcripts(id),
  raw_label TEXT NOT NULL,
  display_name TEXT,
  UNIQUE(transcript_id, raw_label)
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  purpose TEXT NOT NULL,
  version TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  output_format TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'builtin'
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_audio_file ON transcription_jobs(audio_file_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON transcription_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_purpose ON transcription_jobs(purpose);
`;
