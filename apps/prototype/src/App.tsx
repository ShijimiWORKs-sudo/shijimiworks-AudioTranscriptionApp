import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AudioFile,
  FormattedDocument,
  TranscriptionProgress,
  TranscriptionPurpose,
} from "@audiotranscriptionapp/core";
import { HomeScreen } from "./screens/HomeScreen";
import { ProcessingScreen } from "./screens/ProcessingScreen";
import { ResultScreen } from "./screens/ResultScreen";

type Screen = "home" | "processing" | "result";

function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [purpose, setPurpose] = useState<TranscriptionPurpose>("meeting_minutes");
  const [selectedAudio, setSelectedAudio] = useState<AudioFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [canceling, setCanceling] = useState(false);
  const [formattedDocument, setFormattedDocument] = useState<FormattedDocument | null>(null);
  const [editableContent, setEditableContent] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const requestIdRef = useRef<string | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, []);

  const handleSelectFile = useCallback(async () => {
    setFileError(null);
    try {
      const response = await window.electronAPI.selectAudioFile();
      if (response.canceled) return;
      if (response.error) {
        setFileError(response.error);
        setSelectedAudio(null);
        return;
      }
      setSelectedAudio(response.audioFile ?? null);
    } catch (err) {
      setFileError(`ファイル選択でエラーが発生しました: ${(err as Error).message}`);
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (!selectedAudio) return;
    setStarting(true);
    setFileError(null);
    setProgress(null);
    setElapsedSeconds(0);
    setScreen("processing");

    const requestId = generateRequestId();
    requestIdRef.current = requestId;

    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);

    try {
      const response = await window.electronAPI.startTranscription(
        {
          requestId,
          filePath: selectedAudio.filePath,
          purpose,
          modelId: "", // 空文字なら main 側の既定モデルを使用
        },
        (p) => setProgress(p)
      );

      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);

      if (response.canceled) {
        setStatusMessage("文字起こしをキャンセルしました");
        setScreen("home");
        return;
      }
      if (!response.ok || !response.transcript || !response.formattedDocument) {
        setFileError(response.error ?? "文字起こしに失敗しました（原因不明）");
        setScreen("home");
        return;
      }

      setFormattedDocument(response.formattedDocument);
      setEditableContent(response.formattedDocument.content);
      setStatusMessage(null);
      setScreen("result");
    } catch (err) {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      setFileError(`文字起こし中に予期しないエラーが発生しました: ${(err as Error).message}`);
      setScreen("home");
    } finally {
      setStarting(false);
      requestIdRef.current = null;
    }
  }, [selectedAudio, purpose]);

  const handleCancel = useCallback(async () => {
    if (!requestIdRef.current) return;
    setCanceling(true);
    try {
      await window.electronAPI.cancelTranscription(requestIdRef.current);
    } finally {
      setCanceling(false);
    }
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(editableContent);
      setStatusMessage("クリップボードにコピーしました");
    } catch {
      setStatusMessage("コピーに失敗しました（お使いの環境ではクリップボードAPIが利用できない可能性があります）");
    }
  }, [editableContent]);

  const saveAs = useCallback(
    async (format: "txt" | "markdown") => {
      const suggestedFileName = selectedAudio ? selectedAudio.fileName.replace(/\.[^.]+$/, "") : "transcript";
      const response = await window.electronAPI.saveFile({
        content: editableContent,
        suggestedFileName,
        format,
      });
      if (response.canceled) return;
      if (response.error) {
        setStatusMessage(response.error);
        return;
      }
      setStatusMessage(`保存しました: ${response.filePath}`);
    },
    [editableContent, selectedAudio]
  );

  const handleBackHome = useCallback(() => {
    setScreen("home");
    setSelectedAudio(null);
    setFormattedDocument(null);
    setEditableContent("");
    setStatusMessage(null);
  }, []);

  return (
    <div className="app-shell">
      <div className="app-title">AudioTranscriptionApp（試用版）</div>
      <div className="app-subtitle">ローカルAIで音声を文字起こしします。音声データは外部へ送信されません。</div>

      {screen === "home" && (
        <HomeScreen
          purpose={purpose}
          onPurposeChange={setPurpose}
          selectedAudio={selectedAudio}
          fileError={fileError}
          onSelectFile={handleSelectFile}
          onStart={handleStart}
          starting={starting}
        />
      )}

      {screen === "processing" && (
        <ProcessingScreen
          fileName={selectedAudio?.fileName ?? ""}
          progress={progress}
          elapsedSeconds={elapsedSeconds}
          onCancel={handleCancel}
          canceling={canceling}
        />
      )}

      {screen === "result" && formattedDocument && (
        <ResultScreen
          content={editableContent}
          onContentChange={setEditableContent}
          onCopy={handleCopy}
          onSaveTxt={() => saveAs("txt")}
          onSaveMarkdown={() => saveAs("markdown")}
          onBackHome={handleBackHome}
          statusMessage={statusMessage}
        />
      )}
    </div>
  );
}
