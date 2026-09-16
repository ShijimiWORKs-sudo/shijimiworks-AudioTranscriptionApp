from unittest.mock import patch

import pytest

from asr_sidecar.engine import (
    DEFAULT_MODEL_ID,
    MODEL_REGISTRY,
    UnknownModelError,
    ensure_model_downloaded,
    is_model_cached,
    resolve_model_path,
)


def test_default_model_is_registered():
    assert DEFAULT_MODEL_ID in MODEL_REGISTRY


def test_resolve_model_path_known_model():
    path = resolve_model_path("faster-whisper-base")
    assert path == MODEL_REGISTRY["faster-whisper-base"]


def test_resolve_model_path_unknown_model_raises():
    with pytest.raises(UnknownModelError):
        resolve_model_path("some-unknown-model")


def test_resolve_model_path_local_directory(tmp_path):
    local_model_dir = tmp_path / "my-local-model"
    local_model_dir.mkdir()
    path = resolve_model_path(str(local_model_dir))
    assert path == str(local_model_dir)


def test_is_model_cached_true_for_local_directory(tmp_path):
    local_model_dir = tmp_path / "my-local-model"
    local_model_dir.mkdir()
    assert is_model_cached(str(local_model_dir)) is True


def test_is_model_cached_false_when_not_downloaded_and_offline(tmp_path):
    # 空のキャッシュディレクトリに対しては、ネットワークへアクセスせず False を返す
    # (local_files_only=True を使うため、この呼び出し自体はネットワーク到達性に依存しない)。
    assert is_model_cached("faster-whisper-tiny", str(tmp_path)) is False


def test_is_model_cached_true_when_download_model_succeeds(tmp_path):
    with patch("faster_whisper.utils.download_model") as mock_download:
        mock_download.return_value = str(tmp_path)
        assert is_model_cached("faster-whisper-base", str(tmp_path)) is True
        mock_download.assert_called_once_with(
            MODEL_REGISTRY["faster-whisper-base"], cache_dir=str(tmp_path), local_files_only=True
        )


def test_ensure_model_downloaded_skips_network_for_local_directory(tmp_path):
    local_model_dir = tmp_path / "my-local-model"
    local_model_dir.mkdir()
    with patch("faster_whisper.utils.download_model") as mock_download:
        ensure_model_downloaded(str(local_model_dir))
        mock_download.assert_not_called()


def test_ensure_model_downloaded_calls_download_model_with_local_files_only_false(tmp_path):
    with patch("faster_whisper.utils.download_model") as mock_download:
        mock_download.return_value = str(tmp_path)
        ensure_model_downloaded("faster-whisper-base", str(tmp_path))
        mock_download.assert_called_once_with(
            MODEL_REGISTRY["faster-whisper-base"], cache_dir=str(tmp_path), local_files_only=False
        )
