import { PURPOSE_LABEL_JA, type TemplateDefinition } from "@audiotranscriptionapp/core";

export interface TemplatesScreenProps {
  templates: TemplateDefinition[];
  onImport: () => void;
  importing: boolean;
  statusMessage: string | null;
}

export function TemplatesScreen({ templates, onImport, importing, statusMessage }: TemplatesScreenProps) {
  return (
    <div className="card" data-testid="templates-screen">
      <h2>テンプレート管理</h2>
      <div className="action-row" style={{ marginTop: 0 }}>
        <button type="button" className="btn-primary" onClick={onImport} disabled={importing}>
          {importing ? "取り込み中..." : "テンプレートJSONを取り込む"}
        </button>
      </div>
      {statusMessage && (
        <div className="status-text" data-testid="templates-status-message">
          {statusMessage}
        </div>
      )}

      <div className="template-list" style={{ marginTop: 16 }} data-testid="template-list">
        {templates.map((t) => (
          <div key={t.id} className="template-list-item" data-testid="template-list-item">
            <strong>{t.name}</strong>（{PURPOSE_LABEL_JA[t.purpose]}） — {t.description || "説明なし"}
          </div>
        ))}
      </div>
    </div>
  );
}
