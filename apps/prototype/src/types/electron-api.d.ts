import type {
  CheckModelAvailableRequest,
  CheckModelAvailableResponse,
  DownloadModelRequest,
  DownloadModelResponse,
  ModelDownloadProgress,
  SaveFileRequest,
  SaveFileResponse,
  SelectAudioFileResponse,
  StartTranscriptionRequest,
  StartTranscriptionResponse,
  TranscriptionProgress,
} from "../../shared/ipc";

export interface ElectronAPI {
  selectAudioFile(): Promise<SelectAudioFileResponse>;
  startTranscription(
    request: StartTranscriptionRequest,
    onProgress: (progress: TranscriptionProgress) => void
  ): Promise<StartTranscriptionResponse>;
  cancelTranscription(requestId: string): Promise<{ ok: boolean }>;
  saveFile(request: SaveFileRequest): Promise<SaveFileResponse>;
  checkModelAvailable(request: CheckModelAvailableRequest): Promise<CheckModelAvailableResponse>;
  downloadModel(
    request: DownloadModelRequest,
    onProgress: (progress: ModelDownloadProgress) => void
  ): Promise<DownloadModelResponse>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
