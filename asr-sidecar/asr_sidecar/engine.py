"""
faster-whisper を用いたローカル文字起こしエンジン本体。

モデル管理方針（docs/architecture §3, docs/research/LOCAL_ASR_MODEL_COMPARISON.md）:
- 特定モデルへ依存しないよう、model_id はレジストリ経由でHuggingFaceリポジトリ/ローカルパスへ解決する。
- 既定は faster-whisper-base（開発・テスト用の軽量モデル）。Personal Editionのモデル管理画面で
  ユーザーがlarge-v3やKotoba-Whisper等へ切り替えられるようにする。
- HF_HUB_OFFLINE=1 の場合はネットワークへアクセスせず、ローカルにキャッシュ済みのモデルのみ使用する。
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Callable, Optional

from .protocol import TranscriptSegmentDTO

# model_id -> Hugging Face repo id (CTranslate2形式に変換済みのWhisper系モデル)
MODEL_REGISTRY: dict[str, str] = {
    "faster-whisper-tiny": "Systran/faster-whisper-tiny",
    "faster-whisper-base": "Systran/faster-whisper-base",
    "faster-whisper-small": "Systran/faster-whisper-small",
    "faster-whisper-medium": "Systran/faster-whisper-medium",
    "faster-whisper-large-v3": "Systran/faster-whisper-large-v3",
}

DEFAULT_MODEL_ID = "faster-whisper-base"


class UnknownModelError(ValueError):
    pass


def resolve_model_path(model_id: str) -> str:
    """model_id をロード可能なモデル識別子（HFリポジトリ名 or ローカルパス）へ解決する。"""
    if os.path.isdir(model_id):
        return model_id  # ユーザーがローカルパスを直接指定した場合
    if model_id in MODEL_REGISTRY:
        return MODEL_REGISTRY[model_id]
    raise UnknownModelError(
        f"未知のモデルID: {model_id}。対応モデル: {', '.join(MODEL_REGISTRY.keys())}"
    )


def is_model_cached(model_id: str, models_dir: Optional[str] = None) -> bool:
    """モデルがすでにローカルにキャッシュ済みか判定する（ネットワークへは一切アクセスしない）。

    WhisperModel(...)が実際にロードする際と同じ解決ロジック
    (faster_whisper.utils.download_model, local_files_only=True) を使うことで、
    「キャッシュ済みと判定したのに実際のロード時には見つからない」という食い違いを防ぐ。
    """
    repo_or_path = resolve_model_path(model_id)
    if os.path.isdir(repo_or_path):
        return True  # ローカルパス指定は常に利用可能

    # 遅延importにして、faster-whisper未インストール環境でもテスト可能にする
    from faster_whisper.utils import download_model as hf_download_model

    try:
        hf_download_model(repo_or_path, cache_dir=models_dir, local_files_only=True)
        return True
    except Exception:
        return False


def ensure_model_downloaded(model_id: str, models_dir: Optional[str] = None) -> None:
    """モデルがローカルに無ければHuggingFaceから取得する。

    ユーザーの明示的な同意（画面上のダウンロード確認ボタン）を経て呼び出される想定。
    呼び出し元(FasterWhisperEngine.ts の downloadModel())が HF_HUB_OFFLINE=0 を
    このプロセス限定で明示的に設定する。
    """
    repo_or_path = resolve_model_path(model_id)
    if os.path.isdir(repo_or_path):
        return  # ローカルパス指定はダウンロード不要

    from faster_whisper.utils import download_model as hf_download_model

    hf_download_model(repo_or_path, cache_dir=models_dir, local_files_only=False)


@dataclass
class TranscriptionResult:
    segments: list[TranscriptSegmentDTO]
    language: str
    duration_ms: int


ProgressCallback = Callable[[str, int, Optional[str]], None]


class FasterWhisperTranscriber:
    """faster-whisper WhisperModel の薄いラッパー。テスト時はモデルロードを差し替え可能にする。"""

    def __init__(self, models_dir: Optional[str] = None):
        self.models_dir = models_dir or os.environ.get("ASR_MODELS_DIR")
        self._model_cache: dict[str, object] = {}

    def _load_model(self, model_id: str):
        if model_id in self._model_cache:
            return self._model_cache[model_id]

        # 遅延importにして、faster-whisper未インストール環境でもprotocol/engineの単体テストが可能にする
        from faster_whisper import WhisperModel

        repo_or_path = resolve_model_path(model_id)
        model = WhisperModel(
            repo_or_path,
            device="cpu",
            compute_type="int8",
            download_root=self.models_dir,
        )
        self._model_cache[model_id] = model
        return model

    def transcribe(
        self,
        audio_path: str,
        model_id: str,
        language: str = "ja",
        on_progress: Optional[ProgressCallback] = None,
    ) -> TranscriptionResult:
        def progress(stage: str, percent: int, message: str | None = None) -> None:
            if on_progress:
                on_progress(stage, percent, message)

        progress("loading_model", 5)
        model = self._load_model(model_id)

        progress("decoding_audio", 20)
        start = time.monotonic()

        progress("transcribing", 30)
        lang_arg = None if language == "auto" else language
        segments_iter, info = model.transcribe(audio_path, language=lang_arg, vad_filter=True)

        segments: list[TranscriptSegmentDTO] = []
        for i, seg in enumerate(segments_iter):
            segments.append(
                TranscriptSegmentDTO(
                    id=f"seg-{i + 1}",
                    startMs=int(seg.start * 1000),
                    endMs=int(seg.end * 1000),
                    text=seg.text.strip(),
                    confidence=float(getattr(seg, "avg_logprob", 0.0)) if hasattr(seg, "avg_logprob") else None,
                )
            )
            # segmentが出るたびに進捗を進める（0件でも30%->90%へは最終的に到達させる）
            pct = min(30 + (i + 1) * 5, 90)
            progress("transcribing", pct)

        progress("finalizing", 95)
        duration_ms = int((time.monotonic() - start) * 1000)

        detected_language = getattr(info, "language", language) or language
        progress("finalizing", 100)

        return TranscriptionResult(segments=segments, language=detected_language, duration_ms=duration_ms)
