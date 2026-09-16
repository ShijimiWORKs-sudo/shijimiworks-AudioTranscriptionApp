import type { Transcript, TranscriptSegment, SpeakerMapping } from "./types.js";

/** ミリ秒を [HH:MM:SS] 形式へ変換する */
export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `[${pad(hours)}:${pad(minutes)}:${pad(seconds)}]`;
}

/**
 * ASRの生セグメントを正規化する。
 * - 空文字セグメントの除去
 * - 時系列順のソート
 * - 話者ラベルが無い場合は undefined のまま保持する（勝手に断定しない）
 */
export function normalizeSegments(rawSegments: TranscriptSegment[]): TranscriptSegment[] {
  return rawSegments
    .filter((s) => s.text.trim().length > 0)
    .slice()
    .sort((a, b) => a.startMs - b.startMs);
}

/**
 * SpeakerMapping を適用し、話者A/B等の仮ラベルをユーザー定義の表示名に置き換える。
 * マッピングが無い話者はそのまま仮ラベルを表示する（勝手に実名を断定しない）。
 */
export function applySpeakerMapping(
  segments: TranscriptSegment[],
  mappings: SpeakerMapping[]
): TranscriptSegment[] {
  const byRawLabel = new Map(mappings.map((m) => [m.rawLabel, m.displayName]));
  return segments.map((seg) => {
    if (!seg.speaker) return seg;
    const displayName = byRawLabel.get(seg.speaker);
    return displayName ? { ...seg, speaker: displayName } : seg;
  });
}

/** セグメント一覧をタイムスタンプ付きの読みやすいプレーンテキストへ変換する */
export function segmentsToPlainText(segments: TranscriptSegment[], withTimestamps = true): string {
  return segments
    .map((seg) => {
      const speakerPrefix = seg.speaker ? `${seg.speaker}：` : "";
      const timestamp = withTimestamps ? `${formatTimestamp(seg.startMs)}\n` : "";
      return `${timestamp}${speakerPrefix}${seg.text}`;
    })
    .join("\n\n");
}

/** 話者ごとにセグメントをグルーピングする（「発言者別内容」フィールド用） */
export function groupBySpeaker(segments: TranscriptSegment[]): Map<string, TranscriptSegment[]> {
  const map = new Map<string, TranscriptSegment[]>();
  for (const seg of segments) {
    const key = seg.speaker ?? "話者不明";
    const list = map.get(key) ?? [];
    list.push(seg);
    map.set(key, list);
  }
  return map;
}

export function totalDurationMs(transcript: Transcript): number {
  if (transcript.segments.length === 0) return transcript.durationMs;
  const last = transcript.segments[transcript.segments.length - 1];
  return Math.max(transcript.durationMs, last ? last.endMs : 0);
}

/**
 * セグメント単位の編集操作（Personal Edition §21「文字起こし編集」）。
 * いずれも元配列は変更せず新しい配列を返す。
 */
export function updateSegmentText(
  segments: TranscriptSegment[],
  segmentId: string,
  newText: string
): TranscriptSegment[] {
  return segments.map((s) => (s.id === segmentId ? { ...s, text: newText } : s));
}

export function updateSegmentSpeaker(
  segments: TranscriptSegment[],
  segmentId: string,
  speaker: string | undefined
): TranscriptSegment[] {
  return segments.map((s) => (s.id === segmentId ? { ...s, speaker } : s));
}

export function deleteSegment(segments: TranscriptSegment[], segmentId: string): TranscriptSegment[] {
  return segments.filter((s) => s.id !== segmentId);
}

/** 現在の再生位置(ms)に対応するセグメントを返す（音声プレイヤー同期用） */
export function findSegmentAtTime(
  segments: TranscriptSegment[],
  positionMs: number
): TranscriptSegment | undefined {
  return segments.find((s) => positionMs >= s.startMs && positionMs < s.endMs);
}
