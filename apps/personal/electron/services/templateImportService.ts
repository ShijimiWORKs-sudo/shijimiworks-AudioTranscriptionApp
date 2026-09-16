import path from "node:path";
import { promises as fs } from "node:fs";
import {
  TRANSCRIPTION_PURPOSES,
  UNKNOWN_PLACEHOLDER,
  ESTIMATED_PLACEHOLDER,
  type TemplateDefinition,
  type TemplateField,
} from "@audiotranscriptionapp/core";

export class InvalidTemplateError extends Error {
  constructor(message: string) {
    super(`テンプレートの読み込みに失敗しました: ${message}`);
    this.name = "InvalidTemplateError";
  }
}

const MAX_TEMPLATE_FILE_BYTES = 1024 * 1024; // 1MB（巨大ファイル対策）
const VALID_OUTPUT_FORMATS = new Set(["markdown", "txt", "json"]);
const VALID_FALLBACKS = new Set([UNKNOWN_PLACEHOLDER, ESTIMATED_PLACEHOLDER]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateField(raw: unknown, index: number): TemplateField {
  if (!isPlainObject(raw)) {
    throw new InvalidTemplateError(`fields[${index}] がオブジェクトではありません`);
  }
  const { key, label, required, fallback } = raw;
  if (typeof key !== "string" || key.trim() === "") {
    throw new InvalidTemplateError(`fields[${index}].key が不正です`);
  }
  if (typeof label !== "string" || label.trim() === "") {
    throw new InvalidTemplateError(`fields[${index}].label が不正です`);
  }
  if (typeof required !== "boolean") {
    throw new InvalidTemplateError(`fields[${index}].required は真偽値である必要があります`);
  }
  const resolvedFallback = typeof fallback === "string" && VALID_FALLBACKS.has(fallback) ? fallback : UNKNOWN_PLACEHOLDER;
  return { key, label, required, fallback: resolvedFallback as TemplateField["fallback"] };
}

/**
 * ユーザーが取り込んだJSONテンプレートを検証する。
 * 不正なテンプレートJSON対策（docs/specs/PERSONAL_SPEC_v1.0.md §セキュリティ）。
 */
export function validateTemplateDefinition(raw: unknown): TemplateDefinition {
  if (!isPlainObject(raw)) {
    throw new InvalidTemplateError("JSONのトップレベルはオブジェクトである必要があります");
  }
  const { id, name, description, purpose, version, fields, output_format: outputFormat } = raw;

  if (typeof id !== "string" || !/^[a-zA-Z0-9_.-]+$/.test(id)) {
    throw new InvalidTemplateError(
      "id は英数字・ハイフン・アンダースコア・ピリオドのみで構成される必要があります"
    );
  }
  if (typeof name !== "string" || name.trim() === "") {
    throw new InvalidTemplateError("name が不正です");
  }
  if (typeof description !== "string") {
    throw new InvalidTemplateError("description が不正です");
  }
  if (typeof purpose !== "string" || !(TRANSCRIPTION_PURPOSES as readonly string[]).includes(purpose)) {
    throw new InvalidTemplateError(
      `purpose は次のいずれかである必要があります: ${TRANSCRIPTION_PURPOSES.join(", ")}`
    );
  }
  if (typeof version !== "string" || version.trim() === "") {
    throw new InvalidTemplateError("version が不正です");
  }
  if (typeof outputFormat !== "string" || !VALID_OUTPUT_FORMATS.has(outputFormat)) {
    throw new InvalidTemplateError("output_format は markdown/txt/json のいずれかである必要があります");
  }
  if (!Array.isArray(fields)) {
    throw new InvalidTemplateError("fields は配列である必要があります");
  }
  if (fields.length > 100) {
    throw new InvalidTemplateError("fields の数が多すぎます（上限100件）");
  }

  return {
    id,
    name,
    description,
    purpose: purpose as TemplateDefinition["purpose"],
    version,
    output_format: outputFormat as TemplateDefinition["output_format"],
    fields: fields.map((f, i) => validateField(f, i)),
  };
}

/**
 * ローカルのJSONファイルからテンプレートを取り込む。
 * パストラバーサル対策として、許可されたベースディレクトリ配下のみを許可する。
 */
export async function importTemplateFromFile(
  filePath: string,
  allowedBaseDir: string
): Promise<TemplateDefinition> {
  const resolved = path.resolve(filePath);
  const resolvedBase = path.resolve(allowedBaseDir);
  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new InvalidTemplateError(
      `許可されたフォルダ(${allowedBaseDir})の外のファイルは読み込めません`
    );
  }

  const stat = await fs.stat(resolved);
  if (stat.size > MAX_TEMPLATE_FILE_BYTES) {
    throw new InvalidTemplateError(`ファイルサイズが上限(${MAX_TEMPLATE_FILE_BYTES}バイト)を超えています`);
  }

  const raw = await fs.readFile(resolved, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new InvalidTemplateError(`JSONとして解析できません: ${(err as Error).message}`);
  }
  return validateTemplateDefinition(parsed);
}
