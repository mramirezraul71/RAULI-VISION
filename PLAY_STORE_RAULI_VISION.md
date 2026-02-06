# RAULI-VISION — Preparación Google Play Store

Guía completa para publicar RAULI-VISION en Google Play Store.

---

## 1. Requisitos previos

- [ ] Cuenta Google Play Console (desarrollador, pago único)
- [ ] Keystore de firma (crear una sola vez, **guardar copia segura**)
- [ ] App firmada con `release` (AAB para Play Store)
- [ ] **JDK 17+** instalado y `JAVA_HOME` configurado (para Gradle)
- [ ] Node.js y npm (para build del dashboard)

---

## 2. Configuración de firma (keystore)

### Crear keystore (primera vez)

```bash
cd dashboard/android
keytool -genkey -v -keystore rauli-vision-upload.keystore -alias rauli-vision -keyalg RSA -keysize 2048 -validity 10000
```

Guarda el keystore y contraseñas en lugar seguro (Bóveda / credenciales). **No subir al repositorio.**

### Configurar keystore.properties

```bash
cp keystore.properties.example keystore.properties
```

Edita `keystore.properties`:

```
storePassword=TU_PASSWORD
keyPassword=TU_PASSWORD
keyAlias=rauli-vision
storeFile=../rauli-vision-upload.keystore
```

---

## 3. Build release (AAB para Play Store)

### 3.1 Bump de versión

```bash
# Desde la raíz RAULI-VISION
python scripts/bump_version.py         # incrementa patch (1.0.0 -> 1.0.1)
python scripts/bump_version.py --today # usa fecha (ej. 2025.02.02)
```

Esto actualiza:
- `dashboard/package.json`
- `dashboard/android/app/build.gradle` (versionCode + versionName)
- `render.yaml` (VERSION)
- Go (proxy, espejo)

### 3.2 Build web + Android

```bash
cd dashboard
npm run build
npx cap sync android
```

### 3.3 Generar AAB (App Bundle)

```bash
cd android
./gradlew bundleRelease
```

El AAB estará en:
`app/build/outputs/bundle/release/app-release.aab`

---

## 4. Listado en Play Store

### Identificadores

| Campo | Valor |
|-------|-------|
| **ID de aplicación** | `com.rauli.vision` |
| **Nombre** | RAULI-VISION |

### Descripción corta (80 caracteres máx.)

> Búsqueda, video y asistente IA optimizados para conexiones lentas. Proxy y caché integrados.

### Descripción larga (4000 caracteres máx.)

> RAULI-VISION es una aplicación diseñada para aprovechar al máximo conexiones de internet lentas o limitadas.
>
> **Funcionalidades:**
> • Búsqueda optimizada con resultados en texto plano (menos datos)
> • Cola de video: prepara videos en 360p para ver más tarde
> • Asistente IA: resúmenes y respuestas sin cargar páginas completas
> • Caché local para no repetir búsquedas
> • Indicador de conexión (Conectado / Local)
> • PWA instalable y preparada para uso offline
>
> Ideal para entornos con banda limitada, túnel o proxy.

### Capturas de pantalla

Recomendado: mínimo 2 por tipo de dispositivo (teléfono, tablet si aplica).

- **Teléfono:** 1080×1920 px o 1080×2340 px
- Formato PNG o JPEG, sin transparencia
- Mostrar: Búsqueda, Video, Chat IA, indicador de conexión

### Icono

- **512×512 px** PNG de 32 bits con canal alpha
- Ya disponible en `dashboard/android/app/src/main/res/mipmap-*/`

### Imagen de portada (feature graphic)

- **1024×500 px**
- Destacado en la ficha de la app en Play Store

---

## 5. Política de privacidad

Play Store exige URL de política de privacidad si la app:
- Recopila datos personales
- Usa permisos sensibles (cámara, ubicación, etc.)

RAULI-VISION usa principalmente:
- Internet (para búsquedas, espejo, proxy)
- Almacenamiento local (caché)

Si no recopilas datos personales identificables, puedes usar una política simple indicando que no se recopilan datos personales.

Ejemplo de hosteo: GitHub Pages, Vercel o tu dominio.

---

## 6. Lista de probadores (Pruebas internas/cerradas)

Añadir en Play Console → Tu app → Pruebas → Lista de correos:

```
mramirezraul71@gmail.com
lisetmoralesl83@gmail.com
mraulyamil@gmail.com
barbarakamila166@gmail.com
igarcellrodriguez@gmail.com
```

También disponible en: `docs/PLAY_STORE_TESTERS.txt`

---

## 7. Checklist pre-publicación

- [ ] `applicationId`: `com.rauli.vision`
- [ ] `versionCode` y `versionName` actualizados con `bump_version.py`
- [ ] AAB firmado con keystore de release
- [ ] Probar instalación del AAB en dispositivo real
- [ ] Política de privacidad publicada y URL configurada
- [ ] Capturas, icono 512×512, feature graphic 1024×500
- [ ] Descripción corta y larga en español (y otros idiomas si procede)

---

## 8. Proceso completo automatizado (build + upload API)

Con credenciales en `credenciales.txt`:

```
GOOGLE_PLAY_CREDENTIALS_PATH=C:\ruta\al\service-account.json
```

Ejecutar:

```bash
pip install -r requirements-play-store.txt
PROCESO_COMPLETO_PLAY_STORE.bat
```

O manualmente:

```bash
python scripts/proceso_completo_play_store.py
python scripts/proceso_completo_play_store.py --today   # versión con fecha
python scripts/proceso_completo_play_store.py --sin-upload  # solo build, no sube
```

Solo subir AAB existente:

```bash
python scripts/upload_play_store.py
```

---

## 9. Script rápido (build + AAB)

```bash
# Desde raíz RAULI-VISION
python scripts/bump_version.py
cd dashboard && npm run build && npx cap sync android
cd android && ./gradlew bundleRelease
```

El AAB estará en `dashboard/android/app/build/outputs/bundle/release/app-release.aab`.

---

## 10. Notas

- **Keystore:** Si pierdes el keystore, no podrás actualizar la app con el mismo ID. Haz backup seguro.
- **versionCode:** Debe incrementar en cada subida a Play Store.
- **Testing interno:** Usa la pestaña "Pruebas internas" antes de producción.

---

## 11. Errores comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `spawn EPERM` en `npm run build` | Sandbox/permisos | Ejecutar en terminal normal (no sandbox) |
| `JAVA_HOME is not set` | JDK no configurado | Instalar JDK 17+ y definir `JAVA_HOME` |
| `npm: command not found` | Node no en PATH | Instalar Node.js o usar terminal con PATH correcto |
