import type { FormattedDocument, TemplateDefinition, Transcript } from "../types.js";
import { UNKNOWN_PLACEHOLDER } from "../types.js";
import { groupBySpeaker, segmentsToPlainText } from "../normalize.js";

/**
 * Template Renderer。
 *
 * 重要な設計原則: ここは Normalized Transcript のみを入力とし、ASRエンジンの内部実装を知らない
 * （docs/architecture/AudioTranscriptionApp_ARCHITECTURE_v1.0.md §4）。
 * また、音声から確認できない情報を勝手に生成しない。フィールド値が与えられなければ
 * テンプレート定義の fallback（既定 "[不明]"）をそのまま出力する。
 */
export class TemplateEngine {
  /**
   * テンプレートを適用してMarkdown文書を生成する。
   * @param template 適用するテンプレート定義
   * @param transcript 正規化済み文字起こし
   * @param fieldValues ユーザーが入力/編集したフィールド値（無ければ fallback を使用）
   */
  render(
    template: TemplateDefinition,
    transcript: Transcript,
    fieldValues: Partial<Record<string, string>> = {}
  ): FormattedDocument {
    const resolvedFields: Record<string, string> = {};
    for (const field of template.fields) {
      resolvedFields[field.key] = fieldValues[field.key]?.trim() || field.fallback;
    }

    const content =
      template.purpose === "other"
        ? this.renderOther(template, transcript, resolvedFields)
        : this.renderStructured(template, transcript, resolvedFields);

    return {
      id: `${transcript.id}.${template.id}`,
      jobId: transcript.jobId,
      templateId: template.id,
      content,
      fields: resolvedFields,
      exportedFormats: [],
    };
  }

  private renderStructured(
    template: TemplateDefinition,
    transcript: Transcript,
    fields: Record<string, string>
  ): string {
    const lines: string[] = [];
    const title = fields["title"] ?? template.name;
    lines.push(`# ${title}`, "");

    for (const field of template.fields) {
      if (field.key === "title") continue;
      lines.push(`## ${field.label}`, "", fields[field.key] ?? field.fallback, "");
    }

    lines.push("## 発言者別内容（自動生成）", "");
    const bySpeaker = groupBySpeaker(transcript.segments);
    if (bySpeaker.size === 0) {
      lines.push(UNKNOWN_PLACEHOLDER, "");
    } else {
      for (const [speaker, segs] of bySpeaker) {
        lines.push(`### ${speaker}`, "");
        lines.push(segmentsToPlainText(segs), "");
      }
    }

    lines.push("---", "", "## 全文文字起こし", "", segmentsToPlainText(transcript.segments));
    return lines.join("\n");
  }

  private renderOther(
    template: TemplateDefinition,
    transcript: Transcript,
    fields: Record<string, string>
  ): string {
    const title = fields["title"] && fields["title"] !== UNKNOWN_PLACEHOLDER ? fields["title"] : "文字起こし結果";
    return [`# ${title}`, "", "## 全文文字起こし", "", segmentsToPlainText(transcript.segments)].join(
      "\n"
    );
  }
}
