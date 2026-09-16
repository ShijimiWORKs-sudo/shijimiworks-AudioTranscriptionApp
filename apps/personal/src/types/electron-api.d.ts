import type {
  DeleteSegmentRequest,
  EditResponse,
  ExportFileRequest,
  ExportFileResponse,
  GetJobDetailResponse,
  GetSettingResponse,
  ImportTemplateResponse,
  JobSearchFilterDTO,
  ListTemplatesResponse,
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
} from "../../shared/ipc";
import type { TranscriptionPurpose } from "@audiotranscriptionapp/core";

export interface ElectronAPI {
  selectAudioFile(): Promise<SelectAudioFileResponse>;
  startTranscription(
    request: StartTranscriptionRequest,
    onProgress: (progress: TranscriptionProgress) => void
  ): Promise<StartTranscriptionResponse>;
  cancelTranscription(requestId: string): Promise<{ ok: boolean }>;
  searchJobs(filter: JobSearchFilterDTO): Promise<SearchJobsResponse>;
  getJobDetail(jobId: string): Promise<GetJobDetailResponse>;
  renameSpeaker(request: RenameSpeakerRequest): Promise<EditResponse>;
  updateSegmentText(request: UpdateSegmentTextRequest): Promise<EditResponse>;
  updateSegmentSpeaker(request: UpdateSegmentSpeakerRequest): Promise<EditResponse>;
  deleteSegment(request: DeleteSegmentRequest): Promise<EditResponse>;
  listTemplates(purpose?: TranscriptionPurpose): Promise<ListTemplatesResponse>;
  selectTemplateFile(): Promise<SelectTemplateFileResponse>;
  importTemplate(filePath: string): Promise<ImportTemplateResponse>;
  getSetting(key: string): Promise<GetSettingResponse>;
  setSetting(key: string, value: string): Promise<{ ok: boolean }>;
  exportFile(request: ExportFileRequest): Promise<ExportFileResponse>;
  runBackup(): Promise<RunBackupResponse>;
  toAudioUrl(filePath: string): string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
