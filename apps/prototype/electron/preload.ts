import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/ipc.js";
import type {
  SaveFileRequest,
  SaveFileResponse,
  SelectAudioFileResponse,
  StartTranscriptionRequest,
  StartTranscriptionResponse,
  TranscriptionProgress,
} from "../shared/ipc.js";

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

  saveFile: (request: SaveFileRequest): Promise<SaveFileResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveFile, request),
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

export type ElectronAPI = typeof electronAPI;
