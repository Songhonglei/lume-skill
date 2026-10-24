import io
import stat
import zipfile

import pytest

from backend import storage
from backend.storage import PackageError, PackageFile, pack_zip, unpack_zip, validate_files


@pytest.mark.parametrize('name', ['../escape', '/absolute', 'x/../../y', 'x\\y', 'C:/x', 'x//y', 'x/./y'])
def test_archive_rejects_unsafe_paths(name):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        archive.writestr(name, 'untrusted')
    with pytest.raises(PackageError):
        unpack_zip(buffer.getvalue())


def test_archive_rejects_symlinks_and_duplicate_names():
    for names in (['same', 'same'], ['Case', 'case']):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            for name in names:
                archive.writestr(name, 'untrusted')
        with pytest.raises(PackageError):
            unpack_zip(buffer.getvalue())
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        link = zipfile.ZipInfo('link')
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        archive.writestr(link, '/etc/passwd')
    with pytest.raises(PackageError):
        unpack_zip(buffer.getvalue())


def test_archive_limits_binary_roundtrip_and_collisions(monkeypatch):
    original = {'evals/fixtures/binary': PackageFile(bytes(range(256))), 'evals/fixtures/run': PackageFile(b'#!/bin/sh\n', 0o755)}
    assert unpack_zip(pack_zip(original)) == original
    for files in ({'file': PackageFile(b''), 'file/child': PackageFile(b'')},
                  {'Folder/a': PackageFile(b''), 'folder/b': PackageFile(b'')}):
        with pytest.raises(PackageError):
            validate_files(files)
    archive = pack_zip({'large': PackageFile(b'a' * 300)})
    monkeypatch.setattr(storage, 'MAX_EXPANDED', 100)
    with pytest.raises(PackageError):
        unpack_zip(archive)
