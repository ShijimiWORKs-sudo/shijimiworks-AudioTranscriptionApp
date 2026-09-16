"""
ASRサイドカー エントリポイント。

標準入力から1行のJSONリクエストを読み取り、文字起こしを実行して
標準出力へJSON行（progress/result/error）を書き出す。
Electron Main Process からは core/src/asr/FasterWhisperEngine.ts が子プロセスとして起動する。

音声データはこのプロセス内でのみ処理され、ネットワークへは送信しない
（モデルの初回ダウンロードを除く。HF_HUB_OFFLINE=1 のときはダウンロードも行わない）。
"""

from __future__ import annotations

import sys

from .diarization import DiarizationUnavailableError, diarize_and_label
from .engine import FasterWhisperTranscriber
from .protocol import TranscribeRequest, emit_error, emit_progress, emit_result


def _force_utf8_stdio() -> None:
    """Windows(日本語ロケール)ではPythonのstdin/stdout既定エンコーディングがcp932になり、
    JSON行プロトコル(protocol.emit: ensure_ascii=False)でやり取りする日本語テキストが
    文字化けする。呼び出し元(FasterWhisperEngine.ts)がPYTHONIOENCODING=utf-8を設定する
    のが主対策だが、直接起動されるケース(手動デバッグ等)に備えてここでも明示的に
    UTF-8を強制する。
    """
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        encoding = getattr(stream, "encoding", None)
        if encoding is None or encoding.lower() not in ("utf-8", "utf8"):
            reconfigure = getattr(stream, "reconfigure", None)
            if reconfigure is not None:
                reconfigure(encoding="utf-8", errors="replace")


def run(line: str) -> int:
    try:
        request = TranscribeRequest.from_json(line)
    except Exception as exc:  # noqa: BLE001
        emit_error(f"リクエストの解析に失敗しました: {exc}")
        return 1

    try:
        transcriber = FasterWhisperTranscriber()
        result = transcriber.transcribe(
            audio_path=request.audio_path,
            model_id=request.model_id,
            language=request.language,
            on_progress=lambda stage, percent, message=None: emit_progress(stage, percent, message),
        )

        segments = result.segments
        if request.enable_diarization:
            try:
                segments = diarize_and_label(request.audio_path, segments)
            except DiarizationUnavailableError as exc:
                # 話者分離が使えなくても文字起こし自体は継続する（機能を分離した設計のため）
                emit_progress("finalizing", 97, f"話者分離をスキップしました: {exc}")

        emit_result(segments, result.language, result.duration_ms)
        return 0
    except Exception as exc:  # noqa: BLE001
        emit_error(str(exc))
        return 1


def main() -> int:
    _force_utf8_stdio()
    line = sys.stdin.readline()
    if not line.strip():
        emit_error("リクエストが空です")
        return 1
    return run(line)


if __name__ == "__main__":
    raise SystemExit(main())
