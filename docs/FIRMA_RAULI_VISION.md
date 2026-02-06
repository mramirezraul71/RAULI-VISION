# Firma RAULI-VISION — Resumen

## Archivos creados para firma

| Archivo | Ubicación | Uso |
|---------|-----------|-----|
| **rauli-vision-upload.keystore** | `dashboard/android/` | Keystore con la clave de firma |
| **keystore.properties** | `dashboard/android/` | Contraseña y alias (no subir a Git) |

**Contraseña del keystore:** `rauli2026`

## Regenerar AAB firmado

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd c:\dev\RAULI-VISION\dashboard\android
.\gradlew.bat bundleRelease
```

O usar `CADENA_COMPLETA.bat` (ya tiene keystore configurado).

## Ubicación del AAB firmado

```
C:\dev\RAULI-VISION\dashboard\android\app\build\outputs\bundle\release\app-release.aab
```

Este archivo está **firmado** y listo para subir a Play Console.
