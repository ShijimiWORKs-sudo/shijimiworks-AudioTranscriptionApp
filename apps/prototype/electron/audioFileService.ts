import { promises as fs } from "node:fs";
import path from "node:path";
import { parseFile } from "music-metadata";
import { SUPPORTED_AUDIO_FORMATS, type AudioFile, type AudioFormat } from "@audiotranscriptionapp/core";

export class UnsupportedAudioFormatError extends Error {
  constructor(ext: string) {
    super(
      `音声形式に対応していません（拡張子: ${ext}）。対応形式: ${SUPPORTED_AUDIO_FORMATS.join(", ")}`
    );
    this.name = "UnsupportedAudioFormatError";
  }
}

function detectFormat(filePath: string): AudioFormat {
  const ext = path.extname(filePath).replace(".", "").toLowerCase();
  if ((SUPPORTED_AUDIO_FORMATS as readonly string[]).includes(ext)) {
    return ext as AudioFormat;
  }
  throw new UnsupportedAudioFormatError(ext || "(不明)");
}

/**
 * 選択された音声ファイルを検証し、AudioFileメタデータを構築する。
 * Prototype完成条件「MP3を処理できる」「WAVを処理できる」の検証対象。
 */
export async function describeAudioFile(filePath: string): Promise<AudioFile> {
  const format = detectFormat(filePath);
  const stat = await fs.stat(filePath);

  let durationMs = 0;
  try {
    const metadata = await parseFile(filePath);
    durationMs = Math.round((metadata.format.duration ?? 0) * 1000);
  } catch {
    // メタデータ解析に失敗しても致命的エラーにはしない（duration不明のまま続行）
    durationMs = 0;
  }

  return {
    id: `audio-${Date.now()}`,
    filePath,
    fileName: path.basename(filePath),
    fileSizeBytes: stat.size,
    durationMs,
    importedAt: new Date().toISOString(),
    format,
  };
}
