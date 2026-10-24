"""Build deterministic source Worker ZIPs from an explicit public-file allowlist."""
import argparse
import hashlib
import json
import stat
import zipfile
from pathlib import Path


def build(output: Path):
    root = Path(__file__).resolve().parent.parent
    version = json.loads((root / 'frontend/package.json').read_text())['version']
    files = list((root / 'worker').glob('*.py'))
    files += [root / 'backend' / name for name in ('__init__.py', 'storage.py')]
    asset_root = root / 'vendor/skill-upper'
    asset_manifest = json.loads((asset_root / 'UPSTREAM.json').read_text())
    files += [asset_root / name for name in (*asset_manifest['files'], 'LICENSE', 'UPSTREAM.json')]
    files += [root / 'deploy' / name for name in ('install_worker.py', 'install_tools.py', 'toolchain.json', 'worker-requirements.txt')]
    files += [root / 'deploy/codex' / name for name in ('package.json', 'package-lock.json')]
    files += [root / 'docs/WORKER.md', root / 'THIRD-PARTY-NOTICES.md']
    files += list((root / 'licenses').glob('*-LICENSE.txt'))
    files.append(root / 'licenses/skill-up-Apache-2.0.txt')
    if (root / 'LICENSE').is_file():
        files.append(root / 'LICENSE')
    output.mkdir(parents=True, exist_ok=True)
    for target in ('linux-x86_64', 'macos-arm64'):
        path = output / f'open-skill-eval-worker-{version}-{target}.zip'
        with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for file in sorted(files):
                if file.is_symlink():
                    raise SystemExit('Source Worker package cannot contain symlinks')
                info = zipfile.ZipInfo(file.relative_to(root).as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = (stat.S_IFREG | 0o644) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, file.read_bytes())
            info = zipfile.ZipInfo('worker-package.json', date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            archive.writestr(info, json.dumps({'version': version, 'platform': target}, sort_keys=True))
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        path.with_suffix('.zip.sha256').write_text(f'{digest}  {path.name}\n')
        print(f'{path}: {digest}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('.local/dist'))
    build(parser.parse_args().output)
