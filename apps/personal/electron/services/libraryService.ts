import {
  applySpeakerMapping,
  defaultTemplates,
  deleteSegment as deleteSegmentFromList,
  getDefaultTemplateForPurpose,
  TemplateEngine,
  TranscriptionCanceledError,
  updateSegmentSpeaker as updateSegmentSpeakerInList,
  updateSegmentText as updateSegmentTextInList,
  type ASREngine,
  type AudioFile,
  type FormattedDocument,
  type SpeakerMapping,
  type TemplateDefinition,
  type Transcript,
  type TranscriptionJob,
  type TranscriptionProgress,
  type TranscriptionPurpose,
} from "@audiotranscriptionapp/core";
import { AppDatabase } from "../db/AppDatabase.js";
import { describeAudioFile } from "./audioFileService.js";
import { TranscriptionService } from "./transcriptionService.js";

export interface RunTranscriptionParams {
  filePath: string;
  purpose: TranscriptionPurpose;
  modelId: string;
  templateId?: string; // 省略時は用途の既定テンプレート
}

export interface RunTranscriptionResult {
  job: TranscriptionJob;
  transcript: Transcript;
  formattedDocument: FormattedDocument;
}

export interface JobDetail {
  job: TranscriptionJob;
  audioFile: AudioFile;
  transcript: Transcript;
  formattedDocument: FormattedDocument | null;
  speakerMappings: SpeakerMapping[];
}

/**
 * ASR実行とDB永続化をまとめて行うオーケストレーション層。
 * 「再処理機能」（同一音声ファイルを別テンプレート/別モデルで再処理し、
 * 音声ファイルの再登録を不要にする）の中核 (docs/specs/PERSONAL_SPEC_v1.0.md §2)。
 */
export class LibraryService {
  private readonly templateEngine = new TemplateEngine();
  private readonly transcriptionService: TranscriptionService;

  constructor(
    private readonly db: AppDatabase,
    engine: ASREngine
  ) {
    this.transcriptionService = new TranscriptionService(engine);
  }

  /** 新規音声ファイルを取り込み、DBへ登録する（既存パスなら既存レコードを再利用する） */
  async registerAudioFile(filePath: string): Promise<AudioFile> {
    const existing = this.db.findAudioFileByPath(filePath);
    if (existing) return existing;
    const audioFile = await describeAudioFile(filePath);
    this.db.upsertAudioFile(audioFile);
    return audioFile;
  }

  /**
   * 文字起こしを実行する。audioFileId を指定すると、既に登録済みの音声ファイルを
   * 別テンプレート/別モデルで再処理する（新しい音声ファイル登録は行わない）。
   */
  async runTranscription(
    audioFile: AudioFile,
    params: RunTranscriptionParams,
    onProgress?: (progress: TranscriptionProgress) => void,
    signal?: AbortSignal
  ): Promise<RunTranscriptionResult> {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job: TranscriptionJob = {
      id: jobId,
      audioFileId: audioFile.id,
      purpose: params.purpose,
      templateId: params.templateId ?? getDefaultTemplateForPurpose(params.purpose).id,
      modelId: params.modelId,
      languageSetting: "ja",
      diarizationEnabled: false,
      status: "processing",
      createdAt: new Date().toISOString(),
    };
    this.db.insertJob(job);

    try {
      const raw = await this.transcriptionService.run(
        audioFile,
        params.purpose,
        params.modelId,
        onProgress,
        signal
      );

      // ASRエンジン/整形処理が内部生成する id・jobId は、実際にDBへ登録済みの
      // job.id と一致しない場合があり（ASRエンジン実装によっては固定値や重複しうる
      // 値を返すこともある）、そのまま永続化するとFK制約違反や、再処理時に
      // 別ジョブのレコードを誤って上書きする不具合につながる。
      // そのため必ず jobId 由来の一意なIDへ上書きしてから保存する。
      const transcript: Transcript = { ...raw.transcript, id: `transcript-${jobId}`, jobId };
      const formattedDocument: FormattedDocument = {
        ...raw.formattedDocument,
        id: `doc-${jobId}`,
        jobId,
      };

      this.db.insertTranscript(transcript);
      this.db.upsertFormattedDocument(formattedDocument);
      this.db.updateJobStatus(jobId, "completed");

      return {
        job: { ...job, status: "completed", completedAt: new Date().toISOString() },
        transcript,
        formattedDocument,
      };
    } catch (err) {
      if (err instanceof TranscriptionCanceledError) {
        this.db.updateJobStatus(jobId, "canceled", err.message);
      } else {
        this.db.updateJobStatus(jobId, "failed", (err as Error).message);
      }
      throw err;
    }
  }

