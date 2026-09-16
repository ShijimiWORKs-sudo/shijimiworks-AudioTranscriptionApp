import type { TemplateDefinition } from "../types.js";

const REQUIRED_UNKNOWN = { required: true, fallback: "[不明]" } as const;
const OPTIONAL_UNKNOWN = { required: false, fallback: "[不明]" } as const;

export const meetingMinutesTemplate: TemplateDefinition = {
  id: "meeting_minutes.default",
  name: "議事録（標準）",
  description: "会議・議事録向けの標準テンプレート",
  purpose: "meeting_minutes",
  version: "1.0.0",
  output_format: "markdown",
  fields: [
    { key: "title", label: "タイトル", ...REQUIRED_UNKNOWN },
    { key: "datetime", label: "日時", ...REQUIRED_UNKNOWN },
    { key: "attendees", label: "参加者", ...REQUIRED_UNKNOWN },
    { key: "agenda", label: "議題", ...OPTIONAL_UNKNOWN },
    { key: "summary", label: "要約", ...OPTIONAL_UNKNOWN },
    { key: "keyStatements", label: "主な発言", ...OPTIONAL_UNKNOWN },
    { key: "decisions", label: "決定事項", ...OPTIONAL_UNKNOWN },
    { key: "openIssues", label: "未決事項", ...OPTIONAL_UNKNOWN },
    { key: "todo", label: "TODO", ...OPTIONAL_UNKNOWN },
    { key: "owner", label: "担当者", ...OPTIONAL_UNKNOWN },
    { key: "dueDate", label: "期限", ...OPTIONAL_UNKNOWN },
    { key: "notes", label: "補足", ...OPTIONAL_UNKNOWN },
  ],
};

export const phoneCallTemplate: TemplateDefinition = {
  id: "phone_call.default",
  name: "電話内容（標準）",
  description: "電話の文字起こし向け標準テンプレート",
  purpose: "phone_call",
  version: "1.0.0",
  output_format: "markdown",
  fields: [
    { key: "datetime", label: "通話日時", ...REQUIRED_UNKNOWN },
    { key: "counterpart", label: "相手", ...REQUIRED_UNKNOWN },
    { key: "purpose", label: "要件", ...OPTIONAL_UNKNOWN },
    { key: "counterpartStatements", label: "相手の発言", ...OPTIONAL_UNKNOWN },
    { key: "ownStatements", label: "自分の発言", ...OPTIONAL_UNKNOWN },
    { key: "importantPoints", label: "重要事項", ...OPTIONAL_UNKNOWN },
    { key: "requests", label: "依頼事項", ...OPTIONAL_UNKNOWN },
    { key: "confirmations", label: "確認事項", ...OPTIONAL_UNKNOWN },
    { key: "nextAction", label: "次の対応", ...OPTIONAL_UNKNOWN },
    { key: "memo", label: "メモ", ...OPTIONAL_UNKNOWN },
  ],
};

export const discussionTemplate: TemplateDefinition = {
  id: "discussion.default",
  name: "打ち合わせ（標準）",
  description: "打ち合わせ・ミーティング向け標準テンプレート",
  purpose: "discussion",
  version: "1.0.0",
  output_format: "markdown",
  fields: [
    { key: "title", label: "タイトル", ...REQUIRED_UNKNOWN },
    { key: "datetime", label: "日時", ...REQUIRED_UNKNOWN },
    { key: "attendees", label: "参加者", ...REQUIRED_UNKNOWN },
    { key: "objective", label: "目的", ...OPTIONAL_UNKNOWN },
    { key: "agenda", label: "議題", ...OPTIONAL_UNKNOWN },
    { key: "byPerson", label: "発言者別内容", ...OPTIONAL_UNKNOWN },
    { key: "points", label: "論点", ...OPTIONAL_UNKNOWN },
    { key: "opinions", label: "意見", ...OPTIONAL_UNKNOWN },
    { key: "agreements", label: "合意事項", ...OPTIONAL_UNKNOWN },
    { key: "openIssues", label: "未決事項", ...OPTIONAL_UNKNOWN },
    { key: "todo", label: "TODO", ...OPTIONAL_UNKNOWN },
    { key: "nextSchedule", label: "次回予定", ...OPTIONAL_UNKNOWN },
  ],
};

export const otherTemplate: TemplateDefinition = {
  id: "other.default",
  name: "その他（全文）",
  description: "テンプレートを指定せず全文文字起こしを出力する",
  purpose: "other",
  version: "1.0.0",
  output_format: "markdown",
  fields: [{ key: "title", label: "タイトル", ...OPTIONAL_UNKNOWN }],
};

export const defaultTemplates: readonly TemplateDefinition[] = [
  meetingMinutesTemplate,
  phoneCallTemplate,
  discussionTemplate,
  otherTemplate,
];

export function getDefaultTemplateForPurpose(
  purpose: TemplateDefinition["purpose"]
): TemplateDefinition {
  const found = defaultTemplates.find((t) => t.purpose === purpose);
  if (!found) {
    throw new Error(`用途 "${purpose}" に対応する既定テンプレートが見つかりません`);
  }
  return found;
}
