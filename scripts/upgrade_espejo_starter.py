# -*- coding: utf-8 -*-
"""
Actualiza espejo-backend a plan Starter (~7 USD/mes) vía API Render.
Requiere RENDER_API_KEY o RENDER_TOKEN en credenciales.
Uso: python scripts/upgrade_espejo_starter.py
"""
from __future__ import annotations

import json
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


def main() -> int:
    cred = load_credenciales()
    api_key = cred.get("RENDER_API_KEY") or cred.get("RENDER_TOKEN") or os.environ.get("RENDER_API_KEY") or os.environ.get("RENDER_TOKEN")
    if not api_key:
        print("Falta RENDER_API_KEY o RENDER_TOKEN en credenciales.", file=sys.stderr)
        return 1

    import urllib.request

    # 1. Obtener servicio espejo-backend
    print("Buscando espejo-backend...")
    req = urllib.request.Request(
        "https://api.render.com/v1/services?limit=50",
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        raw = json.loads(r.read().decode())

    # La API puede devolver { items: [...] } o lista directa
    items = raw.get("items", raw) if isinstance(raw, dict) else raw
    if not isinstance(items, list):
        items = []

    svc = next((s for s in items if s.get("name") == "espejo-backend"), None)
    if not svc:
        # Permitir ID directo si está en credenciales
        sid_env = os.environ.get("RENDER_ESPEJO_SERVICE_ID") or cred.get("RENDER_ESPEJO_SERVICE_ID")
        if sid_env:
            sid = sid_env
            svc = {"id": sid, "name": "espejo-backend", "serviceDetails": {}, "plan": ""}
        else:
            names = [s.get("name", "?") for s in items[:10]]
            print(f"No se encontró espejo-backend. Servicios: {names}", file=sys.stderr)
            return 1

    sid = svc.get("id", svc["id"])
    plan_actual = svc.get("serviceDetails", {}).get("plan") or svc.get("plan") or "?"
    print(f"  Servicio: {sid}, plan actual: {plan_actual}")

    # 2. PATCH para actualizar a Starter
    # Render API: serviceDetails.plan = "starter"
    body = json.dumps({"serviceDetails": {"plan": "starter"}}).encode("utf-8")
    patch_req = urllib.request.Request(
        f"https://api.render.com/v1/services/{sid}",
        data=body,
        method="PATCH",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(patch_req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
            print("OK. espejo-backend actualizado a plan Starter (~7 USD/mes).")
            return 0
    except urllib.error.HTTPError as e:
        err_body = e.read().decode() if e.fp else ""
        print(f"Error HTTP {e.code}: {err_body}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
