# -*- coding: utf-8 -*-
"""
Incrementa la versión y actualiza toda la cadena RAULI-VISION.
Cadena: dashboard (package.json, __APP_VERSION__) -> render.yaml (VERSION) -> backends Go.
Nota: La app no está en Google Play todavía; build.gradle se actualiza para futuro.
Uso: python scripts/bump_version.py         # incrementa patch
     python scripts/bump_version.py --today # usa fecha YYYY.MM.DD
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PKG_JSON = ROOT / "dashboard" / "package.json"
RENDER_YAML = ROOT / "render.yaml"
GRADLE = ROOT / "dashboard" / "android" / "app" / "build.gradle"
PROXY_MAIN = ROOT / "cliente-local" / "cmd" / "proxy" / "main.go"
ESPEJO_MAIN = ROOT / "espejo" / "cmd" / "server" / "main.go"


def get_current_version() -> str | None:
    if not PKG_JSON.exists():
        return None
    data = json.loads(PKG_JSON.read_text(encoding="utf-8"))
    return data.get("version")


def apply_version(new_ver: str) -> None:
    # 1) dashboard/package.json
    if PKG_JSON.exists():
        data = json.loads(PKG_JSON.read_text(encoding="utf-8"))
        data["version"] = new_ver
        PKG_JSON.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    # 2) render.yaml (VERSION en espejo-backend y proxy-backend)
    if RENDER_YAML.exists():
        yaml = RENDER_YAML.read_text(encoding="utf-8")
        yaml = re.sub(r'(key: VERSION\s*\n\s+value: )"[^"]*"', rf'\1"{new_ver}"', yaml)
        RENDER_YAML.write_text(yaml, encoding="utf-8")

    # 3) Go defaults (local dev; Render usa VERSION env)
    for f in (PROXY_MAIN, ESPEJO_MAIN):
        if f.exists():
            text = f.read_text(encoding="utf-8")
            text = re.sub(r'var version = "[^"]*"', f'var version = "{new_ver}"', text, count=1)
            f.write_text(text, encoding="utf-8")

    # 4) Android build.gradle (para futuro Google Play)
    if GRADLE.exists():
        gtext = GRADLE.read_text(encoding="utf-8")
        # versionName "1.0" -> versionName "X.Y.Z"
        gtext = re.sub(r'versionName\s+"[^"]*"', f'versionName "{new_ver}"', gtext)
        # versionCode 1 -> numérico sin puntos
        code = int(new_ver.replace(".", "")) if re.match(r"^\d+\.\d+\.\d+$", new_ver) else 1
        gtext = re.sub(r"versionCode\s+\d+", f"versionCode {code}", gtext)
        GRADLE.write_text(gtext, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Bump version RAULI-VISION")
    parser.add_argument("--today", action="store_true", help="Usar fecha de hoy (YYYY.MM.DD)")
    args = parser.parse_args()

    if args.today:
        now = datetime.utcnow()
        new_ver = now.strftime("%Y.%m.%d")
    else:
        cur = get_current_version()
        if not cur:
            print("No se encontró versión en dashboard/package.json", file=sys.stderr)
            return 1
        m = re.match(r"(\d+)\.(\d+)\.(\d+)", cur)
        if not m:
            print("Versión debe ser X.Y.Z", file=sys.stderr)
            return 1
        major, minor, patch = int(m.group(1)), int(m.group(2)), int(m.group(3))
        patch += 1
        new_ver = f"{major}.{minor}.{patch}"

    apply_version(new_ver)
    print(new_ver)
    return 0


if __name__ == "__main__":
    sys.exit(main())
