import { MODEL_CATALOG } from "@audiotranscriptionapp/core";

export interface SettingsScreenProps {
  defaultModelId: string;
  onSetDefaultModel: (modelId: string) => void;
  onRunBackup: () => void;
  backingUp: boolean;
  statusMessage: string | null;
}

export function SettingsScreen({
  defaultModelId,
  onSetDefaultModel,
  onRunBackup,
  backingUp,
  statusMessage,
}: SettingsScreenProps) {
  return (
    <div className="card" data-testid="settings-screen">
      <h2>設定</h2>

      <h3>AIモデル管理</h3>
      <p className="status-text" style={{ marginTop: 0 }}>
        既定モデルを切り替えられます。未ダウンロードのモデルは初回文字起こし時に自動取得されます（インターネット接続が必要）。
      </p>
      <div className="model-list" data-testid="model-list">
        {MODEL_CATALOG.map((m) => (
          <div key={m.id} className="model-item" data-selected={m.id === defaultModelId} data-testid="model-item">
            <div>
              <div>{m.label}</div>
              <div className="job-list-item-meta">
                約{m.approxSizeMb >= 1000 ? `${(m.approxSizeMb / 1000).toFixed(1)}GB` : `${m.approxSizeMb}MB`} ・{" "}
                {m.requiresGpu ? "GPU推奨" : "CPUのみで動作可"} ・ {m.description}
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary btn-small"
              disabled={m.id === defaultModelId}
              data-testid={`set-default-model-${m.id}`}
              onClick={() => onSetDefaultModel(m.id)}
            >
              {m.id === defaultModelId ? "既定モデル" : "既定にする"}
            </button>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 24 }}>バックアップ</h3>
      <p className="status-text" style={{ marginTop: 0 }}>
        データベース（文字起こし履歴・テンプレート・設定）を1ファイルにバックアップします。音声ファイル本体は容量が大きいため対象外です。
      </p>
      <button type="button" className="btn-secondary" onClick={onRunBackup} disabled={backingUp}>
        {backingUp ? "バックアップ中..." : "バックアップを保存"}
      </button>

      {statusMessage && (
        <div className="status-text" data-testid="settings-status-message">
          {statusMessage}
        </div>
      )}
    </div>
  );
}
