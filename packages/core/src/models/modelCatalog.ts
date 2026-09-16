/**
 * 既知のローカルASRモデル一覧（Personal Edition §11「モデル管理画面」用）。
 *
 * asr-sidecar/asr_sidecar/engine.py の MODEL_REGISTRY と対応関係を保つこと。
 * ここはUI表示用のメタデータ（容量・日本語対応・CPU/GPU要否）のみを持ち、
 * 実際のモデル取得・解決はPythonサイドカー側（HuggingFace経由）が行う
 * （ASR Engineの交換可能設計 docs/architecture §3 に基づく）。
 */
export interface ModelCatalogEntry {
  id: string;
  label: string;
  approxSizeMb: number;
  requiresGpu: boolean;
  japaneseSupport: "good" | "fair";
  description: string;
}

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    id: "faster-whisper-tiny",
    label: "Whisper Tiny（最軽量・お試し用）",
    approxSizeMb: 75,
    requiresGpu: false,
    japaneseSupport: "fair",
    description: "動作確認・低スペック端末向け。精度は他モデルより劣る。",
  },
  {
    id: "faster-whisper-base",
    label: "Whisper Base（既定）",
    approxSizeMb: 145,
    requiresGpu: false,
    japaneseSupport: "fair",
    description: "速度と精度のバランスが良く、通常はこれを推奨する既定モデル。",
  },
  {
    id: "faster-whisper-small",
    label: "Whisper Small",
    approxSizeMb: 484,
    requiresGpu: false,
    japaneseSupport: "good",
    description: "baseより高精度。CPUでも動作するがやや低速になる。",
  },
  {
    id: "faster-whisper-medium",
    label: "Whisper Medium",
    approxSizeMb: 1530,
    requiresGpu: false,
    japaneseSupport: "good",
    description: "高精度。CPUでは処理時間が長くなるためGPU利用を推奨。",
  },
  {
    id: "faster-whisper-large-v3",
    label: "Whisper Large v3（最高精度）",
    approxSizeMb: 3090,
    requiresGpu: true,
    japaneseSupport: "good",
    description: "最も高精度だが処理が重く、GPU無しでは非常に低速。",
  },
];

export const DEFAULT_MODEL_ID = "faster-whisper-base";

export function findModelCatalogEntry(modelId: string): ModelCatalogEntry | undefined {
  return MODEL_CATALOG.find((m) => m.id === modelId);
}
