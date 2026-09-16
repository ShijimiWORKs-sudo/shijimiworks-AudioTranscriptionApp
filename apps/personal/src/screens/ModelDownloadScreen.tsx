import type { ModelDownloadProgress } from "@audiotranscriptionapp/core";

export interface ModelDownloadScreenProps {
  modelLabel: string;
  approxSizeMb?: number;
  phase: "consent" | "downloading";
  progress: ModelDownloadProgress | null;
  errorMessage: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 選択したAIモデルがまだローカルにキャッシュされていない場合に表示する
 * ダウンロード同意画面。「明示的な同意なしに外部通信を行わない」方針
 * (docs/architecture §5)を、UI上で満たすためのもの。
 */
export function ModelDownloadScreen({
  modelLabel,
  approxSizeMb,
  phase,
  progress,
  errorMessage,
  onConfirm,
  onCancel,
}: ModelDownloadScreenProps) {
  return (
    <div className="card" data-testid="model-download-screen">
      <h2>AIモデルのダウンロードが必要です</h2>
      <p>
        文字起こしには、選択したAIモデル（{modelLabel}
        {approxSizeMb ? `・約${approxSizeMb}MB` : ""}）のダウンロードが必要です。
        インターネット接続が必要ですが、<strong>音声データ自体が外部へ送信されることはありません</strong>
        （ダウンロードするのはAIモデルのプログラムファイルのみです）。一度ダウンロードすれば、
        次回以降はインターネット接続なしで文字起こしできます。
      </p>

      {phase === "consent" && (
        <div className="action-row">
          <button type="button" className="btn-secondary" onClick={onCancel} data-testid="download-cancel-button">
            キャンセル
          </button>
          <button type="button" className="btn-primary" onClick={onConfirm} data-testid="download-confirm-button">
            ダウンロードして続ける
          </button>
        </div>
      )}

      {phase === "downloading" && (
        <>
          <div
            className="progress-bar-track"
            role="progressbar"
            aria-valuenow={progress?.percent ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-bar-fill" style={{ width: `${progress?.percent ?? 0}%` }} />
          </div>
          <div data-testid="model-download-percent">{progress?.percent ?? 0}%</div>
          <div className="status-text">{progress?.message ?? "ダウンロード中..."}</div>
        </>
      )}

      {errorMessage && (
        <div className="file-error" role="alert" data-testid="model-download-error">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
