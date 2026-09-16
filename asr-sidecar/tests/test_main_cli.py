"""
main.py をサブプロセスとして実際に起動し、Electron側 (FasterWhisperEngine.ts) と同じ
stdin/stdout JSON行プロトコルで通信できることを確認するテスト。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import wave

import pytest


@pytest.fixture()
def silent_wav(tmp_path):
    out_path = tmp_path / "silence.wav"
    with wave.open(str(out_path), "w") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(16000)
        f.writeframes(b"\x00\x00" * 16000)
    return str(out_path)


def test_main_cli_missing_audio_path_emits_error():
    proc = subprocess.run(
        [sys.executable, "-m", "asr_sidecar.main"],
        input='{"model_id": "faster-whisper-base"}\n',
        capture_output=True,
        text=True,
        cwd=os.path.dirname(os.path.dirname(__file__)),
        timeout=30,
    )
    lines = [l for l in proc.stdout.strip().split("\n") if l]
    assert len(lines) == 1
    msg = json.loads(lines[0])
    assert msg["type"] == "error"


def test_main_cli_end_to_end_on_silent_audio(tmp_path, silent_wav):
    models_dir = tmp_path / "models"
    models_dir.mkdir()
    request = {
        "audio_path": silent_wav,
        "model_id": "faster-whisper-tiny",
        "language": "ja",
    }
    env = {**os.environ, "ASR_MODELS_DIR": str(models_dir)}
    proc = subprocess.run(
        [sys.executable, "-m", "asr_sidecar.main"],
        input=json.dumps(request) + "\n",
        capture_output=True,
        text=True,
        cwd=os.path.dirname(os.path.dirname(__file__)),
        env=env,
        timeout=120,
    )
    lines = [l for l in proc.stdout.strip().split("\n") if l]
    messages = [json.loads(l) for l in lines]

    assert any(m["type"] == "progress" and m["stage"] == "loading_model" for m in messages)
    result_messages = [m for m in messages if m["type"] == "result"]
    assert len(result_messages) == 1, f"stderr: {proc.stderr}"
    assert result_messages[0]["language"] is not None
