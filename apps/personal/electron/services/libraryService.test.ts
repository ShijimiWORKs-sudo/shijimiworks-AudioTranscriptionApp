import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MockASREngine } from "@audiotranscriptionapp/core";
import { AppDatabase } from "../db/AppDatabase.js";
import { LibraryService } from "./libraryService.js";

const tmpFiles: string[] = [];

async function createTempAudioFile(name = "meeting.mp3"): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "atapp-lib-"));
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, "dummy-audio-content");
  tmpFiles.push(filePath);
  return filePath;
}

afterEach(async () => {
  await Promise.all(tmpFiles.splice(0).map((f) => fs.rm(f, { force: true })));
});

function fixedTranscript(text: string) {
  return {
    id: "fixed-transcript",
    jobId: "unused",
    language: "ja",
    modelId: "mock",
    durationMs: 3000,
    segments: [
      { id: "s1", startMs: 0, endMs: 1000, text, speaker: "話者A" },
      { id: "s2", startMs: 1000, endMs: 2000, text: "続き", speaker: "話者B" },
    ],
  };
}

describe("LibraryService", () => {
  it("registerAudioFile: 同じパスは既存レコードを再利用する（重複登録しない）", async () => {
    const db = new AppDatabase(":memory:");
    const engine = new MockASREngine(undefined, 0);
    const service = new LibraryService(db, engine);
    const filePath = await createTempAudioFile();

    const first = await service.registerAudioFile(filePath);
    const second = await service.registerAudioFile(filePath);

    expect(first.id).toBe(second.id);
    expect(db.listAudioFiles()).toHaveLength(1);
    db.close();
  });

  it("runTranscription: ジョブ・Transcript・FormattedDocumentがDBに保存される", async () => {
    const db = new AppDatabase(":memory:");
    const engine = new MockASREngine(fixedTranscript("会議の議題について話します"), 0);
    const service = new LibraryService(db, engine);
    const filePath = await createTempAudioFile();
    const audioFile = await service.registerAudioFile(filePath);

    const result = await service.runTranscription(audioFile, {
      filePath,
      purpose: "meeting_minutes",
      modelId: "mock",
    });

    expect(result.job.status).toBe("completed");
    expect(db.getTranscriptByJobId(result.job.id)?.segments[0]?.text).toBe("会議の議題について話します");
    expect(db.getFormattedDocumentByJobId(result.job.id)?.content).toContain("## 参加者");
    db.close();
  });

  it("再処理: 同一AudioFileを別用途で再処理しても音声ファイルは1件のまま、ジョブは2件になる", async () => {
    const db = new AppDatabase(":memory:");
    const engine = new MockASREngine(fixedTranscript("内容"), 0);
    const service = new LibraryService(db, engine);
    const filePath = await createTempAudioFile();
    const audioFile = await service.registerAudioFile(filePath);

    await service.runTranscription(audioFile, { filePath, purpose: "meeting_minutes", modelId: "mock" });
    await service.runTranscription(audioFile, { filePath, purpose: "other", modelId: "mock" });

    expect(db.listAudioFiles()).toHaveLength(1);
    expect(db.searchJobs()).toHaveLength(2);
    db.close();
  });

  it("失敗時はジョブのステータスがfailedになり、エラー原因が記録される", async () => {
    const db = new AppDatabase(":memory:");
    const failingEngine = {
      info: { id: "fail", name: "fail", description: "", requiresGpu: false, approxModelSizeMb: 0 },
      transcribe: async () => {
        throw new Error("モデルの読み込みに失敗しました");
      },
    };
    const service = new LibraryService(db, failingEngine);
    const filePath = await createTempAudioFile();
    const audioFile = await service.registerAudioFile(filePath);

    await expect(
      service.runTranscription(audioFile, { filePath, purpose: "other", modelId: "mock" })
    ).rejects.toThrow("モデルの読み込みに失敗しました");

    const jobs = db.searchJobs();
    expect(jobs[0]?.job.status).toBe("failed");
    expect(jobs[0]?.job.errorDetail).toContain("モデルの読み込みに失敗しました");
    db.close();
  });

  it("renameSpeaker: 話者マッピングを保存し、FormattedDocumentへ反映する", async () => {
    const db = new AppDatabase(":memory:");
    const engine = new MockASREngine(fixedTranscript("発言内容"), 0);
    const service = new LibraryService(db, engine);
    const filePath = await createTempAudioFile();
    const audioFile = await service.registerAudioFile(filePath);

    const result = await service.runTranscription(audioFile, {
      filePath,
      purpose: "meeting_minutes",
      modelId: "mock",
    });

    const updatedDoc = service.renameSpeaker(result.transcript.id, result.job.id, "話者A", "自分");
    expect(updatedDoc.content).toContain("### 自分");

    const mappings = db.listSpeakerMappings(result.transcript.id);
    expect(mappings[0]?.displayName).toBe("自分");
  });

  it("getJobDetail: ジョブ詳細（音声・Transcript・FormattedDocument・話者マッピング）を取得できる", async () => {
    const db = new AppDatabase(":memory:");
    const engine = new MockASREngine(fixedTranscript("発言内容"), 0);
    const service = new LibraryService(db, engine);
    const filePath = await createTempAudioFile();
    const audioFile = await service.registerAudioFile(filePath);

    const result = await service.runTranscription(audioFile, {
      filePath,
      purpose: "meeting_minutes",
      modelId: "mock",
    });

    const detail = service.getJobDetail(result.job.id);
    expect(detail?.audioFile.id).toBe(audioFile.id);
    expect(detail?.transcript.segments).toHaveLength(2);
    expect(detail?.formattedDocument?.content).toContain("## 参加者");
    expect(detail?.speakerMappings).toHaveLength(0);

    expect(service.getJobDetail("not-exist")).toBeNull();
    db.close();
  });

  it("updateSegmentText: セグメントの文章を編集するとTranscriptとFormattedDocumentの両方が更新される", async () => {
    const db = new AppDatabase(":memory:");
    const engine = new MockASREngine(fixedTranscript("発言内容"), 0);
    const service = new LibraryService(db, engine);
    const filePath = await createTempAudioFile();
    const audioFile = await service.registerAudioFile(filePath);

    const result = await service.runTranscription(audioFile, {
      filePath,
      purpose: "other",
      modelId: "mock",
    });

    const segmentId = result.transcript.segments[0]!.id;
    service.updateSegmentText(result.job.id, segmentId, "修正後の発言");

    const updatedTranscript = db.getTranscriptByJobId(result.job.id);
    expect(updatedTranscript?.segments[0]?.text).toBe("修正後の発言");
    const updatedDoc = db.getFormattedDocumentByJobId(result.job.id);
    expect(updatedDoc?.content).toContain("修正後の発言");
    db.close();
  });

  it("updateSegmentSpeaker: セグメント単体の話者ラベルを修正できる（話者分離の誤判定修正用）", async () => {
    const db = new AppDatabase(":memory:");
    const engine = new MockASREngine(fixedTranscript("発言内容"), 0);
    const service = new LibraryService(db, engine);
    const filePath = await createTempAudioFile();
    const audioFile = await service.registerAudioFile(filePath);

    const result = await service.runTranscription(audioFile, {
      filePath,
      purpose: "other",
      modelId: "mock",
    });

    const segmentId = result.transcript.segments[1]!.id; // 元は「話者B」
    service.updateSegmentSpeaker(result.job.id, segmentId, "話者A");

    const updatedTranscript = db.getTranscriptByJobId(result.job.id);
    expect(updatedTranscript?.segments[1]?.speaker).toBe("話者A");
    db.close();
  });

  it("deleteSegment: セグメントを削除するとTranscriptとFormattedDocumentの両方から取り除かれる", async () => {
    const db = new AppDatabase(":memory:");
    const engine = new MockASREngine(fixedTranscript("発言内容"), 0);
    const service = new LibraryService(db, engine);
    const filePath = await createTempAudioFile();
    const audioFile = await service.registerAudioFile(filePath);

    const result = await service.runTranscription(audioFile, {
      filePath,
      purpose: "other",
      modelId: "mock",
    });

    const segmentId = result.transcript.segments[0]!.id;
    service.deleteSegment(result.job.id, segmentId);

    const updatedTranscript = db.getTranscriptByJobId(result.job.id);
    expect(updatedTranscript?.segments).toHaveLength(1);
    expect(updatedTranscript?.segments.find((s) => s.id === segmentId)).toBeUndefined();
    db.close();
  });
});
