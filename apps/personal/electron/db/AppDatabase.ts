import Database from "better-sqlite3";
import type {
  AudioFile,
  FormattedDocument,
  SpeakerMapping,
  TemplateDefinition,
  Transcript,
  TranscriptionJob,
  TranscriptionJobStatus,
  TranscriptionPurpose,
} from "@audiotranscriptionapp/core";
import { SCHEMA_SQL } from "./schema.js";

export interface JobSearchFilter {
  purpose?: TranscriptionPurpose;
  fileNameContains?: string;
  templateId?: string;
  keyword?: string; // formatted_documents.content を対象に部分一致検索
  dateFrom?: string; // ISO文字列
  dateTo?: string;
}

export interface JobHistoryEntry {
  job: TranscriptionJob;
  audioFile: AudioFile;
  formattedDocument: FormattedDocument | null;
}

/**
 * Personal Edition のローカルDBアクセス層。
 * 音声ファイル実体とDBを分離し、同一音声の再処理（別テンプレート/別モデル）を
 * 音声ファイル再登録なしで実現できる構造にする（docs/specs/DATA_MODEL_SPEC_v1.0.md）。
 */
export class AppDatabase {
  private readonly db: Database.Database;

  constructor(filePath: string) {
    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA_SQL);
  }

  close(): void {
    this.db.close();
  }

  // ---- audio_files ----

  upsertAudioFile(audioFile: AudioFile): void {
    this.db
      .prepare(
        `INSERT INTO audio_files (id, file_path, file_name, file_size_bytes, duration_ms, recorded_at, imported_at, format)
         VALUES (@id, @filePath, @fileName, @fileSizeBytes, @durationMs, @recordedAt, @importedAt, @format)
         ON CONFLICT(id) DO UPDATE SET
           file_path=excluded.file_path, file_name=excluded.file_name,
           file_size_bytes=excluded.file_size_bytes, duration_ms=excluded.duration_ms,
           recorded_at=excluded.recorded_at, format=excluded.format`
      )
      .run({ ...audioFile, recordedAt: audioFile.recordedAt ?? null });
  }

  findAudioFileByPath(filePath: string): AudioFile | null {
    const row = this.db
      .prepare(`SELECT * FROM audio_files WHERE file_path = ?`)
      .get(filePath) as AudioFileRow | undefined;
    return row ? rowToAudioFile(row) : null;
  }

  getAudioFileById(id: string): AudioFile | null {
    const row = this.db.prepare(`SELECT * FROM audio_files WHERE id = ?`).get(id) as
      | AudioFileRow
      | undefined;
    return row ? rowToAudioFile(row) : null;
  }

  listAudioFiles(): AudioFile[] {
    const rows = this.db.prepare(`SELECT * FROM audio_files ORDER BY imported_at DESC`).all() as AudioFileRow[];
    return rows.map(rowToAudioFile);
  }

  // ---- transcription_jobs ----

  insertJob(job: TranscriptionJob): void {
    this.db
      .prepare(
        `INSERT INTO transcription_jobs
         (id, audio_file_id, purpose, template_id, model_id, language_setting, diarization_enabled, status, created_at, completed_at, error_detail)
         VALUES (@id, @audioFileId, @purpose, @templateId, @modelId, @languageSetting, @diarizationEnabled, @status, @createdAt, @completedAt, @errorDetail)`
      )
      .run({
        ...job,
        diarizationEnabled: job.diarizationEnabled ? 1 : 0,
        completedAt: job.completedAt ?? null,
        errorDetail: job.errorDetail ?? null,
      });
  }

  getJobById(jobId: string): TranscriptionJob | null {
    const row = this.db.prepare(`SELECT * FROM transcription_jobs WHERE id = ?`).get(jobId) as
      | JobRow
      | undefined;
    return row ? rowToJob(row) : null;
  }

  updateJobStatus(jobId: string, status: TranscriptionJobStatus, errorDetail?: string): void {
    this.db
      .prepare(
        `UPDATE transcription_jobs SET status = ?, completed_at = ?, error_detail = ? WHERE id = ?`
      )
      .run(status, new Date().toISOString(), errorDetail ?? null, jobId);
  }

  // ---- transcripts ----

  insertTranscript(transcript: Transcript): void {
    this.db
      .prepare(
        `INSERT INTO transcripts (id, job_id, language, model_id, duration_ms, segments_json)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        transcript.id,
        transcript.jobId,
        transcript.language,
        transcript.modelId,
        transcript.durationMs,
        JSON.stringify(transcript.segments)
      );
  }

  getTranscriptByJobId(jobId: string): Transcript | null {
    const row = this.db.prepare(`SELECT * FROM transcripts WHERE job_id = ?`).get(jobId) as
      | TranscriptRow
      | undefined;
    return row ? rowToTranscript(row) : null;
  }

  updateTranscriptSegments(transcriptId: string, segments: Transcript["segments"]): void {
    this.db
      .prepare(`UPDATE transcripts SET segments_json = ? WHERE id = ?`)
      .run(JSON.stringify(segments), transcriptId);
  }

  // ---- formatted_documents ----

  upsertFormattedDocument(doc: FormattedDocument): void {
    this.db
      .prepare(
        `INSERT INTO formatted_documents (id, job_id, template_id, content, fields_json, exported_formats_json)
         VALUES (@id, @jobId, @templateId, @content, @fieldsJson, @exportedFormatsJson)
         ON CONFLICT(id) DO UPDATE SET content=excluded.content, fields_json=excluded.fields_json,
           exported_formats_json=excluded.exported_formats_json`
      )
      .run({
        id: doc.id,
        jobId: doc.jobId,
        templateId: doc.templateId,
        content: doc.content,
        fieldsJson: JSON.stringify(doc.fields),
        exportedFormatsJson: JSON.stringify(doc.exportedFormats),
      });
  }

  getFormattedDocumentByJobId(jobId: string): FormattedDocument | null {
    const row = this.db
      .prepare(`SELECT * FROM formatted_documents WHERE job_id = ?`)
      .get(jobId) as FormattedDocumentRow | undefined;
    return row ? rowToFormattedDocument(row) : null;
  }

  // ---- speaker_mappings ----

  upsertSpeakerMapping(mapping: SpeakerMapping): void {
    this.db
      .prepare(
        `INSERT INTO speaker_mappings (id, transcript_id, raw_label, display_name)
         VALUES (@id, @transcriptId, @rawLabel, @displayName)
         ON CONFLICT(transcript_id, raw_label) DO UPDATE SET display_name = excluded.display_name`
      )
      .run({ ...mapping, displayName: mapping.displayName ?? null });
  }

  listSpeakerMappings(transcriptId: string): SpeakerMapping[] {
    const rows = this.db
      .prepare(`SELECT * FROM speaker_mappings WHERE transcript_id = ?`)
      .all(transcriptId) as SpeakerMappingRow[];
    return rows.map((r) => ({
      id: r.id,
      transcriptId: r.transcript_id,
      rawLabel: r.raw_label,
      displayName: r.display_name ?? undefined,
    }));
  }

  // ---- templates ----

  upsertTemplate(template: TemplateDefinition, source: "builtin" | "imported" | "remote" = "imported"): void {
    this.db
      .prepare(
        `INSERT INTO templates (id, name, description, purpose, version, fields_json, output_format, source)
         VALUES (@id, @name, @description, @purpose, @version, @fieldsJson, @outputFormat, @source)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description,
           fields_json=excluded.fields_json, output_format=excluded.output_format, version=excluded.version`
      )
      .run({
        id: template.id,
        name: template.name,
        description: template.description,
        purpose: template.purpose,
        version: template.version,
        fieldsJson: JSON.stringify(template.fields),
        outputFormat: template.output_format,
        source,
      });
  }

  findTemplateById(id: string): TemplateDefinition | null {
    const row = this.db.prepare(`SELECT * FROM templates WHERE id = ?`).get(id) as
      | TemplateRow
      | undefined;
    return row ? rowToTemplate(row) : null;
  }

  listTemplates(purpose?: TranscriptionPurpose): TemplateDefinition[] {
    const rows = (
      purpose
        ? this.db.prepare(`SELECT * FROM templates WHERE purpose = ? ORDER BY name`).all(purpose)
        : this.db.prepare(`SELECT * FROM templates ORDER BY purpose, name`).all()
    ) as TemplateRow[];
    return rows.map(rowToTemplate);
  }

  // ---- settings ----

  getSetting(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, value);
  }

  // ---- 履歴検索（再処理・検索・履歴一覧機能の中核） ----

  searchJobs(filter: JobSearchFilter = {}): JobHistoryEntry[] {
    let sql = `
      SELECT
        j.id AS j_id, j.audio_file_id AS j_audio_file_id, j.purpose AS j_purpose,
        j.template_id AS j_template_id, j.model_id AS j_model_id,
        j.language_setting AS j_language_setting, j.diarization_enabled AS j_diarization_enabled,
        j.status AS j_status, j.created_at AS j_created_at, j.completed_at AS j_completed_at,
        j.error_detail AS j_error_detail,
        a.id AS a_id, a.file_path AS a_file_path, a.file_name AS a_file_name,
        a.file_size_bytes AS a_file_size_bytes, a.duration_ms AS a_duration_ms,
        a.recorded_at AS a_recorded_at, a.imported_at AS a_imported_at, a.format AS a_format,
        d.id AS d_id, d.job_id AS d_job_id, d.template_id AS d_template_id,
        d.content AS d_content, d.fields_json AS d_fields_json,
        d.exported_formats_json AS d_exported_formats_json
      FROM transcription_jobs j
      JOIN audio_files a ON a.id = j.audio_file_id
      LEFT JOIN formatted_documents d ON d.job_id = j.id
      WHERE 1=1
    `;
    const params: Record<string, unknown> = {};

    if (filter.purpose) {
      sql += ` AND j.purpose = @purpose`;
      params.purpose = filter.purpose;
    }
    if (filter.templateId) {
      sql += ` AND j.template_id = @templateId`;
      params.templateId = filter.templateId;
    }
    if (filter.fileNameContains) {
      sql += ` AND a.file_name LIKE @fileNameContains`;
      params.fileNameContains = `%${filter.fileNameContains}%`;
    }
    if (filter.keyword) {
      sql += ` AND d.content LIKE @keyword`;
      params.keyword = `%${filter.keyword}%`;
    }
    if (filter.dateFrom) {
      sql += ` AND j.created_at >= @dateFrom`;
      params.dateFrom = filter.dateFrom;
    }
    if (filter.dateTo) {
      sql += ` AND j.created_at <= @dateTo`;
      params.dateTo = filter.dateTo;
    }
    sql += ` ORDER BY j.created_at DESC`;

    const rows = this.db.prepare(sql).all(params) as SearchJobRow[];
    return rows.map((row) => ({
      job: rowToJob({
        id: row.j_id,
        audio_file_id: row.j_audio_file_id,
        purpose: row.j_purpose,
        template_id: row.j_template_id,
        model_id: row.j_model_id,
        language_setting: row.j_language_setting,
        diarization_enabled: row.j_diarization_enabled,
        status: row.j_status,
        created_at: row.j_created_at,
        completed_at: row.j_completed_at,
        error_detail: row.j_error_detail,
      }),
      audioFile: rowToAudioFile({
        id: row.a_id,
        file_path: row.a_file_path,
        file_name: row.a_file_name,
        file_size_bytes: row.a_file_size_bytes,
        duration_ms: row.a_duration_ms,
        recorded_at: row.a_recorded_at,
        imported_at: row.a_imported_at,
        format: row.a_format,
      }),
      formattedDocument:
        row.d_id != null
          ? rowToFormattedDocument({
              id: row.d_id,
              job_id: row.d_job_id!,
              template_id: row.d_template_id!,
              content: row.d_content!,
              fields_json: row.d_fields_json!,
              exported_formats_json: row.d_exported_formats_json!,
            })
          : null,
    }));
  }
}

// ---- row型・マッピング関数 ----

interface SearchJobRow {
  j_id: string;
  j_audio_file_id: string;
  j_purpose: TranscriptionPurpose;
  j_template_id: string;
  j_model_id: string;
  j_language_setting: string;
  j_diarization_enabled: number;
  j_status: TranscriptionJobStatus;
  j_created_at: string;
  j_completed_at: string | null;
  j_error_detail: string | null;
  a_id: string;
  a_file_path: string;
  a_file_name: string;
  a_file_size_bytes: number;
  a_duration_ms: number;
  a_recorded_at: string | null;
  a_imported_at: string;
  a_format: AudioFile["format"];
  d_id: string | null;
  d_job_id: string | null;
  d_template_id: string | null;
  d_content: string | null;
  d_fields_json: string | null;
  d_exported_formats_json: string | null;
}

interface AudioFileRow {
  id: string;
  file_path: string;
  file_name: string;
  file_size_bytes: number;
  duration_ms: number;
  recorded_at: string | null;
  imported_at: string;
  format: AudioFile["format"];
}

function rowToAudioFile(row: AudioFileRow): AudioFile {
  return {
    id: row.id,
    filePath: row.file_path,
    fileName: row.file_name,
    fileSizeBytes: row.file_size_bytes,
    durationMs: row.duration_ms,
    recordedAt: row.recorded_at ?? undefined,
    importedAt: row.imported_at,
    format: row.format,
  };
}

interface JobRow {
  id: string;
  audio_file_id: string;
  purpose: TranscriptionPurpose;
  template_id: string;
  model_id: string;
  language_setting: string;
  diarization_enabled: number;
  status: TranscriptionJobStatus;
  created_at: string;
  completed_at: string | null;
  error_detail: string | null;
}

function rowToJob(row: JobRow): TranscriptionJob {
  return {
    id: row.id,
    audioFileId: row.audio_file_id,
    purpose: row.purpose,
    templateId: row.template_id,
    modelId: row.model_id,
    languageSetting: row.language_setting,
    diarizationEnabled: !!row.diarization_enabled,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    errorDetail: row.error_detail ?? undefined,
  };
}

interface TranscriptRow {
  id: string;
  job_id: string;
  language: string;
  model_id: string;
  duration_ms: number;
  segments_json: string;
}

function rowToTranscript(row: TranscriptRow): Transcript {
  return {
    id: row.id,
    jobId: row.job_id,
    language: row.language,
    modelId: row.model_id,
    durationMs: row.duration_ms,
    segments: JSON.parse(row.segments_json),
  };
}

interface FormattedDocumentRow {
  id: string;
  job_id: string;
  template_id: string;
  content: string;
  fields_json: string;
  exported_formats_json: string;
}

function rowToFormattedDocument(row: FormattedDocumentRow): FormattedDocument {
  return {
    id: row.id,
    jobId: row.job_id,
    templateId: row.template_id,
    content: row.content,
    fields: JSON.parse(row.fields_json),
    exportedFormats: JSON.parse(row.exported_formats_json),
  };
}

interface SpeakerMappingRow {
  id: string;
  transcript_id: string;
  raw_label: string;
  display_name: string | null;
}

interface TemplateRow {
  id: string;
  name: string;
  description: string;
  purpose: TranscriptionPurpose;
  version: string;
  fields_json: string;
  output_format: TemplateDefinition["output_format"];
  source: string;
}

function rowToTemplate(row: TemplateRow): TemplateDefinition {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    purpose: row.purpose,
    version: row.version,
    fields: JSON.parse(row.fields_json),
    output_format: row.output_format,
  };
}
