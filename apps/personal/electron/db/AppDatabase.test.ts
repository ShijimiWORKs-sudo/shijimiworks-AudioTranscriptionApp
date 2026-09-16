import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { AudioFile, FormattedDocument, Transcript, TranscriptionJob } from "@audiotranscriptionapp/core";
import { AppDatabase } from "./AppDatabase.js";

function sampleAudioFile(overrides: Partial<AudioFile> = {}): AudioFile {
  return {
    id: "audio-1",
    filePath: "/data/meeting.mp3",
    fileName: "meeting.mp3",
    fileSizeBytes: 12345,
    durationMs: 60000,
    importedAt: new Date("2026-09-01T00:00:00Z").toISOString(),
    format: "mp3",
    ...overrides,
  };
}

function sampleJob(overrides: Partial<TranscriptionJob> = {}): TranscriptionJob {
  return {
    id: "job-1",
    audioFileId: "audio-1",
    purpose: "meeting_minutes",
    templateId: "meeting_minutes.default",
    modelId: "faster-whisper-base",
    languageSetting: "ja",
    diarizationEnabled: false,
    status: "completed",
    createdAt: new Date("2026-09-01T01:00:00Z").toISOString(),
    ...overrides,
  };
}

describe("AppDatabase", () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = new AppDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("音声ファイルを登録・一覧取得できる", () => {
    db.upsertAudioFile(sampleAudioFile());
    const files = db.listAudioFiles();
    expect(files).toHaveLength(1);
    expect(files[0]?.fileName).toBe("meeting.mp3");
  });

  it("IDで音声ファイルを取得できる", () => {
    db.upsertAudioFile(sampleAudioFile());
    expect(db.getAudioFileById("audio-1")?.fileName).toBe("meeting.mp3");
    expect(db.getAudioFileById("not-exist")).toBeNull();
  });

  it("同じfile_pathで再登録すると音声ファイルの重複登録を避けられる", () => {
    db.upsertAudioFile(sampleAudioFile());
    db.upsertAudioFile(sampleAudioFile({ fileSizeBytes: 99999 }));
    const found = db.findAudioFileByPath("/data/meeting.mp3");
    expect(found?.fileSizeBytes).toBe(99999);
    expect(db.listAudioFiles()).toHaveLength(1);
  });

  it("ジョブ・Transcript・FormattedDocumentを保存し、履歴として取得できる", () => {
    db.upsertAudioFile(sampleAudioFile());
    db.insertJob(sampleJob());

    const transcript: Transcript = {
      id: "t-1",
      jobId: "job-1",
      language: "ja",
      modelId: "faster-whisper-base",
      durationMs: 60000,
      segments: [{ id: "s1", startMs: 0, endMs: 1000, text: "こんにちは", speaker: "話者A" }],
    };
    db.insertTranscript(transcript);

    const doc: FormattedDocument = {
      id: "doc-1",
      jobId: "job-1",
      templateId: "meeting_minutes.default",
      content: "# 定例会議\n\n本文",
      fields: { title: "定例会議" },
      exportedFormats: [],
    };
    db.upsertFormattedDocument(doc);

    const fetchedTranscript = db.getTranscriptByJobId("job-1");
    expect(fetchedTranscript?.segments[0]?.text).toBe("こんにちは");

    const results = db.searchJobs();
    expect(results).toHaveLength(1);
    expect(results[0]?.audioFile.fileName).toBe("meeting.mp3");
    expect(results[0]?.formattedDocument?.content).toContain("定例会議");
  });

  it("再処理: 同じ音声ファイルに対して複数のジョブを作成できる（音声ファイルの再登録は不要）", () => {
    db.upsertAudioFile(sampleAudioFile());
    db.insertJob(sampleJob({ id: "job-1", templateId: "meeting_minutes.default" }));
    db.insertJob(sampleJob({ id: "job-2", templateId: "other.default", purpose: "other" }));

    expect(db.listAudioFiles()).toHaveLength(1);
    const results = db.searchJobs();
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.job.templateId).sort()).toEqual([
      "meeting_minutes.default",
      "other.default",
    ]);
  });

  it("キーワード検索: formatted_documentsのcontentに対して部分一致検索できる", () => {
    db.upsertAudioFile(sampleAudioFile());
    db.insertJob(sampleJob());
    db.upsertFormattedDocument({
      id: "doc-1",
      jobId: "job-1",
      templateId: "meeting_minutes.default",
      content: "# 定例会議\n\n予算について議論した",
      fields: {},
      exportedFormats: [],
    });

    expect(db.searchJobs({ keyword: "予算" })).toHaveLength(1);
    expect(db.searchJobs({ keyword: "存在しないキーワード" })).toHaveLength(0);
  });

  it("用途(purpose)で絞り込み検索できる", () => {
    db.upsertAudioFile(sampleAudioFile());
    db.insertJob(sampleJob({ id: "job-1", purpose: "meeting_minutes" }));
    db.insertJob(sampleJob({ id: "job-2", purpose: "phone_call", templateId: "phone_call.default" }));

    expect(db.searchJobs({ purpose: "phone_call" })).toHaveLength(1);
    expect(db.searchJobs({ purpose: "meeting_minutes" })).toHaveLength(1);
  });

  it("ジョブのステータスを更新できる", () => {
    db.upsertAudioFile(sampleAudioFile());
    db.insertJob(sampleJob({ status: "processing" }));
    db.updateJobStatus("job-1", "failed", "モデル読み込みに失敗しました");

    const result = db.searchJobs()[0];
    expect(result?.job.status).toBe("failed");
    expect(result?.job.errorDetail).toBe("モデル読み込みに失敗しました");
  });

  it("話者マッピングを登録・更新できる（話者A→自分、のような割り当て）", () => {
    db.upsertAudioFile(sampleAudioFile());
    db.insertJob(sampleJob());
    db.insertTranscript({
      id: "t-1",
      jobId: "job-1",
      language: "ja",
      modelId: "faster-whisper-base",
      durationMs: 60000,
      segments: [{ id: "s1", startMs: 0, endMs: 1000, text: "こんにちは", speaker: "話者A" }],
    });

    db.upsertSpeakerMapping({ id: "m1", transcriptId: "t-1", rawLabel: "話者A", displayName: "自分" });
    db.upsertSpeakerMapping({ id: "m1", transcriptId: "t-1", rawLabel: "話者A", displayName: "田中さん" });

    const mappings = db.listSpeakerMappings("t-1");
    expect(mappings).toHaveLength(1);
    expect(mappings[0]?.displayName).toBe("田中さん");
  });

  it("カスタムテンプレートを登録・一覧取得できる", () => {
    db.upsertTemplate(
      {
        id: "custom.sales_meeting",
        name: "営業会議議事録",
        description: "ユーザー独自テンプレート",
        purpose: "meeting_minutes",
        version: "1.0.0",
        output_format: "markdown",
        fields: [{ key: "sales", label: "売上", required: false, fallback: "[不明]" }],
      },
      "imported"
    );

    const templates = db.listTemplates("meeting_minutes");
    expect(templates.some((t) => t.id === "custom.sales_meeting")).toBe(true);
  });

  it("設定値を保存・取得できる", () => {
    expect(db.getSetting("default_model_id")).toBeNull();
    db.setSetting("default_model_id", "faster-whisper-large-v3");
    expect(db.getSetting("default_model_id")).toBe("faster-whisper-large-v3");
    db.setSetting("default_model_id", "faster-whisper-base");
    expect(db.getSetting("default_model_id")).toBe("faster-whisper-base");
  });
});
