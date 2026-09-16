"""
Electron本体とのstdin/stdout JSON行プロトコル定義。

docs/architecture/AudioTranscriptionApp_ARCHITECTURE_v1.0.md §5 の方針に基づき、
このプロセスはネットワークへ音声データを一切送信しない。標準入出力のみで通信する。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Literal, Optional


@dataclass
class TranscribeRequest:
    audio_path: str
    model_id: str
    language: str = "ja"
    enable_diarization: bool = False
    enable_timestamps: bool = True

    @staticmethod
    def from_json(line: str) -> "TranscribeRequest":
        data: dict[str, Any] = json.loads(line)
        if "audio_path" not in data or not data["audio_path"]:
            raise ValueError("audio_path is required")
        if "model_id" not in data or not data["model_id"]:
            raise ValueError("model_id is required")
        return TranscribeRequest(
            audio_path=data["audio_path"],
            model_id=data["model_id"],
            language=data.get("language", "ja"),
            enable_diarization=bool(data.get("enable_diarization", False)),
            enable_timestamps=bool(data.get("enable_timestamps", True)),
        )


@dataclass
class TranscriptSegmentDTO:
    id: str
    startMs: int
    endMs: int
    text: str
    speaker: Optional[str] = None
    confidence: Optional[float] = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "id": self.id,
            "startMs": self.startMs,
            "endMs": self.endMs,
            "text": self.text,
        }
        if self.speaker is not None:
            d["speaker"] = self.speaker
        if self.confidence is not None:
            d["confidence"] = self.confidence
        return d


def emit(message: dict[str, Any]) -> None:
    """1行のJSONメッセージを標準出力へ書き出す（flush必須。進捗をリアルタイムに届けるため）。"""
    print(json.dumps(message, ensure_ascii=False), flush=True)


def emit_progress(stage: Literal["loading_model", "decoding_audio", "transcribing", "finalizing"],
                   percent: int, message: str | None = None) -> None:
    payload: dict[str, Any] = {"type": "progress", "stage": stage, "percent": percent}
    if message:
        payload["message"] = message
    emit(payload)


def emit_result(segments: list[TranscriptSegmentDTO], language: str, duration_ms: int) -> None:
    emit(
        {
            "type": "result",
            "segments": [s.to_dict() for s in segments],
            "language": language,
            "duration_ms": duration_ms,
        }
    )


def emit_error(message: str) -> None:
    emit({"type": "error", "message": message})
