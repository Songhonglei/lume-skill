from pathlib import Path
from urllib.parse import urlsplit

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="OSE_")
    database_url: str = "postgresql://localhost:5432/skill_eval"
    data_dir: Path = Path("data")
    public_url: str = "http://127.0.0.1:8765"
    skill_up: Path = Path(".local/bin/skill-up")
    setup_token: str = ""
    builtin_secret_file: Path | None = None
    lease_seconds: int = Field(default=60, ge=30, le=3600)
    heartbeat_seconds: int = Field(default=10, ge=1, le=60)
    session_hours: int = Field(default=24, ge=1, le=720)
    dev_origin: str = ""

    @field_validator("public_url")
    @classmethod
    def valid_origin(cls, value):
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
            raise ValueError("OSE_PUBLIC_URL 需要不含路径、凭据或查询参数的工作台地址")
        return value.rstrip("/")

    @model_validator(mode="after")
    def heartbeat_within_lease(self):
        if self.heartbeat_seconds * 2 >= self.lease_seconds:
            raise ValueError("心跳间隔需要小于租约时长的一半")
        return self