  /** テンプレートIDから定義を解決する（組み込みテンプレート → DB登録済みテンプレートの順に探索） */
  private resolveTemplate(templateId: string, fallbackPurpose: TranscriptionPurpose): TemplateDefinition {
    const builtin = defaultTemplates.find((t) => t.id === templateId);
    if (builtin) return builtin;
    const stored = this.db.findTemplateById(templateId);
    if (stored) return stored;
    // 万一見つからない場合も用途の既定テンプレートへフォールバックし、処理を継続する
    return getDefaultTemplateForPurpose(fallbackPurpose);
  }

  /**
   * 話者マッピング適用後のセグメントでFormattedDocumentを再生成し、保存し直す共通処理。
   * 話者名変更・セグメント編集・削除のいずれの後もこれを通して一貫した再整形を行う。
   */
  private rerenderAndPersist(job: TranscriptionJob, transcript: Transcript): FormattedDocument {
    const mappings = this.db.listSpeakerMappings(transcript.id);
    const relabeled: Transcript = {
      ...transcript,
      segments: applySpeakerMapping(transcript.segments, mappings),
    };
    const existingDoc = this.db.getFormattedDocumentByJobId(job.id);
    const template = this.resolveTemplate(job.templateId, job.purpose);
    const doc = this.templateEngine.render(template, relabeled, existingDoc?.fields);
    const persisted: FormattedDocument = { ...doc, id: existingDoc?.id ?? doc.id, jobId: job.id };
    this.db.upsertFormattedDocument(persisted);
    return persisted;
  }

  /** ジョブの詳細（音声・Transcript・FormattedDocument・話者マッピング）をまとめて取得する */
  getJobDetail(jobId: string): JobDetail | null {
    const job = this.db.getJobById(jobId);
    if (!job) return null;
    const audioFile = this.db.getAudioFileById(job.audioFileId);
    const transcript = this.db.getTranscriptByJobId(jobId);
    if (!audioFile || !transcript) return null;
    return {
      job,
      audioFile,
      transcript,
      formattedDocument: this.db.getFormattedDocumentByJobId(jobId),
      speakerMappings: this.db.listSpeakerMappings(transcript.id),
    };
  }

  /** 話者ラベルを更新し、再整形したFormattedDocumentも保存し直す */
  renameSpeaker(transcriptId: string, jobId: string, rawLabel: string, displayName: string): FormattedDocument {
    this.db.upsertSpeakerMapping({
      id: `${transcriptId}.${rawLabel}`,
      transcriptId,
      rawLabel,
      displayName,
    });

    const job = this.db.getJobById(jobId);
    const transcript = this.db.getTranscriptByJobId(jobId);
    if (!job || !transcript) {
      throw new Error(`Job または Transcript が見つかりません (jobId=${jobId})`);
    }
    return this.rerenderAndPersist(job, transcript);
  }

  /** セグメントのテキストを編集し、Transcript・FormattedDocumentの両方を保存し直す */
  updateSegmentText(jobId: string, segmentId: string, newText: string): FormattedDocument {
    const job = this.db.getJobById(jobId);
    const transcript = this.db.getTranscriptByJobId(jobId);
    if (!job || !transcript) {
      throw new Error(`Job または Transcript が見つかりません (jobId=${jobId})`);
    }
    const segments = updateSegmentTextInList(transcript.segments, segmentId, newText);
    this.db.updateTranscriptSegments(transcript.id, segments);
    return this.rerenderAndPersist(job, { ...transcript, segments });
  }

  /** セグメント単体の話者ラベルを変更し（誤判定した話者分離結果の修正用）、保存し直す */
  updateSegmentSpeaker(jobId: string, segmentId: string, speaker: string | undefined): FormattedDocument {
    const job = this.db.getJobById(jobId);
    const transcript = this.db.getTranscriptByJobId(jobId);
    if (!job || !transcript) {
      throw new Error(`Job または Transcript が見つかりません (jobId=${jobId})`);
    }
    const segments = updateSegmentSpeakerInList(transcript.segments, segmentId, speaker);
    this.db.updateTranscriptSegments(transcript.id, segments);
    return this.rerenderAndPersist(job, { ...transcript, segments });
  }

  /** セグメントを削除し、Transcript・FormattedDocumentの両方を保存し直す */
  deleteSegment(jobId: string, segmentId: string): FormattedDocument {
    const job = this.db.getJobById(jobId);
    const transcript = this.db.getTranscriptByJobId(jobId);
    if (!job || !transcript) {
      throw new Error(`Job または Transcript が見つかりません (jobId=${jobId})`);
    }
    const segments = deleteSegmentFromList(transcript.segments, segmentId);
    this.db.updateTranscriptSegments(transcript.id, segments);
    return this.rerenderAndPersist(job, { ...transcript, segments });
  }
}
