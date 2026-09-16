import {
  MODEL_CATALOG,
  PURPOSE_LABEL_JA,
  TRANSCRIPTION_PURPOSES,
  type AudioFile,
  type TemplateDefinition,
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

export interface NewTranscriptionScreenProps {
  purpose: TranscriptionPurpose;
  onPurposeChange: (purpose: TranscriptionPurpose) => void;
  templates: TemplateDefinition[];
  templateId: string;
  onTemplateChange: (templateId: string) => void;
  modelId: string;
  onModelChange: (modelId: string) => void;
  selectedAudio: AudioFile | null;
  fileError: string | null;
  onSelectFile: () => void;
  onStart: () => void;
  starting: boolean;
}

export function NewTranscriptionScreen({
  purpose,
  onPurposeChange,
  templates,
  templateId,
  onTemplateChange,
  modelId,
  onModelChange,
  selectedAudio,
  fileError,
  onSelectFile,
  onStart,
  starting,
}: NewTranscriptionScreenProps) {
  return (
    <div className="card" data-testid="new-transcription-screen">
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

      <div className="field-group">
        <label htmlFor="template-select">テンプレート</label>
        <select
          id="template-select"
          data-testid="template-select"
          value={templateId}
          onChange={(e) => onTemplateChange(e.target.value)}
        >
          <option value="">既定のテンプレートを使用</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field-group">
        <label htmlFor="model-select">使用するAIモデル</label>
        <select
          id="model-select"
          data-testid="model-select"
          value={modelId}
          onChange={(e) => onModelChange(e.target.value)}
        >
          {MODEL_CATALOG.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}（約{m.approxSizeMb >= 1000 ? `${(m.approxSizeMb / 1000).toFixed(1)}GB` : `${m.approxSizeMb}MB`}）
            </option>
          ))}
        </select>
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
