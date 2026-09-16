import { describe, expect, it } from "vitest";
import {
  applySpeakerMapping,
  deleteSegment,
  findSegmentAtTime,
  formatTimestamp,
  groupBySpeaker,
  normalizeSegments,
  segmentsToPlainText,
  updateSegmentSpeaker,
  updateSegmentText,
} from "../src/normalize.js";
import type { SpeakerMapping, TranscriptSegment } from "../src/types.js";

describe("formatTimestamp", () => {
  it("ミリ秒を [HH:MM:SS] 形式に変換する", () => {
    expect(formatTimestamp(0)).toBe("[00:00:00]");
    expect(formatTimestamp(12_000)).toBe("[00:00:12]");
    expect(formatTimestamp(27_000)).toBe("[00:00:27]");
    expect(formatTimestamp(3_661_000)).toBe("[01:01:01]");
  });

  it("負の値は0として扱う", () => {
    expect(formatTimestamp(-500)).toBe("[00:00:00]");
  });
});

describe("normalizeSegments", () => {
  const raw: TranscriptSegment[] = [
    { id: "b", startMs: 2000, endMs: 3000, text: "2番目" },
    { id: "a", startMs: 0, endMs: 1000, text: "1番目" },
    { id: "empty", startMs: 500, endMs: 600, text: "   " },
  ];

  it("時系列順にソートし、空セグメントを除去する", () => {
    const result = normalizeSegments(raw);
    expect(result.map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("applySpeakerMapping", () => {
  it("マッピングがある話者は表示名に置き換わる", () => {
    const segments: TranscriptSegment[] = [
      { id: "1", startMs: 0, endMs: 1000, text: "こんにちは", speaker: "話者A" },
      { id: "2", startMs: 1000, endMs: 2000, text: "よろしくお願いします", speaker: "話者B" },
    ];
    const mappings: SpeakerMapping[] = [
      { id: "m1", transcriptId: "t1", rawLabel: "話者A", displayName: "自分" },
    ];
    const result = applySpeakerMapping(segments, mappings);
    expect(result[0]?.speaker).toBe("自分");
    expect(result[1]?.speaker).toBe("話者B"); // マッピング無しはそのまま
  });

  it("話者情報が無いセグメントは変更しない", () => {
    const segments: TranscriptSegment[] = [{ id: "1", startMs: 0, endMs: 1000, text: "本文" }];
    const result = applySpeakerMapping(segments, []);
    expect(result[0]?.speaker).toBeUndefined();
  });
});

describe("groupBySpeaker / segmentsToPlainText", () => {
  const segments: TranscriptSegment[] = [
    { id: "1", startMs: 0, endMs: 1000, text: "本日の会議を開始します。", speaker: "話者A" },
    { id: "2", startMs: 1000, endMs: 2000, text: "よろしくお願いします。", speaker: "話者B" },
    { id: "3", startMs: 2000, endMs: 3000, text: "続けて発言します。", speaker: "話者A" },
  ];

  it("話者ごとにグルーピングする", () => {
    const grouped = groupBySpeaker(segments);
    expect(grouped.get("話者A")?.length).toBe(2);
    expect(grouped.get("話者B")?.length).toBe(1);
  });

  it("タイムスタンプ・話者付きのプレーンテキストを生成する", () => {
    const text = segmentsToPlainText(segments.slice(0, 1));
    expect(text).toContain("[00:00:00]");
    expect(text).toContain("話者A：");
    expect(text).toContain("本日の会議を開始します。");
  });
});

describe("セグメント編集操作（Personal Edition）", () => {
  const segments: TranscriptSegment[] = [
    { id: "1", startMs: 0, endMs: 1000, text: "本日の会議を開始します。", speaker: "話者A" },
    { id: "2", startMs: 1000, endMs: 2000, text: "よろしくお願いします。", speaker: "話者B" },
  ];

  it("updateSegmentText: 指定IDのテキストのみ更新し、元配列は変更しない", () => {
    const updated = updateSegmentText(segments, "1", "修正後のテキスト");
    expect(updated[0]?.text).toBe("修正後のテキスト");
    expect(updated[1]?.text).toBe("よろしくお願いします。");
    expect(segments[0]?.text).toBe("本日の会議を開始します。"); // 元は不変
  });

  it("updateSegmentSpeaker: 話者ラベルを変更できる", () => {
    const updated = updateSegmentSpeaker(segments, "2", "田中さん");
    expect(updated[1]?.speaker).toBe("田中さん");
  });

  it("deleteSegment: 指定IDのセグメントを削除する", () => {
    const updated = deleteSegment(segments, "1");
    expect(updated).toHaveLength(1);
    expect(updated[0]?.id).toBe("2");
  });

  it("findSegmentAtTime: 再生位置に対応するセグメントを返す", () => {
    expect(findSegmentAtTime(segments, 500)?.id).toBe("1");
    expect(findSegmentAtTime(segments, 1500)?.id).toBe("2");
    expect(findSegmentAtTime(segments, 9999)).toBeUndefined();
  });
});
