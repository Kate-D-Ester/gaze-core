"""Explicit local-service limits and paths."""

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    data_dir: Path = Path("data/sessions")
    asset_dir: Path = Path("data/assets")
    device: str = "auto"
    origin: str = "http://localhost:4001"
    port: int = 4033
    max_upload_bytes: int = 120 * 1024 * 1024
    max_data_bytes: int = 1024 * 1024 * 1024
    retention_seconds: float = 1800
    max_queue: int = 2
    max_clips: int = 16
    max_jobs_per_clip: int = 24
    max_duration: float = 120

    def __post_init__(self):
        if self.device not in {"cpu", "mps", "auto"}:
            raise ValueError("Unsupported inference device")
        if (
            min(
                self.max_upload_bytes,
                self.max_data_bytes,
                self.retention_seconds,
                self.max_queue,
                self.max_duration,
            )
            <= 0
        ):
            raise ValueError("Service limits must be positive")
        if not self.origin.startswith(("http://localhost:", "http://127.0.0.1:")):
            raise ValueError("Frontend origin must be an exact local HTTP origin")
