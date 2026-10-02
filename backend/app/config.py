"""运行配置：端口、跨域、运行环境。

本地开发的唯一配置源是仓库根目录的 ``dev.conf``（脚本与前端共用同一份）。
容器内没有该文件时回落到与 dev.conf 默认值一致的内置默认，保持容器行为不变。
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _dev_conf() -> dict[str, str]:
    """从仓库根目录 dev.conf 读取 KEY=VALUE；找不到则返回空字典。"""
    path = Path(__file__).resolve().parents[2] / "dev.conf"
    conf: dict[str, str] = {}
    try:
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            conf[key.strip()] = value.strip()
    except OSError:
        pass
    return conf


_CONF = _dev_conf()


def _conf(key: str, default: str) -> str:
    # 真实环境变量优先，其次 dev.conf，最后默认值
    return os.environ.get(key, _CONF.get(key, default))


@dataclass(frozen=True)
class Settings:
    app_name: str = "特种设备安全管理平台"
    env: str = field(default_factory=lambda: _conf("APP_ENV", "local"))
    port: int = field(default_factory=lambda: int(_conf("DEV_BACKEND_PORT", "8000")))
    frontend_port: int = field(default_factory=lambda: int(_conf("DEV_FRONTEND_PORT", "5173")))

    @property
    def allowed_origins(self) -> list[str]:
        # CORS 来源跟着前端端口走，端口改一处即可
        return [
            f"http://127.0.0.1:{self.frontend_port}",
            f"http://localhost:{self.frontend_port}",
        ]

    page_size_default: int = 20
    page_size_max: int = 200


settings = Settings()
