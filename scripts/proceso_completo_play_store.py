# -*- coding: utf-8 -*-
"""
Proceso completo RAULI-VISION: bump → build → AAB → subir a Play Store vía API.
Lee credenciales desde credenciales.txt (Bóveda).

Uso: python scripts/proceso_completo_play_store.py
     python scripts/proceso_completo_play_store.py --sin-upload   # solo build, no sube
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Bóveda: cargar credenciales antes de todo
CREDENTIALS_PATHS = [
    Path(r"C:\dev\credenciales.txt"),
    ROOT / "credenciales.txt",
    Path(r"C:\Users\Raul\OneDrive\RAUL - Personal\Escritorio\credenciales.txt"),
]


def load_credentials() -> None:
    for p in CREDENTIALS_PATHS:
        if p.exists():
            with open(p, encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, _, v = line.partition("=")
                        k, v = k.strip(), v.strip()
                        if k and v and not os.environ.get(k):
                            os.environ[k] = v
            return


def main() -> int:
    load_credentials()

    parser = argparse.ArgumentParser(description="Proceso completo: build + subir a Play Store")
    parser.add_argument("--sin-upload", action="store_true", help="Solo build AAB, no subir")
    parser.add_argument("--today", action="store_true", help="Versión con fecha (YYYY.MM.DD)")
    args = parser.parse_args()

    # 1. Ejecutar cadena completa (bump + build + AAB)
    print("=== [1/2] Cadena completa (bump + build + AAB) ===\n")
    cadena_args = [sys.executable, str(ROOT / "scripts" / "cadena_completa.py")]
    if args.today:
        cadena_args.append("--today")
    r = subprocess.run(cadena_args, cwd=str(ROOT))
    if r.returncode != 0:
        return r.returncode

    if args.sin_upload:
        print("\n--sin-upload: no se sube a Play Store.")
        return 0

    # 2. Subir AAB a Play Store
    print("\n=== [2/2] Subir AAB a Play Store ===\n")
    r = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "upload_play_store.py")],
        cwd=str(ROOT),
        env=os.environ,
    )
    return r.returncode if r.returncode is not None else 0


if __name__ == "__main__":
    sys.exit(main())
