import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_MODEL_ID,
  findModelCatalogEntry,
  findSegmentAtTime,
  type AudioFile,
  type ModelDownloadProgress,
  type TemplateDefinition,
  type TranscriptionProgress,
  type TranscriptionPurpose,
  type TranscriptSegment,
} from "@audiotranscriptionapp/core";
import type { JobDetailDTO, JobHistoryEntryDTO } from "../shared/ipc";
import { NewTranscriptionScreen } from "./screens/NewTranscriptionScreen";
import { ModelDownloadScreen } from "./screens/ModelDownloadScreen";
import { ProcessingScreen } from "./screens/ProcessingScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { JobDetailScreen } from "./screens/JobDetailScreen";
import { TemplatesScreen } from "./screens/TemplatesScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

type Tab = "new" | "library" | "templates" | "settings";
type Screen =
  | "new"
  | "model_consent"
  | "model_downloading"
  | "processing"
  | "detail"
  | "library"
  | "templates"
  | "settings";

function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const TAB_LABEL_JA: Record<Tab, string> = {
  new: "新規文字起こし",
  library: "履歴",
  templates: "テンプレート",
  settings: "設定",
};

export function App() {
  const [screen, setScreen] = useState<Screen>("new");

  // ---- 新規文字起こし ----
  const [purpose, setPurpose] = useState<TranscriptionPurpose>("meeting_minutes");
  const [templates, setTemplates] = useState<TemplateDefinition[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [selectedAudio, setSelectedAudio] = useState<AudioFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [canceling, setCanceling] = useState(false);
  const [pendingModelId, setPendingModelId] = useState<string | null>(null);
  const [modelDownloadProgress, setModelDownloadProgress] = useState<ModelDownloadProgress | null>(null);
  const [modelDownloadError, setModelDownloadError] = useState<string | null>(null);

  const requestIdRef = useRef<string | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- 履歴 ----
  const [libraryResults, setLibraryResults] = useState<JobHistoryEntryDTO[]>([]);
  const [libraryKeyword, setLibraryKeyword] = useState("");
  const [libraryPurposeFilter, setLibraryPurposeFilter] = useState<TranscriptionPurpose | "">("");
  const [libraryLoading, setLibraryLoading] = useState(false);

  // ---- 詳細 ----
  const [detail, setDetail] = useState<JobDetailDTO | null>(null);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [detailStatusMessage, setDetailStatusMessage] = useState<string | null>(null);

  // ---- テンプレート管理 ----
  const [allTemplates, setAllTemplates] = useState<TemplateDefinition[]>([]);
  const [importing, setImporting] = useState(false);
  const [templatesStatusMessage, setTemplatesStatusMessage] = useState<string | null>(null);

  // ---- 設定 ----
  const [defaultModelId, setDefaultModelId] = useState(DEFAULT_MODEL_ID);
  const [backingUp, setBackingUp] = useState(false);
  const [settingsStatusMessage, setSettingsStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, []);

  // 用途を切り替えるたびに、その用途で使えるテンプレート一覧を読み込む
  useEffect(() => {
    let cancelled = false;
    window.electronAPI
      .listTemplates(purpose)
      .then((res) => {
        if (!cancelled && res.ok) setTemplates(res.templates);
      })
      .catch(() => {
        /* 一覧取得失敗時は既定テンプレートのみで続行できる */
      });
    return () => {
      cancelled = true;
    };
  }, [purpose]);

  // 起動時に既定モデルの設定を読み込む
  useEffect(() => {
    window.electronAPI
      .getSetting("default_model_id")
      .then((res) => {
        if (res.value) {
          setDefaultModelId(res.value);
          setModelId(res.value);
        }
      })
      .catch(() => {
        /* 未設定なら既定値のまま */
      });
  }, []);

  const runLibrarySearch = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const res = await window.electronAPI.searchJobs({
        keyword: libraryKeyword || undefined,
        purpose: libraryPurposeFilter || undefined,
      });
      if (res.ok) setLibraryResults(res.results);
    } finally {
      setLibraryLoading(false);
    }
  }, [libraryKeyword, libraryPurposeFilter]);

  const openJobDetail = useCallback(async (jobId: string) => {
    const res = await window.electronAPI.getJobDetail(jobId);
    if (res.ok && res.detail) {
      setDetail(res.detail);
      setActiveSegmentId(null);
      setDetailStatusMessage(null);
      setScreen("detail");
    } else {
      setDetailStatusMessage(res.error ?? "詳細の取得に失敗しました");
    }
  }, []);

  const refreshDetail = useCallback(async (jobId: string) => {
    const res = await window.electronAPI.getJobDetail(jobId);
    if (res.ok && res.detail) setDetail(res.detail);
  }, []);

  // タブ切り替え時に各タブのデータを読み込む
  const goToTab = useCallback(
    (tab: Tab) => {
      setScreen(tab);
      if (tab === "library") void runLibrarySearch();
      if (tab === "templates") {
        window.electronAPI.listTemplates().then((res) => {
          if (res.ok) setAllTemplates(res.templates);
        });
      }
    },
    [runLibrarySearch]
  );

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

  const runTranscription = useCallback(async () => {
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
          audioFileId: selectedAudio.id,
          filePath: selectedAudio.filePath,
          purpose,
          modelId,
          templateId: templateId || undefined,
        },
        (p) => setProgress(p)
      );

      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);

      if (response.canceled) {
        setScreen("new");
        return;
      }
      if (!response.ok || !response.job) {
        setFileError(response.error ?? "文字起こしに失敗しました（原因不明）");
        setScreen("new");
        return;
      }

      await openJobDetail(response.job.id);
    } catch (err) {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      setFileError(`文字起こし中に予期しないエラーが発生しました: ${(err as Error).message}`);
      setScreen("new");
    } finally {
      setStarting(false);
      requestIdRef.current = null;
    }
  }, [selectedAudio, purpose, modelId, templateId, openJobDetail]);

  const handleStart = useCallback(async () => {
    if (!selectedAudio) return;
    setFileError(null);
    setModelDownloadError(null);
    setStarting(true);
    try {
      // 「明示的な同意なしに外部通信を行わない」方針のため、文字起こし開始前に
      // 選択中のAIモデルがローカルにキャッシュ済みか確認する。無い場合はダウンロード同意画面へ進む。
      const checkResult = await window.electronAPI.checkModelAvailable({ modelId });
      if (checkResult.error) {
        setFileError(`モデルの確認に失敗しました: ${checkResult.error}`);
        setStarting(false);
        return;
      }
      if (checkResult.cached) {
        await runTranscription();
        return;
      }
      setPendingModelId(checkResult.modelId);
      setScreen("model_consent");
      setStarting(false);
    } catch (err) {
      setFileError(`モデルの確認中に予期しないエラーが発生しました: ${(err as Error).message}`);
      setStarting(false);
    }
  }, [selectedAudio, modelId, runTranscription]);

  const handleConfirmDownload = useCallback(async () => {
    setScreen("model_downloading");
    setModelDownloadProgress(null);
    setModelDownloadError(null);
    try {
      const result = await window.electronAPI.downloadModel({ modelId: pendingModelId ?? modelId }, (p) =>
        setModelDownloadProgress(p)
      );
      if (!result.ok) {
        setModelDownloadError(result.error ?? "モデルのダウンロードに失敗しました");
        return;
      }
      await runTranscription();
    } catch (err) {
      setModelDownloadError(`モデルのダウンロード中に予期しないエラーが発生しました: ${(err as Error).message}`);
    }
  }, [pendingModelId, modelId, runTranscription]);

  const handleCancelDownload = useCallback(() => {
    setScreen("new");
    setPendingModelId(null);
    setModelDownloadProgress(null);
    setModelDownloadError(null);
  }, []);

  const handleCancel = useCallback(async () => {
    if (!requestIdRef.current) return;
    setCanceling(true);
    try {
      await window.electronAPI.cancelTranscription(requestIdRef.current);
    } finally {
      setCanceling(false);
    }
  }, []);

  // ---- 詳細画面の編集操作 ----

  const handleSegmentClick = useCallback((segment: TranscriptSegment) => {
    setActiveSegmentId(segment.id);
  }, []);

  const handleTimeUpdate = useCallback(
    (positionMs: number) => {
      if (!detail) return;
      const seg = findSegmentAtTime(detail.transcript.segments, positionMs);
      setActiveSegmentId(seg?.id ?? null);
    },
    [detail]
  );

  const handleSegmentTextCommit = useCallback(
    async (segmentId: string, text: string) => {
      if (!detail) return;
      const res = await window.electronAPI.updateSegmentText({ jobId: detail.job.id, segmentId, text });
      if (res.ok) {
        setDetailStatusMessage("編集内容を保存しました");
        await refreshDetail(detail.job.id);
      } else {
        setDetailStatusMessage(res.error ?? "保存に失敗しました");
      }
    },
    [detail, refreshDetail]
  );

  const handleSegmentSpeakerChange = useCallback(
    async (segmentId: string, speaker: string) => {
      if (!detail) return;
      const res = await window.electronAPI.updateSegmentSpeaker({
        jobId: detail.job.id,
        segmentId,
        speaker: speaker || null,
      });
      if (res.ok) await refreshDetail(detail.job.id);
      else setDetailStatusMessage(res.error ?? "話者の変更に失敗しました");
    },
    [detail, refreshDetail]
  );

  const handleDeleteSegment = useCallback(
    async (segmentId: string) => {
      if (!detail) return;
      const res = await window.electronAPI.deleteSegment({ jobId: detail.job.id, segmentId });
      if (res.ok) {
        setDetailStatusMessage("セグメントを削除しました");
        await refreshDetail(detail.job.id);
      } else {
        setDetailStatusMessage(res.error ?? "削除に失敗しました");
      }
    },
    [detail, refreshDetail]
  );

  const handleRenameSpeaker = useCallback(
    async (rawLabel: string, displayName: string) => {
      if (!detail) return;
      const res = await window.electronAPI.renameSpeaker({
        transcriptId: detail.transcript.id,
        jobId: detail.job.id,
        rawLabel,
        displayName,
      });
      if (res.ok) {
        setDetailStatusMessage(`話者「${rawLabel}」を「${displayName}」に変更しました`);
        await refreshDetail(detail.job.id);
      } else {
        setDetailStatusMessage(res.error ?? "話者名の変更に失敗しました");
      }
    },
    [detail, refreshDetail]
  );

  const handleExport = useCallback(
    async (format: "txt" | "markdown" | "json") => {
      if (!detail) return;
      const suggestedFileName = detail.audioFile.fileName.replace(/\.[^.]+$/, "");
      const content =
        format === "json"
          ? JSON.stringify({ transcript: detail.transcript, formattedDocument: detail.formattedDocument }, null, 2)
          : (detail.formattedDocument?.content ?? "");
      const res = await window.electronAPI.exportFile({ content, suggestedFileName, format });
      if (res.canceled) return;
      setDetailStatusMessage(res.error ?? `保存しました: ${res.filePath}`);
    },
    [detail]
  );

  // ---- テンプレート管理 ----

  const handleImportTemplate = useCallback(async () => {
    setImporting(true);
    setTemplatesStatusMessage(null);
    try {
      const picked = await window.electronAPI.selectTemplateFile();
      if (picked.canceled || !picked.filePath) return;
      const res = await window.electronAPI.importTemplate(picked.filePath);
      if (res.ok && res.template) {
        setTemplatesStatusMessage(`テンプレート「${res.template.name}」を取り込みました`);
        const list = await window.electronAPI.listTemplates();
        if (list.ok) setAllTemplates(list.templates);
      } else {
        setTemplatesStatusMessage(res.error ?? "取り込みに失敗しました");
      }
    } finally {
      setImporting(false);
    }
  }, []);

  // ---- 設定 ----

  const handleSetDefaultModel = useCallback(async (id: string) => {
    await window.electronAPI.setSetting("default_model_id", id);
    setDefaultModelId(id);
    setSettingsStatusMessage("既定モデルを変更しました");
  }, []);

  const handleRunBackup = useCallback(async () => {
    setBackingUp(true);
    try {
      const res = await window.electronAPI.runBackup();
      if (res.canceled) return;
      setSettingsStatusMessage(res.error ?? `バックアップを保存しました: ${res.filePath}`);
    } finally {
      setBackingUp(false);
    }
  }, []);

  const activeTab: Tab =
    screen === "processing" || screen === "model_consent" || screen === "model_downloading"
      ? "new"
      : screen === "detail"
        ? "library"
        : screen;

  return (
    <div className="app-shell">
      <div className="app-title">AudioTranscriptionApp（完成版）</div>
      <div className="app-subtitle">ローカルAIで音声を文字起こしします。音声データは外部へ送信されません。</div>

      <div className="app-nav">
        {(["new", "library", "templates", "settings"] as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className="app-nav-item"
            data-active={activeTab === tab}
            data-testid={`nav-${tab}`}
            onClick={() => goToTab(tab)}
          >
            {TAB_LABEL_JA[tab]}
          </button>
        ))}
      </div>

      {screen === "new" && (
        <NewTranscriptionScreen
          purpose={purpose}
          onPurposeChange={setPurpose}
          templates={templates}
          templateId={templateId}
          onTemplateChange={setTemplateId}
          modelId={modelId}
          onModelChange={setModelId}
          selectedAudio={selectedAudio}
          fileError={fileError}
          onSelectFile={handleSelectFile}
          onStart={handleStart}
          starting={starting}
        />
      )}

      {(screen === "model_consent" || screen === "model_downloading") && (
        <ModelDownloadScreen
          modelLabel={findModelCatalogEntry(pendingModelId ?? modelId)?.label ?? pendingModelId ?? modelId}
          approxSizeMb={findModelCatalogEntry(pendingModelId ?? modelId)?.approxSizeMb}
          phase={screen === "model_consent" ? "consent" : "downloading"}
          progress={modelDownloadProgress}
          errorMessage={modelDownloadError}
          onConfirm={handleConfirmDownload}
          onCancel={handleCancelDownload}
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

      {screen === "library" && (
        <LibraryScreen
          results={libraryResults}
          keyword={libraryKeyword}
          onKeywordChange={setLibraryKeyword}
          purposeFilter={libraryPurposeFilter}
          onPurposeFilterChange={setLibraryPurposeFilter}
          onSearch={runLibrarySearch}
          onSelectJob={openJobDetail}
          loading={libraryLoading}
        />
      )}

      {screen === "detail" && detail && (
        <JobDetailScreen
          detail={detail}
          activeSegmentId={activeSegmentId}
          onSegmentClick={handleSegmentClick}
          onTimeUpdate={handleTimeUpdate}
          onSegmentTextCommit={handleSegmentTextCommit}
          onSegmentSpeakerChange={handleSegmentSpeakerChange}
          onDeleteSegment={handleDeleteSegment}
          onRenameSpeaker={handleRenameSpeaker}
          onExport={handleExport}
          onBack={() => goToTab("library")}
          audioUrl={window.electronAPI.toAudioUrl(detail.audioFile.filePath)}
          statusMessage={detailStatusMessage}
        />
      )}

      {screen === "templates" && (
        <TemplatesScreen
          templates={allTemplates}
          onImport={handleImportTemplate}
          importing={importing}
          statusMessage={templatesStatusMessage}
        />
      )}

      {screen === "settings" && (
        <SettingsScreen
          defaultModelId={defaultModelId}
          onSetDefaultModel={handleSetDefaultModel}
          onRunBackup={handleRunBackup}
          backingUp={backingUp}
          statusMessage={settingsStatusMessage}
        />
      )}
    </div>
  );
}
