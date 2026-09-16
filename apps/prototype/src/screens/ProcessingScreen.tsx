import type { TranscriptionProgress } from "@audiotranscriptionapp/core";

const STAGE_LABEL_JA: Record<TranscriptionProgress["stage"], string> = {
  loading_model: "モデル読み込み中",
  decoding_audio: "音声解析中",
  transcribing: "文字起こし中",
  finalizing: "仕上げ処理中",
};

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export interface ProcessingScreenProps {
  fileName: string;
  progress: TranscriptionProgress | null;
  elapsedSeconds: number;
  onCancel: () => void;
  canceling: boolean;
}

export function ProcessingScreen({
  fileName,
  progress,
  elapsedSeconds,
  onCancel,
  canceling,
}: ProcessingScreenProps) {
  const percent = progress?.percent ?? 0;
  const stageLabel = progress ? STAGE_LABEL_JA[progress.stage] : "準備中";

  return (
    <div className="card" data-testid="processing-screen">
      <h2>文字起こし中...</h2>
      <div>ファイル: {fileName}</div>
      <div className="status-text">経過時間: {formatElapsed(elapsedSeconds)}</div>

      <div
        className="progress-bar-track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <div data-testid="progress-percent">{percent}%</div>
      <div className="status-text" data-testid="progress-stage">
        現在: {stageLabel}
      </div>

      <div className="action-row">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={canceling}>
          {canceling ? "キャンセル中..." : "キャンセル"}
        </button>
      </div>
    </div>
  );
}
