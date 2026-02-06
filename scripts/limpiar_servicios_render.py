# -*- coding: utf-8 -*-
"""
Lista servicios en Render y permite eliminar los obsoletos.
Mantener: espejo-backend (el del Blueprint actual).
Eliminar: proxy-backend, espejo duplicado o antiguo.
Requiere RENDER_API_KEY o RENDER_TOKEN.
Uso: python scripts/limpiar_servicios_render.py [--list] [--delete NOMBRE]
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_credenciales() -> dict[str, str]:
    oh = Path.home()
    paths = [ROOT / "credenciales.txt", Path("C:/dev/credenciales.txt"), oh / "credenciales.txt", oh / "Desktop" / "credenciales.txt", oh / "Escritorio" / "credenciales.txt"]
    result = {}
    for p in paths:
        if p.exists():
            try:
                for line in p.read_text(encoding="utf-8").replace("\r", "").split("\n"):
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    result[k.strip()] = v.strip().strip("'\"")
            except Exception:
                pass
            break
    return result


def main() -> int:
    import urllib.request
    import urllib.error

    cred = load_credenciales()
    api_key = cred.get("RENDER_API_KEY") or cred.get("RENDER_TOKEN") or os.environ.get("RENDER_API_KEY") or os.environ.get("RENDER_TOKEN")
    if not api_key:
        print("Falta RENDER_API_KEY o RENDER_TOKEN.", file=sys.stderr)
        return 1

    args = sys.argv[1:]
    do_list = "--list" in args or not any(a.startswith("--delete") for a in args)
    delete_name = None
    for a in args:
        if a.startswith("--delete="):
            delete_name = a.split("=", 1)[1]
        elif a == "--delete" and args[args.index(a) + 1:]:
            delete_name = args[args.index(a) + 1]

    req = urllib.request.Request(
        "https://api.render.com/v1/services?limit=100",
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        raw = json.loads(r.read().decode())
    items = raw.get("items", raw) if isinstance(raw, dict) else (raw if isinstance(raw, list) else [])
    # Normalizar: a veces cada item es { service: {...} }
    norm = []
    for x in items:
        if isinstance(x, dict) and "service" in x:
            norm.append(x["service"])
        else:
            norm.append(x)
    items = norm

    if do_list:
        print("Servicios en Render:\n")
        for s in items:
            name = s.get("name") or s.get("service", {}).get("name") or "?"
            sid = s.get("id") or s.get("service", {}).get("id") or "?"
            sd = s.get("serviceDetails") or s.get("service", {}).get("serviceDetails") or {}
            plan = sd.get("plan") or s.get("plan") or "?"
            print(f"  {name}  id={sid}  plan={plan}")
        print("\nMantener: espejo-backend (= rauli-vision-espejo, versión actual)")
        print("NO tocar: rauli-panaderia, rauli-panaderia-1")
        print("Eliminado: proxy-backend")
        return 0

    if delete_name:
        svc = next((s for s in items if s.get("name") == delete_name), None)
        if not svc:
            print(f"No se encontró servicio '{delete_name}'", file=sys.stderr)
            return 1
        sid = svc["id"]
        del_req = urllib.request.Request(
            f"https://api.render.com/v1/services/{sid}",
            method="DELETE",
            headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
        )
        try:
            urllib.request.urlopen(del_req, timeout=15)
            print(f"Eliminado: {delete_name}")
            return 0
        except urllib.error.HTTPError as e:
            print(f"Error {e.code}: {e.read().decode()}", file=sys.stderr)
            return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
