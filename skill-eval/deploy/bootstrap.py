"""One-shot Compose initialization. Existing volume contents are never overwritten."""
import os
import secrets
from pathlib import Path

os.umask(0o077)
for directory in ('/secrets/database', '/secrets/builtin', '/data/center', '/data/worker', '/data/model'):
    path = Path(directory)
    path.mkdir(parents=True, exist_ok=True)
    os.chown(path, 10001, 10001)
    path.chmod(0o700 if directory.startswith('/data') else 0o755)
for filename, mode in (('/secrets/database/password', 0o644), ('/secrets/builtin/seed', 0o600)):
    file = Path(filename)
    try:
        descriptor = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    except FileExistsError:
        if len(file.read_text().strip()) < 32:
            raise SystemExit('Existing secret is incomplete; restore the matching volume backup') from None
    else:
        with os.fdopen(descriptor, 'w') as stream:
            stream.write(secrets.token_urlsafe(48))
            stream.flush()
            os.fsync(stream.fileno())
        os.chown(file, 10001, 10001)
        file.chmod(mode)
print('Persistent volumes initialized')
