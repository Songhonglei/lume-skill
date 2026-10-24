
import pytest

from deploy.volume_backup import pack, unpack


def test_backup_restore_preserves_bytes_modes_and_refuses_overwrite(tmp_path):
    source = tmp_path / 'source'
    source.mkdir(mode=0o700)
    (source / 'nested').mkdir(mode=0o700)
    file = source / 'nested/key'
    file.write_bytes(b'private synthetic bytes\0\xff')
    file.chmod(0o600)
    archive = tmp_path / 'backup.zip'
    pack(archive, {'center': source})
    target = tmp_path / 'restored'
    unpack(archive, {'center': target}, None)
    assert (target / 'nested/key').read_bytes() == file.read_bytes()
    assert (target / 'nested/key').stat().st_mode & 0o777 == 0o600
    with pytest.raises(SystemExit):
        unpack(archive, {'center': target}, None)
    with pytest.raises(SystemExit):
        pack(archive, {'center': source})
    with pytest.raises(SystemExit):
        pack(source / 'recursive.zip', {'center': source})


def test_corrupt_manifest_does_not_create_files(tmp_path):
    import json
    import zipfile

    archive = tmp_path / 'bad.zip'
    with zipfile.ZipFile(archive, 'w') as file:
        file.writestr('center/data', b'changed')
        file.writestr('manifest.json', json.dumps({'version': 1, 'directories': {'center': 0o700}, 'files': {'center/data': {'sha256': '0' * 64, 'mode': 0o600}}}))
    target = tmp_path / 'target'
    with pytest.raises(SystemExit):
        unpack(archive, {'center': target}, None)
    assert not target.exists()


def test_explicit_runtime_exclusion_preserves_login_and_other_symlink_checks(tmp_path):
    import json
    import zipfile

    model = tmp_path / 'model'
    (model / 'tmp').mkdir(parents=True)
    (model / 'auth.json').write_text('synthetic-login')
    (model / 'tmp/temporary-link').symlink_to('/missing-runtime-executable')
    archive = tmp_path / 'backup.zip'
    pack(archive, {'model': model}, ['model/tmp'])
    with zipfile.ZipFile(archive) as source:
        manifest = json.loads(source.read('manifest.json'))
        assert manifest['excluded'] == ['model/tmp']
        assert source.read('model/auth.json') == b'synthetic-login'
        assert not any(name.startswith('model/tmp') for name in source.namelist())
    (model / 'unexpected-link').symlink_to('/outside')
    with pytest.raises(SystemExit, match='Unsupported backup entry'):
        pack(tmp_path / 'unsafe.zip', {'model': model}, ['model/tmp'])
    for excluded in ('model', 'model/../auth.json', 'unknown/tmp'):
        with pytest.raises(SystemExit, match='--exclude'):
            pack(tmp_path / 'invalid.zip', {'model': model}, [excluded])


def test_configuration_rejects_unusable_origin_and_lease():
    from pydantic import ValidationError

    from backend.config import Settings

    for values in ({'public_url': 'https://example.com/path'}, {'lease_seconds': 1}, {'lease_seconds': 30, 'heartbeat_seconds': 20}):
        with pytest.raises(ValidationError):
            Settings(**values)
    assert Settings(public_url='http://127.0.0.1:8765/').public_url == 'http://127.0.0.1:8765'
