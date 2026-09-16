import { useMemo, useRef, useState } from "react";
import { formatTimestamp, PURPOSE_LABEL_JA, type TranscriptSegment } from "@audiotranscriptionapp/core";
import type { JobDetailDTO } from "../../shared/ipc";

export interface JobDetailScreenProps {
  detail: JobDetailDTO;
  activeSegmentId: string | null;
  onSegmentClick: (segment: TranscriptSegment) => void;
  onTimeUpdate: (positionMs: number) => void;
  onSegmentTextCommit: (segmentId: string, text: string) => void;
  onSegmentSpeakerChange: (segmentId: string, speaker: string) => void;
  onDeleteSegment: (segmentId: string) => void;
  onRenameSpeaker: (rawLabel: string, displayName: string) => void;
  onExport: (format: "txt" | "markdown" | "json") => void;
  onBack: () => void;
  audioUrl: string;
  statusMessage: string | null;
}

function displayNameFor(rawLabel: string, mappings: JobDetailDTO["speakerMappings"]): string {
  return mappings.find((m) => m.rawLabel === rawLabel)?.displayName ?? rawLabel;
}

export function JobDetailScreen({
  detail,
  activeSegmentId,
  onSegmentClick,
  onTimeUpdate,
  onSegmentTextCommit,
  onSegmentSpeakerChange,
  onDeleteSegment,
  onRenameSpeaker,
  onExport,
  onBack,
  audioUrl,
  statusMessage,
}: JobDetailScreenProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});

  const rawSpeakers = useMemo(() => {
    const set = new Set<string>();
    for (const seg of detail.transcript.segments) {
      if (seg.speaker) set.add(seg.speaker);
    }
    return Array.from(set).sort();
  }, [detail.transcript.segments]);

  const handleSegmentClick = (segment: TranscriptSegment) => {
    onSegmentClick(segment);
    if (audioRef.current) {
      audioRef.current.currentTime = segment.startMs / 1000;
      void audioRef.current.play().catch(() => {
        /* 自動再生がブロックされた場合は無視する（ユーザーが手動で再生できる） */
      });
    }
  };

  return (
    <div className="card" data-testid="job-detail-screen">
      <div className="action-row" style={{ marginTop: 0, marginBottom: 12 }}>
        <button type="button" className="btn-secondary" onClick={onBack}>
          ← 履歴に戻る
        </button>
      </div>

      <h2>{detail.audioFile.fileName}</h2>
      <div className="status-text">
        {PURPOSE_LABEL_JA[detail.job.purpose]} ・ 使用モデル: {detail.job.modelId}
      </div>

      <audio
        className="audio-player"
        controls
        ref={audioRef}
        src={audioUrl}
        data-testid="audio-player"
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime * 1000)}
      />

      {rawSpeakers.length > 0 && (
        <div style={{ margin: "12px 0" }}>
          <h3>話者</h3>
          <div className="search-row">
            {rawSpeakers.map((rawLabel) => (
              <div key={rawLabel} className="field-group" style={{ margin: 0 }}>
                <label>{rawLabel}</label>
                <input
                  type="text"
                  data-testid={`speaker-rename-${rawLabel}`}
                  value={renameDrafts[rawLabel] ?? displayNameFor(rawLabel, detail.speakerMappings)}
                  onChange={(e) => setRenameDrafts((prev) => ({ ...prev, [rawLabel]: e.target.value }))}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value && value !== rawLabel) onRenameSpeaker(rawLabel, value);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="detail-layout">
        <div>
          <h3>文字起こしセグメント（クリックでその時刻から再生）</h3>
          <div className="segment-list" data-testid="segment-list">
            {detail.transcript.segments.map((segment) => (
              <div
                key={segment.id}
                className="segment-item"
                data-testid="segment-item"
                data-active={segment.id === activeSegmentId}
                onClick={() => handleSegmentClick(segment)}
              >
                <div className="segment-item-header">
                  <span>
                    {formatTimestamp(segment.startMs)} 〜 {formatTimestamp(segment.endMs)}
                  </span>
                  <span onClick={(e) => e.stopPropagation()}>
                    <select
                      data-testid={`segment-speaker-${segment.id}`}
                      value={segment.speaker ?? ""}
                      onChange={(e) => onSegmentSpeakerChange(segment.id, e.target.value)}
                    >
                      <option value="">(話者なし)</option>
                      {rawSpeakers.map((s) => (
                        <option key={s} value={s}>
                          {displayNameFor(s, detail.speakerMappings)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-danger btn-small"
                      data-testid={`segment-delete-${segment.id}`}
                      onClick={() => onDeleteSegment(segment.id)}
                    >
                      削除
                    </button>
                  </span>
                </div>
                <textarea
                  className="segment-text"
                  data-testid={`segment-text-${segment.id}`}
                  defaultValue={segment.text}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => onSegmentTextCommit(segment.id, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3>整形済み文書（プレビュー）</h3>
          <textarea
            className="result-editor"
            data-testid="formatted-document-preview"
            value={detail.formattedDocument?.content ?? ""}
            readOnly
          />
          <div className="action-row">
            <button type="button" className="btn-secondary" onClick={() => onExport("txt")}>
              TXT保存
            </button>
            <button type="button" className="btn-secondary" onClick={() => onExport("markdown")}>
              Markdown保存
            </button>
            <button type="button" className="btn-secondary" onClick={() => onExport("json")}>
              JSON保存
            </button>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div className="status-text" data-testid="detail-status-message">
          {statusMessage}
        </div>
      )}
    </div>
  );
}
