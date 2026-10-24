"""Install a standalone Worker into an isolated application directory."""
from __future__ import annotations

import argparse
import json
import os
import platform
import shlex
import shutil
import subprocess
import sys
import venv
from pathlib import Path

from install_tools import install


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, required=True, help='New application directory')
    parser.add_argument('--install-codex', action='store_true', help='Install pinned Codex privately (requires npm)')
    options = parser.parse_args()
    if sys.version_info < (3, 11):  # noqa: UP036 - installer runs before project dependencies exist
        raise SystemExit('需要 Python 3.11 或更新版本')
    supported = (platform.system(), platform.machine())
    if supported not in {('Linux', 'x86_64'), ('Darwin', 'arm64')}:
        raise SystemExit(f'当前独立 Worker 支持 Linux x86_64、macOS arm64，检测到 {supported}')
    source = Path(__file__).resolve().parent.parent
    manifest = source / 'worker-package.json'
    expected_platform = {('Linux', 'x86_64'): 'linux-x86_64', ('Darwin', 'arm64'): 'macos-arm64'}[supported]
    if manifest.exists() and json.loads(manifest.read_text()).get('platform') != expected_platform:
        raise SystemExit('安装包平台不匹配，请下载当前系统对应的 ZIP')
    target = options.directory.expanduser().resolve()
    if target.exists():
        raise SystemExit('应用目录已经存在，请选择新目录。不会覆盖已有应用或连接凭据')
    target.mkdir(parents=True, mode=0o700)
    # Explicit files only: no center, database, history, .env or model login.
    for directory in ('worker', 'vendor/skill-upper', 'deploy/codex'):
        shutil.copytree(source / directory, target / directory, ignore=shutil.ignore_patterns('__pycache__', 'node_modules', '*.pyc'))
    shutil.copytree(source / 'licenses', target / 'licenses')
    (target / 'docs').mkdir()
    shutil.copyfile(source / 'docs/WORKER.md', target / 'docs/WORKER.md')
    shutil.copyfile(source / 'THIRD-PARTY-NOTICES.md', target / 'THIRD-PARTY-NOTICES.md')
    if (source / 'LICENSE').is_file():
        shutil.copyfile(source / 'LICENSE', target / 'LICENSE')
    (target / 'backend').mkdir()
    for filename in ('__init__.py', 'storage.py'):
        shutil.copyfile(source / 'backend' / filename, target / 'backend' / filename)
    for filename in ('worker-requirements.txt', 'toolchain.json', 'install_tools.py'):
        shutil.copyfile(source / 'deploy' / filename, target / 'deploy' / filename)
    venv.EnvBuilder(with_pip=True).create(target / 'venv')
    executable = target / 'venv/bin/python3'
    subprocess.run([str(executable), '-m', 'pip', 'install', '--require-hashes', '-r', str(target / 'deploy/worker-requirements.txt')], check=True)
    install(target / 'bin')
    if options.install_codex:
        if shutil.which('npm') is None:
            raise SystemExit('私有 Codex 安装需要 Node.js 22+ 和 npm；应用已保存，可在新目录重装')
        subprocess.run(['npm', 'ci', '--prefix', str(target / 'deploy/codex'), '--ignore-scripts'], check=True)
    launcher = target / 'start-worker'
    launcher.write_text('#!/bin/sh\nset -eu\n' +
                        f'cd {shlex.quote(str(target))}\n' +
                        f'export PATH={shlex.quote(str(target / "deploy/codex/node_modules/.bin"))}:"$PATH"\n' +
                        f'exec {shlex.quote(str(executable))} -m worker --skill-up {shlex.quote(str(target / "bin/skill-up"))} "$@"\n')
    launcher.chmod(0o755)
    print(f'Worker 已安装：{launcher}')
    print('首次启动粘贴工作台授权码；以后自动重连。Codex 需要 0.162.1 和可用登录。')
    if not options.install_codex:
        print('不会改写系统 Codex。需要私有版本时，在新应用目录使用 --install-codex。')


if __name__ == '__main__':
    os.umask(0o077)
    main()
