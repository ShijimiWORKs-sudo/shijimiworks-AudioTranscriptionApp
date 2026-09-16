import {
  TemplateEngine,
  getDefaultTemplateForPurpose,
  normalizeSegments,
  type ASREngine,
  type AudioFile,
  type FormattedDocument,
  type Transcript,
  type TranscriptionProgress,
  type TranscriptionPurpose,
} from "@audiotranscriptionapp/core";

export interface TranscriptionRunResult {
  transcript: Transcript;
  formattedDocument: FormattedDocument;
}

/**
 * ASR実行 → 正規化 → テンプレート適用 までを orchestrate する。
 * ASREngine を注入可能にすることで、Prototype(Mock/faster-whisper)・Personal Edition
 * どちらからも、またテストからも同じロジックを再利用できる
 * （docs/architecture §4「テンプレートとAI処理を分離する」）。
 */
export class TranscriptionService {
  private readonly templateEngine = new TemplateEngine();

  constructor(private readonly engine: ASREngine) {}

  async run(
    audioFile: AudioFile,
    purpose: TranscriptionPurpose,
    modelId: string,
    onProgress?: (progress: TranscriptionProgress) => void,
    signal?: AbortSignal
  ): Promise<TranscriptionRunResult> {
    const rawTranscript = await this.engine.transcribe(
      audioFile.filePath,
      { modelId, language: "ja", enableTimestamps: true },
      onProgress,
      signal
    );

    const transcript: Transcript = {
      ...rawTranscript,
      segments: normalizeSegments(rawTranscript.segments),
    };

    const template = getDefaultTemplateForPurpose(purpose);
    const formattedDocument = this.templateEngine.render(template, transcript);

    return { transcript, formattedDocument };
  }
}
