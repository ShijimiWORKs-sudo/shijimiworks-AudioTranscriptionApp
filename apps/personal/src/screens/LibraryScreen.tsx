import { PURPOSE_LABEL_JA, TRANSCRIPTION_PURPOSES, type TranscriptionPurpose } from "@audiotranscriptionapp/core";
import type { JobHistoryEntryDTO } from "../../shared/ipc";

const STATUS_LABEL_JA: Record<string, string> = {
  processing: "処理中",
  completed: "完了",
  failed: "失敗",
  canceled: "キャンセル",
};

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP");
  } catch {
    return iso;
  }
}

export interface LibraryScreenProps {
  results: JobHistoryEntryDTO[];
  keyword: string;
  onKeywordChange: (v: string) => void;
  purposeFilter: TranscriptionPurpose | "";
  onPurposeFilterChange: (v: TranscriptionPurpose | "") => void;
  onSearch: () => void;
  onSelectJob: (jobId: string) => void;
  loading: boolean;
}

export function LibraryScreen({
  results,
  keyword,
  onKeywordChange,
  purposeFilter,
  onPurposeFilterChange,
  onSearch,
  onSelectJob,
  loading,
}: LibraryScreenProps) {
  return (
    <div className="card" data-testid="library-screen">
      <h2>文字起こし履歴</h2>

      <div className="search-row">
        <input
          type="text"
          placeholder="キーワード検索（本文に対して部分一致）"
          value={keyword}
          data-testid="keyword-input"
          onChange={(e) => onKeywordChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch();
          }}
        />
        <select
          data-testid="purpose-filter"
          value={purposeFilter}
          onChange={(e) => onPurposeFilterChange(e.target.value as TranscriptionPurpose | "")}
        >
          <option value="">すべての用途</option>
          {TRANSCRIPTION_PURPOSES.map((p) => (
            <option key={p} value={p}>
              {PURPOSE_LABEL_JA[p]}
            </option>
          ))}
        </select>
        <button type="button" className="btn-primary" onClick={onSearch} disabled={loading}>
          検索
        </button>
      </div>

      {results.length === 0 && !loading && (
        <div className="empty-state" data-testid="library-empty">
          まだ文字起こし履歴がありません。「新規文字起こし」から始めてください。
        </div>
      )}

      <div className="job-list" data-testid="job-list">
        {results.map((entry) => (
          <div
            key={entry.job.id}
            className="job-list-item"
            data-testid="job-list-item"
            onClick={() => onSelectJob(entry.job.id)}
          >
            <div>
              <div>{entry.audioFile.fileName}</div>
              <div className="job-list-item-meta">
                {PURPOSE_LABEL_JA[entry.job.purpose]} ・ {formatDateTime(entry.job.createdAt)}
              </div>
            </div>
            <span className="status-badge" data-status={entry.job.status}>
              {STATUS_LABEL_JA[entry.job.status] ?? entry.job.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
