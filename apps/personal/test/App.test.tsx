import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import type {
  AudioFile,
  FormattedDocument,
  TemplateDefinition,
  Transcript,
  TranscriptionJob,
} from "@audiotranscriptionapp/core";
import type { JobDetailDTO, JobHistoryEntryDTO } from "../shared/ipc";

const sampleAudioFile: AudioFile = {
  id: "audio-1",
  filePath: "/tmp/meeting.mp3",
  fileName: "meeting.mp3",
  fileSizeBytes: 2 * 1024 * 1024,
  durationMs: 65_000,
  importedAt: new Date().toISOString(),
  format: "mp3",
};

const sampleJob: TranscriptionJob = {
  id: "job-1",
  audioFileId: "audio-1",
  purpose: "meeting_minutes",
  templateId: "meeting_minutes.default",
  modelId: "faster-whisper-base",
  languageSetting: "ja",
  diarizationEnabled: false,
  status: "completed",
  createdAt: new Date().toISOString(),
};

const sampleTranscript: Transcript = {
  id: "t1",
  jobId: "job-1",
  language: "ja",
  modelId: "faster-whisper-base",
  durationMs: 5000,
  segments: [
    { id: "s1", startMs: 0, endMs: 1000, text: "テスト発言1", speaker: "話者A" },
    { id: "s2", startMs: 1000, endMs: 2000, text: "テスト発言2", speaker: "話者B" },
  ],
};

const sampleDocument: FormattedDocument = {
  id: "doc1",
  jobId: "job-1",
  templateId: "meeting_minutes.default",
  content: "# 定例会議\n\n## 参加者\n\n[不明]",
  fields: { title: "定例会議" },
  exportedFormats: [],
};

const sampleDetail: JobDetailDTO = {
  job: sampleJob,
  audioFile: sampleAudioFile,
  transcript: sampleTranscript,
  formattedDocument: sampleDocument,
  speakerMappings: [],
};

const sampleTemplate: TemplateDefinition = {
  id: "meeting_minutes.default",
  name: "議事録（既定）",
  description: "組み込みの議事録テンプレート",
  purpose: "meeting_minutes",
  version: "1.0.0",
  output_format: "markdown",
  fields: [{ key: "title", label: "タイトル", required: false, fallback: "[不明]" }],
};

function installElectronAPIMock() {
  const api = {
    selectAudioFile: vi.fn(),
    startTranscription: vi.fn(),
    cancelTranscription: vi.fn().mockResolvedValue({ ok: true }),
    // 既定ではモデルはキャッシュ済み扱いにし、既存の各テストがそのまま
    // 文字起こしフローへ進めるようにする。ダウンロード同意フロー自体は
    // 専用のテストで cached:false を返すよう上書きする。
    checkModelAvailable: vi.fn().mockResolvedValue({ modelId: "faster-whisper-base", cached: true }),
    downloadModel: vi.fn(),
    searchJobs: vi.fn().mockResolvedValue({ ok: true, results: [] as JobHistoryEntryDTO[] }),
    getJobDetail: vi.fn().mockResolvedValue({ ok: true, detail: sampleDetail }),
    renameSpeaker: vi.fn().mockResolvedValue({ ok: true, formattedDocument: sampleDocument }),
    updateSegmentText: vi.fn().mockResolvedValue({ ok: true, formattedDocument: sampleDocument }),
    updateSegmentSpeaker: vi.fn().mockResolvedValue({ ok: true, formattedDocument: sampleDocument }),
    deleteSegment: vi.fn().mockResolvedValue({ ok: true, formattedDocument: sampleDocument }),
    listTemplates: vi.fn().mockResolvedValue({ ok: true, templates: [sampleTemplate] }),
    selectTemplateFile: vi.fn(),
    importTemplate: vi.fn(),
    getSetting: vi.fn().mockResolvedValue({ value: null }),
    setSetting: vi.fn().mockResolvedValue({ ok: true }),
    exportFile: vi.fn(),
    runBackup: vi.fn(),
    toAudioUrl: vi.fn((p: string) => `app-audio:///${encodeURIComponent(p)}`),
  };
  (window as unknown as { electronAPI: typeof api }).electronAPI = api;
  return api;
}

