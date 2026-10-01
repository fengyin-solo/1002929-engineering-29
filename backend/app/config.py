"""运行配置：端口、跨域、运行环境。

本地开发的端口不再写死在代码里，而是与前端、脚本共用同一份事实源
``config/local-dev.json``（仓库根目录）。这样在一处改端口，后端监听地址、
CORS 来源、前端 dev server 与代理目标会同时生效。

可用环境变量覆盖：APP_ENV、BACKEND_HOST、BACKEND_PORT、FRONTEND_HOST、
FRONTEND_PORT、DEV_CONFIG（另一份 JSON）、SKIP_DEV_CONFIG=1（不用文件，走默认值）。
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

_DEFAULT_BACKEND_HOST = "127.0.0.1"
_DEFAULT_BACKEND_PORT = 8000
_DEFAULT_FRONTEND_HOST = "127.0.0.1"
_DEFAULT_FRONTEND_PORT = 5173


def _config_path() -> Path:
    root = Path(__file__).resolve().parents[2]
    return Path(os.environ.get("DEV_CONFIG", root / "config" / "local-dev.json"))


def _load_raw() -> dict:
    """读取唯一事实源 JSON；显式跳过或文件缺失时回退默认值，保证容器也能起。"""
    if os.environ.get("SKIP_DEV_CONFIG") == "1":
        return {}
    path = _config_path()
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _as_int(value: object) -> int | None:
    try:
        n = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return n if 0 < n < 65536 else None


def _build_settings() -> "Settings":
    raw = _load_raw()
    backend = raw.get("backend") or {}
    frontend = raw.get("frontend") or {}

    backend_host = os.environ.get("BACKEND_HOST") or backend.get("host") or _DEFAULT_BACKEND_HOST
    backend_port = _as_int(os.environ.get("BACKEND_PORT")) or _as_int(backend.get("port")) or _DEFAULT_BACKEND_PORT
    frontend_host = os.environ.get("FRONTEND_HOST") or frontend.get("host") or _DEFAULT_FRONTEND_HOST
    frontend_port = _as_int(os.environ.get("FRONTEND_PORT")) or _as_int(frontend.get("port")) or _DEFAULT_FRONTEND_PORT

    # 监听 0.0.0.0 时浏览器实际从 127.0.0.1 访问，CORS 来源按客户端地址拼。
    cors_host = "127.0.0.1" if frontend_host in {"0.0.0.0", "::"} else frontend_host
    env_override = os.environ.get("ALLOWED_ORIGINS")
    if env_override:
        allowed = [item.strip() for item in env_override.split(",") if item.strip()]
    else:
        allowed = [
            f"http://{cors_host}:{frontend_port}",
            f"http://localhost:{frontend_port}",
        ]

    return Settings(
        app_name="特种设备安全管理平台",
        env=os.environ.get("APP_ENV", "local"),
        host=str(backend_host),
        port=int(backend_port),
        allowed_origins=allowed,
    )


@dataclass(frozen=True)
class Settings:
    app_name: str = "特种设备安全管理平台"
    env: str = "local"
    host: str = _DEFAULT_BACKEND_HOST
    port: int = _DEFAULT_BACKEND_PORT
    allowed_origins: list[str] = field(default_factory=list)
    page_size_default: int = 20
    page_size_max: int = 200


settings = _build_settings()
