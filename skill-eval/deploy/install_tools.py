"""Install the pinned skill-up in an application directory; never change global tools."""
import argparse
import hashlib
import io
import json
import os
import platform
import tarfile
import urllib.request
from pathlib import Path


def install(destination: Path) -> Path:
    lock = json.loads(Path(__file__).with_name("toolchain.json").read_text())["skill_up"]
    arch = {"aarch64": "arm64", "arm64": "arm64", "x86_64": "amd64"}.get(platform.machine())
    target = f"{platform.system().lower()}_{arch}"
    if target not in lock["artifacts"]:
        raise SystemExit(f"Unsupported platform: {target}")
    filename = f"skill-up_{lock['version']}_{target}.tar.gz"
    url = f"{lock['repository']}/releases/download/v{lock['version']}/{filename}"
    with urllib.request.urlopen(url, timeout=60) as response:
        archive = response.read(100 * 1024 * 1024)
    if hashlib.sha256(archive).hexdigest() != lock["artifacts"][target]:
        raise SystemExit("Download checksum mismatch; no executable was installed")
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        member = tar.getmember("skill-up")
        if not member.isfile():
            raise SystemExit("Unexpected executable in archive")
        content = tar.extractfile(member).read()
    destination.mkdir(parents=True, exist_ok=True)
    output = destination / "skill-up"
    temporary = destination / f".skill-up-{os.getpid()}"
    temporary.write_bytes(content)
    temporary.chmod(0o755)
    temporary.replace(output)
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path(".local/bin"))
    print(install(parser.parse_args().directory))
