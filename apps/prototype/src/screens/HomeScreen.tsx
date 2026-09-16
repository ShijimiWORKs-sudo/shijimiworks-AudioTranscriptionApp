import {
  PURPOSE_LABEL_JA,
  TRANSCRIPTION_PURPOSES,
  type AudioFile,
  type TranscriptionPurpose,
} from "@audiotranscriptionapp/core";

function formatDuration(ms: number): string {
  if (!ms) return "不明";
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}分${s}秒`;
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)}MB`;
}

export interface HomeScreenProps {
  purpose: TranscriptionPurpose;
  onPurposeChange: (purpose: TranscriptionPurpose) => void;
  selectedAudio: AudioFile | null;
  fileError: string | null;
  onSelectFile: () => void;
  onStart: () => void;
  starting: boolean;
}

export function HomeScreen({
  purpose,
  onPurposeChange,
  selectedAudio,
  fileError,
  onSelectFile,
  onStart,
  starting,
}: HomeScreenProps) {
  return (
    <div className="card" data-testid="home-screen">
      <h2>音声ファイルを文字起こし</h2>

      <button type="button" className="btn-secondary" onClick={onSelectFile} disabled={starting}>
        音声ファイルを選択
      </button>

      {selectedAudio && (
        <div className="file-info" data-testid="file-info">
          <div>ファイル名: {selectedAudio.fileName}</div>
          <div>形式: {selectedAudio.format.toUpperCase()}</div>
          <div>長さ: {formatDuration(selectedAudio.durationMs)}</div>
          <div>サイズ: {formatSize(selectedAudio.fileSizeBytes)}</div>
        </div>
      )}
      {fileError && (
        <div className="file-error" role="alert" data-testid="file-error">
          {fileError}
        </div>
      )}

      <h3>用途</h3>
      <div className="purpose-group" role="radiogroup" aria-label="用途">
        {TRANSCRIPTION_PURPOSES.map((p) => (
          <label key={p} className="purpose-option" data-selected={p === purpose}>
            <input
              type="radio"
              name="purpose"
              value={p}
              checked={p === purpose}
              onChange={() => onPurposeChange(p)}
            />
            {PURPOSE_LABEL_JA[p]}
          </label>
        ))}
      </div>

      <button
        type="button"
        className="btn-primary"
        onClick={onStart}
        disabled={!selectedAudio || starting}
        data-testid="start-button"
      >
        文字起こし開始
      </button>
    </div>
  );
}
