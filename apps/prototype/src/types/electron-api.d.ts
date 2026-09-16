import type {
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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
