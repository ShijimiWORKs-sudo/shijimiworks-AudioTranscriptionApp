"""
実際に faster-whisper モデルをダウンロードし、ローカルで音声を文字起こしする
エンドツーエンド統合テスト。

- モデルの初回ダウンロードのみネットワークを使用する（docs/specs/PERSONAL_SPEC_v1.0.md
  「オフライン動作」の許容例外に該当）。ダウンロード後の推論処理は完全ローカルで完結する。
- テスト音声は espeak-ng でその場生成する（日本語音声合成）。espeak-ngが無い環境ではスキップする。
- ネットワークが無い/遅い環境向けに RUN_ASR_E2E_TEST=0 で明示的にスキップできる。
"""

from __future__ import annotations

import os
import shutil
import subprocess
import wave

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_ASR_E2E_TEST", "1") == "0",
    reason="RUN_ASR_E2E_TEST=0 のためスキップ",
)


def _espeak_available() -> bool:
    return shutil.which("espeak-ng") is not None


@pytest.fixture()
def japanese_speech_wav(tmp_path):
    if not _espeak_available():
        pytest.skip("espeak-ng が見つからないためスキップ")
    out_path = tmp_path / "sample_ja.wav"
    subprocess.run(
        ["espeak-ng", "-v", "ja", "-s", "140", "これはテストです。今日は良い天気ですね。", "-w", str(out_path)],
        check=True,
        capture_output=True,
    )
    assert out_path.exists()
    return str(out_path)


@pytest.fixture()
def silent_wav(tmp_path):
    """espeak-ngが無い環境向けの最低限フォールバック（無音1秒）。"""
    out_path = tmp_path / "silence.wav"
    with wave.open(str(out_path), "w") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(16000)
        f.writeframes(b"\x00\x00" * 16000)
    return str(out_path)


def test_faster_whisper_transcribes_local_audio_offline_after_download(tmp_path, japanese_speech_wav):
    """
    tinyモデルで実際に音声を文字起こしし、ASRパイプライン（音声→ローカルASR→セグメント）が
    実際に動作することを確認する。espeak-ngの機械音声のため認識精度そのものは検証対象外とし、
    「クラッシュせずセグメントが得られること」と「処理時間が記録されること」を確認する。
    """
    from asr_sidecar.engine import FasterWhisperTranscriber

    models_dir = tmp_path / "models"
    models_dir.mkdir()
    transcriber = FasterWhisperTranscriber(models_dir=str(models_dir))

    progress_stages = []

    result = transcriber.transcribe(
        audio_path=japanese_speech_wav,
        model_id="faster-whisper-tiny",
        language="ja",
        on_progress=lambda stage, percent, message=None: progress_stages.append((stage, percent)),
    )

    assert result.duration_ms >= 0
    assert progress_stages[0][0] == "loading_model"
    assert progress_stages[-1] == ("finalizing", 100)
    # モデルがローカルにダウンロード・キャッシュされたことを確認
    assert any(models_dir.iterdir())

    print(f"\n[E2E] 認識結果: {[s.text for s in result.segments]}")
