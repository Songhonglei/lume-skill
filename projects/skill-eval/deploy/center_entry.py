"""Read the Compose database secret locally without printing credentials."""
import os
from pathlib import Path
from urllib.parse import quote

password = Path('/run/database/password').read_text().strip()
os.environ['OSE_DATABASE_URL'] = 'postgresql://skill_eval:' + quote(password, safe='') + '@db:5432/skill_eval'
os.umask(0o077)
os.execvp('python3', ['python3', '-m', 'uvicorn', 'backend.api:app', '--host', '0.0.0.0', '--port', '8765', '--no-proxy-headers'])
