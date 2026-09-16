import pytest

from asr_sidecar.engine import DEFAULT_MODEL_ID, MODEL_REGISTRY, UnknownModelError, resolve_model_path


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
