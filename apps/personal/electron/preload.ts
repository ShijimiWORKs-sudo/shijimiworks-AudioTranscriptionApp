import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/ipc.js";
import type {
  CheckModelAvailableRequest,
  CheckModelAvailableResponse,
  DeleteSegmentRequest,
  DownloadModelRequest,
  DownloadModelResponse,
  EditResponse,
  ExportFileRequest,
  ExportFileResponse,
  GetJobDetailResponse,
  GetSettingResponse,
  ImportTemplateResponse,
  JobSearchFilterDTO,
  ListTemplatesResponse,
  ModelDownloadProgress,
  RenameSpeakerRequest,
  RunBackupResponse,
  SearchJobsResponse,
  SelectAudioFileResponse,
  SelectTemplateFileResponse,
  StartTranscriptionRequest,
  StartTranscriptionResponse,
  TranscriptionProgress,
  UpdateSegmentSpeakerRequest,
  UpdateSegmentTextRequest,
} from "../shared/ipc.js";
import type { TranscriptionPurpose } from "@audiotranscriptionapp/core";

/**
 * contextIsolation:true の下で、レンダラーに公開する最小限のAPI。
 * レンダラーはNode/Electronの生APIへ直接アクセスできない（セキュリティ方針）。
 */
const electronAPI = {
  selectAudioFile: (): Promise<SelectAudioFileResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.selectAudioFile),

  startTranscription: (
    request: StartTranscriptionRequest,
    onProgress: (progress: TranscriptionProgress) => void
  ): Promise<StartTranscriptionResponse> => {
    const listener = (_event: unknown, progress: TranscriptionProgress) => onProgress(progress);
    ipcRenderer.on(IPC_CHANNELS.transcriptionProgress, listener);
    return ipcRenderer.invoke(IPC_CHANNELS.startTranscription, request).finally(() => {
      ipcRenderer.removeListener(IPC_CHANNELS.transcriptionProgress, listener);
    });
  },

  cancelTranscription: (requestId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.cancelTranscription, requestId),

  checkModelAvailable: (request: CheckModelAvailableRequest): Promise<CheckModelAvailableResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.checkModelAvailable, request),

  downloadModel: (
    request: DownloadModelRequest,
    onProgress: (progress: ModelDownloadProgress) => void
  ): Promise<DownloadModelResponse> => {
    const listener = (_event: unknown, progress: ModelDownloadProgress) => onProgress(progress);
    ipcRenderer.on(IPC_CHANNELS.modelDownloadProgress, listener);
    return ipcRenderer.invoke(IPC_CHANNELS.downloadModel, request).finally(() => {
      ipcRenderer.removeListener(IPC_CHANNELS.modelDownloadProgress, listener);
    });
  },

  searchJobs: (filter: JobSearchFilterDTO): Promise<SearchJobsResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.searchJobs, filter),

  getJobDetail: (jobId: string): Promise<GetJobDetailResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.getJobDetail, jobId),

  renameSpeaker: (request: RenameSpeakerRequest): Promise<EditResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.renameSpeaker, request),

  updateSegmentText: (request: UpdateSegmentTextRequest): Promise<EditResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.updateSegmentText, request),

  updateSegmentSpeaker: (request: UpdateSegmentSpeakerRequest): Promise<EditResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.updateSegmentSpeaker, request),

  deleteSegment: (request: DeleteSegmentRequest): Promise<EditResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteSegment, request),

  listTemplates: (purpose?: TranscriptionPurpose): Promise<ListTemplatesResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.listTemplates, purpose),

  selectTemplateFile: (): Promise<SelectTemplateFileResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.selectTemplateFile),

  importTemplate: (filePath: string): Promise<ImportTemplateResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.importTemplate, filePath),

  getSetting: (key: string): Promise<GetSettingResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.getSetting, key),

  setSetting: (key: string, value: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.setSetting, key, value),

  exportFile: (request: ExportFileRequest): Promise<ExportFileResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.exportFile, request),

  runBackup: (): Promise<RunBackupResponse> => ipcRenderer.invoke(IPC_CHANNELS.runBackup),

  toAudioUrl: (filePath: string): string => `app-audio:///${encodeURIComponent(filePath)}`,
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

export type ElectronAPI = typeof electronAPI;
