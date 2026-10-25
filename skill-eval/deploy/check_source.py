"""Check public candidate files, fixed versions and vendored asset integrity."""
import hashlib
import json
import re
import subprocess
import tomllib
from pathlib import Path


def main():
    root = Path(__file__).resolve().parent.parent
    candidates = subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard', '-z'], cwd=root).decode().split('\0')
    files = sorted({name for name in candidates if name and (root / name).is_file()})
    issues = []
    patterns = [re.compile(r'/Users/[A-Za-z0-9_.-]+/'), re.compile(r'https?://[^\s"<>]*\.(?:xiaohongshu|xiaohongshu-inc)\.com', re.I),
                re.compile(r'\bsk-[A-Za-z0-9_-]{20,}\b'), re.compile(r'\bBearer [A-Za-z0-9._~+/=-]{25,}\b')]
    forbidden = {'.env', 'auth.json', 'connection.json', 'instance-key', 'database.dump'}
    for name in files:
        path = root / name
        if path.name in forbidden or name.startswith(('.local/', '.cache/', 'data/')):
            issues.append(f'{name}: private runtime file in public candidate')
        try:
            text = path.read_text()
        except UnicodeDecodeError:
            continue
        for number, line in enumerate(text.splitlines(), 1):
            if any(pattern.search(line) for pattern in patterns):
                issues.append(f'{name}:{number}: possible private path, endpoint or credential; inspect locally')
    assets = json.loads((root / 'vendor/skill-upper/UPSTREAM.json').read_text())
    for name, expected in assets['files'].items():
        path = root / 'vendor/skill-upper' / name
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            issues.append(f'vendor/skill-upper/{name}: upstream content checksum mismatch')
    seccomp_source = json.loads((root / 'deploy/worker-seccomp.SOURCE.json').read_text())
    for name, expected in seccomp_source['files'].items():
        path = root / name
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            issues.append(f'{name}: pinned seccomp source checksum mismatch')
    project = tomllib.loads((root / 'pyproject.toml').read_text())['project']
    web = json.loads((root / 'frontend/package.json').read_text())
    if project['version'] != web['version']:
        issues.append('pyproject.toml: application version does not match frontend')
    tools = json.loads((root / 'deploy/toolchain.json').read_text())
    codex = json.loads((root / 'deploy/codex/package.json').read_text())
    if codex['dependencies']['@openai/codex'] != tools['codex']['version']:
        issues.append('deploy/codex/package.json: Codex pin differs from toolchain')
    for name in ('THIRD-PARTY-NOTICES.md', 'vendor/skill-upper/LICENSE', 'frontend/public/third-party-licenses.txt'):
        if not (root / name).is_file():
            issues.append(name + ': missing third-party notice')
    if issues:
        print('\n'.join(issues))
        raise SystemExit(1)
    print(f'Public candidate checks passed: {len(files)} files; fixed versions and upstream hashes consistent')


if __name__ == '__main__':
    main()
