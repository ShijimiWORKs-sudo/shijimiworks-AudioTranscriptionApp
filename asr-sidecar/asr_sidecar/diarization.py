"""
話者分離（Personal Edition向け、任意機能）。

pyannote.audio はコードはMITだがモデルはHugging Face上でgatedのため、
利用にはユーザー自身のHugging Faceトークンとモデル利用規約への同意が必要
（docs/research/LOCAL_ASR_MODEL_COMPARISON.md §4）。
そのため、このモジュールは:
  - pyannote.audio が未インストール、またはトークン未設定の場合は静かにスキップする
  - 実行できる場合のみ、セグメントへ話者ラベル（話者A/話者B...）を付与する
アプリ全体をこの機能の有無に依存させない。
"""

from __future__ import annotations

import os
from typing import Optional

from .protocol import TranscriptSegmentDTO


class DiarizationUnavailableError(Exception):
    pass


def is_diarization_available() -> bool:
    if not os.environ.get("HF_TOKEN"):
        return False
    try:
        import pyannote.audio  # noqa: F401
    except ImportError:
        return False
    return True


def diarize_and_label(
    audio_path: str, segments: list[TranscriptSegmentDTO]
) -> list[TranscriptSegmentDTO]:
    """
    各セグメントへ話者ラベル（話者A/話者B...）を付与する。
    pyannote.audioが利用できない場合は DiarizationUnavailableError を送出する
    （呼び出し側で「話者分離なしで続行」を選択できるようにするため）。
    """
    if not is_diarization_available():
        raise DiarizationUnavailableError(
            "話者分離を実行できません。HF_TOKEN環境変数とpyannote.audioのインストールが必要です。"
        )

    from pyannote.audio import Pipeline

    hf_token = os.environ["HF_TOKEN"]
    pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=hf_token)
    diarization = pipeline(audio_path)

    label_map: dict[str, str] = {}

    def label_for(raw_label: str) -> str:
        if raw_label not in label_map:
            label_map[raw_label] = f"話者{chr(ord('A') + len(label_map))}"
        return label_map[raw_label]

    def speaker_at(t_ms: int) -> Optional[str]:
        t_sec = t_ms / 1000
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            if turn.start <= t_sec <= turn.end:
                return label_for(speaker)
        return None

    labeled: list[TranscriptSegmentDTO] = []
    for seg in segments:
        mid = (seg.startMs + seg.endMs) // 2
        seg.speaker = speaker_at(mid)
        labeled.append(seg)
    return labeled
