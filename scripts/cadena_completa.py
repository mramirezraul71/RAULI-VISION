# -*- coding: utf-8 -*-
"""
Cadena completa RAULI-VISION: bump → build web → sync → AAB → (opcional) push/deploy.

Actualiza package.json, build.gradle, render.yaml, Go; construye dashboard y AAB.
Uso:
  python scripts/cadena_completa.py              # bump + build web + sync + AAB
  python scripts/cadena_completa.py --push       # + git push
  python scripts/cadena_completa.py --todo       # + deploy-network + push
  python scripts/cadena_completa.py --solo-build # solo build web+sync+AAB (sin bump)
"""
from __future__ import annotations

import argparse
import os
import platform
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DASHBOARD = ROOT / "dashboard"
ANDROID = DASHBOARD / "android"
AAB_OUT = ANDROID / "app" / "build" / "outputs" / "bundle" / "release" / "app-release.aab"

IS_WIN = platform.system() == "Windows"
GRADLEW = "gradlew.bat" if IS_WIN else "gradlew"


def _find_java() -> bool:
    """Comprueba si java está en PATH."""
    try:
        subprocess.run(["java", "-version"], capture_output=True, check=False, timeout=5)
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def _ensure_java_home() -> bool:
    """Intenta configurar JAVA_HOME si no está definido (rutas comunes Windows)."""
    if os.environ.get("JAVA_HOME"):
        return True
    candidates = [
        Path(r"C:\Program Files\Eclipse Adoptium\jdk-17"),
        Path(r"C:\Program Files\Eclipse Adoptium\jdk-21"),
        Path(r"C:\Program Files\Java\jdk-17"),
        Path(r"C:\Program Files\Java\jdk-21"),
    ]
    for base in [Path(r"C:\Program Files\Eclipse Adoptium"), Path(r"C:\Program Files\Java"), Path(r"C:\Program Files\Microsoft")]:
        if base.exists():
            for d in sorted(base.glob("jdk*"), reverse=True):
                if (d / "bin" / "java.exe").exists():
                    candidates.append(d)
    for p in candidates:
        if p.exists() and (p / "bin" / "java.exe").exists():
            os.environ["JAVA_HOME"] = str(p)
            os.environ["PATH"] = f"{p / 'bin'};{os.environ.get('PATH', '')}"
            return True
    return False


def run(cmd: list[str] | str, cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess:
    cwd = cwd or ROOT
    # En Windows, npm/npx/gradlew requieren shell para resolver .cmd/.bat
    use_shell = IS_WIN
    if use_shell and isinstance(cmd, list):
        cmd = " ".join(str(x) for x in cmd)
    result = subprocess.run(cmd, cwd=str(cwd), check=False, shell=use_shell)
    if check and result.returncode != 0:
        sys.exit(result.returncode)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Cadena completa RAULI-VISION")
    parser.add_argument("--solo-build", action="store_true", help="Solo build (sin bump de versión)")
    parser.add_argument("--push", action="store_true", help="Git add, commit, push")
    parser.add_argument("--deploy-network", action="store_true", help="Ejecutar deploy_network.js")
    parser.add_argument("--todo", action="store_true", help="Bump + deploy-network + push")
    parser.add_argument("--today", action="store_true", help="Usar fecha para versión (YYYY.MM.DD)")
    args = parser.parse_args()

    if args.todo:
        args.push = True
        args.deploy_network = True

    version: str | None = None

    # 1. Bump version (salvo --solo-build)
    if not args.solo_build:
        bump_args = ["--today"] if args.today else []
        r = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "bump_version.py")] + bump_args,
            cwd=str(ROOT),
            capture_output=True,
            text=True,
        )
        if r.returncode != 0:
            print("Error bump_version:", r.stderr or r.stdout, file=sys.stderr)
            return 1
        version = (r.stdout or "").strip()
        print(f"[1/6] Versión: {version}")
    else:
        # Leer versión actual para mensaje
        import json
        pkg = ROOT / "dashboard" / "package.json"
        if pkg.exists():
            version = json.loads(pkg.read_text(encoding="utf-8")).get("version", "?")
        print(f"[1/6] Solo build (versión actual: {version})")

    # 2. Build web
    print("[2/6] Build web (npm run build)...")
    r = run(["npm", "run", "build"], cwd=DASHBOARD)
    if r.returncode != 0:
        return 1

    # 3. Capacitor sync
    print("[3/6] Capacitor sync...")
    r = run(["npx", "cap", "sync", "android"], cwd=DASHBOARD)
    if r.returncode != 0:
        return 1

    # 4. Gradle bundleRelease
    print("[4/6] Gradle bundleRelease...")
    if not _ensure_java_home() and not _find_java():
        print(
            "Error: JAVA_HOME no configurado. Instala JDK 17+ y define JAVA_HOME.",
            file=sys.stderr,
        )
        print("  Ej: set JAVA_HOME=C:\\Program Files\\Eclipse Adoptium\\jdk-17", file=sys.stderr)
        return 1
    r = run([GRADLEW, "bundleRelease"], cwd=ANDROID)
    if r.returncode != 0:
        return 1

    if AAB_OUT.exists():
        print(f"      AAB: {AAB_OUT}")
    else:
        print("      Aviso: AAB no encontrado en ruta esperada", file=sys.stderr)

    # 5. Deploy network (opcional)
    if args.deploy_network:
        print("[5/6] Deploy puente Cloudflare...")
        run(["node", str(ROOT / "deploy_network.js")])
    else:
        print("[5/6] Deploy network omitido")

    # 6. Git push (opcional)
    if args.push:
        print("[6/6] Git push...")
        msg = f"chore: bump version {version}" if version else "chore: build RAULI-VISION"
        run(["git", "add", "-A"])
        run(["git", "commit", "-m", msg])
        run(["git", "push"])
        print("      Push realizado. Render + Vercel desplegarán.")
    else:
        print("[6/6] Git push omitido")

    print("\n=== Cadena completa OK ===")
    if AAB_OUT.exists():
        print(f"AAB listo para Play Store: {AAB_OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
