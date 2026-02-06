# -*- coding: utf-8 -*-
"""
Sube AAB a Google Play Store vía API.
Lee credenciales desde credenciales.txt (Bóveda).
Requiere: GOOGLE_PLAY_CREDENTIALS_PATH o GOOGLE_APPLICATION_CREDENTIALS = ruta al JSON de cuenta de servicio.

Uso: python scripts/upload_play_store.py [ruta_aab]
     Si no se pasa ruta, usa el AAB por defecto del build.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AAB_DEFAULT = ROOT / "dashboard" / "android" / "app" / "build" / "outputs" / "bundle" / "release" / "app-release.aab"
PACKAGE_NAME = "com.rauli.vision"

# Bóveda: cargar credenciales
CREDENTIALS_PATHS = [
    Path(r"C:\dev\credenciales.txt"),
    ROOT / "credenciales.txt",
    Path(r"C:\Users\Raul\OneDrive\RAUL - Personal\Escritorio\credenciales.txt"),
]


def load_credentials() -> None:
    """Carga variables desde credenciales.txt (formato KEY=value)."""
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

    cred_path = (
        os.environ.get("GOOGLE_PLAY_CREDENTIALS_PATH")
        or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        or os.environ.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON")
        or ""
    ).strip()
    # Expandir si es ruta relativa
    if cred_path and not Path(cred_path).is_absolute():
        cred_path = str(ROOT / cred_path)
    if not cred_path or not Path(cred_path).exists():
        print(
            "Error: Configura GOOGLE_PLAY_CREDENTIALS_PATH o GOOGLE_APPLICATION_CREDENTIALS en credenciales.txt",
            file=sys.stderr,
        )
        print("  Ej: GOOGLE_PLAY_CREDENTIALS_PATH=C:\\ruta\\al\\service-account.json", file=sys.stderr)
        return 1

    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = cred_path

    aab_path = Path(sys.argv[1]) if len(sys.argv) > 1 else AAB_DEFAULT
    if not aab_path.is_absolute():
        aab_path = ROOT / aab_path
    if not aab_path.exists():
        print(f"Error: AAB no encontrado: {aab_path}", file=sys.stderr)
        return 1

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
    except ImportError:
        print("Instala: pip install google-auth google-api-python-client", file=sys.stderr)
        return 1

    scopes = ["https://www.googleapis.com/auth/androidpublisher"]
    credentials = service_account.Credentials.from_service_account_file(cred_path, scopes=scopes)
    service = build("androidpublisher", "v3", credentials=credentials)

    print(f"Creando edición...")
    edit = service.edits().insert(packageName=PACKAGE_NAME, body={}).execute()
    edit_id = edit["id"]
    print(f"  editId: {edit_id}")

    print(f"Subiendo AAB: {aab_path}")
    media = MediaFileUpload(str(aab_path), mimetype="application/octet-stream", resumable=True)
    bundle = (
        service.edits()
        .bundles()
        .upload(
            editId=edit_id,
            packageName=PACKAGE_NAME,
            media_body=media,
            media_mime_type="application/octet-stream",
        )
        .execute()
    )
    print(f"  versionCode: {bundle.get('versionCode', '?')}")

    print("Confirmando edición...")
    service.edits().commit(editId=edit_id, packageName=PACKAGE_NAME).execute()
    print("OK. AAB subido a Play Console.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
