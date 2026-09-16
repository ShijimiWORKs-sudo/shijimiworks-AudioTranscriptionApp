import json

import pytest

from asr_sidecar.protocol import TranscribeRequest, emit_error, emit_progress, emit_result, TranscriptSegmentDTO


def test_transcribe_request_from_json_minimal():
    req = TranscribeRequest.from_json('{"audio_path": "/tmp/a.mp3", "model_id": "faster-whisper-base"}')
    assert req.audio_path == "/tmp/a.mp3"
    assert req.model_id == "faster-whisper-base"
    assert req.language == "ja"  # デフォルトは日本語
    assert req.enable_diarization is False
    assert req.enable_timestamps is True


def test_transcribe_request_from_json_full():
    payload = {
        "audio_path": "/tmp/a.wav",
        "model_id": "faster-whisper-large-v3",
        "language": "en",
        "enable_diarization": True,
        "enable_timestamps": False,
    }
    req = TranscribeRequest.from_json(json.dumps(payload))
    assert req.language == "en"
    assert req.enable_diarization is True
    assert req.enable_timestamps is False


def test_transcribe_request_missing_audio_path_raises():
    with pytest.raises(ValueError):
        TranscribeRequest.from_json('{"model_id": "faster-whisper-base"}')


def test_transcribe_request_missing_model_id_raises():
    with pytest.raises(ValueError):
        TranscribeRequest.from_json('{"audio_path": "/tmp/a.mp3"}')


def test_emit_functions_write_valid_json_lines(capsys):
    emit_progress("loading_model", 10)
    emit_result([TranscriptSegmentDTO(id="1", startMs=0, endMs=1000, text="テスト")], "ja", 1234)
    emit_error("エラーメッセージ")

    out_lines = [line for line in capsys.readouterr().out.strip().split("\n") if line]
    assert len(out_lines) == 3

    progress_msg = json.loads(out_lines[0])
    assert progress_msg == {"type": "progress", "stage": "loading_model", "percent": 10}

    result_msg = json.loads(out_lines[1])
    assert result_msg["type"] == "result"
    assert result_msg["language"] == "ja"
    assert result_msg["duration_ms"] == 1234
    assert result_msg["segments"][0]["text"] == "テスト"

    error_msg = json.loads(out_lines[2])
    assert error_msg == {"type": "error", "message": "エラーメッセージ"}
