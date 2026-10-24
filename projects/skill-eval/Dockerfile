FROM node:24.19.0-bookworm-slim AS node
WORKDIR /build/web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build
WORKDIR /build/codex
COPY deploy/codex/package.json deploy/codex/package-lock.json ./
RUN npm ci --ignore-scripts

FROM python:3.12.12-slim-bookworm AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git procps libstdc++6 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY deploy/requirements.txt /tmp/requirements.txt
RUN python3 -m pip install --no-cache-dir --require-hashes -r /tmp/requirements.txt && rm /tmp/requirements.txt
COPY deploy/install_tools.py deploy/toolchain.json /app/deploy/
RUN python3 deploy/install_tools.py --directory /opt/skill-eval/bin
RUN useradd --uid 10001 --create-home --shell /bin/sh worker
ENV PATH="/opt/skill-eval/bin:/opt/codex/node_modules/.bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY LICENSE THIRD-PARTY-NOTICES.md /app/
COPY licenses/ /app/licenses/

FROM runtime AS center
COPY backend/ /app/backend/
COPY worker/ /app/worker/
COPY examples/ /app/examples/
COPY --from=node /build/web/dist/ /app/frontend/dist/
COPY deploy/center_entry.py deploy/bootstrap.py deploy/volume_backup.py /app/deploy/
ENV OSE_DATA_DIR=/data OSE_SKILL_UP=/opt/skill-eval/bin/skill-up
USER 10001:10001
EXPOSE 8765
CMD ["python3", "deploy/center_entry.py"]

FROM runtime AS worker
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/LICENSE /opt/node-LICENSE
COPY --from=node /build/codex/node_modules/ /opt/codex/node_modules/
COPY worker/ /app/worker/
COPY backend/__init__.py backend/storage.py /app/backend/
COPY vendor/skill-upper/ /app/vendor/skill-upper/
ENV CODEX_HOME=/model-home HOME=/home/worker
USER 10001:10001
CMD ["python3", "-m", "worker", "--state-dir", "/worker-state", "--skill-up", "/opt/skill-eval/bin/skill-up"]
