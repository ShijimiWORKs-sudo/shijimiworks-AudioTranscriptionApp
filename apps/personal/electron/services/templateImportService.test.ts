import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  InvalidTemplateError,
  importTemplateFromFile,
  validateTemplateDefinition,
} from "./templateImportService.js";

const tmpDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "atapp-tmpl-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

const validTemplate = {
  id: "custom.sales_meeting",
  name: "営業会議議事録",
  description: "ユーザー独自テンプレート",
  purpose: "meeting_minutes",
  version: "1.0.0",
  output_format: "markdown",
  fields: [
    { key: "sales", label: "売上", required: false, fallback: "[不明]" },
    { key: "issue", label: "課題", required: true, fallback: "[不明]" },
  ],
};

describe("validateTemplateDefinition", () => {
  it("正しいテンプレート定義を受理する", () => {
    const result = validateTemplateDefinition(validTemplate);
    expect(result.id).toBe("custom.sales_meeting");
    expect(result.fields).toHaveLength(2);
  });

  it("トップレベルがオブジェクトでない場合は拒否する", () => {
    expect(() => validateTemplateDefinition("not an object")).toThrow(InvalidTemplateError);
    expect(() => validateTemplateDefinition([1, 2, 3])).toThrow(InvalidTemplateError);
    expect(() => validateTemplateDefinition(null)).toThrow(InvalidTemplateError);
  });

  it("不正なidを拒否する（パストラバーサル文字などを含む場合）", () => {
    expect(() =>
      validateTemplateDefinition({ ...validTemplate, id: "../../etc/passwd" })
    ).toThrow(InvalidTemplateError);
  });

  it("未知のpurposeを拒否する", () => {
    expect(() => validateTemplateDefinition({ ...validTemplate, purpose: "unknown_purpose" })).toThrow(
      InvalidTemplateError
    );
  });

  it("不正なoutput_formatを拒否する", () => {
    expect(() => validateTemplateDefinition({ ...validTemplate, output_format: "exe" })).toThrow(
      InvalidTemplateError
    );
  });

  it("fieldsが配列でない場合は拒否する", () => {
    expect(() => validateTemplateDefinition({ ...validTemplate, fields: "not-an-array" })).toThrow(
      InvalidTemplateError
    );
  });

  it("fieldsの要素数が多すぎる場合は拒否する（DoS対策）", () => {
    const manyFields = Array.from({ length: 101 }, (_, i) => ({
      key: `f${i}`,
      label: `field${i}`,
      required: false,
      fallback: "[不明]",
    }));
    expect(() => validateTemplateDefinition({ ...validTemplate, fields: manyFields })).toThrow(
      InvalidTemplateError
    );
  });

  it("不正なfallback値は既定の[不明]へフォールバックする（クラッシュしない）", () => {
    const result = validateTemplateDefinition({
      ...validTemplate,
      fields: [{ key: "x", label: "X", required: false, fallback: "勝手な値" }],
    });
    expect(result.fields[0]?.fallback).toBe("[不明]");
  });
});

describe("importTemplateFromFile", () => {
  it("許可ディレクトリ内のJSONファイルを正しく読み込める", async () => {
    const dir = await makeTempDir();
    const filePath = path.join(dir, "template.json");
    await fs.writeFile(filePath, JSON.stringify(validTemplate), "utf-8");

    const result = await importTemplateFromFile(filePath, dir);
    expect(result.name).toBe("営業会議議事録");
  });

  it("許可ディレクトリ外のファイルはパストラバーサル対策で拒否する", async () => {
    const allowedDir = await makeTempDir();
    const outsideDir = await makeTempDir();
    const outsideFile = path.join(outsideDir, "template.json");
    await fs.writeFile(outsideFile, JSON.stringify(validTemplate), "utf-8");

    await expect(importTemplateFromFile(outsideFile, allowedDir)).rejects.toThrow(InvalidTemplateError);
    await expect(importTemplateFromFile(outsideFile, allowedDir)).rejects.toThrow(/許可されたフォルダ/);
  });

  it("../ を使ったパストラバーサル試行を拒否する", async () => {
    const allowedDir = await makeTempDir();
    const traversalPath = path.join(allowedDir, "..", "..", "etc", "passwd");

    await expect(importTemplateFromFile(traversalPath, allowedDir)).rejects.toThrow();
  });

  it("壊れたJSONはわかりやすいエラーになる", async () => {
    const dir = await makeTempDir();
    const filePath = path.join(dir, "broken.json");
    await fs.writeFile(filePath, "{ this is not valid json", "utf-8");

    await expect(importTemplateFromFile(filePath, dir)).rejects.toThrow(/JSONとして解析できません/);
  });

  it("巨大すぎるファイルは拒否する", async () => {
    const dir = await makeTempDir();
    const filePath = path.join(dir, "huge.json");
    const hugeContent = JSON.stringify({ ...validTemplate, description: "x".repeat(2 * 1024 * 1024) });
    await fs.writeFile(filePath, hugeContent, "utf-8");

    await expect(importTemplateFromFile(filePath, dir)).rejects.toThrow(/ファイルサイズが上限/);
  });
});
