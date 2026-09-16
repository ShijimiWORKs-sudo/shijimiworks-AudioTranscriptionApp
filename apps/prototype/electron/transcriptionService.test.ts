import { describe, expect, it } from "vitest";
import { MockASREngine, type AudioFile } from "@audiotranscriptionapp/core";
import { TranscriptionService } from "./transcriptionService.js";

const sampleAudioFile: AudioFile = {
  id: "audio-1",
  filePath: "/tmp/sample.mp3",
  fileName: "sample.mp3",
  fileSizeBytes: 1000,
  durationMs: 5000,
  importedAt: new Date().toISOString(),
  format: "mp3",
};

describe("TranscriptionService", () => {
  it("ASR結果を正規化し、用途別テンプレートで整形する", async () => {
    const engine = new MockASREngine(undefined, 0);
    const service = new TranscriptionService(engine);

    const { transcript, formattedDocument } = await service.run(
      sampleAudioFile,
      "meeting_minutes",
      "mock"
    );

    expect(transcript.segments.length).toBeGreaterThan(0);
    expect(formattedDocument.templateId).toBe("meeting_minutes.default");
    expect(formattedDocument.content).toContain("## 参加者");
  });

  it("進捗コールバックが呼ばれる", async () => {
    const engine = new MockASREngine(undefined, 0);
    const service = new TranscriptionService(engine);
    const stages: string[] = [];

    await service.run(sampleAudioFile, "other", "mock", (p) => stages.push(p.stage));

    expect(stages).toContain("transcribing");
  });

  it("AbortSignalでキャンセルするとTranscriptionCanceledErrorが伝播する", async () => {
    const engine = new MockASREngine(undefined, 10);
    const service = new TranscriptionService(engine);
    const controller = new AbortController();

    const promise = service.run(
      sampleAudioFile,
      "phone_call",
      "mock",
      () => controller.abort(),
      controller.signal
    );

    await expect(promise).rejects.toThrow(/キャンセル/);
  });
});
