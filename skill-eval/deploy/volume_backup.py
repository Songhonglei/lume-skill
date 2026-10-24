"""Archive application volumes together; PostgreSQL dump/restore is a separate step."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import stat
import zipfile
from pathlib import Path, PurePosixPath


def parse_roots(values):
    roots = {}
    for value in values:
        name, separator, path = value.partition('=')
        if not separator or not name.isidentifier() or name in roots:
            raise SystemExit('--root must be a unique name=/absolute/directory')
        roots[name] = Path(path).resolve()
    return roots


def file_digest(stream):
    digest = hashlib.sha256()
    while block := stream.read(1024 * 1024):
        digest.update(block)
    return digest.hexdigest()


def pack(archive, roots, excluded=()):
    for name in excluded:
        parts = name.split('/')
        if len(parts) < 2 or parts[0] not in roots or '\\' in name or any(part in {'', '.', '..'} for part in parts):
            raise SystemExit('--exclude must be a relative root/subdirectory path, never an entire root')
    if any(archive.resolve().is_relative_to(root) for root in roots.values()):
        raise SystemExit('Backup archive must be outside the source volumes')
    if archive.exists():
        raise SystemExit('Backup already exists; choose a new archive path')
    archive.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    manifest = {'version': 1, 'files': {}, 'directories': {}, 'excluded': sorted(set(excluded))}
    temporary = archive.with_name(archive.name + '.partial')
    try:
        with zipfile.ZipFile(temporary, 'x', compression=zipfile.ZIP_DEFLATED) as output:
            for name, root in roots.items():
                if not root.is_dir():
                    raise SystemExit(f'Missing volume: {name}')
                for path in [root, *sorted(root.rglob('*'))]:
                    relative = name + ('/' + path.relative_to(root).as_posix() if path != root else '')
                    if any(relative == prefix or relative.startswith(prefix + '/') for prefix in excluded):
                        continue
                    if path.is_symlink() or not (path.is_dir() or path.is_file()):
                        raise SystemExit(f'Unsupported backup entry in volume: {name}')
                    mode = stat.S_IMODE(path.stat().st_mode)
                    if path.is_dir():
                        manifest['directories'][relative] = mode
                    else:
                        with path.open('rb') as stream:
                            checksum = file_digest(stream)
                        output.write(path, relative)
                        manifest['files'][relative] = {'sha256': checksum, 'mode': mode}
            output.writestr('manifest.json', json.dumps(manifest, sort_keys=True))
        temporary.chmod(0o600)
        temporary.replace(archive)
    finally:
        temporary.unlink(missing_ok=True)
    print(f'Backup saved: {archive}; {len(manifest["files"])} files')


def unpack(archive, roots, owner):
    for root in roots.values():
        if root.exists() and any(root.iterdir()):
            raise SystemExit('Restore requires empty target volumes; existing data was not changed')
    with zipfile.ZipFile(archive) as source:
        manifest = json.loads(source.read('manifest.json'))
        if manifest.get('version') != 1:
            raise SystemExit('Unsupported backup version')
        members = manifest['files']
        if len(source.namelist()) != len(set(source.namelist())) or set(source.namelist()) != {*members, 'manifest.json'}:
            raise SystemExit('Backup entries do not match the manifest')
        directories = manifest['directories']
        for name in [*members, *directories]:
            parts = name.split('/')
            if name.startswith('/') or any(part in {'', '.', '..'} for part in parts) or '\\' in name or parts[0] not in roots:
                raise SystemExit('Invalid backup path')
        # Verify the complete archive before creating files in any target volume.
        for name, metadata in members.items():
            with source.open(name) as stream:
                if file_digest(stream) != metadata['sha256']:
                    raise SystemExit('Backup checksum mismatch; targets were not changed')
        def target(name):
            parts = PurePosixPath(name).parts
            return roots[parts[0]].joinpath(*parts[1:])
        for name, mode in sorted(directories.items(), key=lambda item: item[0].count('/')):
            directory = target(name)
            directory.mkdir(parents=True, exist_ok=True)
            directory.chmod(mode & 0o777)
            if owner:
                os.chown(directory, *owner)
        for name, metadata in members.items():
            file = target(name)
            file.parent.mkdir(parents=True, exist_ok=True)
            with source.open(name) as stream, file.open('xb') as output:
                shutil.copyfileobj(stream, output, length=1024 * 1024)
            file.chmod(metadata['mode'] & 0o777)
            if owner:
                os.chown(file, *owner)
    print(f'Backup restored: {len(members)} files')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['pack', 'unpack'])
    parser.add_argument('--archive', required=True, type=Path)
    parser.add_argument('--root', action='append', required=True, help='name=/absolute/directory; repeat for each volume')
    parser.add_argument('--owner', help='Restore ownership as uid:gid; requires permission')
    parser.add_argument('--exclude', action='append', default=[], help='Pack only: omit root/relative/path and record it in the manifest')
    options = parser.parse_args()
    owner = tuple(map(int, options.owner.split(':'))) if options.owner else None
    if owner and len(owner) != 2:
        raise SystemExit('--owner must be uid:gid')
    roots = parse_roots(options.root)
    if options.action == 'pack':
        pack(options.archive, roots, options.exclude)
    else:
        if options.exclude:
            parser.error('--exclude is only valid when packing')
        unpack(options.archive, roots, owner)


if __name__ == '__main__':
    os.umask(0o077)
    main()