describe("App（完成版 画面遷移）", () => {
  let api: ReturnType<typeof installElectronAPIMock>;

  beforeEach(() => {
    api = installElectronAPIMock();
    // jsdomは<audio>のplay/loadを実装していないため、明示的にモックする
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
  });

  it("初期状態では新規文字起こし画面が表示され、ファイル未選択時は開始ボタンが無効", async () => {
    render(<App />);
    expect(screen.getByTestId("new-transcription-screen")).toBeInTheDocument();
    expect(screen.getByTestId("start-button")).toBeDisabled();
    // マウント時の非同期処理（テンプレート・設定読み込み）の完了を待つ
    await waitFor(() => expect(api.listTemplates).toHaveBeenCalled());
  });

  it("ファイル選択→文字起こし開始→詳細画面（結果確認）までの一連の流れが動作する", async () => {
    const user = userEvent.setup();
    api.selectAudioFile.mockResolvedValue({ canceled: false, audioFile: sampleAudioFile });
    api.startTranscription.mockImplementation(async (_req, onProgress) => {
      onProgress({ jobId: "job-1", stage: "loading_model", percent: 25 });
      onProgress({ jobId: "job-1", stage: "transcribing", percent: 75 });
      return { ok: true, job: sampleJob, transcript: sampleTranscript, formattedDocument: sampleDocument };
    });

    render(<App />);

    await user.click(screen.getByText("音声ファイルを選択"));
    await waitFor(() => expect(screen.getByTestId("file-info")).toBeInTheDocument());
    expect(screen.getByTestId("file-info")).toHaveTextContent("meeting.mp3");

    await user.click(screen.getByTestId("start-button"));

    await waitFor(() => expect(screen.getByTestId("job-detail-screen")).toBeInTheDocument());
    expect(api.getJobDetail).toHaveBeenCalledWith("job-1");
    expect(screen.getByTestId("formatted-document-preview")).toHaveValue(sampleDocument.content);
    expect(screen.getAllByTestId("segment-item")).toHaveLength(2);
  });

  it("選択エラー時はエラーメッセージが表示される", async () => {
    const user = userEvent.setup();
    api.selectAudioFile.mockResolvedValue({
      canceled: false,
      error: "音声形式に対応していません（拡張子: exe）。",
    });

    render(<App />);
    await user.click(screen.getByText("音声ファイルを選択"));

    await waitFor(() => expect(screen.getByTestId("file-error")).toBeInTheDocument());
    expect(screen.getByTestId("file-error")).toHaveTextContent("音声形式に対応していません");
  });

  it("処理中にキャンセルすると新規文字起こし画面へ戻る", async () => {
    const user = userEvent.setup();
    api.selectAudioFile.mockResolvedValue({ canceled: false, audioFile: sampleAudioFile });

    let resolveTranscription: (value: unknown) => void = () => {};
    api.startTranscription.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTranscription = resolve;
        })
    );

    render(<App />);
    await user.click(screen.getByText("音声ファイルを選択"));
    await waitFor(() => expect(screen.getByTestId("file-info")).toBeInTheDocument());
    await user.click(screen.getByTestId("start-button"));

    await waitFor(() => expect(screen.getByTestId("processing-screen")).toBeInTheDocument());

    await user.click(screen.getByText("キャンセル"));
    expect(api.cancelTranscription).toHaveBeenCalled();

    resolveTranscription({ ok: false, canceled: true, error: "文字起こしがキャンセルされました" });

    await waitFor(() => expect(screen.getByTestId("new-transcription-screen")).toBeInTheDocument());
  });

  it("履歴タブ: 検索結果一覧が表示され、クリックすると詳細画面に遷移する", async () => {
    const user = userEvent.setup();
    const historyEntry: JobHistoryEntryDTO = {
      job: sampleJob,
      audioFile: sampleAudioFile,
      formattedDocument: sampleDocument,
    };
    api.searchJobs.mockResolvedValue({ ok: true, results: [historyEntry] });

    render(<App />);
    await user.click(screen.getByTestId("nav-library"));

    await waitFor(() => expect(api.searchJobs).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByTestId("job-list-item")).toHaveLength(1));
    expect(screen.getByTestId("job-list-item")).toHaveTextContent("meeting.mp3");

    await user.click(screen.getByTestId("job-list-item"));

    await waitFor(() => expect(screen.getByTestId("job-detail-screen")).toBeInTheDocument());
    expect(api.getJobDetail).toHaveBeenCalledWith("job-1");
  });

  it("詳細画面: セグメントのテキストを編集するとupdateSegmentTextが呼ばれ再取得される", async () => {
    const user = userEvent.setup();
    const historyEntry: JobHistoryEntryDTO = {
      job: sampleJob,
      audioFile: sampleAudioFile,
      formattedDocument: sampleDocument,
    };
    api.searchJobs.mockResolvedValue({ ok: true, results: [historyEntry] });

    render(<App />);
    await user.click(screen.getByTestId("nav-library"));
    await waitFor(() => expect(screen.getAllByTestId("job-list-item")).toHaveLength(1));
    await user.click(screen.getByTestId("job-list-item"));
    await waitFor(() => expect(screen.getByTestId("job-detail-screen")).toBeInTheDocument());

    const textarea = screen.getByTestId("segment-text-s1");
    await user.clear(textarea);
    await user.type(textarea, "修正後の発言");
    await user.tab(); // blurさせる

    await waitFor(() =>
      expect(api.updateSegmentText).toHaveBeenCalledWith({
        jobId: "job-1",
        segmentId: "s1",
        text: "修正後の発言",
      })
    );
    await waitFor(() => expect(api.getJobDetail).toHaveBeenCalledTimes(2));
  });

  it("詳細画面: セグメントを削除するとdeleteSegmentが呼ばれる", async () => {
    const user = userEvent.setup();
    api.searchJobs.mockResolvedValue({
      ok: true,
      results: [{ job: sampleJob, audioFile: sampleAudioFile, formattedDocument: sampleDocument }],
    });

    render(<App />);
    await user.click(screen.getByTestId("nav-library"));
    await waitFor(() => expect(screen.getAllByTestId("job-list-item")).toHaveLength(1));
    await user.click(screen.getByTestId("job-list-item"));
    await waitFor(() => expect(screen.getByTestId("job-detail-screen")).toBeInTheDocument());

    await user.click(screen.getByTestId("segment-delete-s1"));

    await waitFor(() =>
      expect(api.deleteSegment).toHaveBeenCalledWith({ jobId: "job-1", segmentId: "s1" })
    );
  });

  it("詳細画面: 話者名を変更するとrenameSpeakerが呼ばれる", async () => {
    const user = userEvent.setup();
    api.searchJobs.mockResolvedValue({
      ok: true,
      results: [{ job: sampleJob, audioFile: sampleAudioFile, formattedDocument: sampleDocument }],
    });

    render(<App />);
    await user.click(screen.getByTestId("nav-library"));
    await waitFor(() => expect(screen.getAllByTestId("job-list-item")).toHaveLength(1));
    await user.click(screen.getByTestId("job-list-item"));
    await waitFor(() => expect(screen.getByTestId("job-detail-screen")).toBeInTheDocument());

    const input = screen.getByTestId("speaker-rename-話者A");
    await user.clear(input);
    await user.type(input, "自分");
    await user.tab();

    await waitFor(() =>
      expect(api.renameSpeaker).toHaveBeenCalledWith({
        transcriptId: "t1",
        jobId: "job-1",
        rawLabel: "話者A",
        displayName: "自分",
      })
    );
  });

  it("テンプレートタブ: 一覧表示とインポート操作が行える", async () => {
    const user = userEvent.setup();
    api.selectTemplateFile.mockResolvedValue({ canceled: false, filePath: "/tmp/custom.json" });
    api.importTemplate.mockResolvedValue({ ok: true, template: sampleTemplate });

    render(<App />);
    await user.click(screen.getByTestId("nav-templates"));

    await waitFor(() => expect(screen.getByTestId("template-list-item")).toBeInTheDocument());
    expect(screen.getByTestId("template-list-item")).toHaveTextContent("議事録（既定）");

    await user.click(screen.getByText("テンプレートJSONを取り込む"));

    await waitFor(() => expect(api.importTemplate).toHaveBeenCalledWith("/tmp/custom.json"));
    await waitFor(() =>
      expect(screen.getByTestId("templates-status-message")).toHaveTextContent("取り込みました")
    );
  });

  it("設定タブ: 既定モデルの切り替えとバックアップ操作が行える", async () => {
    const user = userEvent.setup();
    api.runBackup.mockResolvedValue({ canceled: false, filePath: "/tmp/backup.sqlite" });

    render(<App />);
    await user.click(screen.getByTestId("nav-settings"));

    await waitFor(() => expect(screen.getByTestId("settings-screen")).toBeInTheDocument());
    await user.click(screen.getByTestId("set-default-model-faster-whisper-small"));

    await waitFor(() =>
      expect(api.setSetting).toHaveBeenCalledWith("default_model_id", "faster-whisper-small")
    );

    await user.click(screen.getByText("バックアップを保存"));
    await waitFor(() => expect(api.runBackup).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId("settings-status-message")).toHaveTextContent("バックアップを保存しました")
    );
  });

  it("モデル未キャッシュ時はダウンロード同意画面を経由してから文字起こしが始まる", async () => {
    const user = userEvent.setup();
    api.selectAudioFile.mockResolvedValue({ canceled: false, audioFile: sampleAudioFile });
    api.checkModelAvailable.mockResolvedValue({ modelId: "faster-whisper-base", cached: false });
    api.downloadModel.mockImplementation(async (_req, onProgress) => {
      onProgress({ modelId: "faster-whisper-base", percent: 50, message: "ダウンロード中です..." });
      return { ok: true };
    });
    api.startTranscription.mockResolvedValue({
      ok: true,
      job: sampleJob,
      transcript: sampleTranscript,
      formattedDocument: sampleDocument,
    });

    render(<App />);
    await user.click(screen.getByText("音声ファイルを選択"));
    await waitFor(() => expect(screen.getByTestId("file-info")).toBeInTheDocument());
    await user.click(screen.getByTestId("start-button"));

    await waitFor(() => expect(screen.getByTestId("model-download-screen")).toBeInTheDocument());
    expect(screen.getByTestId("download-confirm-button")).toBeInTheDocument();

    await user.click(screen.getByTestId("download-confirm-button"));

    expect(api.downloadModel).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("job-detail-screen")).toBeInTheDocument());
    expect(api.startTranscription).toHaveBeenCalled();
  });

  it("ダウンロード同意画面でキャンセルすると新規文字起こし画面へ戻り、ダウンロードは呼ばれない", async () => {
    const user = userEvent.setup();
    api.selectAudioFile.mockResolvedValue({ canceled: false, audioFile: sampleAudioFile });
    api.checkModelAvailable.mockResolvedValue({ modelId: "faster-whisper-base", cached: false });

    render(<App />);
    await user.click(screen.getByText("音声ファイルを選択"));
    await waitFor(() => expect(screen.getByTestId("file-info")).toBeInTheDocument());
    await user.click(screen.getByTestId("start-button"));

    await waitFor(() => expect(screen.getByTestId("model-download-screen")).toBeInTheDocument());
    await user.click(screen.getByTestId("download-cancel-button"));

    await waitFor(() => expect(screen.getByTestId("new-transcription-screen")).toBeInTheDocument());
    expect(api.downloadModel).not.toHaveBeenCalled();
  });
});
