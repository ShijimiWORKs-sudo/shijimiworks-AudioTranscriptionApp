import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import type { AudioFile, FormattedDocument, Transcript } from "@audiotranscriptionapp/core";

const sampleAudioFile: AudioFile = {
  id: "audio-1",
  filePath: "/tmp/meeting.mp3",
  fileName: "meeting.mp3",
  fileSizeBytes: 2 * 1024 * 1024,
  durationMs: 65_000,
  importedAt: new Date().toISOString(),
  format: "mp3",
};

const sampleTranscript: Transcript = {
  id: "t1",
  jobId: "job1",
  language: "ja",
  modelId: "mock",
  durationMs: 5000,
  segments: [{ id: "1", startMs: 0, endMs: 1000, text: "テスト発言", speaker: "話者A" }],
};

const sampleDocument: FormattedDocument = {
  id: "doc1",
  jobId: "job1",
  templateId: "meeting_minutes.default",
  content: "# 定例会議\n\n## 参加者\n\n[不明]",
  fields: { title: "定例会議" },
  exportedFormats: [],
};

function installElectronAPIMock() {
  const api = {
    selectAudioFile: vi.fn(),
    startTranscription: vi.fn(),
    cancelTranscription: vi.fn().mockResolvedValue({ ok: true }),
    saveFile: vi.fn(),
  };
  (window as unknown as { electronAPI: typeof api }).electronAPI = api;
  return api;
}

describe("App（試用版 画面遷移）", () => {
  let api: ReturnType<typeof installElectronAPIMock>;

  beforeEach(() => {
    api = installElectronAPIMock();
  });

  it("初期状態ではホーム画面が表示され、ファイル未選択時は開始ボタンが無効", () => {
    render(<App />);
    expect(screen.getByTestId("home-screen")).toBeInTheDocument();
    expect(screen.getByTestId("start-button")).toBeDisabled();
  });

  it("ファイル選択→文字起こし開始→結果表示までの一連の流れが動作する", async () => {
    const user = userEvent.setup();
    api.selectAudioFile.mockResolvedValue({ canceled: false, audioFile: sampleAudioFile });
    api.startTranscription.mockImplementation(async (_req, onProgress) => {
      onProgress({ jobId: "job1", stage: "loading_model", percent: 25 });
      onProgress({ jobId: "job1", stage: "transcribing", percent: 75 });
      return { ok: true, transcript: sampleTranscript, formattedDocument: sampleDocument };
    });

    render(<App />);

    await user.click(screen.getByText("音声ファイルを選択"));
    await waitFor(() => expect(screen.getByTestId("file-info")).toBeInTheDocument());
    expect(screen.getByTestId("file-info")).toHaveTextContent("meeting.mp3");

    await user.click(screen.getByTestId("start-button"));

    await waitFor(() => expect(screen.getByTestId("result-screen")).toBeInTheDocument());
    expect(screen.getByTestId("result-editor")).toHaveValue(sampleDocument.content);
  });

  it("選択エラー時はエラーメッセージが表示される（エラー時に原因が表示される）", async () => {
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

  it("処理中にキャンセルするとホーム画面へ戻る", async () => {
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

    // main側がキャンセルを検知してcanceled応答を返した状況を模擬する
    resolveTranscription({ ok: false, canceled: true, error: "文字起こしがキャンセルされました" });

    await waitFor(() => expect(screen.getByTestId("home-screen")).toBeInTheDocument());
  });

  it("結果画面でTXT保存すると保存API が呼ばれ、結果メッセージが表示される", async () => {
    const user = userEvent.setup();
    api.selectAudioFile.mockResolvedValue({ canceled: false, audioFile: sampleAudioFile });
    api.startTranscription.mockResolvedValue({
      ok: true,
      transcript: sampleTranscript,
      formattedDocument: sampleDocument,
    });
    api.saveFile.mockResolvedValue({ canceled: false, filePath: "C:/tmp/meeting.txt" });

    render(<App />);
    await user.click(screen.getByText("音声ファイルを選択"));
    await waitFor(() => expect(screen.getByTestId("file-info")).toBeInTheDocument());
    await user.click(screen.getByTestId("start-button"));
    await waitFor(() => expect(screen.getByTestId("result-screen")).toBeInTheDocument());

    await user.click(screen.getByText("TXT保存"));

    await waitFor(() => expect(api.saveFile).toHaveBeenCalled());
    expect(api.saveFile.mock.calls[0][0].format).toBe("txt");
    await waitFor(() => expect(screen.getByTestId("status-message")).toHaveTextContent("保存しました"));
  });
});
