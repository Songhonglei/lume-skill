ARG PYTHON_IMAGE=docker.io/library/python:3.12-slim
FROM ${PYTHON_IMAGE}
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SKILL_MNG_DATA=/data PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock && useradd --uid 10001 --create-home app && mkdir /data /link /worker-data && chown app:app /data /link /worker-data
COPY pyproject.toml README.md LICENSE ./
COPY src ./src
RUN pip install --no-cache-dir --no-deps .
USER app
VOLUME /data
EXPOSE 8765
CMD ["skill-mng", "server", "run"]
