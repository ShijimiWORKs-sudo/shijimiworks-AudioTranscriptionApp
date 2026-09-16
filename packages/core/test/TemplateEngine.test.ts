import { describe, expect, it } from "vitest";
import { TemplateEngine } from "../src/templates/TemplateEngine.js";
import {
  discussionTemplate,
  meetingMinutesTemplate,
  otherTemplate,
  phoneCallTemplate,
} from "../src/templates/defaultTemplates.js";
import type { Transcript } from "../src/types.js";

const sampleTranscript: Transcript = {
  id: "t1",
  jobId: "job1",
  language: "ja",
  modelId: "faster-whisper",
  durationMs: 3000,
  segments: [
    { id: "1", startMs: 0, endMs: 1000, text: "本日の会議を開始します。", speaker: "話者A" },
    { id: "2", startMs: 1000, endMs: 3000, text: "よろしくお願いします。", speaker: "話者B" },
  ],
};

describe("TemplateEngine", () => {
  const engine = new TemplateEngine();

  it("議事録テンプレート: フィールド未入力は [不明] を出力する", () => {
    const doc = engine.render(meetingMinutesTemplate, sampleTranscript);
    expect(doc.fields["title"]).toBe("[不明]");
    expect(doc.fields["attendees"]).toBe("[不明]");
    expect(doc.content).toContain("## 参加者");
    expect(doc.content).toContain("[不明]");
  });

  it("議事録テンプレート: 入力したフィールド値が反映される", () => {
    const doc = engine.render(meetingMinutesTemplate, sampleTranscript, {
      title: "定例会議",
      attendees: "田中, 鈴木",
    });
    expect(doc.content).toContain("# 定例会議");
    expect(doc.content).toContain("田中, 鈴木");
  });

  it("議事録テンプレート: 発言者別内容が自動生成される", () => {
    const doc = engine.render(meetingMinutesTemplate, sampleTranscript);
    expect(doc.content).toContain("### 話者A");
    expect(doc.content).toContain("### 話者B");
    expect(doc.content).toContain("本日の会議を開始します。");
  });

  it("電話内容テンプレートが正しくレンダリングされる", () => {
    const doc = engine.render(phoneCallTemplate, sampleTranscript, { counterpart: "山田様" });
    expect(doc.content).toContain("## 相手");
    expect(doc.content).toContain("山田様");
  });

  it("打ち合わせテンプレートが正しくレンダリングされる", () => {
    const doc = engine.render(discussionTemplate, sampleTranscript);
    expect(doc.content).toContain("## 次回予定");
  });

  it("その他テンプレート: 全文文字起こしのみを出力する", () => {
    const doc = engine.render(otherTemplate, sampleTranscript);
    expect(doc.content).toContain("## 全文文字起こし");
    expect(doc.content).not.toContain("## 決定事項");
  });

  it("音声に存在しない情報を勝手に生成しない（fallbackがそのまま出力される）", () => {
    const doc = engine.render(meetingMinutesTemplate, sampleTranscript);
    expect(doc.fields["decisions"]).toBe("[不明]");
    expect(doc.fields["dueDate"]).toBe("[不明]");
  });
});
