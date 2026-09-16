import { describe, expect, it } from "vitest";
import { MockASREngine } from "../src/asr/MockASREngine.js";
import { TranscriptionCanceledError } from "../src/types.js";
import type { TranscriptionProgress } from "../src/types.js";

describe("MockASREngine", () => {
  it("進捗コールバックを順序通りに呼び出し、Transcriptを返す", async () => {
    const engine = new MockASREngine(undefined, 0);
    const progressEvents: TranscriptionProgress["stage"][] = [];

    const transcript = await engine.transcribe(
      "/tmp/sample.mp3",
      { modelId: "mock", language: "ja" },
      (p) => progressEvents.push(p.stage)
    );

    expect(progressEvents).toEqual(["loading_model", "decoding_audio", "transcribing", "finalizing"]);
    expect(transcript.segments.length).toBeGreaterThan(0);
    expect(transcript.language).toBe("ja");
  });

  it("固定Transcriptを渡した場合はそれを返す", async () => {
    const fixed = {
      id: "fixed",
      jobId: "job",
      language: "ja",
      modelId: "mock",
      durationMs: 1000,
      segments: [{ id: "1", startMs: 0, endMs: 1000, text: "固定テキスト" }],
    };
    const engine = new MockASREngine(fixed, 0);
    const result = await engine.transcribe("/tmp/sample.mp3", { modelId: "mock" });
    expect(result).toBe(fixed);
  });

  it("AbortSignalが発火済みの場合はTranscriptionCanceledErrorを送出する", async () => {
    const engine = new MockASREngine(undefined, 0);
    const controller = new AbortController();
    controller.abort();
    await expect(
      engine.transcribe("/tmp/sample.mp3", { modelId: "mock" }, undefined, controller.signal)
    ).rejects.toThrow(TranscriptionCanceledError);
  });

  it("処理途中でキャンセルすると TranscriptionCanceledError を送出する", async () => {
    const engine = new MockASREngine(undefined, 20);
    const controller = new AbortController();
    const promise = engine.transcribe(
      "/tmp/sample.mp3",
      { modelId: "mock" },
      () => controller.abort(),
      controller.signal
    );
    await expect(promise).rejects.toThrow(TranscriptionCanceledError);
  });
});
