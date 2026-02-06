# -*- coding: utf-8 -*-
"""
Dispara deploy de espejo-backend en Render.
Usa RENDER_DEPLOY_HOOK_ESPEJO (credenciales) o RENDER_API_KEY para trigger.
Uso: python scripts/deploy_render_espejo.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_credenciales() -> dict[str, str]:
    oh = Path.home()
    paths = [
        ROOT / "credenciales.txt",
        Path("C:/dev/credenciales.txt"),
        oh / "credenciales.txt",
        oh / "Desktop" / "credenciales.txt",
        oh / "Escritorio" / "credenciales.txt",
        oh / "OneDrive" / "RAUL - Personal" / "Escritorio" / "credenciales.txt",
    ]
    result = {}
    for p in paths:
        if p.exists():
            try:
                text = p.read_text(encoding="utf-8").replace("\r", "")
                for line in text.split("\n"):
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        k, v = line.split("=", 1)
                        result[k.strip()] = v.strip().strip("'\"")
            except Exception:
                pass
            break
    return result


def trigger_deploy_hook(url: str) -> bool:
    import urllib.request
    req = urllib.request.Request(url, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status in (200, 201)
    except Exception as e:
        print(f"Error deploy hook: {e}", file=sys.stderr)
        return False


def main() -> int:
    cred = load_credenciales()
    hook = cred.get("RENDER_DEPLOY_HOOK_ESPEJO") or os.environ.get("RENDER_DEPLOY_HOOK_ESPEJO")
    if hook:
        print("Disparando deploy de espejo-backend (Deploy Hook)...")
        if trigger_deploy_hook(hook):
            print("OK. Deploy iniciado. Espera 2-5 min.")
            return 0
        print("Hook falló, intentando via API...", file=sys.stderr)

    api_key = cred.get("RENDER_API_KEY") or cred.get("RENDER_TOKEN") or os.environ.get("RENDER_API_KEY") or os.environ.get("RENDER_TOKEN")
    if api_key:
        print("Buscando espejo-backend para trigger via API...")
        try:
            import urllib.request
            import json
            req = urllib.request.Request(
                "https://api.render.com/v1/services?limit=50",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=15) as r:
                raw = json.loads(r.read().decode())
            items = raw.get("items", raw) if isinstance(raw, dict) else (raw if isinstance(raw, list) else [])
            norm = [x.get("service", x) if isinstance(x, dict) and "service" in x else x for x in items]
            svc = next((s for s in norm if isinstance(s, dict) and s.get("name") == "espejo-backend"), None)
            if not svc:
                print("No se encontró espejo-backend. ¿Ya conectaste el Blueprint?", file=sys.stderr)
                print("Ver RENDER_SETUP_ESPEJO.md", file=sys.stderr)
                return 1
            sid = svc["id"]
            deploy_req = urllib.request.Request(
                f"https://api.render.com/v1/services/{sid}/deploys",
                data=b"{}",
                method="POST",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(deploy_req, timeout=15) as resp:
                print("OK. Deploy iniciado via API. Espera 2-5 min.")
                return 0
        except Exception as e:
            print(f"Error API: {e}", file=sys.stderr)
            return 1

    print("Falta RENDER_DEPLOY_HOOK_ESPEJO o RENDER_API_KEY/RENDER_TOKEN en credenciales.", file=sys.stderr)
    print("Ver RENDER_SETUP_ESPEJO.md para configurar.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
