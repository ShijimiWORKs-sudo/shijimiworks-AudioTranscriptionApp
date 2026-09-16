import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { describeAudioFile, UnsupportedAudioFormatError } from "./audioFileService.js";

const tmpFiles: string[] = [];

async function createTempFile(name: string, content = "dummy"): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "atapp-test-"));
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, content);
  tmpFiles.push(filePath);
  return filePath;
}

afterEach(async () => {
  await Promise.all(
    tmpFiles.splice(0).map((f) => fs.rm(f, { force: true }).catch(() => undefined))
  );
});

describe("describeAudioFile", () => {
  it("対応形式(mp3)のファイルはAudioFileとして解決される", async () => {
    const filePath = await createTempFile("sample.mp3");
    const audioFile = await describeAudioFile(filePath);
    expect(audioFile.format).toBe("mp3");
    expect(audioFile.fileName).toBe("sample.mp3");
    expect(audioFile.fileSizeBytes).toBeGreaterThan(0);
  });

  it("対応形式(wav)のファイルはAudioFileとして解決される", async () => {
    const filePath = await createTempFile("sample.wav");
    const audioFile = await describeAudioFile(filePath);
    expect(audioFile.format).toBe("wav");
  });

  it("未対応形式は UnsupportedAudioFormatError を送出する（エラー原因が日本語で示される）", async () => {
    const filePath = await createTempFile("sample.exe");
    await expect(describeAudioFile(filePath)).rejects.toThrow(UnsupportedAudioFormatError);
    await expect(describeAudioFile(filePath)).rejects.toThrow(/音声形式に対応していません/);
  });
});
