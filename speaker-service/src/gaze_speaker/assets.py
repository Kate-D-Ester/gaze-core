"""Verified local model assets; no inference path downloads implicitly."""

import hashlib
import stat
import zipfile
from pathlib import Path


def sha256_file(path: Path) -> str:
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def verify_file(path: Path, expected_sha256: str) -> None:
    if sha256_file(path) != expected_sha256:
        raise ValueError(f"Asset checksum mismatch: {path.name}")


def safe_extract(archive: Path, destination: Path, max_bytes: int = 512_000_000) -> None:
    root = destination.resolve()
    with zipfile.ZipFile(archive) as contents:
        members = contents.infolist()
        if sum(member.file_size for member in members) > max_bytes:
            raise ValueError("Expanded asset archive exceeds size limit")
        for member in members:
            output = (root / member.filename).resolve()
            if (
                not output.is_relative_to(root)
                or "\\" in member.filename
                or stat.S_ISLNK(member.external_attr >> 16)
            ):
                raise ValueError("Unsafe archive path")
        destination.mkdir(parents=True, exist_ok=True)
        contents.extractall(destination)


def load_checkpoint(path: Path) -> dict:
    import torch
    from torch.torch_version import TorchVersion

    with torch.serialization.safe_globals([TorchVersion]):
        result = torch.load(path, map_location="cpu", weights_only=True)
    if not isinstance(result, dict):
        raise ValueError("Checkpoint must contain a tensor dictionary")
    return result


VISUAL_HASH = "a19bd302a4f575f1b816cb5b6ed472dfa64bd0c1f1d3ffb2c9dd1432dabb9bc2"
ASSET_HASHES = {
    "separator.pth": "5f9bbb91de9c515d41eac096257c15c0c997bafa7878991e46cfa26f6dcdda9f",
    "config.yaml": "79a7a52c34f906e35aec82aef92c966e5e21819631e696cad2ed6ccb04e9c929",
    "frcnn_128_512.backbone.pth.tar": VISUAL_HASH,
}
ARCHIVE_HASH = "5794ea31512075170c3463b8f7f848821d8b720dca4efa93fc63e0228a98d21c"
SEPARATOR_URL = "https://drive.usercontent.google.com/download?id=1M5udD-65F6eASeI_0coOfl8IIugE79To&export=download"
VISUAL_URL = "https://drive.usercontent.google.com/download?id=13-T3nBnf21-lMKrV_XbH6Lf4vK2xU7lS&export=download&confirm=t"


def download_file(
    url: str, destination: Path, checksum: str, *, client=None, max_bytes: int = 350_000_000
) -> None:
    import httpx

    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(".partial")
    owns_client = client is None
    client = client or httpx.Client(follow_redirects=True, timeout=120)
    try:
        total = 0
        with client.stream("GET", url) as response:
            response.raise_for_status()
            with partial.open("wb") as output:
                for chunk in response.iter_bytes(1_048_576):
                    total += len(chunk)
                    if total > max_bytes:
                        raise ValueError("Model download exceeds size limit")
                    output.write(chunk)
        verify_file(partial, checksum)
        partial.replace(destination)
    finally:
        partial.unlink(missing_ok=True)
        if owns_client:
            client.close()


def setup_assets(asset_dir: Path) -> dict:
    import json
    import shutil

    asset_dir.mkdir(parents=True, exist_ok=True)
    archive = asset_dir / "RTFSNet.zip"
    if not archive.exists() or sha256_file(archive) != ARCHIVE_HASH:
        download_file(SEPARATOR_URL, archive, ARCHIVE_HASH)
    unpacked = asset_dir / "checkpoints"
    safe_extract(archive, unpacked)
    source = unpacked / "RTFSNet/4_layers"
    for original, name in [("best_model.pth", "separator.pth"), ("conf.yaml", "config.yaml")]:
        partial = asset_dir / f"{name}.partial"
        try:
            shutil.copyfile(source / original, partial)
            verify_file(partial, ASSET_HASHES[name])
            partial.replace(asset_dir / name)
        finally:
            partial.unlink(missing_ok=True)
    visual = asset_dir / "frcnn_128_512.backbone.pth.tar"
    if not visual.exists() or sha256_file(visual) != ASSET_HASHES[visual.name]:
        download_file(VISUAL_URL, visual, ASSET_HASHES[visual.name])
    manifest = {
        "engine": "RTFS-Net-4-LRS2",
        "source_commit": "083348bc609275e05916ddc83ff64dd9ad95e9d0",
        "files": ASSET_HASHES,
        "sources": {"separator": SEPARATOR_URL, "visual": VISUAL_URL},
    }
    temporary = asset_dir / "manifest.partial"
    temporary.write_text(json.dumps(manifest, indent=2) + "\n")
    temporary.replace(asset_dir / "manifest.json")
    return manifest


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Download and verify the official local model assets"
    )
    parser.add_argument("--dir", type=Path, default=Path("data/assets"))
    arguments = parser.parse_args()
    setup_assets(arguments.dir)
    print(f"Verified model assets ready at {arguments.dir.resolve()}")
