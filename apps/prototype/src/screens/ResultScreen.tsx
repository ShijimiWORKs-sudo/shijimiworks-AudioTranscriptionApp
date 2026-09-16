export interface ResultScreenProps {
  content: string;
  onContentChange: (content: string) => void;
  onCopy: () => void;
  onSaveTxt: () => void;
  onSaveMarkdown: () => void;
  onBackHome: () => void;
  statusMessage: string | null;
}

export function ResultScreen({
  content,
  onContentChange,
  onCopy,
  onSaveTxt,
  onSaveMarkdown,
  onBackHome,
  statusMessage,
}: ResultScreenProps) {
  return (
    <div className="card" data-testid="result-screen">
      <h2>文字起こし結果</h2>
      <textarea
        className="result-editor"
        data-testid="result-editor"
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
      />
      <div className="action-row">
        <button type="button" className="btn-secondary" onClick={onCopy}>
          コピー
        </button>
        <button type="button" className="btn-secondary" onClick={onSaveTxt}>
          TXT保存
        </button>
        <button type="button" className="btn-secondary" onClick={onSaveMarkdown}>
          Markdown保存
        </button>
        <button type="button" className="btn-primary" onClick={onBackHome}>
          新しい文字起こしを始める
        </button>
      </div>
      {statusMessage && (
        <div className="status-text" data-testid="status-message">
          {statusMessage}
        </div>
      )}
    </div>
  );
}
